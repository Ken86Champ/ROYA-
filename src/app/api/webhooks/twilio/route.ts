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
import type { BusinessPersona } from '@/lib/types/conversation';
import { supabase } from '@/lib/supabase';

// ── Load campaign persona + framework for a given contact number ─────────────
async function loadCampaignContext(contact: string): Promise<{
  business: BusinessPersona;
  framework?: {
    writerInstructions?: string;
    strategistInstructions?: string;
    interpreterInstructions?: string;
    rules?: string[];
    forbiddenPhrases?: string[];
    temperature?: number;
    exampleMessages?: { context: string; message: string }[];
    referenceDoc?: string;
  };
  leadName?: string;
} | null> {
  try {
    // 1. Find the most-recently-contacted campaign for this number
    const { data: cc } = await supabase
      .from('campaign_contacts')
      .select('campaign_id, name')
      .eq('contact', contact)
      .order('last_contacted_at', { ascending: false })
      .limit(1)
      .single();

    if (!cc?.campaign_id) return null;

    // 2. Load campaign row
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', cc.campaign_id)
      .single();

    if (!campaign) return null;

    // 3. Build BusinessPersona from campaign fields
    const extra = (campaign.business_extra as Record<string, unknown>) ?? {};
    const business: BusinessPersona = {
      agentName:          campaign.agent_name || 'Roya',
      companyName:        campaign.company_name || '',
      offer:              campaign.offer || '',
      goal:               campaign.cta || 'Telefontermin vereinbaren',
      tone:               campaign.agent_tone || 'Professionell, freundlich, direkt',
      language:           'de',
      valueProp:          campaign.value_prop || undefined,
      painPoint:          campaign.pain_point || undefined,
      cta:                campaign.cta || undefined,
      bookingLink:        campaign.booking_link || undefined,
      industry:           (extra.industry as string) || undefined,
      companyDescription: (extra.companyDescription as string) || undefined,
      location:           (extra.location as string) || undefined,
      usps:               (extra.usps as string) || undefined,
      allServices:        (extra.allServices as string) || undefined,
      priceRange:         (extra.priceRange as string) || undefined,
      specialOffer:       (extra.specialOffer as string) || undefined,
      leadRelationship:   (extra.leadRelationship as string) || undefined,
      noConvertReason:    campaign.no_convert_reason || undefined,
      afterCta:           (extra.afterCta as string) || undefined,
      urgency:            (extra.urgency as string) || undefined,
      objections:         (extra.objections as { objection: string; response: string }[]) || undefined,
      doNotSay:           (extra.doNotSay as string) || undefined,
      insiderKnowledge:   (extra.insiderKnowledge as string) || undefined,
      exampleConversation:(extra.exampleConversation as string) || undefined,
    };

    // 4. Load prompt framework if campaign has one
    if (!campaign.framework_id) {
      return { business, leadName: cc.name };
    }

    const { data: fw } = await supabase
      .from('prompt_frameworks')
      .select('*')
      .eq('id', campaign.framework_id)
      .single();

    if (!fw) return { business, leadName: cc.name };

    return {
      business,
      leadName: cc.name,
      framework: {
        writerInstructions:      fw.writer_instructions || undefined,
        strategistInstructions:  fw.strategist_instructions || undefined,
        interpreterInstructions: fw.interpreter_instructions || undefined,
        rules:                   (fw.rules as string[]) || [],
        forbiddenPhrases:        (fw.forbidden_phrases as string[]) || [],
        temperature:             fw.temperature ?? 0.5,
        exampleMessages:         (fw.example_messages as { context: string; message: string }[]) || [],
      },
    };
  } catch (err) {
    console.error('[ROYA] loadCampaignContext failed:', err);
    return null;
  }
}

// In-process dedup (fast path) + Supabase dedup (persistent path)
const _processing = new Set<string>();

async function isDuplicate(sid: string): Promise<boolean> {
  if (!sid) return false;
  if (_processing.has(sid)) return true;
  try {
    const { data } = await supabase
      .from('webhook_events')
      .select('id')
      .eq('id', sid)
      .single();
    return !!data;
  } catch {
    return false;
  }
}

async function markProcessed(sid: string): Promise<void> {
  if (!sid) return;
  _processing.delete(sid);
  try {
    await supabase.from('webhook_events').insert({
      id: sid,
      provider: 'twilio',
      event_type: 'inbound',
    });
  } catch { /* ignore duplicate */ }
}

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
    if (messageSid && await isDuplicate(messageSid)) {
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
        const campaignCtx = await loadCampaignContext(contact);
        const result = await runConversationTurn({
          conversationId:  `twilio_${contact}`,
          leadName:        campaignCtx?.leadName ?? contact,
          channel,
          incomingMessage: msgBody,
          leadContact:     contact,
          business:        campaignCtx?.business ?? DEFAULT_PERSONA,
          framework:       campaignCtx?.framework,
        });

        if (result.action === 'reply' && result.reply) {
          await sendTwilioMessage(contact, result.reply, channel);
        }
      } catch (err) {
        console.error('[ROYA] Background orchestrator error:', err);
      } finally {
        if (messageSid) await markProcessed(messageSid);
      }
    });

    return ok();
  } catch (err) {
    console.error('[ROYA] Webhook error:', err);
    return ok(); // Always return 200 to Twilio to prevent retries
  }
}
