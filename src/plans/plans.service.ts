import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User } from '../users/schemas/user.schema';
import { Profile } from '../profiles/schemas/profile.schema';
import { getProfileKind } from '../profiles/profile.utils';
import {
  DEFAULT_PLAN_CATALOG,
  PLAN_FEATURES,
  PLAN_LABELS,
  PLAN_LIMITS,
  PRO_TEMPLATE_IDS,
  normalizePlan,
} from './plans.constants';
import {
  PlanCatalogItem,
  PlanFeatures,
  PlanLimits,
  SubscriptionInfo,
  SubscriptionPlan,
} from './plan.types';
import { PlanDefinition } from './schemas/plan.schema';

@Injectable()
export class PlansService implements OnModuleInit {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Profile.name) private profileModel: Model<Profile>,
    @InjectModel(PlanDefinition.name)
    private planModel: Model<PlanDefinition>,
  ) {}

  async onModuleInit() {
    await this.seedDefaultPlans();
  }

  private serializePlan(plan: PlanDefinition): PlanCatalogItem {
    const raw = plan.toObject ? plan.toObject() : plan;
    return {
      id: raw._id?.toString(),
      code: raw.code,
      name: raw.name,
      price: raw.price,
      period: raw.period,
      description: raw.description,
      highlighted: raw.highlighted,
      cta: raw.cta,
      href: raw.href,
      features: raw.features || [],
      limits: raw.limits,
      featureFlags: raw.featureFlags,
      isActive: raw.isActive,
      sortOrder: raw.sortOrder ?? 0,
    };
  }

  private fallbackPlan(code: SubscriptionPlan): PlanCatalogItem {
    return (
      DEFAULT_PLAN_CATALOG.find((plan) => plan.code === code) ||
      DEFAULT_PLAN_CATALOG[0]
    );
  }

  private cleanLimits(value?: Partial<PlanLimits>): PlanLimits {
    return {
      maxResumes:
        value?.maxResumes === null || typeof value?.maxResumes === 'number'
          ? value.maxResumes
          : 0,
      maxWebsites:
        value?.maxWebsites === null || typeof value?.maxWebsites === 'number'
          ? value.maxWebsites
          : 0,
    };
  }

  private cleanFeatures(value?: Partial<PlanFeatures>): PlanFeatures {
    return {
      aiMentor: Boolean(value?.aiMentor),
      jobMatches: Boolean(value?.jobMatches),
      resumeImport: Boolean(value?.resumeImport),
      proTemplates: Boolean(value?.proTemplates),
    };
  }

  private async seedDefaultPlans() {
    for (const plan of DEFAULT_PLAN_CATALOG) {
      await this.planModel
        .updateOne(
          { code: plan.code },
          { $setOnInsert: plan },
          { upsert: true },
        )
        .exec();
    }
  }

  async getPlanCatalog(includeInactive = false): Promise<PlanCatalogItem[]> {
    const query = includeInactive ? {} : { isActive: true };
    const plans = await this.planModel
      .find(query)
      .sort({ sortOrder: 1, createdAt: 1 })
      .exec();
    return plans.map((plan) => this.serializePlan(plan));
  }

  async getPlanDefinition(code: SubscriptionPlan): Promise<PlanCatalogItem> {
    const plan = await this.planModel.findOne({ code, isActive: true }).exec();
    return plan ? this.serializePlan(plan) : this.fallbackPlan(code);
  }

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

  async getFeatures(plan: SubscriptionPlan): Promise<PlanFeatures> {
    const planData = await this.getPlanDefinition(plan);
    return { ...planData.featureFlags };
  }

  async getSubscription(userId: string): Promise<SubscriptionInfo> {
    const plan = await this.getUserPlan(userId);
    const usage = await this.getUsage(userId);
    const planData = await this.getPlanDefinition(plan);
    return {
      plan,
      planLabel: planData.name,
      limits: { ...planData.limits },
      usage,
      features: { ...planData.featureFlags },
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
    const planData = await this.getPlanDefinition(plan);
    const limits = planData.limits;
    const planLabel = planData.name;

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
    const planData = await this.getPlanDefinition(plan);
    if (!planData.featureFlags[feature]) {
      const planLabel = planData.name;
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
    const features = await this.getFeatures(plan);
    if (features.proTemplates) return;

    await this.assertFeature(userId, 'proTemplates');
  }

  async setUserPlan(
    userId: string,
    plan: SubscriptionPlan,
    billing?: {
      paypalSubscriptionId?: string;
      paypalSubscriptionStatus?: string;
      razorpayOrderId?: string;
      razorpayPaymentId?: string;
      razorpayPaymentStatus?: string;
    },
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

  async createPlan(data: Partial<PlanCatalogItem>): Promise<PlanCatalogItem> {
    const code = normalizePlan(data.code);
    if (!data.code || code !== data.code) {
      throw new ForbiddenException('Invalid plan code.');
    }
    const fallback = this.fallbackPlan(code);
    const plan = new this.planModel({
      ...fallback,
      ...data,
      code,
      limits: this.cleanLimits(data.limits || fallback.limits),
      featureFlags: this.cleanFeatures(
        data.featureFlags || fallback.featureFlags,
      ),
      isActive: data.isActive ?? true,
    });
    return this.serializePlan(await plan.save());
  }

  async updatePlan(
    id: string,
    data: Partial<PlanCatalogItem>,
  ): Promise<PlanCatalogItem> {
    const update: Record<string, unknown> = { ...data };
    delete update.id;
    delete update.code;
    if (data.limits) update.limits = this.cleanLimits(data.limits);
    if (data.featureFlags) {
      update.featureFlags = this.cleanFeatures(data.featureFlags);
    }
    const plan = await this.planModel
      .findByIdAndUpdate(id, { $set: update }, { new: true })
      .exec();
    if (!plan) throw new NotFoundException('Plan not found');
    return this.serializePlan(plan);
  }

  async deletePlan(id: string) {
    const plan = await this.planModel.findById(id).lean();
    if (!plan) throw new NotFoundException('Plan not found');

    const assignedUsers = await this.userModel
      .countDocuments({ plan: plan.code })
      .exec();
    if (assignedUsers > 0) {
      throw new ForbiddenException(
        `Cannot delete ${plan.name} because ${assignedUsers} user${assignedUsers === 1 ? '' : 's'} currently ${assignedUsers === 1 ? 'holds' : 'hold'} it.`,
      );
    }

    await this.planModel.findByIdAndDelete(id).exec();
    return { deleted: true };
  }

  async terminatePlan(id: string): Promise<PlanCatalogItem> {
    const plan = await this.planModel
      .findByIdAndUpdate(
        id,
        { $set: { isActive: false, terminatedAt: new Date() } },
        { new: true },
      )
      .exec();
    if (!plan) throw new NotFoundException('Plan not found');
    // if (plan.code !== SubscriptionPlan.FREE) {
    //   await this.userModel
    //     .updateMany(
    //       { plan: plan.code },
    //       { $set: { plan: SubscriptionPlan.FREE } },
    //     )
    //     .exec();
    // }
    return this.serializePlan(plan);
  }

  async activatePlan(id: string): Promise<PlanCatalogItem> {
    const plan = await this.planModel
      .findByIdAndUpdate(
        id,
        { $set: { isActive: true }, $unset: { terminatedAt: '' } },
        { new: true },
      )
      .exec();
    if (!plan) throw new NotFoundException('Plan not found');
    return this.serializePlan(plan);
  }

  async assignPlanToUser(
    userId: string,
    plan: SubscriptionPlan,
  ): Promise<User> {
    const planData = await this.getPlanDefinition(plan);
    if (!planData.isActive) throw new ForbiddenException('Plan is terminated.');
    return this.setUserPlan(userId, plan);
  }
}
