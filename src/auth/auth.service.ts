import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
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

  async register(userData: any) {
    const user = await this.usersService.create(userData);
    return this.login(user);
  }
}
