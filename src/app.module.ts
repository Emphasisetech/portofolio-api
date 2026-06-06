import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ProfilesModule } from './profiles/profiles.module';
import { ProjectsModule } from './projects/projects.module';
import { TemplatesModule } from './templates/templates.module';
import { AdminModule } from './admin/admin.module';
import { MentorModule } from './mentor/mentor.module';
import { PlansModule } from './plans/plans.module';
import { JobsModule } from './jobs/jobs.module';
import { LessonsModule } from './lessons/lessons.module';
import { ContactMessagesModule } from './contact-messages/contact-messages.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI'),
      }),
      inject: [ConfigService],
    }),
    AuthModule,
    UsersModule,
    ProfilesModule,
    ProjectsModule,
    TemplatesModule,
    AdminModule,
    MentorModule,
    PlansModule,
    JobsModule,
    LessonsModule,
    ContactMessagesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
