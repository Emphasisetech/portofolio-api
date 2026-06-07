import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';

@Controller('superadmin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERADMIN)
export class SuperAdminController {
  constructor(private adminService: AdminService) {}

  @Get('stats')
  async getStats() {
    return this.adminService.getStats();
  }

  @Get('users')
  async getUsers(@Query('role') role?: UserRole) {
    return this.adminService.getAllUsers(true, role);
  }

  @Get('deleted-users')
  async getDeletedUsers(@Query('role') role?: UserRole) {
    return this.adminService.getDeletedAccounts(true, role);
  }

  @Get('users/:id')
  async getUser(@Param('id') id: string) {
    return this.adminService.getUserDetails(id, true);
  }

  @Get('deleted-users/:id')
  async getDeletedUser(@Param('id') id: string) {
    return this.adminService.getDeletedAccountDetails(id, true);
  }

  @Patch('users/:id')
  async updateUser(@Param('id') id: string, @Body() body: Record<string, any>) {
    return this.adminService.updateUser(id, body, true);
  }

  @Delete('users/:id')
  async deleteUser(@Param('id') id: string, @Request() req) {
    return this.adminService.deleteAnyUser(id, req.user?.userId);
  }

  @Post('users/:id/activate')
  async activateUser(@Param('id') id: string) {
    return this.adminService.activateAnyUser(id);
  }

  @Post('users/:id/disable')
  async disableUser(@Param('id') id: string) {
    return this.adminService.disableAnyUser(id);
  }
}
