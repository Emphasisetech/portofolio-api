import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { SubscriptionPlan } from '../../plans/plan.types';

export enum UserRole {
  USER = 'USER',
  COMPANY = 'COMPANY',
  ADMIN = 'ADMIN',
  SUPERADMIN = 'SUPERADMIN',
}

@Schema({ timestamps: true })
export class User extends Document {
  @Prop({ required: true, unique: true })
  username: string;

  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true })
  password: string;

  @Prop({ enum: UserRole, default: UserRole.USER })
  role: UserRole;

  @Prop()
  companyName?: string;

  @Prop({ default: 0 })
  views: number;

  @Prop()
  profileImage?: string;

  @Prop({ default: false })
  useProfileSpecificImages!: boolean;

  @Prop({ enum: SubscriptionPlan, default: SubscriptionPlan.FREE })
  plan: SubscriptionPlan;

  @Prop()
  paypalSubscriptionId?: string;

  @Prop()
  paypalSubscriptionStatus?: string;

  @Prop()
  razorpayOrderId?: string;

  @Prop()
  razorpayPaymentId?: string;

  @Prop()
  razorpayPaymentStatus?: string;
}

export const UserSchema = SchemaFactory.createForClass(User);
