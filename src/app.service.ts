import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  restart(): string {
    return 'Server restarted successfully!';
  }
}
