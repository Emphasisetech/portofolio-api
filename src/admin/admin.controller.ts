import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get('stats')
  async getStats() {
    return this.adminService.getStats();
  }

  @Get('users')
  async getUsers(@Query('role') role?: UserRole) {
    return this.adminService.getAllUsers(false, role);
  }

  @Get('deleted-users')
  async getDeletedUsers(@Query('role') role?: UserRole) {
    return this.adminService.getDeletedAccounts(false, role);
  }

  @Get('users/:id')
  async getUser(@Param('id') id: string) {
    return this.adminService.getUserDetails(id);
  }

  @Get('deleted-users/:id')
  async getDeletedUser(@Param('id') id: string) {
    return this.adminService.getDeletedAccountDetails(id);
  }

  @Patch('users/:id')
  async updateUser(@Param('id') id: string, @Body() body: Record<string, any>) {
    return this.adminService.updateUser(id, body);
  }

  @Delete('users/:id')
  async deleteUser(@Param('id') id: string, @Request() req) {
    return this.adminService.deleteUser(id, req.user?.userId);
  }

  @Post('users/:id/activate')
  async activateUser(@Param('id') id: string) {
    return this.adminService.activateUser(id);
  }

  @Post('users/:id/disable')
  async disableUser(@Param('id') id: string) {
    return this.adminService.disableUser(id);
  }
}
