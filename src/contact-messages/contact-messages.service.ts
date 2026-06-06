import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Profile } from '../profiles/schemas/profile.schema';
import { User } from '../users/schemas/user.schema';
import { ContactMessage } from './schemas/contact-message.schema';

type CreateContactMessageInput = {
  profileId?: string;
  publicSlug?: string;
  name?: string;
  email?: string;
  message?: string;
};

@Injectable()
export class ContactMessagesService {
  constructor(
    @InjectModel(ContactMessage.name)
    private contactMessageModel: Model<ContactMessage>,
    @InjectModel(Profile.name) private profileModel: Model<Profile>,
    @InjectModel(User.name) private userModel: Model<User>,
  ) {}

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private normalizeRequired(value: string | undefined, label: string): string {
    const normalized = String(value || '').trim();
    if (!normalized) {
      throw new BadRequestException(`${label} is required`);
    }
    return normalized;
  }

  private async findPublishedProfile(input: CreateContactMessageInput) {
    const profileId = input.profileId?.trim();
    const publicSlug = input.publicSlug?.trim();
    const query = profileId
      ? { _id: new Types.ObjectId(profileId), isPublished: true }
      : publicSlug
        ? {
            publicSlug: new RegExp(`^${this.escapeRegex(publicSlug)}$`, 'i'),
            isPublished: true,
          }
        : null;

    if (!query) {
      throw new BadRequestException('Profile is required');
    }

    const profile = await this.profileModel.findOne(query).exec();
    if (!profile) {
      throw new NotFoundException('Published profile not found');
    }
    return profile;
  }

  async create(input: CreateContactMessageInput): Promise<ContactMessage> {
    const profile = await this.findPublishedProfile(input);
    const owner = await this.userModel.findById(profile.userId).exec();
    if (!owner || owner.contactFormEnabled === false) {
      throw new ForbiddenException(
        'This portfolio is not accepting messages right now',
      );
    }

    const name = this.normalizeRequired(input.name, 'Name');
    const email = this.normalizeRequired(input.email, 'Email').toLowerCase();
    const message = this.normalizeRequired(input.message, 'Message');

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Invalid email address');
    }

    const contactMessage = new this.contactMessageModel({
      userId: profile.userId,
      profileId: profile._id,
      profileTitle: profile.title || 'Published profile',
      publicSlug: profile.publicSlug,
      name,
      email,
      message,
    });

    return contactMessage.save();
  }

  async findForUser(userId: string): Promise<ContactMessage[]> {
    return this.contactMessageModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .exec();
  }

  async updateStatus(
    userId: string,
    messageId: string,
    isActive: boolean,
  ): Promise<ContactMessage> {
    const message = await this.contactMessageModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(messageId),
          userId: new Types.ObjectId(userId),
        },
        { $set: { isActive } },
        { new: true },
      )
      .exec();

    if (!message) {
      throw new NotFoundException('Message not found');
    }
    return message;
  }

  async delete(userId: string, messageId: string): Promise<void> {
    const result = await this.contactMessageModel
      .deleteOne({
        _id: new Types.ObjectId(messageId),
        userId: new Types.ObjectId(userId),
      })
      .exec();

    if (result.deletedCount === 0) {
      throw new NotFoundException('Message not found');
    }
  }
}
