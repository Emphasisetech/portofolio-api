import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
  Param,
  UploadedFile,
  UseInterceptors,
  HttpException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ProfilesService } from './profiles.service';
import { ResumeImportService } from './resume-import.service';
import { CloudinaryService } from './cloudinary.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('profiles')
export class ProfilesController {
  private readonly logger = new Logger(ProfilesController.name);

  constructor(
    private profilesService: ProfilesService,
    private resumeImportService: ResumeImportService,
    private cloudinaryService: CloudinaryService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getMyProfiles(@Request() req) {
    return this.profilesService.findByUserId(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('initial-data')
  async getInitialData(@Request() req) {
    return this.profilesService.getInitialData(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('create')
  async createProfile(@Request() req, @Body('title') title: string) {
    return this.profilesService.createProfile(req.user.userId, title);
  }

  @UseGuards(JwtAuthGuard)
  @Post('import-resume')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async importResume(
    @Request() req: { user: { userId: string } },
    @UploadedFile() file: Express.Multer.File,
    @Body('title') title?: string,
  ) {
    try {
      const validFile = this.resumeImportService.validateFile(file);
      const text = await this.resumeImportService.extractText(validFile);
      const parsed = await this.resumeImportService.parseResumeText(text);
      return this.profilesService.createProfileFromImport(
        req.user.userId,
        title || '',
        parsed,
      );
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error('import-resume failed', error);
      const message =
        error instanceof Error ? error.message : 'Resume import failed';
      throw new InternalServerErrorException(message);
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('upload-profile-image/:id')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  async uploadProfileImage(
    @Request() req: { user: { userId: string } },
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const imageUrl = await this.cloudinaryService.uploadProfileImage(file);
    return this.profilesService.updateProfileImage(id, req.user.userId, imageUrl);
  }

  @Get('public/slug/:slug')
  async getPublicBySlug(@Param('slug') slug: string) {
    return this.profilesService.findByPublicSlug(slug);
  }

  @Get('public/list/:username')
  async getPublishedList(@Param('username') username: string) {
    return this.profilesService.findPublishedByUsername(username);
  }

  @Get('public/:username')
  async getPublicProfile(@Param('username') username: string) {
    return this.profilesService.findByUsername(username);
  }

  @Get('public/:username/:profileId')
  async getPublicProfileWithId(
    @Param('username') username: string,
    @Param('profileId') profileId: string,
  ) {
    return this.profilesService.findByUsername(username, profileId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getProfile(@Request() req, @Param('id') id: string) {
    if (id === 'me' || id === 'create' || id === 'update' || id === 'publish') return; // Handled by other routes
    return this.profilesService.findById(id, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('update/:id')
  async updateProfile(@Request() req, @Param('id') id: string, @Body() updateData: any) {
    return this.profilesService.update(id, req.user.userId, updateData);
  }

  @UseGuards(JwtAuthGuard)
  @Post('publish/:id')
  async publishProfile(@Request() req, @Param('id') id: string, @Body() body: { isPublished: boolean }) {
    return this.profilesService.publish(id, req.user.userId, body.isPublished);
  }

  @UseGuards(JwtAuthGuard)
  @Post('delete/:id')
  async deleteProfile(@Request() req, @Param('id') id: string) {
    await this.profilesService.delete(id, req.user.userId);
    return { success: true };
  }
}
