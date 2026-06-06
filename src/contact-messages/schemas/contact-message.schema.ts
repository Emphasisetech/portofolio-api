import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class ContactMessage extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Profile', required: true, index: true })
  profileId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  profileTitle!: string;

  @Prop({ trim: true })
  publicSlug?: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, trim: true, lowercase: true })
  email!: string;

  @Prop({ required: true, trim: true })
  message!: string;

  @Prop({ default: true, type: Boolean })
  isActive!: boolean;
}

export const ContactMessageSchema =
  SchemaFactory.createForClass(ContactMessage);
