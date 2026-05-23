import { Module } from '@nestjs/common';
import { ProfilesModule } from '../profiles/profiles.module';
import { LessonsController } from './lessons.controller';
import { LessonsService } from './lessons.service';

@Module({
  imports: [ProfilesModule],
  controllers: [LessonsController],
  providers: [LessonsService],
})
export class LessonsModule {}
