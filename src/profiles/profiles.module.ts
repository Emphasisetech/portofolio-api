import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';
import { ResumeImportService } from './resume-import.service';
import { CloudinaryService } from './cloudinary.service';
import { Profile, ProfileSchema } from './schemas/profile.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { PlansModule } from '../plans/plans.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Profile.name, schema: ProfileSchema },
      { name: User.name, schema: UserSchema },
    ]),
    PlansModule,
  ],
  controllers: [ProfilesController],
  providers: [ProfilesService, ResumeImportService, CloudinaryService],
  exports: [ProfilesService],
})
export class ProfilesModule {}
