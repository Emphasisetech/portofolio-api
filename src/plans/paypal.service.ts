import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubscriptionPlan } from './plan.types';

interface PayPalLink {
  href: string;
  rel: string;
  method?: string;
}

interface PayPalSubscription {
  id: string;
  plan_id: string;
  status: string;
  links?: PayPalLink[];
}

interface PayPalWebhookEvent {
  event_type?: string;
  resource?: {
    id?: string;
    plan_id?: string;
    status?: string;
  };
}

interface PayPalOAuthResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
  message?: string;
}

@Injectable()
export class PayPalService {
  constructor(private configService: ConfigService) {}

  private getConfigValue(key: string): string {
    return this.configService.get<string>(key)?.trim() || '';
  }

  private get baseUrl(): string {
    const mode = this.getConfigValue('PAYPAL_MODE').toLowerCase() === 'live'
      ? 'live'
      : 'sandbox';
    return mode === 'live'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com';
  }

  getPlanId(plan: SubscriptionPlan): string {
    const envKey =
      plan === SubscriptionPlan.CREATOR
        ? 'PAYPAL_CREATOR_PLAN_ID'
        : plan === SubscriptionPlan.PRO
          ? 'PAYPAL_PRO_PLAN_ID'
          : '';
    const planId = envKey ? this.getConfigValue(envKey) : '';
    if (!planId) {
      throw new BadRequestException('PayPal is not configured for this plan.');
    }
    return planId;
  }

  getPlanFromPayPalPlanId(paypalPlanId: string): SubscriptionPlan | null {
    if (
      paypalPlanId &&
      paypalPlanId === this.getConfigValue('PAYPAL_CREATOR_PLAN_ID')
    ) {
      return SubscriptionPlan.CREATOR;
    }
    if (
      paypalPlanId &&
      paypalPlanId === this.getConfigValue('PAYPAL_PRO_PLAN_ID')
    ) {
      return SubscriptionPlan.PRO;
    }
    return null;
  }

  private getReturnUrl(plan: SubscriptionPlan): string {
    const frontendUrl = this.getConfigValue('FRONTEND_URL') || 'http://localhost:3000';
    return `${frontendUrl}/dashboard/settings?paypal=success&plan=${plan}`;
  }

  private getCancelUrl(): string {
    const frontendUrl = this.getConfigValue('FRONTEND_URL') || 'http://localhost:3000';
    return `${frontendUrl}/dashboard/settings?paypal=cancelled`;
  }

  private async getAccessToken(): Promise<string> {
    const clientId = this.getConfigValue('PAYPAL_CLIENT_ID');
    const clientSecret = this.getConfigValue('PAYPAL_CLIENT_SECRET');
    if (!clientId || !clientSecret) {
      throw new InternalServerErrorException(
        'PayPal credentials are not configured.',
      );
    }

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
      'base64',
    );
    const response = await fetch(`${this.baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    const data = (await response.json().catch(() => ({}))) as PayPalOAuthResponse;
    if (!response.ok || !data.access_token) {
      const errorDetail = data.error_description || data.message || data.error;
      throw new InternalServerErrorException(
        errorDetail
          ? `Unable to authenticate with PayPal: ${errorDetail}`
          : 'Unable to authenticate with PayPal.',
      );
    }
    return data.access_token;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const accessToken = await this.getAccessToken();
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    });
    const data = (await response.json().catch(() => ({}))) as T & {
      message?: string;
    };
    if (!response.ok) {
      throw new BadRequestException(data.message || 'PayPal request failed.');
    }
    return data;
  }

  async createSubscription(plan: SubscriptionPlan): Promise<{
    subscriptionId: string;
    approvalUrl: string;
  }> {
    if (plan === SubscriptionPlan.FREE) {
      throw new BadRequestException('Free plan does not require payment.');
    }

    const subscription = await this.request<PayPalSubscription>(
      '/v1/billing/subscriptions',
      {
        method: 'POST',
        body: JSON.stringify({
          plan_id: this.getPlanId(plan),
          application_context: {
            brand_name: this.getConfigValue('PAYPAL_BRAND_NAME') || 'Portfolio Builder',
            user_action: 'SUBSCRIBE_NOW',
            return_url: this.getReturnUrl(plan),
            cancel_url: this.getCancelUrl(),
          },
        }),
      },
    );

    const approvalUrl = subscription.links?.find(
      (link) => link.rel === 'approve',
    )?.href;
    if (!subscription.id || !approvalUrl) {
      throw new InternalServerErrorException(
        'PayPal did not return an approval link.',
      );
    }

    return { subscriptionId: subscription.id, approvalUrl };
  }

  async verifySubscription(
    subscriptionId: string,
    expectedPlan: SubscriptionPlan,
  ): Promise<PayPalSubscription> {
    if (!subscriptionId) {
      throw new BadRequestException('PayPal subscription id is required.');
    }

    const subscription = await this.request<PayPalSubscription>(
      `/v1/billing/subscriptions/${subscriptionId}`,
    );
    const actualPlan = this.getPlanFromPayPalPlanId(subscription.plan_id);
    if (actualPlan !== expectedPlan) {
      throw new ForbiddenException('PayPal subscription plan mismatch.');
    }
    if (!['ACTIVE', 'APPROVED'].includes(subscription.status)) {
      throw new ForbiddenException(
        `PayPal subscription is ${subscription.status}.`,
      );
    }
    return subscription;
  }

  async verifyWebhookSignature(
    headers: Record<string, string | string[] | undefined>,
    event: PayPalWebhookEvent,
  ): Promise<boolean> {
    const webhookId = this.getConfigValue('PAYPAL_WEBHOOK_ID');
    if (!webhookId) {
      throw new InternalServerErrorException(
        'PayPal webhook id is not configured.',
      );
    }

    const header = (name: string) => {
      const value = headers[name] || headers[name.toLowerCase()];
      return Array.isArray(value) ? value[0] : value;
    };

    const verification = await this.request<{ verification_status?: string }>(
      '/v1/notifications/verify-webhook-signature',
      {
        method: 'POST',
        body: JSON.stringify({
          auth_algo: header('paypal-auth-algo'),
          cert_url: header('paypal-cert-url'),
          transmission_id: header('paypal-transmission-id'),
          transmission_sig: header('paypal-transmission-sig'),
          transmission_time: header('paypal-transmission-time'),
          webhook_id: webhookId,
          webhook_event: event,
        }),
      },
    );

    return verification.verification_status === 'SUCCESS';
  }
}
