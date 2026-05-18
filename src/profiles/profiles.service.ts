import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Profile } from './schemas/profile.schema';
import { User } from '../users/schemas/user.schema';

@Injectable()
export class ProfilesService {
  constructor(
    @InjectModel(Profile.name) private profileModel: Model<Profile>,
    @InjectModel(User.name) private userModel: Model<User>,
  ) {}

  async findByUserId(userId: string): Promise<Profile> {
    let profile = await this.profileModel.findOne({ userId: new Types.ObjectId(userId) }).exec();
    if (!profile) {
      profile = new this.profileModel({ userId: new Types.ObjectId(userId) });
      await profile.save();
    }
    return profile;
  }

  async findByUsername(username: string): Promise<Profile> {
    const user = await this.userModel.findOneAndUpdate(
      { username },
      { $inc: { views: 1 } },
      { new: true }
    ).exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const profile = await this.profileModel.findOne({ userId: user._id }).exec();
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }
    return profile;
  }

  async update(userId: string, updateData: any): Promise<Profile | null> {
    const profile = await this.profileModel.findOneAndUpdate(
      { userId: new Types.ObjectId(userId) },
      { $set: updateData },
      { new: true, upsert: true },
    ).exec();
    return profile;
  }

  async publish(userId: string, isPublished: boolean): Promise<Profile | null> {
    return this.profileModel.findOneAndUpdate(
      { userId: new Types.ObjectId(userId) },
      { $set: { isPublished } },
      { new: true },
    ).exec();
  }
}
