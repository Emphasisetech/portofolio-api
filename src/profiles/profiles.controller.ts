import { Controller, Get, Post, Body, UseGuards, Request, Param } from '@nestjs/common';
import { ProfilesService } from './profiles.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('profiles')
export class ProfilesController {
  constructor(private profilesService: ProfilesService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getMyProfile(@Request() req) {
    return this.profilesService.findByUserId(req.user.userId);
  }

  @Get('public/:username')
  async getPublicProfile(@Param('username') username: string) {
    return this.profilesService.findByUsername(username);
  }

  @UseGuards(JwtAuthGuard)
  @Post('update')
  async updateProfile(@Request() req, @Body() updateData: any) {
    return this.profilesService.update(req.user.userId, updateData);
  }

  @UseGuards(JwtAuthGuard)
  @Post('publish')
  async publishProfile(@Request() req, @Body() body: { isPublished: boolean }) {
    return this.profilesService.publish(req.user.userId, body.isPublished);
  }
}
