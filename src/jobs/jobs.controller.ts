import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JobsService } from './jobs.service';

@Controller('jobs')
export class JobsController {
  constructor(private jobsService: JobsService) {}

  @UseGuards(JwtAuthGuard)
  @Get('matches')
  async getMatches(@Request() req: { user: { userId: string } }): Promise<unknown> {
    return this.jobsService.getMatches(req.user.userId);
  }
}
