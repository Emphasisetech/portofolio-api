import {
  BadRequestException,
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from './schemas/user.schema';

@Injectable()
export class UsersService {
  private static readonly USERNAME_PATTERN = /^[a-z][a-z0-9_-]*$/;
  private static readonly PASSWORD_PATTERN =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

  constructor(@InjectModel(User.name) private userModel: Model<User>) {}

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private exactCaseInsensitive(field: string, value: string) {
    return { [field]: new RegExp(`^${this.escapeRegex(value)}$`, 'i') };
  }

  private validateUsername(username: string): void {
    if (username.length < 5 || !UsersService.USERNAME_PATTERN.test(username)) {
      throw new BadRequestException(
        'Username must be at least 5 characters, start with a-z, and use only a-z, 0-9, _ or -',
      );
    }
  }

  private validatePassword(password: string, label = 'Password'): void {
    if (!UsersService.PASSWORD_PATTERN.test(password || '')) {
      throw new BadRequestException(
        `${label} must be at least 8 characters and include one capital letter, one small letter, one digit, and one special character`,
      );
    }
  }

  async create(userData: any): Promise<User> {
    const username = String(userData.username || '').trim().toLowerCase();
    const email = String(userData.email || '').trim().toLowerCase();
    const role = userData.role === UserRole.COMPANY ? UserRole.COMPANY : UserRole.USER;
    const companyName =
      role === UserRole.COMPANY ? String(userData.companyName || '').trim() : undefined;
    const { password } = userData;

    this.validateUsername(username);
    this.validatePassword(password);

    const existingUser = await this.userModel.findOne({
      $or: [
        this.exactCaseInsensitive('username', username),
        this.exactCaseInsensitive('email', email),
      ],
    });

    if (existingUser) {
      throw new ConflictException('Username or email already exists');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new this.userModel({
      ...userData,
      username,
      email,
      role,
      companyName,
      password: hashedPassword,
    });

    return newUser.save();
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.userModel
      .findOne(this.exactCaseInsensitive('username', username.trim()))
      .exec();
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userModel
      .findOne(this.exactCaseInsensitive('email', email.trim().toLowerCase()))
      .exec();
  }

  async findByUsernameOrEmail(identifier: string): Promise<User | null> {
    const trimmed = identifier.trim();
    if (trimmed.includes('@')) {
      return this.findByEmail(trimmed.toLowerCase());
    }
    return this.findByUsername(trimmed);
  }

  async findById(id: string): Promise<User | null> {
    return this.userModel.findById(id).exec();
  }

  async updateSettings(
    id: string,
    data: { profileImage?: string; useProfileSpecificImages?: boolean },
  ): Promise<User | null> {
    return this.userModel
      .findByIdAndUpdate(id, { $set: data }, { new: true })
      .exec();
  }

  async deactivateAccount(id: string): Promise<User | null> {
    return this.userModel
      .findByIdAndUpdate(
        id,
        { $set: { isActive: false, deactivatedAt: new Date() } },
        { new: true },
      )
      .exec();
  }

  async activateAccount(id: string): Promise<User | null> {
    return this.userModel
      .findByIdAndUpdate(
        id,
        { $set: { isActive: true }, $unset: { deactivatedAt: '' } },
        { new: true },
      )
      .select('-password')
      .exec();
  }

  async changePassword(
    id: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    this.validatePassword(newPassword, 'New password');

    const user = await this.userModel.findById(id).exec();
    if (!user?.password) {
      throw new UnauthorizedException('Unable to change password');
    }

    const currentPasswordMatches = await bcrypt.compare(
      currentPassword || '',
      user.password,
    );
    if (!currentPasswordMatches) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const newPasswordMatches = await bcrypt.compare(newPassword, user.password);
    if (newPasswordMatches) {
      throw new BadRequestException('New password must be different');
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
  }

  async findAll(): Promise<User[]> {
    return this.userModel.find().select('-password').exec();
  }

  async delete(id: string): Promise<any> {
    return this.deactivateAccount(id);
  }
}
