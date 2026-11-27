import { Controller, Get, Header } from '@nestjs/common';

const page = (title: string, body: string) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · TRILLION</title>
<style>body{font-family:system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 20px;color:#0f2e24;line-height:1.6}h1{color:#047857}a{color:#047857}</style></head><body><h1>${title}</h1>${body}<p style="color:#6b7280;font-size:14px">Last updated 27 November 2026 · Contact: <a href="mailto:trillionapp.official@gmail.com">trillionapp.official@gmail.com</a></p></body></html>`;

const PRIVACY = page('Privacy Policy', `
<p>TRILLION ("we") is an AI assistant app. This policy explains what we collect and why.</p>
<h2>What we collect</h2><ul>
<li>Account info: your email address, and your name and profile picture if you sign in with Google or GitHub.</li>
<li>Content you create: your conversations, memories, files and scheduled tasks.</li>
<li>Connected services: if you connect an account (such as GitHub or Gmail), an encrypted access token so the assistant can act for you when you ask.</li></ul>
<h2>How we use it</h2><p>Only to run the app for you: signing you in, answering your requests, and remembering context you choose to keep. We do not sell your data or use it for advertising.</p>
<h2>Google user data</h2><p>When you sign in with Google we receive only your basic profile (name, email, picture) via the openid, email and profile scopes. TRILLION's use of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements.</p>
<h2>Processors</h2><p>Data is stored with Supabase and processed on Render. Your messages are sent to AI model providers to generate replies.</p>
<h2>Your choices</h2><p>You can disconnect services or delete your account and data at any time by contacting us.</p>`);

const TERMS = page('Terms of Service', `
<p>By using TRILLION you agree to use it lawfully and not to abuse the service. TRILLION is provided as is, without warranties. We may change or end the service. Questions: contact us below.</p>`);

@Controller()
export class LegalController {
  @Get('privacy') @Header('Content-Type', 'text/html; charset=utf-8') privacy() { return PRIVACY; }
  @Get('terms') @Header('Content-Type', 'text/html; charset=utf-8') terms() { return TERMS; }
}
