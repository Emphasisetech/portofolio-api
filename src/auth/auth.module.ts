import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { JwtStrategy } from './strategies/jwt.strategy';
import {
  EmailVerification,
  EmailVerificationSchema,
} from './schemas/email-verification.schema';
import { ResendEmailService } from './resend-email.service';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    MongooseModule.forFeature([
      { name: EmailVerification.name, schema: EmailVerificationSchema },
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'secret',
        signOptions: {
          expiresIn: (configService.get<string>('JWT_EXPIRATION') ||
            '7d') as any,
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, ResendEmailService],
  exports: [AuthService],
})
export class AuthModule {}
