import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { SubscriptionPlan } from './plan.types';
import { PlansService } from './plans.service';

interface RazorpayOrder {
  id: string;
  amount: number;
  amount_paid?: number;
  currency: string;
  receipt?: string;
  status?: string;
  notes?: {
    userId?: string;
    plan?: string;
  };
}

interface RazorpaySubscription {
  id: string;
  plan_id: string;
  status: string;
  notes?: {
    userId?: string;
    plan?: string;
    billingPeriod?: string;
  };
}

interface RazorpayWebhookEvent {
  event?: string;
  payload?: {
    subscription?: {
      entity?: RazorpaySubscription;
    };
  };
}

interface RazorpayErrorResponse {
  error?: {
    code?: string;
    description?: string;
    reason?: string;
  };
}

@Injectable()
export class RazorpayService {
  private readonly baseUrl = 'https://api.razorpay.com/v1';

  constructor(
    private configService: ConfigService,
    private plansService: PlansService,
  ) {}

  private getConfigValue(key: string): string {
    return this.configService.get<string>(key)?.trim() || '';
  }

  private get keyId(): string {
    return this.getConfigValue('RAZORPAY_KEY_ID');
  }

  private get keySecret(): string {
    return this.getConfigValue('RAZORPAY_KEY_SECRET');
  }

  private get currency(): string {
    return this.getConfigValue('RAZORPAY_CURRENCY') || 'INR';
  }

  private getSubscriptionTotalCount(billingPeriod: 'monthly' | 'yearly'): number {
    const envKey =
      billingPeriod === 'monthly'
        ? 'RAZORPAY_MONTHLY_SUBSCRIPTION_TOTAL_COUNT'
        : 'RAZORPAY_YEARLY_SUBSCRIPTION_TOTAL_COUNT';
    const configured = Number(
      this.getConfigValue(envKey) ||
        this.getConfigValue('RAZORPAY_SUBSCRIPTION_TOTAL_COUNT'),
    );
    if (Number.isInteger(configured) && configured > 0) return configured;
    return billingPeriod === 'monthly' ? 120 : 10;
  }

  private getCredentials(): { keyId: string; keySecret: string } {
    const keyId = this.keyId;
    const keySecret = this.keySecret;
    if (!keyId || !keySecret) {
      throw new InternalServerErrorException(
        'Razorpay credentials are not configured.',
      );
    }
    return { keyId, keySecret };
  }

  private parsePriceToMinorUnit(price: string): number {
    const numericPrice = Number(String(price).replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
      return 0;
    }
    return Math.round(numericPrice * 100);
  }

  private getBillingPeriod(period: string): 'monthly' | 'yearly' | null {
    const normalized = String(period || '').toLowerCase();
    if (normalized.includes('month')) return 'monthly';
    if (
      normalized.includes('year') ||
      normalized.includes('annual') ||
      normalized.includes('annum')
    ) {
      return 'yearly';
    }
    return null;
  }

  private getSubscriptionPlanId(
    plan: SubscriptionPlan,
    billingPeriod: 'monthly' | 'yearly',
  ): string {
    const envKey = `RAZORPAY_${plan}_${billingPeriod.toUpperCase()}_PLAN_ID`;
    const planId =
      this.getConfigValue(envKey) ||
      this.getConfigValue(`RAZORPAY_${plan}_PLAN_ID`);
    if (!planId) {
      throw new BadRequestException(
        `Razorpay ${billingPeriod} subscription plan id is not configured for ${plan}.`,
      );
    }
    return planId;
  }

