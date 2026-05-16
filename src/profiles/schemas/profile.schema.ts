import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema()
class PersonalInfo {
  @Prop()
  fullName: string;

  @Prop()
  bio: string;

  @Prop()
  title: string;

  @Prop()
  contactEmail: string;

  @Prop()
  location: string;

  @Prop()
  profileImage: string;
}

@Schema()
class Experience {
  @Prop()
  company: string;

  @Prop()
  position: string;

  @Prop()
  startDate: string;

  @Prop()
  endDate: string;

  @Prop()
  description: string;
}

@Schema()
class Education {
  @Prop()
  school: string;

  @Prop()
  degree: string;

  @Prop()
  fieldOfStudy: string;

  @Prop()
  startDate: string;

  @Prop()
  endDate: string;
}

@Schema()
class Skill {
  @Prop()
  name: string;

  @Prop()
  level: number; // 0-100
}

@Schema()
class Project {
  @Prop()
  title: string;

  @Prop()
  description: string;

  @Prop()
  link: string;

  @Prop()
  githubLink: string;

  @Prop()
  image: string;

  @Prop({ type: [String] })
  techStack: string[];
}

@Schema({ timestamps: true })
export class Profile extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: PersonalInfo })
  personalInfo: PersonalInfo;

  @Prop({ type: [Experience] })
  experience: Experience[];

  @Prop({ type: [Education] })
  education: Education[];

  @Prop({ type: [Skill] })
  skills: Skill[];

  @Prop({ type: [Project] })
  projects: Project[];

  @Prop()
  templateId: string;

  @Prop({ type: Object })
  layout: any; // Store layout JSON

  @Prop({ default: false })
  isPublished: boolean;
}

export const ProfileSchema = SchemaFactory.createForClass(Profile);
