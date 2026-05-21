import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MentorController } from './mentor.controller';
import { MentorService } from './mentor.service';
import { ChatSession, ChatSessionSchema } from './schemas/chat.schema';
import { ProfilesModule } from '../profiles/profiles.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ChatSession.name, schema: ChatSessionSchema },
    ]),
    ProfilesModule,
  ],
  controllers: [MentorController],
  providers: [MentorService],
  exports: [MentorService],
})
export class MentorModule {}
