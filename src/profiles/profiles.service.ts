import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Profile } from './schemas/profile.schema';
import { User } from '../users/schemas/user.schema';
import {
  DEFAULT_SECTIONS,
  extractProfileContent,
  getProfileKind,
  buildPublicSlug,
} from './profile.utils';
import type { ParsedResumeData } from './resume-import.types';
import { PlansService } from '../plans/plans.service';

@Injectable()
export class ProfilesService {
  constructor(
    @InjectModel(Profile.name) private profileModel: Model<Profile>,
    @InjectModel(User.name) private userModel: Model<User>,
    private plansService: PlansService,
  ) {}

  private async getUsername(userId: string): Promise<string> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user.username;
  }

  private async ensureUniqueSlug(
    baseSlug: string,
    excludeId?: string,
  ): Promise<string> {
    let slug = baseSlug.toLowerCase();
    let counter = 2;
    const exclude = excludeId
      ? { _id: { $ne: new Types.ObjectId(excludeId) } }
      : {};

    while (
      await this.profileModel
        .findOne({
          publicSlug: new RegExp(`^${this.escapeRegex(slug)}$`, 'i'),
          ...exclude,
        })
        .exec()
    ) {
      slug = `${baseSlug.toLowerCase()}-${counter++}`;
    }
    return slug;
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private exactCaseInsensitive(field: string, value: string) {
    return { [field]: new RegExp(`^${this.escapeRegex(value)}$`, 'i') };
  }

  private async assignPublicSlug(
    profile: Profile,
    username: string,
  ): Promise<void> {
    const base = buildPublicSlug(username, profile.title);
    profile.publicSlug = await this.ensureUniqueSlug(
      base,
      profile._id?.toString(),
    );
  }

  private async backfillSlugs(
    profiles: Profile[],
    userId: string,
  ): Promise<void> {
    const username = await this.getUsername(userId);
    for (const profile of profiles) {
      if (!profile.publicSlug) {
        await this.assignPublicSlug(profile, username);
        await profile.save();
      }
    }
  }

  private async getSourceProfileForCopy(
    userId: string,
  ): Promise<Profile | null> {
    const defaultProfile = await this.profileModel
      .findOne({ userId: new Types.ObjectId(userId), isDefault: true })
      .exec();
    if (defaultProfile) return defaultProfile;

    return this.profileModel
      .findOne({ userId: new Types.ObjectId(userId) })
      .sort({ updatedAt: -1 })
      .exec();
  }

  private async withResolvedProfileImage(
    profile: Profile | null,
  ): Promise<any> {
    if (!profile) return profile;
    const data = profile.toObject ? profile.toObject() : profile;
    const user = await this.userModel.findById(data.userId).exec();
    const useSpecific = user?.useProfileSpecificImages ?? false;
    const accountImage = user?.profileImage || '';
    const personalInfo = { ...(data.personalInfo || {}) };

    if (!useSpecific) {
      personalInfo.profileImage = accountImage;
    } else if (!personalInfo.profileImage && accountImage) {
      personalInfo.profileImage = accountImage;
    }

    return {
      ...data,
      personalInfo,
      contactFormEnabled: user?.contactFormEnabled ?? true,
    };
  }

  private async withResolvedProfileImages(profiles: Profile[]): Promise<any[]> {
    return Promise.all(
      profiles.map((profile) => this.withResolvedProfileImage(profile)),
    );
  }

  async findByUserId(userId: string): Promise<Profile[]> {
    let profiles = await this.profileModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .exec();
    if (profiles.length === 0) {
      const username = await this.getUsername(userId);
      const profile = new this.profileModel({
        userId: new Types.ObjectId(userId),
        isDefault: true,
        title: 'My Resume',
        templateId: 'resume-1',
        layout: DEFAULT_SECTIONS,
        profileKind: 'resume',
      });
      await this.assignPublicSlug(profile, username);
      await profile.save();
      profiles = [profile];
    } else {
      await this.backfillSlugs(profiles, userId);
    }
    return this.withResolvedProfileImages(profiles);
  }

  async getInitialData(userId: string) {
    const source = await this.getSourceProfileForCopy(userId);
    if (!source) {
      return {
        personalInfo: {},
        experience: [],
        education: [],
        skills: [],
        projects: [],
        layout: DEFAULT_SECTIONS,
        templateId: 'minimal',
      };
    }
    return extractProfileContent(source);
  }

  async findById(profileId: string, userId: string): Promise<Profile> {
    const profile = await this.profileModel
      .findOne({
        _id: new Types.ObjectId(profileId),
        userId: new Types.ObjectId(userId),
      })
      .exec();
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }
    return this.withResolvedProfileImage(profile);
  }

  async createProfile(userId: string, title: string): Promise<Profile> {
    const username = await this.getUsername(userId);
    const source = await this.getSourceProfileForCopy(userId);
    const kind =
      source?.profileKind || getProfileKind(source?.templateId) || 'resume';
    await this.plansService.assertCanAddProfile(userId, kind);
    const copied = source
      ? extractProfileContent(source)
      : {
          personalInfo: {},
          experience: [],
          education: [],
          skills: [],
          projects: [],
          templateId: 'minimal',
          layout: DEFAULT_SECTIONS,
          profileKind: 'resume' as const,
        };

    const profile = new this.profileModel({
      userId: new Types.ObjectId(userId),
      title: title || 'New Resume',
      isDefault: false,
      isPublished: false,
      personalInfo: copied.personalInfo,
      experience: copied.experience,
      education: copied.education,
      skills: copied.skills,
      projects: copied.projects,
      templateId: copied.templateId || 'resume-1',
      layout: copied.layout,
      profileKind: copied.profileKind,
    });
    await this.assignPublicSlug(profile, username);
    return this.withResolvedProfileImage(await profile.save());
  }

  /** New profile filled from uploaded resume — does not copy initial/default data. */
  async createProfileFromImport(
    userId: string,
    title: string,
    data: ParsedResumeData,
  ): Promise<Profile> {
    await this.plansService.assertFeature(userId, 'resumeImport');
    await this.plansService.assertCanAddProfile(userId, 'resume');
    const username = await this.getUsername(userId);
    const profileTitle =
      title?.trim() ||
      data.suggestedTitle?.trim() ||
      data.personalInfo?.fullName?.trim() ||
      'Imported Resume';

    const profile = new this.profileModel({
      userId: new Types.ObjectId(userId),
      title: profileTitle,
      isDefault: false,
      isPublished: false,
      personalInfo: data.personalInfo || {},
      experience: data.experience || [],
      education: data.education || [],
      skills: data.skills || [],
      projects: data.projects || [],
      templateId: 'resume-1',
      layout: JSON.parse(JSON.stringify(DEFAULT_SECTIONS)),
      profileKind: 'resume',
    });
    await this.assignPublicSlug(profile, username);
    return this.withResolvedProfileImage(await profile.save());
  }

  async findByPublicSlug(slug: string): Promise<Profile> {
    const profile = await this.profileModel
      .findOne({
        ...this.exactCaseInsensitive('publicSlug', slug.trim()),
        isPublished: true,
      })
      .exec();

    if (!profile) {
      throw new NotFoundException('Published profile not found');
    }

    await this.userModel
      .findByIdAndUpdate(profile.userId, { $inc: { views: 1 } })
      .exec();
    return this.withResolvedProfileImage(profile);
  }

  async findPublishedByUsername(username: string): Promise<Profile[]> {
    const user = await this.userModel
      .findOne(this.exactCaseInsensitive('username', username.trim()))
      .exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const profiles = await this.profileModel
      .find({ userId: user._id, isPublished: true })
      .sort({ updatedAt: -1 })
      .exec();
    return this.withResolvedProfileImages(profiles);
  }

  /** @deprecated Use findByPublicSlug */
  async findByUsername(username: string, profileId?: string): Promise<Profile> {
    if (profileId) {
      const user = await this.userModel
        .findOne(this.exactCaseInsensitive('username', username.trim()))
        .exec();
      if (!user) throw new NotFoundException('User not found');
      const profile = await this.profileModel
        .findOne({
          _id: new Types.ObjectId(profileId),
          userId: user._id,
          isPublished: true,
        })
        .exec();
      if (!profile) throw new NotFoundException('Published profile not found');
      await this.userModel
        .findByIdAndUpdate(user._id, { $inc: { views: 1 } })
        .exec();
      return this.withResolvedProfileImage(profile);
    }

    const published = await this.findPublishedByUsername(username);
    const website = published.find((p) => p.profileKind === 'website');
    if (website?.publicSlug) {
      return this.findByPublicSlug(website.publicSlug);
    }
    if (published[0]?.publicSlug) {
      return this.findByPublicSlug(published[0].publicSlug);
    }
    throw new NotFoundException('No published profile found for this user');
  }

  async update(
    profileId: string,
    userId: string,
    updateData: any,
  ): Promise<Profile | null> {
    if (updateData.templateId) {
      await this.plansService.assertTemplateAllowed(
        userId,
        updateData.templateId,
      );
      const newKind = getProfileKind(updateData.templateId);
      await this.plansService.assertCanSwitchToKind(userId, profileId, newKind);
    }

    if (updateData.isDefault === true) {
      await this.profileModel
        .updateMany(
          { userId: new Types.ObjectId(userId) },
          { $set: { isDefault: false } },
        )
        .exec();
    }

    if (updateData.templateId) {
      updateData.profileKind = getProfileKind(updateData.templateId);
    }

    if (updateData.title) {
      const username = await this.getUsername(userId);
      updateData.publicSlug = await this.ensureUniqueSlug(
        buildPublicSlug(username, updateData.title),
        profileId,
      );
    }

    const profile = await this.profileModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(profileId),
          userId: new Types.ObjectId(userId),
        },
        { $set: updateData },
        { new: true },
      )
      .exec();

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }
    return this.withResolvedProfileImage(profile);
  }

  async updateProfileImage(
    profileId: string,
    userId: string,
    profileImage: string,
  ): Promise<Profile | null> {
    const user = await this.userModel.findById(userId).exec();
    if (!user?.useProfileSpecificImages) {
      throw new ForbiddenException(
        'Enable per-profile photos in Settings before uploading a profile-specific image.',
      );
    }
    const profile = await this.profileModel
      .findOne({
        _id: new Types.ObjectId(profileId),
        userId: new Types.ObjectId(userId),
      })
      .exec();
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }
    const personalInfo = {
      ...JSON.parse(JSON.stringify(profile.personalInfo || {})),
      profileImage,
    };
    return this.update(profileId, userId, { personalInfo });
  }

  async publish(
    profileId: string,
    userId: string,
    isPublished: boolean,
  ): Promise<Profile | null> {
    const profile = await this.profileModel
      .findOne({
        _id: new Types.ObjectId(profileId),
        userId: new Types.ObjectId(userId),
      })
      .exec();

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    if (isPublished && !profile.publicSlug) {
      const username = await this.getUsername(userId);
      await this.assignPublicSlug(profile, username);
    }

    const updated = await this.profileModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(profileId),
          userId: new Types.ObjectId(userId),
        },
        { $set: { isPublished, publicSlug: profile.publicSlug } },
        { new: true },
      )
      .exec();

    return this.withResolvedProfileImage(updated);
  }

  async delete(profileId: string, userId: string): Promise<void> {
    const profile = await this.profileModel.findOne({
      _id: new Types.ObjectId(profileId),
      userId: new Types.ObjectId(userId),
    });

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    if (profile.isDefault) {
      throw new ForbiddenException(
        'Cannot delete your default profile. Set another as default first.',
      );
    }

    const result = await this.profileModel
      .deleteOne({
        _id: new Types.ObjectId(profileId),
        userId: new Types.ObjectId(userId),
      })
      .exec();

    if (result.deletedCount === 0) {
      throw new NotFoundException('Profile not found');
    }
  }
}
