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

type CreateUserInput = {
  username?: string;
  email?: string;
  password?: string;
  role?: UserRole;
  companyName?: string;
};

@Injectable()
export class UsersService {
  private static readonly USERNAME_PATTERN = /^[a-z][a-z0-9_-]*$/;
  private static readonly PASSWORD_PATTERN =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
  private static readonly BLOCKED_EMAIL_DOMAINS = new Set([
    'yopmail.com',
    'yopmail.fr',
    'yopmail.net',
    'cool.fr.nf',
    'jetable.fr.nf',
    'nospam.ze.tc',
    'nomail.xl.cx',
    'mega.zik.dj',
    'mailinator.com',
    'mailinator.net',
    'mailinator.org',
    'maildrop.cc',
    'mailnesia.com',
    'mailcatch.com',
    'mailmetrash.com',
    'guerrillamail.com',
    'guerrillamail.net',
    'guerrillamail.org',
    'guerrillamail.biz',
    'guerrillamail.de',
    'sharklasers.com',
    'grr.la',
    'guerrillamailblock.com',
    '10minutemail.com',
    '10minutemail.net',
    '10mail.org',
    '20minutemail.com',
    'tempmail.com',
    'temp-mail.org',
    'tempail.com',
    'tempmailo.com',
    'mail.tm',
    'dropmail.me',
    'dropmail.xyz',
    'getnada.com',
    'getairmail.com',
    'emailondeck.com',
    'fakeinbox.com',
    'dispostable.com',
    'throwawaymail.com',
    'trashmail.com',
    'trashmail.net',
    'mytrashmail.com',
    'spamgourmet.com',
    'spam4.me',
    'mintemail.com',
    'mohmal.com',
    'harakirimail.com',
    'inboxbear.com',
    'mailpoof.com',
    'mailnull.com',
    'mailinator2.com',
    'mail-temporaire.fr',
    'temporary-mail.net',
    'tempinbox.com',
    'tempemail.net',
    'temp-mail.ru',
    'mailforspam.com',
    'mailimate.com',
    'mailinator.gq',
    'burnermail.io',
    'simplelogin.io',
    'anonaddy.com',
    'addy.io',
    'relay.firefox.com',
    'secmail.pw',
    'secmail.pro',
    'secmail.net',
    '1secmail.com',
    '1secmail.org',
    '1secmail.net',
    'tmail.ws',
    'tmailor.com',
    'tmailor.net',
    'tmails.net',
    'tmpmail.org',
    'tmpeml.com',
    'fakemail.net',
    'fakemailgenerator.com',
    'emailfake.com',
    'emailfake.net',
    'fake-mail.ml',
    'fakemailz.com',
    'bccto.me',
    'spambox.us',
    'spambox.xyz',
    'spamdecoy.net',
    'spamfree24.org',
    'luxusmail.org',
    'trashymail.com',
    'trashdevil.com',
    'wegwerfemail.de',
    'wegwerfmail.de',
    'disposableemailaddresses.com',
    'discard.email',
    'discardmail.com',
    'discardmail.de',
    'mail7.io',
    'mail7.net',
    'mail7.org',
    'mailbox.in.ua',
    'mailboxy.fun',
    'emlhub.com',
    'emltmp.com',
    'emlpro.com',
    'freeml.net',
    'anonbox.net',
    'mailmenot.io',
    'privy-mail.de',
    'temp-mail.io',
    'tempmail.plus',
    'tempmail.dev',
    'tempmail.world',
    'tempmail.lol',
    'mailhost.top',
    'mail4you.men',
    'best-mail.net',
    'freemail4.info',
    '0-mail.com',
    '0815.ru',
    '0clickemail.com',
    '0wnd.net',
    '0wnd.org',
    '47t.de',
    '7dmail.com',
    'mail.ee',
    'mail.cx',
    'mail.ac',
    'mail.kz',
  ]);

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
        'Username must be at least 5 characters, start with a letter, and use only letters, numbers, _ or -',
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

  private validateEmailDomain(email: string): void {
    const domain = email.split('@').pop()?.toLowerCase();
    if (domain && UsersService.BLOCKED_EMAIL_DOMAINS.has(domain)) {
      throw new BadRequestException(
        'Disposable or temporary email addresses are not allowed',
      );
    }
  }

  async create(userData: CreateUserInput): Promise<User> {
    const username = String(userData.username || '')
      .trim()
      .toLowerCase();
    const email = String(userData.email || '')
      .trim()
      .toLowerCase();
    const role =
      userData.role === UserRole.COMPANY ? UserRole.COMPANY : UserRole.USER;
    const companyName =
      role === UserRole.COMPANY
        ? String(userData.companyName || '').trim()
        : undefined;
    const password = userData.password || '';

    this.validateUsername(username);
    this.validatePassword(password);
    this.validateEmailDomain(email);

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
