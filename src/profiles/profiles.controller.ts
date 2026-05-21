import { Controller, Get, Post, Body, UseGuards, Request, Param } from '@nestjs/common';
import { ProfilesService } from './profiles.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('profiles')
export class ProfilesController {
  constructor(private profilesService: ProfilesService) {}

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
