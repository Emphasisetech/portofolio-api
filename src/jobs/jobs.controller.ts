import { Body, Controller, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';
import { JobsService } from './jobs.service';

@Controller('jobs')
export class JobsController {
  constructor(private jobsService: JobsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER)
  @Get('matches')
  async getMatches(@Request() req: { user: { userId: string } }): Promise<unknown> {
    return this.jobsService.getMatches(req.user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER)
  @Get('applications/me')
  async getMyApplications(@Request() req: { user: { userId: string } }) {
    return this.jobsService.getMyApplications(req.user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.COMPANY)
  @Get('company')
  async getCompanyJobs(@Request() req: { user: { userId: string; role?: string } }) {
    return this.jobsService.getCompanyJobs(req.user.userId, req.user.role);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.COMPANY)
  @Post('company')
  async createCompanyJob(
    @Request() req: { user: { userId: string; role?: string } },
    @Body() body: Record<string, unknown>,
  ) {
    return this.jobsService.createCompanyJob(req.user.userId, req.user.role, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.COMPANY)
  @Patch('company/:jobId')
  async updateCompanyJob(
    @Request() req: { user: { userId: string; role?: string } },
    @Param('jobId') jobId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.jobsService.updateCompanyJob(req.user.userId, req.user.role, jobId, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.COMPANY)
  @Get('company/:jobId/applications')
  async getCompanyApplications(
    @Request() req: { user: { userId: string; role?: string } },
    @Param('jobId') jobId: string,
  ) {
    return this.jobsService.getCompanyApplications(req.user.userId, req.user.role, jobId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.COMPANY)
  @Patch('company/:jobId/applications/:applicationId')
  async updateApplicationStatus(
    @Request() req: { user: { userId: string; role?: string } },
    @Param('jobId') jobId: string,
    @Param('applicationId') applicationId: string,
    @Body() body: { status: 'APPLIED' | 'ACCEPTED' | 'DECLINED' | 'HOLD' },
  ) {
    return this.jobsService.updateApplicationStatus(
      req.user.userId,
      req.user.role,
      jobId,
      applicationId,
      body.status,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER)
  @Post(':jobId/apply')
  async applyToJob(
    @Request() req: { user: { userId: string; role?: string } },
    @Param('jobId') jobId: string,
    @Body() body: { coverNote?: string },
  ) {
    return this.jobsService.applyToJob(req.user.userId, req.user.role, jobId, body.coverNote || '');
  }
}
