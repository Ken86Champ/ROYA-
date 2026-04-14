/**
 * GET /api/twilio-poll?contact=+41...&since=ISO_DATE
 *
 * Polls Twilio for new inbound messages from a specific contact.
 * Used when webhooks can't reach localhost (dev mode).
 * Returns new messages since the given timestamp.
 *
 * POST /api/twilio-poll
 * { contact, message, leadName, history, business }
 *
 * Processes an inbound message through the AI pipeline and sends the reply via Twilio.
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

function getTwilioCredentials() {
  // Read from settings file first, fall back to env vars
  let settings: Record<string, string> = {};
  try {
    const file = path.join(process.cwd(), 'roya-settings.json');
    if (fs.existsSync(file)) settings = JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {}
  const accountSid    = settings.twilioAccountSid || process.env.TWILIO_ACCOUNT_SID;
  const authToken     = settings.twilioAuthToken  || process.env.TWILIO_AUTH_TOKEN;
  const fromNumber    = settings.twilioFrom       || process.env.TWILIO_FROM_NUMBER;
  const whatsappFrom  = settings.twilioWhatsappFrom || process.env.TWILIO_WHATSAPP_FROM;
  return { accountSid, authToken, fromNumber, whatsappFrom };
}

function authHeader(accountSid: string, authToken: string) {
  return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`;
}

// GET — poll for new inbound messages from a contact
export async function GET(req: NextRequest) {
  const { accountSid, authToken, fromNumber, whatsappFrom } = getTwilioCredentials();
  if (!accountSid || !authToken || !fromNumber) {
    return NextResponse.json({ error: 'Twilio nicht konfiguriert' }, { status: 400 });
  }

  const contact = req.nextUrl.searchParams.get('contact');
  const since   = req.nextUrl.searchParams.get('since'); // ISO date string
  const channel = req.nextUrl.searchParams.get('channel') || 'sms'; // 'sms' | 'whatsapp'

  if (!contact) {
    return NextResponse.json({ error: 'contact parameter required' }, { status: 400 });
  }

  try {
    // For WhatsApp, Twilio stores From/To with whatsapp: prefix
    const waNum = whatsappFrom || fromNumber;
    const fromField = channel === 'whatsapp' ? `whatsapp:${waNum}` : fromNumber;
    const contactField = channel === 'whatsapp' ? `whatsapp:${contact}` : contact;

    // Fetch messages sent TO our number FROM the contact (inbound)
    const url = new URL(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`);
    url.searchParams.set('To', fromField);
    url.searchParams.set('From', contactField);
    url.searchParams.set('PageSize', '10');
    if (since) {
      // Twilio DateSent filter: messages after this date
      url.searchParams.set('DateSent>', since.split('T')[0]);
    }

    const res = await fetch(url.toString(), {
      headers: { Authorization: authHeader(accountSid, authToken) },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json({ error: 'Twilio API error', details: err }, { status: 500 });
    }

    const data = await res.json();
    const messages = (data.messages || [])
      .filter((m: { status: string }) => m.status === 'received')
      .map((m: { body: string; date_sent: string; sid: string }) => ({
        body: m.body,
        dateSent: m.date_sent,
        sid: m.sid,
      }))
      // Filter by exact timestamp if provided
      .filter((m: { dateSent: string }) => {
        if (!since) return true;
        return new Date(m.dateSent).getTime() > new Date(since).getTime();
      })
      // Sort oldest first
      .sort((a: { dateSent: string }, b: { dateSent: string }) =>
        new Date(a.dateSent).getTime() - new Date(b.dateSent).getTime()
      );

    return NextResponse.json({ messages });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// POST — process inbound message through AI and send reply via Twilio
export async function POST(req: NextRequest) {
  const { accountSid, authToken, fromNumber } = getTwilioCredentials();
  if (!accountSid || !authToken || !fromNumber) {
    return NextResponse.json({ error: 'Twilio nicht konfiguriert' }, { status: 400 });
  }

  try {
    const { contact, message, leadName, history, business } = await req.json();

    if (!contact || !message) {
      return NextResponse.json({ error: 'contact and message required' }, { status: 400 });
    }

    // Run through the same AI pipeline as /api/converse
    const converseRes = await fetch(new URL('/api/converse', req.url), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadName, message, history, business }),
    });

    const data = await converseRes.json();
    const reply = data.reply;

    if (!reply) {
      return NextResponse.json({ error: 'No reply generated', data });
    }

    // Send reply via Twilio
    const params = new URLSearchParams();
    params.append('To', contact);
    params.append('From', fromNumber);
    params.append('Body', reply);

    const sendRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: authHeader(accountSid, authToken),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      },
    );

    if (!sendRes.ok) {
      const err = await sendRes.json().catch(() => ({}));
      return NextResponse.json({ error: 'Twilio send error', details: err }, { status: 500 });
    }

    return NextResponse.json({
      reply,
      intent: data.intent,
      sentiment: data.sentiment,
      confidence: data.confidence,
      nextAction: data.nextAction,
      reasoning: data.reasoning,
      sent: true,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
