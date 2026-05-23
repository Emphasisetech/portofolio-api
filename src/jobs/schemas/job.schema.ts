import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'jobs', strict: false })
export class Job extends Document {
  @Prop()
  title?: string;

  @Prop()
  company?: string;

  @Prop()
  location?: string;

  @Prop()
  description?: string;

  @Prop({ type: [String], default: [] })
  skills?: string[];

  @Prop({ type: [String], default: [] })
  requirements?: string[];

  @Prop()
  applyUrl?: string;

  @Prop()
  source?: string;

  @Prop({ default: true })
  active?: boolean;

  @Prop({ default: true })
  isActive?: boolean;

  @Prop()
  status?: string;

  @Prop()
  postedAt?: Date;
}

export const JobSchema = SchemaFactory.createForClass(Job);
