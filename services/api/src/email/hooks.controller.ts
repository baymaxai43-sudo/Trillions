import { Controller, HttpCode, Logger, Post, Req, UnauthorizedException } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { Webhook } from 'standardwebhooks';
import { MailerService } from './mailer.service';

type SendEmailPayload = {
  user: { email: string; new_email?: string };
  email_data: { token: string; token_new?: string; email_action_type: string };
};

/** Supabase Auth "Send Email" hook: Supabase makes the OTP, we deliver it. */
@Controller('hooks')
export class HooksController {
  private readonly log = new Logger(HooksController.name);
  constructor(private readonly mailer: MailerService) {}

  @Post('send-email')
  @HttpCode(200)
  async sendEmail(@Req() req: RawBodyRequest<Request>) {
    const secret = (process.env.SEND_EMAIL_HOOK_SECRET ?? '').replace('v1,whsec_', '');
    let payload: SendEmailPayload;
    try {
      payload = new Webhook(secret).verify(
        req.rawBody?.toString('utf8') ?? '',
        req.headers as Record<string, string>,
      ) as SendEmailPayload;
    } catch {
      throw new UnauthorizedException('bad signature');
    }
    const { user, email_data } = payload;
    const type = email_data.email_action_type;
    // Supabase gives hooks 5s; reply now and deliver in the background.
    const jobs =
      type === 'email_change' && user.new_email && email_data.token_new
        ? [this.mailer.sendOtp(user.email, email_data.token, type), this.mailer.sendOtp(user.new_email, email_data.token_new, type)]
        : [this.mailer.sendOtp(user.email, email_data.token, type)];
    Promise.all(jobs).catch((e) => this.log.error(`send failed: ${(e as Error).message}`));
    return {};
  }
}
