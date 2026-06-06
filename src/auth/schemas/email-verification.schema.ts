import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class EmailVerification extends Document {
  @Prop({ required: true, unique: true, type: String })
  email!: string;

  @Prop({ required: true, type: String })
  otpHash!: string;

  @Prop({ required: true, type: Date })
  expiresAt!: Date;

  @Prop({ default: 0, type: Number })
  attempts!: number;
}

export const EmailVerificationSchema =
  SchemaFactory.createForClass(EmailVerification);

EmailVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
