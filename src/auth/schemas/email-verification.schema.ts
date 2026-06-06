import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum EmailVerificationPurpose {
  SIGNUP = 'SIGNUP',
  PASSWORD_RESET = 'PASSWORD_RESET',
}

@Schema({ timestamps: true })
export class EmailVerification extends Document {
  @Prop({ required: true, type: String })
  email!: string;

  @Prop({
    enum: EmailVerificationPurpose,
    required: true,
    type: String,
  })
  purpose!: EmailVerificationPurpose;

  @Prop({ required: true, type: String })
  otpHash!: string;

  @Prop({ required: true, type: Date })
  expiresAt!: Date;

  @Prop({ default: 0, type: Number })
  attempts!: number;
}

export const EmailVerificationSchema =
  SchemaFactory.createForClass(EmailVerification);

EmailVerificationSchema.index({ email: 1, purpose: 1 }, { unique: true });
EmailVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
