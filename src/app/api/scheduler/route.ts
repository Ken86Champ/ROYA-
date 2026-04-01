// ─── Scheduler ────────────────────────────────────────────────────────────────
// POST /api/scheduler — called by Vercel Cron (vercel.json) or manually.
// GET  /api/scheduler — dev-only manual trigger.
//
// When Redis is available: delegates to BullMQ workers.
// Fallback: inline processing.

import { NextRequest, NextResponse } from "next/server";
import * as campaignStore from "@/lib/campaign-store";
import * as convStore from "@/lib/conversation-store";
import * as rateLimiter from "@/lib/rate-limiter";
import * as abStore from "@/lib/ab-store";
import { enqueueSend, enqueueNoReplyCheck, isQueueAvailable } from "@/lib/queue";
import type { Channel } from "@/lib/conversation-store";

// ── Transport helpers ──────────────────────────────────────────────────────────

async function sendViaTwilio(to: string, body: string, channel: Channel): Promise<boolean> {
  const sid = process.env.TWILIO_ACCOUNT_SID, token = process.env.TWILIO_AUTH_TOKEN, from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) return false;
  const p = new URLSearchParams();
  p.append("To",   channel === "whatsapp" ? `whatsapp:${to}` : to);
  p.append("From", channel === "whatsapp" ? `whatsapp:${from}` : from);
  p.append("Body", body);
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: p.toString(),
  });
  return r.ok;
}

async function sendViaMailgun(to: string, subject: string, body: string): Promise<boolean> {
  const apiKey = process.env.MAILGUN_API_KEY, domain = process.env.MAILGUN_DOMAIN, from = process.env.MAILGUN_FROM;
  if (!apiKey || !domain || !from) return false;
  const p = new URLSearchParams();
  p.append("from", from); p.append("to", to); p.append("subject", subject); p.append("text", body);
  const r = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: p.toString(),
  });
  return r.ok;
}

// ── Main scheduler logic ───────────────────────────────────────────────────────

interface SchedulerResult { processed: number; sent: number; skipped: number; errors: string[]; queued: number; }

async function runScheduler(): Promise<SchedulerResult> {
  const result: SchedulerResult = { processed: 0, sent: 0, skipped: 0, errors: [], queued: 0 };
  const useQueue = await isQueueAvailable();
  const campaigns = (await campaignStore.getAll()).filter(c => c.status === "active");
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

  for (const campaign of campaigns) {
    for (const contact of campaign.contacts) {
      result.processed++;

      if (["booked", "closed", "opted_out"].includes(contact.status)) { result.skipped++; continue; }

      const rateCheck = await rateLimiter.canSend(contact.contact);
      if (!rateCheck.allowed) { result.skipped++; continue; }

      const stepIndex = contact.currentStep;
      const step = campaign.flow[stepIndex];
      if (!step) { result.skipped++; continue; }

      // Delay check: time since last contact
      if (stepIndex > 0 && contact.lastContactedAt) {
        const daysSince = (Date.now() - new Date(contact.lastContactedAt).getTime()) / 86400000;
        if (daysSince < step.delayDays) { result.skipped++; continue; }
      }

      if (stepIndex === 0 && contact.status !== "pending") { result.skipped++; continue; }
      if (stepIndex > 0 && contact.status !== "contacted") { result.skipped++; continue; }

      // ── Channel orchestration: after 3 email no-replies → try alt channel or close ──
      if (contact.channel === "email" && contact.emailAttempts >= 3) {
        const switched = await campaignStore.switchToAltChannel(campaign.id, contact.id);
        if (!switched) await campaignStore.updateContactStatus(campaign.id, contact.id, "closed");
        result.skipped++;
        continue;
      }

      // ── Condition node: evaluate intent and route, no send ──
      if (step.type === "condition") {
        const conv = contact.convId ? await convStore.findByContact(contact.contact) : null;
        const lastIntent = conv?.lastIntent?.intent ?? "no_reply";
        const branch = step.branches?.find(b => b.intent === lastIntent)
          ?? step.branches?.find(b => b.intent === "default");
        if (branch) {
          await campaignStore.setContactStep(campaign.id, contact.id, branch.nextStepIndex);
        }
        result.skipped++;
        continue;
      }

      // ── Exit node: close the contact ──
      if (step.type === "exit") {
        await campaignStore.updateContactStatus(campaign.id, contact.id, "closed");
        result.skipped++;
        continue;
      }

      // ── Delegate to BullMQ if Redis available ──
      if (useQueue) {
        await enqueueSend({
          campaignId: campaign.id, contactId: contact.id, stepIndex,
          channel: contact.channel, contact: contact.contact, leadName: contact.name,
        });
        result.queued++;
        continue;
      }

      // ── Inline fallback ──
      try {
        let body = step.messageTemplate;
        let subject = `Kurze Frage, ${contact.name.split(" ")[0]}`;
        let variationId = "template";

        if (!body) {
          const winner = await abStore.getWinnerForStep(campaign.id, step.type);
          const genRes = await fetch(`${baseUrl}/api/generate-message`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ stepType: step.type, leadName: contact.name, channel: contact.channel, count: winner ? 1 : 2 }),
          });
          if (genRes.ok) {
            const { variations } = await genRes.json();
            const chosen = (winner && variations.find((v: {id:string}) => v.id === winner)) ?? variations[0];
            if (chosen) {
              body = chosen.body; variationId = chosen.id;
              if (chosen.subject) subject = chosen.subject;
              await abStore.recordSend({ variationId, variationBody: body, stepType: step.type, campaignId: campaign.id, contactId: contact.id, contactName: contact.name, sentAt: new Date().toISOString() });
            }
          }
        }

        if (!body) { result.skipped++; continue; }

        let sent = false;
        if (contact.channel === "email") sent = await sendViaMailgun(contact.contact, subject, body);
        else sent = await sendViaTwilio(contact.contact, body, contact.channel);

        if (!sent && process.env.NODE_ENV === "development") {
          console.log(`[SCHEDULER DEV] ${contact.name}: "${body.slice(0, 80)}…"`);
          sent = true;
        }

        if (sent) {
          await rateLimiter.recordSend(contact.contact);
          await campaignStore.incrementChannelAttempts(campaign.id, contact.id, contact.channel);

          let conv = await convStore.findByContact(contact.contact);
          if (!conv) {
            conv = await convStore.create({ leadName: contact.name, leadContact: contact.contact, channel: contact.channel, campaignId: campaign.id, openingMessage: body });
          } else {
            await convStore.addMessage(conv.id, "agent", body, contact.channel);
          }
          await campaignStore.updateContactStatus(campaign.id, contact.id, "contacted", conv.id);

          // Advance step counter in DB for next run
          const next = Math.min(stepIndex + 1, campaign.flow.length - 1);
          if (next !== stepIndex) {
            await campaignStore.updateContactStatus(campaign.id, contact.id, "contacted", conv.id);
          }

          result.sent++;
        } else {
          result.errors.push(`Send failed: ${contact.name} (${contact.channel})`);
        }
      } catch (err) {
        result.errors.push(`Error for ${contact.name}: ${String(err)}`);
      }
    }
  }

  return result;
}

// ── Route handlers ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runScheduler();
  return NextResponse.json({ ...result, runAt: new Date().toISOString() });
}

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "GET only allowed in development" }, { status: 403 });
  }
  const result = await runScheduler();
  return NextResponse.json({ ...result, runAt: new Date().toISOString() });
}
