import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../users/schemas/user.schema';
import { Profile } from '../profiles/schemas/profile.schema';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Profile.name) private profileModel: Model<Profile>,
  ) {}

  async getStats() {
    const totalUsers = await this.userModel.countDocuments();
    const activePortfolios = await this.profileModel.countDocuments({ isPublished: true });
    return {
      totalUsers,
      activePortfolios,
    };
  }

  async getAllUsers() {
    return this.userModel.find().select('-password').exec();
  }

  async deleteUser(userId: string) {
    await this.profileModel.deleteOne({ userId }).exec();
    return this.userModel.findByIdAndDelete(userId).exec();
  }
}
