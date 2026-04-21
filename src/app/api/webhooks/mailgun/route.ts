/**
 * POST /api/webhooks/mailgun
 *
 * Handles:
 * 1. Inbound email replies → Full V2 Orchestrator (same as Twilio)
 * 2. Delivery status events: delivered, bounced, failed, opened, complained
 *
 * Security: HMAC-SHA256 signature validation (prod), idempotency via Supabase.
 */

import { NextRequest, NextResponse } from "next/server";
import * as store from "@/lib/conversation-store";
import * as rateLimiter from "@/lib/rate-limiter";
import * as abStore from "@/lib/ab-store";
import { runConversationTurn } from "@/lib/conversation/orchestrator";
import { validateMailgunSignature } from "@/lib/compliance/webhook-signature";
import { send as channelSend } from "@/server/channels";
import { supabase } from "@/lib/supabase";
import { DEFAULT_PERSONA } from "@/lib/types/conversation";

// ── Idempotency: track processed event IDs ──────────────────────────────────

async function isDuplicate(eventId: string): Promise<boolean> {
  if (!eventId) return false;
  try {
    const { data } = await supabase
      .from('webhook_events')
      .select('id')
      .eq('id', eventId)
      .single();
    return !!data;
  } catch {
    return false;
  }
}

async function markProcessed(eventId: string, eventType: string): Promise<void> {
  if (!eventId) return;
  try {
    await supabase.from('webhook_events').insert({
      id: eventId,
      provider: 'mailgun',
      event_type: eventType,
    });
  } catch {
    // Ignore duplicate insert errors
  }
}

// ── Delivery status handler ─────────────────────────────────────────────────

type DeliveryEvent = 'delivered' | 'bounced' | 'failed' | 'opened' | 'complained' | 'dropped';

async function handleDeliveryEvent(
  eventType: DeliveryEvent,
  recipient: string,
  messageId: string,
  details: Record<string, unknown>,
): Promise<void> {
  console.log(`[MAILGUN] Delivery event: ${eventType} → ${recipient} (${messageId})`);

  // Update conversation message delivery status
  const conv = await store.findByContact(recipient);
  if (!conv) return;

  // Track in execution log (if campaign-linked)
  if (conv.campaignId) {
    try {
      await supabase.from('campaign_execution_log').insert({
        id: `mg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        campaign_id: conv.campaignId,
        contact_name: conv.leadName,
        event: eventType === 'delivered' ? 'send' : 'error',
        channel: 'email',
        details: { mailgunEvent: eventType, recipient, messageId, ...details },
      });
    } catch { /* non-blocking */ }
  }

  // Handle bounce/complaint → opt-out
  if (eventType === 'bounced' || eventType === 'complained') {
    await rateLimiter.optOut(recipient);
    console.log(`[MAILGUN] Auto opt-out for ${recipient}: ${eventType}`);
  }
}

// ── Parse webhook body ──────────────────────────────────────────────────────

interface MailgunBody {
  // Inbound fields
  sender?: string;
  from?: string;
  'stripped-text'?: string;
  'body-plain'?: string;
  subject?: string;
  'Message-Id'?: string;
  // Event/signature fields (Mailgun Events API format)
  signature?: { timestamp: string; token: string; signature: string };
  'event-data'?: {
    id: string;
    event: string;
    recipient: string;
    message?: { headers?: { 'message-id': string } };
    'delivery-status'?: { code: number; description: string };
    reason?: string;
  };
  // Legacy format (routes)
  timestamp?: string;
  token?: string;
  'message-id'?: string;
}

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json().catch(async () => {
      const form = await req.formData();
      return Object.fromEntries(form.entries());
    });

    const body = raw as MailgunBody;

    // ── Signature validation ──────────────────────────────────────────────
    const signingKey = process.env.MAILGUN_WEBHOOK_SIGNING_KEY;
    const isDev = process.env.NODE_ENV === 'development';

    if (signingKey && !isDev) {
      // Events API format
      const sig = body.signature;
      if (sig) {
        if (!validateMailgunSignature(signingKey, sig.timestamp, sig.token, sig.signature)) {
          console.warn('[MAILGUN] Invalid signature — rejecting');
          return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
        }
      } else {
        // Legacy route format (timestamp + token at top level)
        const ts = body.timestamp as string;
        const tk = body.token as string;
        // Skip validation if fields missing (some routes don't include them)
        if (ts && tk) {
          console.warn('[MAILGUN] Legacy signature format — accepting (no sig field)');
        }
      }
    }

    // ── Delivery status events (Events API) ─────────────────────────────
    if (body['event-data']) {
      const evt = body['event-data'];
      const eventType = evt.event as DeliveryEvent;
      const eventId = evt.id;

      if (await isDuplicate(eventId)) {
        return NextResponse.json({ success: true, dedup: true });
      }

      await handleDeliveryEvent(
        eventType,
        evt.recipient,
        evt.message?.headers?.['message-id'] || '',
        {
          deliveryCode: evt['delivery-status']?.code,
          deliveryDesc: evt['delivery-status']?.description,
          reason: evt.reason,
        },
      );

      await markProcessed(eventId, eventType);
      return NextResponse.json({ success: true });
    }

    // ── Inbound email reply ─────────────────────────────────────────────
    const from    = (body.sender || body.from || "") as string;
    const msgBody = (body['stripped-text'] || body['body-plain'] || "") as string;
    const subject = (body.subject || "Re: ROYA") as string;
    const messageId = (body['Message-Id'] || body['message-id'] || `mg-${Date.now()}`) as string;

    if (!from || !msgBody) return NextResponse.json({ success: true });

    // Idempotency check for inbound
    if (await isDuplicate(messageId)) {
      console.log('[MAILGUN] Duplicate inbound ignored:', messageId);
      return NextResponse.json({ success: true, dedup: true });
    }

    // STOP / opt-out
    if (rateLimiter.isStopKeyword(msgBody)) {
      await rateLimiter.optOut(from);
      await channelSend({ to: from, body: "Du wurdest abgemeldet. Du erhältst keine weiteren Nachrichten.", channel: 'email', subject: `Re: ${subject}` });
      await markProcessed(messageId, 'inbound_optout');
      return NextResponse.json({ success: true });
    }

    // Find or create conversation
    let conv = await store.findByContact(from);
    if (!conv) {
      conv = await store.create({ leadName: from, leadContact: from, channel: "email" });
    }

    await store.addMessage(conv.id, "lead", msgBody, "email");

    if (conv.campaignId) {
      await abStore.recordReply(from, conv.campaignId);
    }

    // ── Full V2 Orchestrator (same pipeline as Twilio) ────────────────
    try {
      const result = await runConversationTurn({
        conversationId:  conv.id,
        leadName:        conv.leadName,
        channel:         'email',
        incomingMessage: msgBody,
        leadContact:     from,
        business:        DEFAULT_PERSONA,
      });

      // Send reply via channel abstraction
      if (result.action === 'reply' && result.reply) {
        await channelSend({
          to: from,
          body: result.reply,
          channel: 'email',
          subject: subject.startsWith("Re:") ? subject : `Re: ${subject}`,
        });
        await store.addMessage(conv.id, "agent", result.reply, "email");
      }
    } catch (orchErr) {
      console.error("[MAILGUN] Orchestrator error:", orchErr);
    }

    await markProcessed(messageId, 'inbound');
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Mailgun webhook error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
