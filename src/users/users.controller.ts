import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CloudinaryService } from '../profiles/cloudinary.service';

@Controller('users')
export class UsersController {
  constructor(
    private usersService: UsersService,
    private cloudinaryService: CloudinaryService,
  ) {}

  private serializeUser(user: any) {
    const raw = user.toObject ? user.toObject() : user;
    return {
      id: raw._id?.toString(),
      username: raw.username,
      email: raw.email,
      role: raw.role,
      views: raw.views ?? 0,
      plan: raw.plan || 'FREE',
      profileImage: raw.profileImage || '',
      useProfileSpecificImages: raw.useProfileSpecificImages ?? false,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getMe(@Request() req) {
    const user = await this.usersService.findById(req.user.userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.serializeUser(user);
  }

  @UseGuards(JwtAuthGuard)
  @Post('settings')
  async updateSettings(
    @Request() req,
    @Body() body: { useProfileSpecificImages?: boolean },
  ) {
    const user = await this.usersService.updateSettings(req.user.userId, {
      useProfileSpecificImages: body.useProfileSpecificImages,
    });
    if (!user) throw new NotFoundException('User not found');
    return this.serializeUser(user);
  }

  @UseGuards(JwtAuthGuard)
  @Post('upload-profile-image')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  async uploadProfileImage(
    @Request() req,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const imageUrl = await this.cloudinaryService.uploadProfileImage(file);
    const user = await this.usersService.updateSettings(req.user.userId, {
      profileImage: imageUrl,
    });
    if (!user) throw new NotFoundException('User not found');
    return this.serializeUser(user);
  }
}
