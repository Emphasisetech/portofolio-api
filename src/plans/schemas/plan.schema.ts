import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { SubscriptionPlan } from '../plan.types';
import type { PlanFeatures, PlanLimits } from '../plan.types';

@Schema({ timestamps: true })
export class PlanDefinition extends Document {
  @Prop({ enum: SubscriptionPlan, required: true, unique: true })
  code: SubscriptionPlan;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  price: string;

  @Prop({ default: '/month' })
  period: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ default: false })
  highlighted: boolean;

  @Prop({ default: 'Choose plan' })
  cta: string;

  @Prop({ default: '/register' })
  href: string;

  @Prop({ type: [String], default: [] })
  features: string[];

  @Prop({
    type: {
      maxResumes: { type: Number, default: null },
      maxWebsites: { type: Number, default: null },
    },
    required: true,
  })
  limits: PlanLimits;

  @Prop({
    type: {
      aiMentor: { type: Boolean, default: false },
      jobMatches: { type: Boolean, default: false },
      resumeImport: { type: Boolean, default: false },
      proTemplates: { type: Boolean, default: false },
    },
    required: true,
  })
  featureFlags: PlanFeatures;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: 0 })
  sortOrder: number;

  @Prop()
  terminatedAt?: Date;
}

export const PlanDefinitionSchema = SchemaFactory.createForClass(PlanDefinition);
