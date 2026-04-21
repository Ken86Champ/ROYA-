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
import * as execLog from "@/lib/execution-log";
import { enqueueSend, enqueueNoReplyCheck, isQueueAvailable } from "@/lib/queue";
import { send as channelSend } from "@/server/channels";
import type { Channel } from "@/lib/conversation-store";
import type { ChannelType } from "@/server/channels";

// ── Main scheduler logic ───────────────────────────────────────────────────────

interface SchedulerResult { processed: number; sent: number; skipped: number; errors: string[]; queued: number; runId: string; }

async function runScheduler(): Promise<SchedulerResult> {
  const runId = `run-${Date.now()}`;
  const result: SchedulerResult = { processed: 0, sent: 0, skipped: 0, errors: [], queued: 0, runId };
  const useQueue = await isQueueAvailable();
  const campaigns = (await campaignStore.getAll()).filter(c => c.status === "active");
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

  for (const campaign of campaigns) {
    for (const contact of campaign.contacts) {
      result.processed++;

      // Skip terminal + human_escalated statuses
      if (["booked", "closed", "opted_out", "human_escalated"].includes(contact.status)) {
        await execLog.log({ campaignId: campaign.id, contactId: contact.id, contactName: contact.name, event: 'skip', details: { reason: `status=${contact.status}` } });
        result.skipped++;
        continue;
      }

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

      // ── Condition node: evaluate intent from FRESH conversation state ──
      if (step.type === "condition") {
        const conv = contact.convId ? await convStore.getById(contact.convId) : await convStore.findByContact(contact.contact);
        const lastIntent = conv?.lastIntent?.intent ?? "no_reply";
        // Validate freshness: only route if conversation was active within last 7 days
        const intentAge = conv?.lastActivity
          ? (Date.now() - new Date(conv.lastActivity).getTime()) / 86400000
          : Infinity;
        const effectiveIntent = intentAge <= 7 ? lastIntent : "no_reply";

        const branch = step.branches?.find(b => b.intent === effectiveIntent)
          ?? step.branches?.find(b => b.intent === "default");
        if (branch) {
          await campaignStore.setContactStep(campaign.id, contact.id, branch.nextStepIndex);
          await execLog.log({ campaignId: campaign.id, contactId: contact.id, contactName: contact.name, event: 'step_advance', stepIndex: branch.nextStepIndex, details: { from: 'condition', intent: effectiveIntent, intentAge: Math.round(intentAge), fresh: intentAge <= 7 } });
        }
        result.skipped++;
        continue;
      }

      // ── Exit node: close the contact ──
      if (step.type === "exit") {
        await campaignStore.updateContactStatus(campaign.id, contact.id, "closed");
        await execLog.log({ campaignId: campaign.id, contactId: contact.id, contactName: contact.name, event: 'closed', details: { reason: 'exit_node' } });
        result.skipped++;
        continue;
      }

      // ── Delegate to BullMQ if Redis available ──
      if (useQueue) {
        await enqueueSend({
          campaignId: campaign.id, contactId: contact.id, stepIndex,
          channel: contact.channel, contact: contact.contact, leadName: contact.name,
        });
        await execLog.log({ campaignId: campaign.id, contactId: contact.id, contactName: contact.name, event: 'queued', channel: contact.channel, stepIndex, details: { queue: 'send_message' } });
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
        const sendResult = await channelSend({ to: contact.contact, body, channel: contact.channel as ChannelType, subject });
        sent = sendResult.success;

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
          await execLog.log({ campaignId: campaign.id, contactId: contact.id, contactName: contact.name, event: 'send', channel: contact.channel, stepIndex, details: { provider: sendResult.provider, messageId: sendResult.messageId } });
        } else {
          result.errors.push(`Send failed: ${contact.name} (${contact.channel})`);
          await execLog.log({ campaignId: campaign.id, contactId: contact.id, contactName: contact.name, event: 'error', channel: contact.channel, stepIndex, details: { error: sendResult.error || 'send_failed' } });
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
