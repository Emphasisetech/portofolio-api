import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User } from '../users/schemas/user.schema';
import { Profile } from '../profiles/schemas/profile.schema';
import { getProfileKind } from '../profiles/profile.utils';
import {
  PLAN_FEATURES,
  PLAN_LABELS,
  PLAN_LIMITS,
  PRO_TEMPLATE_IDS,
  normalizePlan,
} from './plans.constants';
import {
  PlanFeatures,
  SubscriptionInfo,
  SubscriptionPlan,
} from './plan.types';

@Injectable()
export class PlansService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Profile.name) private profileModel: Model<Profile>,
  ) {}

  async getUserPlan(userId: string): Promise<SubscriptionPlan> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) throw new NotFoundException('User not found');
    return normalizePlan(user.plan);
  }

  async getUsage(userId: string): Promise<{ resumes: number; websites: number }> {
    const profiles = await this.profileModel
      .find({ userId: new Types.ObjectId(userId) })
      .select('profileKind templateId')
      .exec();

    let resumes = 0;
    let websites = 0;
    for (const p of profiles) {
      const kind =
        p.profileKind || getProfileKind(p.templateId);
      if (kind === 'website') websites += 1;
      else resumes += 1;
    }
    return { resumes, websites };
  }

  getFeatures(plan: SubscriptionPlan): PlanFeatures {
    return { ...PLAN_FEATURES[plan] };
  }

  async getSubscription(userId: string): Promise<SubscriptionInfo> {
    const plan = await this.getUserPlan(userId);
    const usage = await this.getUsage(userId);
    return {
      plan,
      planLabel: PLAN_LABELS[plan],
      limits: { ...PLAN_LIMITS[plan] },
      usage,
      features: this.getFeatures(plan),
    };
  }

  private assertUnderLimit(
    current: number,
    max: number | null,
    label: string,
    planLabel: string,
  ): void {
    if (max === null) return;
    if (current >= max) {
      throw new ForbiddenException(
        `${planLabel} plan allows up to ${max} ${label}. Upgrade to add more.`,
      );
    }
  }

  async assertCanAddProfile(
    userId: string,
    kind: 'resume' | 'website',
  ): Promise<void> {
    const plan = await this.getUserPlan(userId);
    const usage = await this.getUsage(userId);
    const limits = PLAN_LIMITS[plan];
    const planLabel = PLAN_LABELS[plan];

    if (kind === 'resume') {
      this.assertUnderLimit(
        usage.resumes,
        limits.maxResumes,
        'resumes',
        planLabel,
      );
    } else {
      this.assertUnderLimit(
        usage.websites,
        limits.maxWebsites,
        'websites',
        planLabel,
      );
    }
  }

  async assertCanSwitchToKind(
    userId: string,
    profileId: string,
    newKind: 'resume' | 'website',
  ): Promise<void> {
    const profile = await this.profileModel
      .findOne({
        _id: new Types.ObjectId(profileId),
        userId: new Types.ObjectId(userId),
      })
      .exec();
    if (!profile) return;

    const currentKind =
      profile.profileKind || getProfileKind(profile.templateId);
    if (currentKind === newKind) return;

    await this.assertCanAddProfile(userId, newKind);
  }

  async assertFeature(
    userId: string,
    feature: keyof PlanFeatures,
  ): Promise<void> {
    const plan = await this.getUserPlan(userId);
    if (!PLAN_FEATURES[plan][feature]) {
      const planLabel = PLAN_LABELS[plan];
      const messages: Record<keyof PlanFeatures, string> = {
        aiMentor: `AI Mentor requires Creator or Pro. You are on ${planLabel}.`,
        jobMatches: `Job matches require Creator or Pro. You are on ${planLabel}.`,
        resumeImport: `AI resume upload requires Creator or Pro. You are on ${planLabel}.`,
        proTemplates: `Premium templates require Pro. You are on ${planLabel}.`,
      };
      throw new ForbiddenException(messages[feature]);
    }
  }

  async assertTemplateAllowed(
    userId: string,
    templateId: string,
    profileId?: string,
  ): Promise<void> {
    if (!PRO_TEMPLATE_IDS.has(templateId)) return;

    const plan = await this.getUserPlan(userId);
    if (PLAN_FEATURES[plan].proTemplates) return;

    await this.assertFeature(userId, 'proTemplates');
  }

  async setUserPlan(
    userId: string,
    plan: SubscriptionPlan,
    billing?: { paypalSubscriptionId?: string; paypalSubscriptionStatus?: string },
  ): Promise<User> {
    const user = await this.userModel
      .findByIdAndUpdate(userId, { plan, ...(billing || {}) }, { new: true })
      .exec();
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async setPlanByPayPalSubscriptionId(
    paypalSubscriptionId: string,
    plan: SubscriptionPlan,
    paypalSubscriptionStatus: string,
  ): Promise<User | null> {
    return this.userModel
      .findOneAndUpdate(
        { paypalSubscriptionId },
        { plan, paypalSubscriptionStatus },
        { new: true },
      )
      .exec();
  }
}
