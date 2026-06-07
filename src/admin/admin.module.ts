import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminController } from './admin.controller';
import { SuperAdminController } from './superadmin.controller';
import { AdminService } from './admin.service';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Profile, ProfileSchema } from '../profiles/schemas/profile.schema';
import { Job, JobSchema } from '../jobs/schemas/job.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Profile.name, schema: ProfileSchema },
      { name: Job.name, schema: JobSchema },
    ]),
  ],
  controllers: [AdminController, SuperAdminController],
  providers: [AdminService],
})
export class AdminModule {}
