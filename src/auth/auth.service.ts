import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { Model } from 'mongoose';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/schemas/user.schema';
import { EmailVerification } from './schemas/email-verification.schema';
import { ResendEmailService } from './resend-email.service';

type RegisterData = {
  username?: string;
  email?: string;
  password?: string;
  role?: UserRole;
  companyName?: string;
  otp?: string;
};

@Injectable()
export class AuthService {
  private static readonly OTP_TTL_MS = 10 * 60 * 1000;
  private static readonly MAX_OTP_ATTEMPTS = 5;

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    @InjectModel(EmailVerification.name)
    private emailVerificationModel: Model<EmailVerification>,
    private resendEmailService: ResendEmailService,
  ) {}

  async validateUser(identifier: string, pass: string): Promise<any> {
    const user = await this.usersService.findByUsernameOrEmail(identifier);
    if (!user?.password) {
      return null;
    }
    if (user.isActive === false) {
      throw new UnauthorizedException(
        'Account is disabled. Contact an admin to activate it.',
      );
    }
    try {
      const passwordMatches = await bcrypt.compare(pass, user.password);
      if (!passwordMatches) {
        return null;
      }
      const { password, ...result } = user.toObject();
      return result;
    } catch {
      return null;
    }
  }

  async login(user: any) {
    console.log(`User ${user.username} logged in`);
    const payload = { username: user.username, sub: user._id, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        companyName: user.companyName || '',
        views: user.views || 0,
        plan: user.plan || 'FREE',
        dashboards: [String(user.role || 'USER').toLowerCase()],
        profileImage: user.profileImage || '',
        useProfileSpecificImages: user.useProfileSpecificImages ?? false,
        contactFormEnabled: user.contactFormEnabled ?? true,
        isActive: user.isActive !== false,
      },
    };
  }

  private normalizeEmail(email?: string): string {
    return String(email || '')
      .trim()
      .toLowerCase();
  }

  private generateOtp(): string {
    return String(randomInt(100000, 1000000));
  }

  async requestSignupOtp(userData: RegisterData) {
    const email = this.normalizeEmail(userData.email);
    await this.usersService.assertCanCreate(userData);

    const otp = this.generateOtp();
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + AuthService.OTP_TTL_MS);

    await this.emailVerificationModel
      .findOneAndUpdate(
        { email },
        { $set: { email, otpHash, expiresAt, attempts: 0 } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .exec();

    await this.resendEmailService.sendSignupOtp(email, otp);

    return {
      message: 'Verification code sent to your email',
      email,
      expiresInSeconds: Math.floor(AuthService.OTP_TTL_MS / 1000),
    };
  }

  async register(userData: RegisterData) {
    const email = this.normalizeEmail(userData.email);
    const otp = String(userData.otp || '').trim();

    if (!/^\d{6}$/.test(otp)) {
      throw new BadRequestException('A valid 6-digit email OTP is required');
    }

    const verification = await this.emailVerificationModel
      .findOne({ email })
      .exec();

    if (!verification || verification.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Verification code has expired');
    }

    if (verification.attempts >= AuthService.MAX_OTP_ATTEMPTS) {
      throw new BadRequestException('Too many incorrect verification attempts');
    }

    const otpMatches = await bcrypt.compare(otp, verification.otpHash);
    if (!otpMatches) {
      verification.attempts += 1;
      await verification.save();
      throw new BadRequestException('Invalid verification code');
    }

    const user = await this.usersService.create(userData);
    await this.emailVerificationModel.deleteOne({ email }).exec();
    return this.login(user);
  }
}
