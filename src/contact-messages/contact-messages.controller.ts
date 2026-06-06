import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';
import { ContactMessagesService } from './contact-messages.service';

@Controller('contact-messages')
export class ContactMessagesController {
  constructor(private contactMessagesService: ContactMessagesService) {}

  @Post('public')
  async create(@Body() body: unknown) {
    await this.contactMessagesService.create(body as Record<string, string>);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER)
  @Get('me')
  async getMine(@Request() req: { user: { userId: string } }) {
    return this.contactMessagesService.findForUser(req.user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER)
  @Patch(':id/status')
  async updateStatus(
    @Request() req: { user: { userId: string } },
    @Param('id') id: string,
    @Body() body: { isActive?: boolean },
  ) {
    return this.contactMessagesService.updateStatus(
      req.user.userId,
      id,
      body.isActive === true,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.USER)
  @Delete(':id')
  async delete(
    @Request() req: { user: { userId: string } },
    @Param('id') id: string,
  ) {
    await this.contactMessagesService.delete(req.user.userId, id);
    return { success: true };
  }
}
