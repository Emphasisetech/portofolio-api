import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LessonsService } from './lessons.service';

@Controller('lessons')
export class LessonsController {
  constructor(private lessonsService: LessonsService) {}

  @UseGuards(JwtAuthGuard)
  @Get('mini')
  async getMiniLessons(@Request() req: { user: { userId: string } }): Promise<unknown> {
    return this.lessonsService.getMiniLessons(req.user.userId);
  }
}
