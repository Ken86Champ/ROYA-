/**
 * Channel Abstraction Layer
 * 
 * Unified interface for sending messages via Twilio (SMS/WhatsApp) or Mailgun (Email).
 * Replaces duplicated transport code across send-message, send-reminder, scheduler, test-send.
 */

export type ChannelType = 'sms' | 'whatsapp' | 'email';

export interface SendResult {
  success: boolean;
  provider: 'twilio' | 'mailgun' | 'dev';
  messageId?: string;
  error?: string;
}

export interface SendParams {
  to: string;
  body: string;
  channel: ChannelType;
  subject?: string;     // email only
}

// ── Phone number normalization ──────────────────────────────────────────────

/**
 * Normalize to E.164 format.
 * Swiss defaults: "0779123456" → "+41779123456"
 */
export function normalizePhone(raw: string): string {
  const cleaned = raw.replace(/[\s\-()]/g, '');
  if (cleaned.startsWith('+')) return cleaned;
  if (cleaned.startsWith('00')) return '+' + cleaned.slice(2);
  if (cleaned.startsWith('0') && cleaned.length >= 10) {
    return '+41' + cleaned.slice(1);  // Swiss default
  }
  return '+' + cleaned;
}

/**
 * Check if a string looks like a phone number (E.164-compatible).
 */
export function isPhoneNumber(contact: string): boolean {
  const cleaned = contact.replace(/[\s\-()]/g, '');
  return /^\+?\d{8,15}$/.test(cleaned);
}

/**
 * Check if a string looks like an email address.
 */
export function isEmail(contact: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.trim());
}

/**
 * Detect the best channel for a given contact string.
 */
export function detectChannel(contact: string): ChannelType {
  if (isEmail(contact)) return 'email';
  return 'sms'; // default to SMS for phone numbers
}

// ── Twilio SMS/WhatsApp ─────────────────────────────────────────────────────

async function sendTwilio(params: SendParams): Promise<SendResult> {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from  = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) {
    return { success: false, provider: 'twilio', error: 'Twilio credentials not configured' };
  }

  const to = params.channel === 'whatsapp' ? `whatsapp:${params.to}` : params.to;
  const fromAddr = params.channel === 'whatsapp' ? `whatsapp:${from}` : from;

  const body = new URLSearchParams();
  body.append('To', to);
  body.append('From', fromAddr);
  body.append('Body', params.body);

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      },
    );

    if (!res.ok) {
      const err = await res.text().catch(() => 'unknown');
      return { success: false, provider: 'twilio', error: `HTTP ${res.status}: ${err.slice(0, 200)}` };
    }

    const data = await res.json();
    return { success: true, provider: 'twilio', messageId: data.sid };
  } catch (err) {
    return { success: false, provider: 'twilio', error: String(err) };
  }
}

// ── Mailgun Email ───────────────────────────────────────────────────────────

async function sendMailgun(params: SendParams): Promise<SendResult> {
  const apiKey = process.env.MAILGUN_API_KEY;
  const domain = process.env.MAILGUN_DOMAIN;
  const from   = process.env.MAILGUN_FROM;
  if (!apiKey || !domain || !from) {
    return { success: false, provider: 'mailgun', error: 'Mailgun credentials not configured' };
  }

  const body = new URLSearchParams();
  body.append('from', from);
  body.append('to', params.to);
  body.append('subject', params.subject || 'Kurze Frage');
  body.append('text', params.body);

  try {
    const res = await fetch(
      `https://api.mailgun.net/v3/${domain}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      },
    );

    if (!res.ok) {
      const err = await res.text().catch(() => 'unknown');
      return { success: false, provider: 'mailgun', error: `HTTP ${res.status}: ${err.slice(0, 200)}` };
    }

    const data = await res.json();
    return { success: true, provider: 'mailgun', messageId: data.id };
  } catch (err) {
    return { success: false, provider: 'mailgun', error: String(err) };
  }
}

// ── Dev fallback ────────────────────────────────────────────────────────────

function sendDev(params: SendParams): SendResult {
  console.log(
    `[CHANNEL-DEV] ${params.channel.toUpperCase()} → ${params.to}: ` +
    `"${params.body.slice(0, 80)}…"`,
  );
  return { success: true, provider: 'dev', messageId: `dev-${Date.now()}` };
}

// ── Main send function ──────────────────────────────────────────────────────

/**
 * Send a message through the appropriate channel.
 * Falls back to dev console in development if provider isn't configured.
 */
export async function send(params: SendParams): Promise<SendResult> {
  // Normalize phone numbers
  if (params.channel !== 'email') {
    params = { ...params, to: normalizePhone(params.to) };
  }

  let result: SendResult;

  if (params.channel === 'email') {
    result = await sendMailgun(params);
  } else {
    result = await sendTwilio(params);
  }

  // Dev fallback
  if (!result.success && process.env.NODE_ENV === 'development') {
    result = sendDev(params);
  }

  return result;
}

// ── Multi-channel cascade ───────────────────────────────────────────────────

export interface CascadeConfig {
  primary: ChannelType;
  fallback: ChannelType[];
  maxAttemptsPerChannel: number;
}

export const DEFAULT_CASCADE: CascadeConfig = {
  primary: 'sms',
  fallback: ['whatsapp', 'email'],
  maxAttemptsPerChannel: 3,
};

/**
 * Determine the next channel to try based on attempt history.
 * Returns null if all channels exhausted.
 */
export function nextChannel(
  attempts: Record<ChannelType, number>,
  cascade: CascadeConfig = DEFAULT_CASCADE,
): ChannelType | null {
  if ((attempts[cascade.primary] ?? 0) < cascade.maxAttemptsPerChannel) {
    return cascade.primary;
  }
  for (const fb of cascade.fallback) {
    if ((attempts[fb] ?? 0) < cascade.maxAttemptsPerChannel) {
      return fb;
    }
  }
  return null; // all channels exhausted
}
