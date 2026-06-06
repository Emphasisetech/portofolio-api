import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ResendEmailService {
  constructor(private configService: ConfigService) {}

  async sendSignupOtp(email: string, otp: string): Promise<void> {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    const from =
      this.configService.get<string>('RESEND_FROM_EMAIL') ||
      'Portfolio Builder <onboarding@resend.dev>';

    if (!apiKey) {
      throw new InternalServerErrorException(
        'Resend API key is not configured',
      );
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: 'Verify your Portfolio Builder account',
        html: `
          <div style="font-family:Arial,sans-serif;color:#0f172a">
            <h2>Your verification code</h2>
            <p>Use this code to finish creating your account:</p>
            <p style="font-size:28px;font-weight:700;letter-spacing:6px">${otp}</p>
            <p>This code expires in 10 minutes.</p>
          </div>
        `,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new InternalServerErrorException(
        `Unable to send verification email: ${body || response.statusText}`,
      );
    }
  }
}
