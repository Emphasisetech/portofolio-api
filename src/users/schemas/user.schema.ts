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
  @Prop({ required: true, unique: true,  type: String })
  username!: string;

  @Prop({ required: true, unique: true, type: String })
  email!: string;

  @Prop({ required: true, type: String })
  password!: string;

  @Prop({ enum: UserRole, default: UserRole.USER })
  role!: UserRole;

  @Prop({ default: '', type: String })
  companyName?: string;

  @Prop({ default: 0, type: Number })
  views!: number;

  @Prop({ default: '', type: String })
  profileImage?: string;

  @Prop({ default: false, type: Boolean })
  useProfileSpecificImages!: boolean;

  @Prop({ default: SubscriptionPlan.FREE, type: String })
  plan!: string;

  @Prop({ default: '', type: String })
  razorpayOrderId?: string;

  @Prop({ default: '', type: String })
  razorpayPaymentId?: string;

  @Prop({ default: '', type: String })
  razorpayPaymentStatus?: string;

  @Prop({ default: '', type: String })
  razorpaySubscriptionId?: string;

  @Prop({ default: '', type: String })
  razorpaySubscriptionStatus?: string;
}

export const UserSchema = SchemaFactory.createForClass(User);
