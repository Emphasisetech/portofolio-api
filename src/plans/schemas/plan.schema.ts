import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { SubscriptionPlan } from '../plan.types';
import type { PlanFeatures, PlanLimits } from '../plan.types';

@Schema({ timestamps: true })
export class PlanDefinition extends Document {
  @Prop({ required: true, unique: true , type: String })
  code!: string;

  @Prop({ required: true, type: String })
  name!: string;

  @Prop({ required: true, type: String })
  price!: string;

  @Prop({ default: '/month', type: String })
  period!: string;

  @Prop({ default: '', type: String })
  description!: string;

  @Prop({ default: false, type: Boolean })
  highlighted!: boolean;

  @Prop({ default: 'Choose plan', type: String })
  cta!: string;

  @Prop({ default: '/register', type: String })
  href!: string;

  @Prop({ type: [String], default: [] })
  features!: string[];

  @Prop({
    type: {
      maxResumes: { type: Number, default: null },
      maxWebsites: { type: Number, default: null },
    },
    required: true,
  })
  limits!: PlanLimits;

  @Prop({
    type: {
      aiMentor: { type: Boolean, default: false },
      jobMatches: { type: Boolean, default: false },
      resumeImport: { type: Boolean, default: false },
      proTemplates: { type: Boolean, default: false },
    },
    required: true,
  })
  featureFlags!: PlanFeatures;

  @Prop({ default: true, type: Boolean })
  isActive: boolean | undefined;

  @Prop({ default: 0, type: Number })
  sortOrder!: number;

  @Prop({ type: Date })
  terminatedAt?: Date;
}

export const PlanDefinitionSchema = SchemaFactory.createForClass(PlanDefinition);
