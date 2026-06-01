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

  private async getPlanPaymentDetails(plan: SubscriptionPlan): Promise<{
    amount: number;
    name: string;
  }> {
    const planData = await this.plansService.getPlanDefinition(plan);
    const amount = this.parsePriceToMinorUnit(planData.price);
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new BadRequestException(
        `Razorpay amount is not configured for ${planData.name}.`,
      );
    }
    return { amount, name: planData.name };
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

  async createOrder(
    userId: string,
    plan: SubscriptionPlan,
  ): Promise<{
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
      keyId: this.keyId,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      plan,
      name: this.getConfigValue('RAZORPAY_BRAND_NAME') || 'Portfolio Builder',
      description: `${name} plan`,
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
}
