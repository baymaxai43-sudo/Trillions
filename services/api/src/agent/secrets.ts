/**
 * Secret hygiene for anything that reaches the model, the event stream or agent_steps.
 * Connector tokens never pass through the agent at all (the paste card posts straight to /v1/connect);
 * this catches secrets a user pasted into chat by mistake or that appear inside files and logs.
 */
const PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, label: 'GitHub token' },
  { re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g, label: 'GitHub token' },
  { re: /\bsbp_[A-Za-z0-9]{30,}\b/g, label: 'Supabase token' },
  { re: /\bsb_secret_[A-Za-z0-9_-]{20,}\b/g, label: 'Supabase secret key' },
  { re: /\brnd_[A-Za-z0-9]{20,}\b/g, label: 'Render API key' },
  { re: /\bnfp_[A-Za-z0-9]{20,}\b/g, label: 'Netlify token' },
  { re: /\bvercel_[A-Za-z0-9_-]{20,}\b/gi, label: 'Vercel token' },
  { re: /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}\b/g, label: 'API key' },
  { re: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, label: 'AWS key' },
  { re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g, label: 'Slack token' },
  { re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, label: 'JWT' },
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, label: 'private key' },
];

export function redactSecrets(text: string): { text: string; found: string[] } {
  const found = new Set<string>();
  let out = text;
  for (const { re, label } of PATTERNS) {
    out = out.replace(re, () => {
      found.add(label);
      return `[REDACTED ${label}]`;
    });
  }
  return { text: out, found: [...found] };
}

export const redact = (text: string) => redactSecrets(text).text;

/** Deep-redacts string values (tool args before they are emitted or saved). */
export function redactArgs<T>(v: T): T {
  if (typeof v === 'string') return redact(v) as unknown as T;
  if (Array.isArray(v)) return v.map(redactArgs) as unknown as T;
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, redactArgs(x)])) as T;
  return v;
}
