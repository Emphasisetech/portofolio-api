import {
  Controller,
  Post,
  Body,
  UnauthorizedException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  async register(@Body() userData: any) {
    return this.authService.register(userData);
  }

  @HttpCode(HttpStatus.OK)
  @Post('register/request-otp')
  async requestSignupOtp(@Body() userData: any) {
    return this.authService.requestSignupOtp(userData);
  }

  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(@Body() loginData: any) {
    const user = await this.authService.validateUser(
      loginData.username,
      loginData.password,
    );
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.authService.login(user);
  }
}
