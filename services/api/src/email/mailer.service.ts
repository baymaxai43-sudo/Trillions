import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { Transporter } from 'nodemailer';

@Injectable()
export class MailerService {
  private readonly log = new Logger(MailerService.name);
  private transporter: Transporter | null = null;

  private get from() {
    return `TRILLION <${process.env.SMTP_USER ?? ''}>`;
  }

  private tx(): Transporter {
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
        port: Number(process.env.SMTP_PORT ?? 465),
        secure: Number(process.env.SMTP_PORT ?? 465) === 465,
        auth: { user: process.env.SMTP_USER, pass: (process.env.SMTP_PASS ?? '').replace(/\s+/g, '') },
      });
    }
    return this.transporter;
  }

  async sendOtp(to: string, code: string, purpose: string) {
    const { subject, heading, line } = copy(purpose);
    await this.tx().sendMail({
      from: this.from,
      to,
      subject: `${code} is your TRILLION code`,
      text: `${heading}\n\n${line}\n\n${code}\n\nThis code expires in 10 minutes. If you didn't request it, ignore this email.`,
      html: otpHtml(heading, line, code),
      headers: { 'X-Entity-Ref-ID': `${Date.now()}` },
    });
    this.log.log(`OTP email (${purpose}) sent`);
    void subject;
  }
}

function copy(purpose: string) {
  switch (purpose) {
    case 'recovery':
      return { subject: 'Reset your password', heading: 'Reset your password', line: 'Enter this code in TRILLION to set a new password.' };
    case 'magiclink':
      return { subject: 'Sign in', heading: 'Sign in to TRILLION', line: 'Enter this code in TRILLION to sign in.' };
    case 'email_change':
      return { subject: 'Confirm email change', heading: 'Confirm your new email', line: 'Enter this code in TRILLION to confirm your new email.' };
    default:
      return { subject: 'Confirm your email', heading: 'Welcome to TRILLION', line: 'Enter this code in the app to confirm your email.' };
  }
}

function otpHtml(heading: string, line: string, code: string) {
  return `<!doctype html><html><body style="margin:0;background:#F6FBF8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0B1F17">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:440px;background:#FFFFFF;border:1px solid #DCEFE4;border-radius:16px;padding:32px">
<tr><td style="font-size:20px;font-weight:700;color:#047857;letter-spacing:.5px">TRILLION</td></tr>
<tr><td style="padding-top:20px;font-size:22px;font-weight:700">${heading}</td></tr>
<tr><td style="padding-top:8px;font-size:15px;line-height:22px;color:#5B6B63">${line}</td></tr>
<tr><td style="padding-top:24px" align="center"><div style="display:inline-block;background:#D1FAE5;color:#062A1E;border-radius:12px;padding:14px 22px;font-size:32px;font-weight:700;letter-spacing:8px">${code}</div></td></tr>
<tr><td style="padding-top:24px;font-size:13px;line-height:18px;color:#5B6B63">This code expires in 10 minutes. If you didn't request it, you can ignore this email.</td></tr>
</table></td></tr></table></body></html>`;
}
