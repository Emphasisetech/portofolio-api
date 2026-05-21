import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ChatMessageRole = 'user' | 'assistant' | 'system';

@Schema({ _id: false })
export class ChatMessage {
  @Prop({ required: true, enum: ['user', 'assistant', 'system'] })
  role!: ChatMessageRole;

  @Prop({ required: true })
  content!: string;

  @Prop({ default: () => new Date() })
  createdAt!: Date;
}

@Schema({ timestamps: true })
export class ChatSession extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ default: 'New Chat' })
  title!: string;

  @Prop({ type: [ChatMessage], default: [] })
  messages!: ChatMessage[];
}

export const ChatMessageSchema = SchemaFactory.createForClass(ChatMessage);
export const ChatSessionSchema = SchemaFactory.createForClass(ChatSession);
