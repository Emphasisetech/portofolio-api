import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlansService } from './plans.service';
import { PayPalService } from './paypal.service';
import { SubscriptionPlan } from './plan.types';
import { normalizePlan } from './plans.constants';

@Controller('plans')
export class PlansController {
  constructor(
    private plansService: PlansService,
    private configService: ConfigService,
    private paypalService: PayPalService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get('subscription')
  getSubscription(@Request() req: { user: { userId: string } }) {
    return this.plansService.getSubscription(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('paypal/subscription')
  createPayPalSubscription(@Body('plan') plan: string) {
    const normalized = normalizePlan(plan);
    if (normalized === SubscriptionPlan.FREE) {
      throw new ForbiddenException('Choose a paid plan to start checkout.');
    }
    return this.paypalService.createSubscription(normalized);
  }

  @UseGuards(JwtAuthGuard)
  @Post('paypal/confirm')
  async confirmPayPalSubscription(
    @Request() req: { user: { userId: string } },
    @Body('plan') plan: string,
    @Body('subscriptionId') subscriptionId: string,
  ) {
    const normalized = normalizePlan(plan);
    if (normalized === SubscriptionPlan.FREE) {
      throw new ForbiddenException('Invalid paid plan.');
    }

    const subscription = await this.paypalService.verifySubscription(
      subscriptionId,
      normalized,
    );
    await this.plansService.setUserPlan(req.user.userId, normalized, {
      paypalSubscriptionId: subscription.id,
      paypalSubscriptionStatus: subscription.status,
    });

    return this.plansService.getSubscription(req.user.userId);
  }

  @Post('paypal/webhook')
  async handlePayPalWebhook(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body()
    event: {
      event_type?: string;
      resource?: { id?: string; plan_id?: string; status?: string };
    },
  ) {
    const verified = await this.paypalService.verifyWebhookSignature(
      headers,
      event,
    );
    if (!verified) {
      throw new ForbiddenException('Invalid PayPal webhook signature.');
    }

    const subscriptionId = event.resource?.id;
    if (!subscriptionId) return { received: true };

    const paidPlan = event.resource?.plan_id
      ? this.paypalService.getPlanFromPayPalPlanId(event.resource.plan_id)
      : null;
    const status = event.resource?.status || 'UNKNOWN';

    if (
      event.event_type === 'BILLING.SUBSCRIPTION.ACTIVATED' &&
      paidPlan
    ) {
      await this.plansService.setPlanByPayPalSubscriptionId(
        subscriptionId,
        paidPlan,
        status,
      );
    }

    if (
      [
        'BILLING.SUBSCRIPTION.CANCELLED',
        'BILLING.SUBSCRIPTION.EXPIRED',
        'BILLING.SUBSCRIPTION.SUSPENDED',
      ].includes(event.event_type || '')
    ) {
      await this.plansService.setPlanByPayPalSubscriptionId(
        subscriptionId,
        SubscriptionPlan.FREE,
        status,
      );
    }

    return { received: true };
  }

  /** Dev/demo upgrade when ALLOW_DEV_PLAN_UPGRADE=true - no payment. */
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
