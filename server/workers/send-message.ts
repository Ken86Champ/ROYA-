// ─── Send Message Worker ───────────────────────────────────────────────────────
// Handles the "send_message" BullMQ job:
// 1. Generates message (template or AI)
// 2. Sends via Twilio or Mailgun
// 3. Creates/updates conversation
// 4. Updates contact status + increments channel attempt counter
// 5. Enqueues check_no_reply job (fires 48h later)
// 6. Handles channel orchestration: after 3 email no-replies → try SMS/WA

import type { Job } from "bullmq";
import type { SendMessagePayload } from "../../src/lib/queue";
import { enqueueNoReplyCheck, enqueueSend } from "../../src/lib/queue";
import * as campaignStore from "../../src/lib/campaign-store";
import * as convStore from "../../src/lib/conversation-store";
import * as rateLimiter from "../../src/lib/rate-limiter";
import * as abStore from "../../src/lib/ab-store";
import type { Channel } from "../../src/lib/conversation-store";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

// ── Transport helpers ──────────────────────────────────────────────────────────

async function sendViaTwilio(to: string, body: string, channel: Channel): Promise<boolean> {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from  = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) return false;

  const params = new URLSearchParams();
  params.append("To",   channel === "whatsapp" ? `whatsapp:${to}` : to);
  params.append("From", channel === "whatsapp" ? `whatsapp:${from}` : from);
  params.append("Body", body);

  const r = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    }
  );
  return r.ok;
}

async function sendViaMailgun(to: string, subject: string, body: string): Promise<boolean> {
  const apiKey = process.env.MAILGUN_API_KEY;
  const domain = process.env.MAILGUN_DOMAIN;
  const from   = process.env.MAILGUN_FROM;
  if (!apiKey || !domain || !from) return false;

  const params = new URLSearchParams();
  params.append("from", from); params.append("to", to);
  params.append("subject", subject); params.append("text", body);

  const r = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  return r.ok;
}

async function generateVariations(
  stepType: string, leadName: string, channel: string, count = 2
) {
  const res = await fetch(`${BASE_URL}/api/generate-message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stepType, leadName, channel, count }),
  });
  if (!res.ok) return [];
  const { variations } = await res.json();
  return variations as { id: string; subject?: string; body: string; label: string }[];
}

// ── Channel orchestration ──────────────────────────────────────────────────────

async function tryAlternativeChannel(
  campaign: Awaited<ReturnType<typeof campaignStore.getById>>,
  contact: campaignStore.CampaignContact,
): Promise<void> {
  if (!campaign) return;

  // If email has 3+ attempts with no reply → try WhatsApp or SMS if contact looks like a phone
  const isPhone = /^\+?\d{8,15}$/.test(contact.contact.replace(/\s/g, ""));

  if (contact.channel === "email" && contact.emailAttempts >= 3 && isPhone) {
    console.log(`[CHANNEL-ORCH] ${contact.name}: email exhausted → no phone number, skipping`);
    return;
  }

  if (contact.channel === "email" && contact.emailAttempts >= 3) {
    // Check if we have their phone in the campaign (different contact row same name)
    console.log(`[CHANNEL-ORCH] ${contact.name}: email exhausted (${contact.emailAttempts} attempts) — marking closed`);
    await campaignStore.updateContactStatus(campaign.id, contact.id, "closed");
  }
}

// ── Main handler ───────────────────────────────────────────────────────────────

export async function handleSendMessage(job: Job<SendMessagePayload>): Promise<void> {
  const { campaignId, contactId, stepIndex, channel, contact: contactAddr, leadName } = job.data;

  // Rate limit check
  const rateCheck = await rateLimiter.canSend(contactAddr);
  if (!rateCheck.allowed) {
    console.log(`[SEND-WORKER] Skipping ${leadName}: ${rateCheck.reason}`);
    return;
  }

  const campaign = await campaignStore.getById(campaignId);
  if (!campaign || campaign.status !== "active") return;

  const contact = campaign.contacts.find(c => c.id === contactId);
  if (!contact) return;

  const step = campaign.flow[stepIndex];
  if (!step) return;

  // Generate message
  let body        = step.messageTemplate;
  let subject     = `Kurze Frage, ${leadName.split(" ")[0]}`;
  let variationId = "template";

  if (!body) {
    const winner     = await abStore.getWinnerForStep(campaignId, step.type);
    const variations = await generateVariations(step.type, leadName, channel, winner ? 1 : 2);

    if (!variations.length) throw new Error(`No variations generated for ${leadName}`);

    const chosen = winner
      ? variations.find(v => v.id === winner) ?? variations[0]
      : variations[0];

    body        = chosen.body;
    variationId = chosen.id;
    if (chosen.subject) subject = chosen.subject;

    await abStore.recordSend({
      variationId,
      variationBody: body,
      stepType:      step.type,
      campaignId,
      contactId,
      contactName:   leadName,
      sentAt:        new Date().toISOString(),
    });
  }

  // Send
  let sent = false;
  if (channel === "email") {
    sent = await sendViaMailgun(contactAddr, subject, body);
  } else {
    sent = await sendViaTwilio(contactAddr, body, channel as Channel);
  }

  // Dev fallback
  if (!sent && process.env.NODE_ENV === "development") {
    console.log(`[SEND-WORKER DEV] ${leadName} (${channel}): "${body.slice(0, 80)}…"`);
    sent = true;
  }

  if (!sent) throw new Error(`Send failed for ${leadName} via ${channel}`);

  // Record
  await rateLimiter.recordSend(contactAddr);
  await campaignStore.incrementChannelAttempts(campaignId, contactId, channel as Channel);

  // Create / update conversation
  let conv = await convStore.findByContact(contactAddr);
  if (!conv) {
    conv = await convStore.create({
      leadName, leadContact: contactAddr,
      channel: channel as Channel, campaignId, openingMessage: body,
    });
  } else {
    await convStore.addMessage(conv.id, "agent", body, channel as Channel);
  }

  await campaignStore.updateContactStatus(campaignId, contactId, "contacted", conv.id);

  // Schedule no-reply check (48h)
  await enqueueNoReplyCheck({ campaignId, contactId, stepIndex }, 48);

  // Channel orchestration check
  const updatedContact = (await campaignStore.getById(campaignId))?.contacts.find(c => c.id === contactId);
  if (updatedContact) await tryAlternativeChannel(campaign, updatedContact);

  console.log(`[SEND-WORKER] ✓ ${leadName} (${channel}) step ${stepIndex} — var ${variationId}`);
}
