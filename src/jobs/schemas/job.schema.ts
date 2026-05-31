import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ _id: true, timestamps: true })
class JobApplication {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ default: 'APPLIED' })
  status: 'APPLIED' | 'ACCEPTED' | 'DECLINED' | 'HOLD';

  @Prop()
  coverNote?: string;

  @Prop({ type: Object })
  candidateSnapshot?: Record<string, unknown>;
}

@Schema({ timestamps: true, collection: 'jobs', strict: false })
export class Job extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User' })
  companyUserId?: Types.ObjectId;

  @Prop()
  title?: string;

  @Prop()
  company?: string;

  @Prop()
  location?: string;

  @Prop()
  description?: string;

  @Prop()
  employmentType?: string;

  @Prop()
  workplaceType?: string;

  @Prop()
  experienceLevel?: string;

  @Prop()
  salaryRange?: string;

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

  @Prop({ type: [JobApplication], default: [] })
  applications?: JobApplication[];
}

export const JobSchema = SchemaFactory.createForClass(Job);
