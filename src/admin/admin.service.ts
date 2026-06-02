import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserRole } from '../users/schemas/user.schema';
import { Profile } from '../profiles/schemas/profile.schema';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Profile.name) private profileModel: Model<Profile>,
  ) {}

  async getStats() {
    const totalUsers = await this.userModel.countDocuments();
    const activePortfolios = await this.profileModel.countDocuments({ isPublished: true });
    return {
      totalUsers,
      activePortfolios,
    };
  }

  async getAllUsers() {
    return this.userModel.find().select('-password').exec();
  }

  private ensureAdminCanManage(target: User | null) {
    if (!target) {
      throw new NotFoundException('User not found');
    }
    if (target.role === UserRole.ADMIN || target.role === UserRole.SUPERADMIN) {
      throw new ForbiddenException('Superadmin access required for admin accounts');
    }
  }

  async disableUser(userId: string) {
    const target = await this.userModel.findById(userId).exec();
    this.ensureAdminCanManage(target);
    return this.userModel
      .findByIdAndUpdate(
        userId,
        { $set: { isActive: false, deactivatedAt: new Date() } },
        { new: true },
      )
      .select('-password')
      .exec();
  }

  async activateUser(userId: string) {
    const target = await this.userModel.findById(userId).exec();
    this.ensureAdminCanManage(target);
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
}
