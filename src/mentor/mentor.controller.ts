import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';
import { MentorService } from './mentor.service';
import { SendMessageDto } from './dto/mentor.dto';

@Controller('mentor')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER)
export class MentorController {
  constructor(private mentorService: MentorService) {}

  @Get('chats')
  listChats(@Request() req: { user: { userId: string } }) {
    return this.mentorService.listChats(req.user.userId);
  }

  @Post('chats')
  createChat(@Request() req: { user: { userId: string } }) {
    return this.mentorService.createChat(req.user.userId);
  }

  @Get('chats/:id')
  getChat(
    @Request() req: { user: { userId: string } },
    @Param('id') id: string,
  ) {
    return this.mentorService.getChat(id, req.user.userId);
  }

  @Delete('chats/:id')
  deleteChat(
    @Request() req: { user: { userId: string } },
    @Param('id') id: string,
  ) {
    return this.mentorService.deleteChat(id, req.user.userId);
  }

  @Post('chats/:id/message')
  sendMessage(
    @Request() req: { user: { userId: string } },
    @Param('id') id: string,
    @Body() body: SendMessageDto,
  ) {
    return this.mentorService.sendMessage(id, req.user.userId, body.message);
  }

  @Post('chats/:id/stream')
  streamMessage(
    @Request() req: { user: { userId: string } },
    @Param('id') id: string,
    @Body() body: SendMessageDto,
    @Res() res: Response,
  ) {
    return this.mentorService.streamMessage(
      id,
      req.user.userId,
      body.message,
      res,
    );
  }
}
