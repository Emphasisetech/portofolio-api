import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Req,
  Request,
  UseGuards,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';
import { PlansService } from './plans.service';
import { RazorpayService } from './razorpay.service';
import { SubscriptionPlan } from './plan.types';
import { normalizePlan } from './plans.constants';

@Controller('plans')
export class PlansController {
  constructor(
    private plansService: PlansService,
    private configService: ConfigService,
    private razorpayService: RazorpayService,
  ) {}

  @Get()
  getPlans() {
    return this.plansService.getPlanCatalog(false);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
  @Get('admin/all')
  getAllPlansForAdmin() {
    return this.plansService.getPlanCatalog(true);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERADMIN)
  @Post('admin')
  createPlan(@Body() body: any) {
    console.log('Creating plan with data:', body);
    return this.plansService.createPlan(body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERADMIN)
  @Patch('admin/:id')
  updatePlan(@Param('id') id: string, @Body() body: any) {
    return this.plansService.updatePlan(id, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERADMIN)
  @Delete('admin/:id')
  deletePlan(@Param('id') id: string) {
    return this.plansService.deletePlan(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERADMIN)
  @Post('admin/:id/terminate')
  terminatePlan(@Param('id') id: string) {
    return this.plansService.terminatePlan(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERADMIN)
  @Post('admin/:id/activate')
  activatePlan(@Param('id') id: string) {
    return this.plansService.activatePlan(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERADMIN)
  @Post('admin/users/:userId/plan')
  assignPlanToUser(
    @Param('userId') userId: string,
    @Body('plan') plan: string,
  ) {
    return this.plansService.assignPlanToUser(userId, normalizePlan(plan));
  }

  @UseGuards(JwtAuthGuard)
  @Get('subscription')
  getSubscription(@Request() req: { user: { userId: string } }) {
    return this.plansService.getSubscription(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('razorpay/checkout')
  createRazorpayCheckout(
    @Request() req: { user: { userId: string } },
    @Body('plan') plan: string,
  ) {
    const normalized = normalizePlan(plan);
    if (normalized === SubscriptionPlan.FREE) {
      throw new ForbiddenException('Choose a paid plan to start checkout.');
    }
    return this.razorpayService.createCheckout(req.user.userId, normalized);
  }

  @UseGuards(JwtAuthGuard)
  @Post('razorpay/order')
  createRazorpayOrder(
    @Request() req: { user: { userId: string } },
    @Body('plan') plan: string,
  ) {
    const normalized = normalizePlan(plan);
    if (normalized === SubscriptionPlan.FREE) {
      throw new ForbiddenException('Choose a paid plan to start checkout.');
    }
    return this.razorpayService.createOrder(req.user.userId, normalized);
  }

  @UseGuards(JwtAuthGuard)
  @Post('razorpay/confirm')
  async confirmRazorpayPayment(
    @Request() req: { user: { userId: string } },
    @Body('plan') plan: string,
    @Body('razorpay_order_id') razorpayOrderId: string,
    @Body('razorpay_payment_id') razorpayPaymentId: string,
    @Body('razorpay_signature') razorpaySignature: string,
  ) {
    const normalized = normalizePlan(plan);
    if (normalized === SubscriptionPlan.FREE) {
      throw new ForbiddenException('Invalid paid plan.');
    }

    await this.razorpayService.verifyPayment({
      expectedPlan: normalized,
      userId: req.user.userId,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    });
    await this.plansService.setUserPlan(req.user.userId, normalized, {
      razorpayOrderId,
      razorpayPaymentId,
      razorpayPaymentStatus: 'paid',
    });

    return this.plansService.getSubscription(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('razorpay/subscription/confirm')
  async confirmRazorpaySubscription(
    @Request() req: { user: { userId: string } },
    @Body('plan') plan: string,
    @Body('razorpay_subscription_id') razorpaySubscriptionId: string,
    @Body('razorpay_payment_id') razorpayPaymentId: string,
    @Body('razorpay_signature') razorpaySignature: string,
  ) {
    const normalized = normalizePlan(plan);
    if (normalized === SubscriptionPlan.FREE) {
      throw new ForbiddenException('Invalid paid plan.');
    }

    const subscription = await this.razorpayService.verifySubscription({
      expectedPlan: normalized,
      userId: req.user.userId,
      razorpaySubscriptionId,
      razorpayPaymentId,
      razorpaySignature,
    });
    await this.plansService.setUserPlan(req.user.userId, normalized, {
      razorpaySubscriptionId: subscription.id,
      razorpaySubscriptionStatus: subscription.status,
      razorpayPaymentId,
      razorpayPaymentStatus: 'paid',
    });

    return this.plansService.getSubscription(req.user.userId);
  }

  @Post('razorpay/webhook')
  async handleRazorpayWebhook(
    @Headers('x-razorpay-signature') signature: string | undefined,
    @Req() req: ExpressRequest & { rawBody?: Buffer },
    @Body() event: { event?: string },
  ) {
    this.razorpayService.verifyWebhookSignature(req.rawBody, signature);
    const subscription = this.razorpayService.getSubscriptionFromWebhook(event);
    if (!subscription?.id) return { received: true };

    const status = subscription.status || 'unknown';
    if (
      [
        'subscription.authenticated',
        'subscription.activated',
        'subscription.charged',
      ].includes(event.event || '')
    ) {
      const paidPlan = normalizePlan(subscription.notes?.plan);
      if (
        paidPlan !== SubscriptionPlan.CREATOR &&
        paidPlan !== SubscriptionPlan.PRO
      ) {
        return { received: true };
      }
      await this.plansService.setPlanByRazorpaySubscriptionId(
        subscription.id,
        paidPlan,
        status,
      );
    }

    if (
      [
        'subscription.cancelled',
        'subscription.completed',
        'subscription.expired',
        'subscription.halted',
      ].includes(event.event || '')
    ) {
      await this.plansService.setPlanByRazorpaySubscriptionId(
        subscription.id,
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
