import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Profile, ProfileSchema } from '../profiles/schemas/profile.schema';
import {
  PlanDefinition,
  PlanDefinitionSchema,
} from './schemas/plan.schema';
import { PlansService } from './plans.service';
import { PlansController } from './plans.controller';
import { PayPalService } from './paypal.service';
import { RazorpayService } from './razorpay.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Profile.name, schema: ProfileSchema },
      { name: PlanDefinition.name, schema: PlanDefinitionSchema },
    ]),
  ],
  controllers: [PlansController],
  providers: [PlansService, PayPalService, RazorpayService],
  exports: [PlansService],
})
export class PlansModule {}
