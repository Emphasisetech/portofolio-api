import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { User, UserRole } from '../users/schemas/user.schema';
import { Profile } from '../profiles/schemas/profile.schema';
import { Job } from '../jobs/schemas/job.schema';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Profile.name) private profileModel: Model<Profile>,
    @InjectModel(Job.name) private jobModel: Model<Job>,
    @InjectConnection() private connection: Connection,
  ) {}

  async getStats() {
    const totalUsers = await this.userModel.countDocuments();
    const activePortfolios = await this.profileModel.countDocuments({ isPublished: true });
    return {
      totalUsers,
      activePortfolios,
    };
  }

  private accountRoles(allowPrivileged = false) {
    return allowPrivileged
      ? [UserRole.USER, UserRole.COMPANY, UserRole.ADMIN, UserRole.SUPERADMIN]
      : [UserRole.USER, UserRole.COMPANY];
  }

  async getAllUsers(allowPrivileged = false, role?: UserRole) {
    const roles = this.accountRoles(allowPrivileged);
    const selectedRole = role && roles.includes(role) ? role : undefined;
    return this.userModel
      .find(selectedRole ? { role: selectedRole } : { role: { $in: roles } })
      .select('-password')
      .sort({ createdAt: -1 })
      .exec();
  }

  private async getJobsForUser(userId: string) {
    return this.jobModel
      .find({ 'applications.userId': new Types.ObjectId(userId) })
      .select('title company location employmentType workplaceType applications createdAt updatedAt')
      .lean()
      .exec();
  }

  private async getOwnedJobs(userId: string) {
    return this.jobModel
      .find({ companyUserId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  async getUserDetails(userId: string, allowPrivileged = false) {
    const target = await this.userModel.findById(userId).select('-password').exec();
    if (!allowPrivileged) {
      this.ensureAdminCanManage(target);
    }
    if (!target) throw new NotFoundException('User not found');

    const [profiles, appliedJobs, companyJobs] = await Promise.all([
      this.profileModel.find({ userId: target._id }).sort({ createdAt: -1 }).lean().exec(),
      target.role === UserRole.USER ? this.getJobsForUser(userId) : Promise.resolve([]),
      target.role === UserRole.COMPANY ? this.getOwnedJobs(userId) : Promise.resolve([]),
    ]);

    const applications = appliedJobs.flatMap((job: any) =>
      (job.applications || [])
        .filter((application: any) => String(application.userId) === userId)
        .map((application: any) => ({
          ...application,
          job: {
            _id: job._id,
            title: job.title,
            company: job.company,
            location: job.location,
            employmentType: job.employmentType,
            workplaceType: job.workplaceType,
          },
        })),
    );

    return {
      user: target,
      profiles,
      applications,
      jobs: companyJobs,
    };
  }

  private cleanUserUpdate(data: Record<string, any>, allowPrivileged = false) {
    const update: Record<string, any> = {};
    for (const field of [
      'username',
      'email',
      'companyName',
      'plan',
      'profileImage',
      'useProfileSpecificImages',
      'contactFormEnabled',
      'isActive',
    ]) {
      if (data[field] !== undefined) {
        update[field] = data[field];
      }
    }

    if (allowPrivileged && data.role && Object.values(UserRole).includes(data.role)) {
      update.role = data.role;
    }

    if (update.isActive === false) {
      update.deactivatedAt = new Date();
    }

    return update;
  }

  private ensureAdminCanManage(target: User | null) {
    if (!target) {
      throw new NotFoundException('User not found');
    }
    if (target.role === UserRole.ADMIN || target.role === UserRole.SUPERADMIN) {
      throw new ForbiddenException('Superadmin access required for admin accounts');
    }
  }

  private ensureAdminCanManageUser(target: User | null) {
    this.ensureAdminCanManage(target);
    if (target && ![UserRole.USER, UserRole.COMPANY].includes(target.role)) {
      throw new ForbiddenException('Superadmin access required for this account');
    }
  }

  async disableUser(userId: string) {
    const target = await this.userModel.findById(userId).exec();
    this.ensureAdminCanManageUser(target);
    return this.userModel
      .findByIdAndUpdate(
        userId,
        { $set: { isActive: false, deactivatedAt: new Date() } },
        { new: true },
      )
      .select('-password')
      .exec();
  }

  async updateUser(userId: string, data: Record<string, any>, allowPrivileged = false) {
    const target = await this.userModel.findById(userId).exec();
    if (!allowPrivileged) {
      this.ensureAdminCanManageUser(target);
    }
    if (!target) throw new NotFoundException('User not found');

    const update = this.cleanUserUpdate(data, allowPrivileged);
    const unset = update.isActive === true ? { deactivatedAt: '' } : undefined;
    return this.userModel
      .findByIdAndUpdate(
        userId,
        {
          ...(Object.keys(update).length ? { $set: update } : {}),
          ...(unset ? { $unset: unset } : {}),
        },
        { new: true, runValidators: true },
      )
      .select('-password')
      .exec();
  }

  private async archiveAndDeleteUser(target: User, deletedBy?: string) {
    const now = new Date();
    const userObject = target.toObject();
    const originalUserId = target._id;
    const profiles = await this.profileModel.find({ userId: originalUserId }).lean().exec();

    const { _id: userMongoId, ...userArchive } = userObject;
    await this.connection.collection('deleted_users').insertOne({
      ...userArchive,
      originalId: userMongoId,
      deletedAt: now,
      deletedBy: deletedBy ? new Types.ObjectId(deletedBy) : undefined,
    });

    if (profiles.length > 0) {
      await this.connection.collection('deleted_users_profiles').insertMany(
        profiles.map((profile: any) => {
          const { _id, ...profileArchive } = profile;
          return {
            ...profileArchive,
            originalId: _id,
            originalUserId,
            deletedAt: now,
            deletedBy: deletedBy ? new Types.ObjectId(deletedBy) : undefined,
          };
        }),
      );
    }

    let deletedJobs = 0;
    if (target.role === UserRole.COMPANY) {
      const jobs = await this.jobModel.find({ companyUserId: originalUserId }).lean().exec();
      deletedJobs = jobs.length;
      if (jobs.length > 0) {
        await this.connection.collection('deleted_company_jobs').insertMany(
          jobs.map((job: any) => {
            const { _id, ...jobArchive } = job;
            return {
              ...jobArchive,
              originalId: _id,
              originalCompanyUserId: originalUserId,
              deletedAt: now,
              deletedBy: deletedBy ? new Types.ObjectId(deletedBy) : undefined,
            };
          }),
        );
        await this.jobModel.deleteMany({ companyUserId: originalUserId }).exec();
      }
    }

    await this.profileModel.deleteMany({ userId: originalUserId }).exec();
    await this.userModel.deleteOne({ _id: originalUserId }).exec();

    return {
      message: 'User archived and deleted',
      deletedUserId: String(originalUserId),
      archivedProfiles: profiles.length,
      archivedJobs: deletedJobs,
    };
  }

  async deleteUser(userId: string, deletedBy?: string) {
    const target = await this.userModel.findById(userId).exec();
    this.ensureAdminCanManageUser(target);
    return this.archiveAndDeleteUser(target as User, deletedBy);
  }

  async activateUser(userId: string) {
    const target = await this.userModel.findById(userId).exec();
    this.ensureAdminCanManageUser(target);
    return this.userModel
      .findByIdAndUpdate(
        userId,
        { $set: { isActive: true }, $unset: { deactivatedAt: '' } },
        { new: true },
      )
      .select('-password')
      .exec();
  }

  async disableAnyUser(userId: string) {
    const target = await this.userModel.findById(userId).exec();
    if (!target) throw new NotFoundException('User not found');
    return this.userModel
      .findByIdAndUpdate(
        userId,
        { $set: { isActive: false, deactivatedAt: new Date() } },
        { new: true },
      )
      .select('-password')
      .exec();
  }

  async activateAnyUser(userId: string) {
    const target = await this.userModel.findById(userId).exec();
    if (!target) throw new NotFoundException('User not found');
    return this.userModel
      .findByIdAndUpdate(
        userId,
        { $set: { isActive: true }, $unset: { deactivatedAt: '' } },
        { new: true },
      )
      .select('-password')
      .exec();
  }

  async deleteAnyUser(userId: string, deletedBy?: string) {
    const target = await this.userModel.findById(userId).exec();
    if (!target) throw new NotFoundException('User not found');
    return this.archiveAndDeleteUser(target, deletedBy);
  }

  async getDeletedAccounts(allowPrivileged = false, role?: UserRole) {
    const roles = this.accountRoles(allowPrivileged);
    const selectedRole = role && roles.includes(role) ? role : undefined;
    return this.connection
      .collection('deleted_users')
      .find(selectedRole ? { role: selectedRole } : { role: { $in: roles } })
      .sort({ deletedAt: -1 })
      .toArray();
  }

  async getDeletedAccountDetails(id: string, allowPrivileged = false) {
    const deletedUser = await this.connection
      .collection('deleted_users')
      .findOne({ _id: new Types.ObjectId(id) });
    if (!deletedUser) throw new NotFoundException('Deleted account not found');
    if (!allowPrivileged && ![UserRole.USER, UserRole.COMPANY].includes(deletedUser.role)) {
      throw new ForbiddenException('Superadmin access required for this account');
    }

    const [profiles, jobs] = await Promise.all([
      this.connection
        .collection('deleted_users_profiles')
        .find({ originalUserId: deletedUser.originalId })
        .sort({ deletedAt: -1 })
        .toArray(),
      deletedUser.role === UserRole.COMPANY
        ? this.connection
            .collection('deleted_company_jobs')
            .find({ originalCompanyUserId: deletedUser.originalId })
            .sort({ deletedAt: -1 })
            .toArray()
        : Promise.resolve([]),
    ]);

    return {
      user: deletedUser,
      profiles,
      jobs,
      applications: [],
    };
  }
}
