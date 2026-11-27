// Supabase Auth "Send Email" hook. Supabase makes the OTP; we deliver it from our Gmail.
// Runs as an Edge Function because Render's free tier blocks outbound SMTP.
import { Webhook } from 'npm:standardwebhooks@1.0.0';
import nodemailer from 'npm:nodemailer@6.9.16';

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: { user: Deno.env.get('SMTP_USER'), pass: (Deno.env.get('SMTP_PASS') ?? '').replace(/\s+/g, '') },
});

const COPY: Record<string, { heading: string; line: string }> = {
  signup: { heading: 'Welcome to TRILLION', line: 'Enter this code in the app to confirm your email.' },
  recovery: { heading: 'Reset your password', line: 'Enter this code in TRILLION to set a new password.' },
  magiclink: { heading: 'Sign in to TRILLION', line: 'Enter this code in TRILLION to sign in.' },
  email_change: { heading: 'Confirm your new email', line: 'Enter this code in TRILLION to confirm your new email.' },
};

function html(heading: string, line: string, code: string) {
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

async function send(to: string, code: string, type: string) {
  const c = COPY[type] ?? COPY.signup;
  await transporter.sendMail({
    from: `TRILLION <${Deno.env.get('SMTP_USER')}>`,
    to,
    subject: `${code} is your TRILLION code`,
    text: `${c.heading}\n\n${c.line}\n\n${code}\n\nThis code expires in 10 minutes.`,
    html: html(c.heading, c.line, code),
  });
}

Deno.serve(async (req) => {
  const body = await req.text();
  const secret = (Deno.env.get('SEND_EMAIL_HOOK_SECRET') ?? '').replace('v1,whsec_', '');
  let p: any;
  try {
    p = new Webhook(secret).verify(body, Object.fromEntries(req.headers));
  } catch {
    return Response.json({ error: { http_code: 401, message: 'bad signature' } }, { status: 401 });
  }
  const type = p.email_data.email_action_type;
  const jobs = [send(p.user.email, p.email_data.token, type)];
  if (type === 'email_change' && p.user.new_email && p.email_data.token_new) jobs.push(send(p.user.new_email, p.email_data.token_new, type));
  // Reply within Supabase's 5s window; finish delivery in the background.
  // @ts-ignore EdgeRuntime is provided by Supabase
  EdgeRuntime.waitUntil(Promise.all(jobs).catch((e) => console.error('send failed', e?.message)));
  return Response.json({});
});
