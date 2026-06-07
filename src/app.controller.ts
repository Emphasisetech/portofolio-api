import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller("restart")
export class AppController {
  constructor(private readonly appService: AppService) {}

  
  @Get()
  restart(): string {
    return this.appService.restart();
  }
}