  private async getPlanPaymentDetails(plan: SubscriptionPlan): Promise<{
    amount: number;
    name: string;
    period: string;
    billingPeriod: 'monthly' | 'yearly' | null;
  }> {
    const planData = await this.plansService.getPlanDefinition(plan);
    const amount = this.parsePriceToMinorUnit(planData.price);
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new BadRequestException(
        `Razorpay amount is not configured for ${planData.name}.`,
      );
    }
    return {
      amount,
      name: planData.name,
      period: planData.period,
      billingPeriod: this.getBillingPeriod(planData.period),
    };
  }

  private async request<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const { keyId, keySecret } = this.getCredentials();
    const credentials = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    });
    const data = (await response.json().catch(() => ({}))) as T &
      RazorpayErrorResponse;

    if (!response.ok) {
      throw new BadRequestException(
        data.error?.description || 'Razorpay request failed.',
      );
    }
    return data;
  }

  async createCheckout(
    userId: string,
    plan: SubscriptionPlan,
  ): Promise<
    | Awaited<ReturnType<RazorpayService['createOrder']>>
    | Awaited<ReturnType<RazorpayService['createSubscription']>>
  > {
    const { billingPeriod } = await this.getPlanPaymentDetails(plan);
    if (billingPeriod) {
      return this.createSubscription(userId, plan, billingPeriod);
    }
    return this.createOrder(userId, plan);
  }

  async createOrder(
    userId: string,
    plan: SubscriptionPlan,
  ): Promise<{
    type: 'order';
    keyId: string;
    orderId: string;
    amount: number;
    currency: string;
    plan: SubscriptionPlan;
    name: string;
    description: string;
  }> {
    if (plan === SubscriptionPlan.FREE) {
      throw new BadRequestException('Free plan does not require payment.');
    }

    const { amount, name } = await this.getPlanPaymentDetails(plan);
    const receipt = `${plan.toLowerCase()}_${Date.now()}`;
    const order = await this.request<RazorpayOrder>('/orders', {
      method: 'POST',
      body: JSON.stringify({
        amount,
        currency: this.currency,
        receipt,
        notes: {
          userId,
          plan,
        },
      }),
    });

    if (!order.id) {
      throw new InternalServerErrorException(
        'Razorpay did not return an order id.',
      );
    }

    return {
      type: 'order',
      keyId: this.keyId,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      plan,
      name: this.getConfigValue('RAZORPAY_BRAND_NAME') || 'Portfolio Builder',
      description: `${name} plan`,
    };
  }

  async createSubscription(
    userId: string,
    plan: SubscriptionPlan,
    billingPeriod?: 'monthly' | 'yearly',
  ): Promise<{
    type: 'subscription';
    keyId: string;
    subscriptionId: string;
    plan: SubscriptionPlan;
    name: string;
    description: string;
  }> {
    if (plan === SubscriptionPlan.FREE) {
      throw new BadRequestException('Free plan does not require payment.');
    }

    const details = await this.getPlanPaymentDetails(plan);
    const period = billingPeriod || details.billingPeriod;
    if (!period) {
      throw new BadRequestException(
        `${details.name} is not configured as a monthly or yearly subscription.`,
      );
    }

    const subscription = await this.request<RazorpaySubscription>(
      '/subscriptions',
      {
        method: 'POST',
        body: JSON.stringify({
          plan_id: this.getSubscriptionPlanId(plan, period),
          total_count: this.getSubscriptionTotalCount(period),
          quantity: 1,
          customer_notify: 1,
          notes: {
            userId,
            plan,
            billingPeriod: period,
          },
        }),
      },
    );

    if (!subscription.id) {
      throw new InternalServerErrorException(
        'Razorpay did not return a subscription id.',
      );
    }

    return {
      type: 'subscription',
      keyId: this.keyId,
      subscriptionId: subscription.id,
      plan,
      name: this.getConfigValue('RAZORPAY_BRAND_NAME') || 'Portfolio Builder',
      description: `${details.name} ${period} subscription`,
    };
  }

  private verifyPaymentSignature(params: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  }): void {
    const { keySecret } = this.getCredentials();
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = params;
    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      throw new BadRequestException('Razorpay payment details are required.');
    }

    const expected = createHmac('sha256', keySecret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');
    const expectedBuffer = Buffer.from(expected);
    const actualBuffer = Buffer.from(razorpaySignature);

    if (
      expectedBuffer.length !== actualBuffer.length ||
      !timingSafeEqual(expectedBuffer, actualBuffer)
    ) {
      throw new ForbiddenException('Invalid Razorpay payment signature.');
    }
  }

  async verifyPayment(params: {
    expectedPlan: SubscriptionPlan;
    userId: string;
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  }): Promise<void> {
    this.verifyPaymentSignature(params);

    const order = await this.request<RazorpayOrder>(
      `/orders/${params.razorpayOrderId}`,
    );
    const { amount: expectedAmount } = await this.getPlanPaymentDetails(
      params.expectedPlan,
    );
    if (
      order.amount !== expectedAmount ||
      order.currency !== this.currency ||
      order.notes?.plan !== params.expectedPlan ||
      order.notes?.userId !== params.userId
    ) {
      throw new ForbiddenException('Razorpay order does not match this plan.');
    }

    if ((order.amount_paid || 0) < expectedAmount) {
      throw new ForbiddenException('Razorpay payment is not fully paid.');
    }
  }

  private verifySubscriptionSignature(params: {
    razorpaySubscriptionId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  }): void {
    const { keySecret } = this.getCredentials();
    const {
      razorpaySubscriptionId,
      razorpayPaymentId,
      razorpaySignature,
    } = params;
    if (!razorpaySubscriptionId || !razorpayPaymentId || !razorpaySignature) {
      throw new BadRequestException(
        'Razorpay subscription payment details are required.',
      );
    }

    const expected = createHmac('sha256', keySecret)
      .update(`${razorpayPaymentId}|${razorpaySubscriptionId}`)
      .digest('hex');
    const expectedBuffer = Buffer.from(expected);
    const actualBuffer = Buffer.from(razorpaySignature);

    if (
      expectedBuffer.length !== actualBuffer.length ||
      !timingSafeEqual(expectedBuffer, actualBuffer)
    ) {
      throw new ForbiddenException('Invalid Razorpay subscription signature.');
    }
  }

  async verifySubscription(params: {
    expectedPlan: SubscriptionPlan;
    userId: string;
    razorpaySubscriptionId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  }): Promise<RazorpaySubscription> {
    this.verifySubscriptionSignature(params);

    const subscription = await this.request<RazorpaySubscription>(
      `/subscriptions/${params.razorpaySubscriptionId}`,
    );
    const details = await this.getPlanPaymentDetails(params.expectedPlan);
    if (!details.billingPeriod) {
      throw new ForbiddenException('This plan is not a recurring subscription.');
    }
    if (
      subscription.plan_id !==
        this.getSubscriptionPlanId(params.expectedPlan, details.billingPeriod) ||
      subscription.notes?.plan !== params.expectedPlan ||
      subscription.notes?.userId !== params.userId
    ) {
      throw new ForbiddenException(
        'Razorpay subscription does not match this plan.',
      );
    }

    if (!['authenticated', 'active'].includes(subscription.status)) {
      throw new ForbiddenException(
        `Razorpay subscription is ${subscription.status}.`,
      );
    }
    return subscription;
  }

  verifyWebhookSignature(rawBody: Buffer | undefined, signature?: string): void {
    const secret = this.getConfigValue('RAZORPAY_WEBHOOK_SECRET');
    if (!secret) {
      throw new InternalServerErrorException(
        'Razorpay webhook secret is not configured.',
      );
    }
    if (!rawBody || !signature) {
      throw new ForbiddenException('Razorpay webhook signature is required.');
    }

    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const expectedBuffer = Buffer.from(expected);
    const actualBuffer = Buffer.from(signature);
    if (
      expectedBuffer.length !== actualBuffer.length ||
      !timingSafeEqual(expectedBuffer, actualBuffer)
    ) {
      throw new ForbiddenException('Invalid Razorpay webhook signature.');
    }
  }

  getSubscriptionFromWebhook(event: RazorpayWebhookEvent) {
    return event.payload?.subscription?.entity || null;
  }
}
