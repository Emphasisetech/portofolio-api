import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlansService } from './plans.service';
import { SubscriptionPlan } from './plan.types';
import { normalizePlan } from './plans.constants';

@Controller('plans')
export class PlansController {
  constructor(
    private plansService: PlansService,
    private configService: ConfigService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get('subscription')
  getSubscription(@Request() req: { user: { userId: string } }) {
    return this.plansService.getSubscription(req.user.userId);
  }

  /** Dev/demo upgrade when ALLOW_DEV_PLAN_UPGRADE=true — no payment yet. */
  @UseGuards(JwtAuthGuard)
  @Post('upgrade')
  async upgradePlan(
    @Request() req: { user: { userId: string } },
    @Body('plan') plan: string,
  ) {
    const allow =
      this.configService.get<string>('ALLOW_DEV_PLAN_UPGRADE') === 'true';
    if (!allow) {
      throw new ForbiddenException(
        'Online billing is not enabled yet. Contact us to upgrade your account.',
      );
    }

    const normalized = normalizePlan(plan);
    if (normalized === SubscriptionPlan.FREE) {
      await this.plansService.setUserPlan(req.user.userId, SubscriptionPlan.FREE);
    } else if (
      normalized === SubscriptionPlan.CREATOR ||
      normalized === SubscriptionPlan.PRO
    ) {
      await this.plansService.setUserPlan(req.user.userId, normalized);
    } else {
      throw new ForbiddenException('Invalid plan');
    }

    return this.plansService.getSubscription(req.user.userId);
  }
}
