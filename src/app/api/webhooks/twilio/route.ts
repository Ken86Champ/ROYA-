/**
 * POST /api/webhooks/twilio
 *
 * Entry point for all incoming SMS and WhatsApp messages.
 * Routes every message through the V2 Conversation Orchestrator.
 */

import { NextRequest, NextResponse, after } from 'next/server';
import { runConversationTurn } from '@/lib/conversation/orchestrator';
import {
  validateTwilioSignature,
  extractTwilioParams,
} from '@/lib/compliance/webhook-signature';
import { DEFAULT_PERSONA } from '@/lib/types/conversation';

// In-process dedup: ignore MessageSids we've already started processing
// (protects against Twilio sending the same webhook twice within the same instance)
const _processing = new Set<string>();

const TWIML_EMPTY = "<?xml version='1.0' encoding='UTF-8'?><Response></Response>";
const STOP_KEYWORDS = [
  'stop', 'stopp', 'unsubscribe', 'abmelden', 'aufhören', 'aufhoeren',
  'kein interesse', 'bitte nicht mehr', 'no more', 'remove me', 'opt out',
  'optout', 'cancel', 'abbestellen',
];

function ok(): NextResponse {
  return new NextResponse(TWIML_EMPTY, { headers: { 'Content-Type': 'text/xml' } });
}

async function sendTwilioMessage(
  to: string,
  body: string,
  channel: 'sms' | 'whatsapp',
): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const from       = process.env.TWILIO_FROM_NUMBER;
  if (!accountSid || !authToken || !from) return;

  const params = new URLSearchParams();
  params.append('To',   channel === 'whatsapp' ? `whatsapp:${to}` : to);
  params.append('From', channel === 'whatsapp' ? `whatsapp:${from}` : from);
  params.append('Body', body);

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    },
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error('[ROYA] Twilio send error:', res.status, err);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const formData = await req.formData();
    const params   = extractTwilioParams(formData);

    const from      = params['From'] || '';
    const msgBody   = (params['Body'] || '').trim();
    const messageSid = params['MessageSid'] || '';
    const channel: 'sms' | 'whatsapp' = from.startsWith('whatsapp:') ? 'whatsapp' : 'sms';
    const contact = from.replace('whatsapp:', '');

    if (!contact || !msgBody) return ok();

    // ── Signature validation (non-blocking in dev, enforced in prod) ──────
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const isDev     = process.env.NODE_ENV === 'development';
    if (authToken && !isDev) {
      const twilioSig = req.headers.get('x-twilio-signature') || '';
      const baseUrl   = process.env.NEXT_PUBLIC_BASE_URL || '';
      const webhookUrl = `${baseUrl}/api/webhooks/twilio`;

      if (twilioSig && !validateTwilioSignature(authToken, twilioSig, webhookUrl, params)) {
        console.warn('[ROYA] Invalid Twilio signature from:', contact);
        return new NextResponse('Forbidden', { status: 403 });
      }
    }

    // ── Dedup: skip if already processing this MessageSid ────────────────
    if (messageSid && _processing.has(messageSid)) {
      console.log('[ROYA] Duplicate webhook ignored:', messageSid);
      return ok();
    }
    if (messageSid) _processing.add(messageSid);

    // ── Opt-out check ─────────────────────────────────────────────────────
    const msgLower = msgBody.toLowerCase();
    if (STOP_KEYWORDS.some(kw => msgLower.includes(kw))) {
      await sendTwilioMessage(
        contact,
        'Du wurdest abgemeldet und erhältst keine weiteren Nachrichten.',
        channel,
      );
      if (messageSid) _processing.delete(messageSid);
      return ok();
    }

    // ── Return 200 to Twilio immediately, process in background ──────────
    // This prevents Twilio from retrying due to slow AI processing (3 LLM calls)
    after(async () => {
      try {
        const result = await runConversationTurn({
          conversationId:  `twilio_${contact}`,
          leadName:        contact,
          channel,
          incomingMessage: msgBody,
          leadContact:     contact,
          business:        DEFAULT_PERSONA,
        });

        if (result.action === 'reply' && result.reply) {
          await sendTwilioMessage(contact, result.reply, channel);
        }
      } catch (err) {
        console.error('[ROYA] Background orchestrator error:', err);
      } finally {
        if (messageSid) _processing.delete(messageSid);
      }
    });

    return ok();
  } catch (err) {
    console.error('[ROYA] Webhook error:', err);
    return ok(); // Always return 200 to Twilio to prevent retries
  }
}
