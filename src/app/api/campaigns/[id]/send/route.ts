// Trigger immediate send for a single campaign (runs scheduler for that campaign only)
import { NextRequest, NextResponse } from "next/server";
import * as campaignStore from "@/lib/campaign-store";
import * as convStore from "@/lib/conversation-store";
import * as rateLimiter from "@/lib/rate-limiter";
import * as abStore from "@/lib/ab-store";
import { enqueueSend, enqueueNoReplyCheck, isQueueAvailable } from "@/lib/queue";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const campaign = await campaignStore.getById(id);
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (campaign.status !== "active") {
    return NextResponse.json({ error: "Campaign is not active" }, { status: 400 });
  }

  const baseUrl      = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const useQueue     = await isQueueAvailable();
  let sent = 0;
  let skipped = 0;

  for (const contact of campaign.contacts) {
    if (!["pending", "contacted"].includes(contact.status)) { skipped++; continue; }

    const rateCheck = await rateLimiter.canSend(contact.contact);
    if (!rateCheck.allowed) { skipped++; continue; }

    const stepIndex = contact.currentStep ?? 0;
    const step = campaign.flow[stepIndex];
    if (!step) { skipped++; continue; }

    // If Redis available, delegate to BullMQ worker
    if (useQueue) {
      await enqueueSend({
        campaignId: campaign.id,
        contactId:  contact.id,
        stepIndex,
        channel:    contact.channel,
        contact:    contact.contact,
        leadName:   contact.name,
      });
      sent++;
      continue;
    }

    // Fallback: inline send (no Redis)
    let body        = step.messageTemplate;
    let subject     = `Kurze Frage, ${contact.name.split(" ")[0]}`;
    let variationId = "template";

    if (!body) {
      const genRes = await fetch(`${baseUrl}/api/generate-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stepType: step.type, leadName: contact.name, channel: contact.channel, count: 2 }),
      });
      if (genRes.ok) {
        const { variations } = await genRes.json();
        const winner = await abStore.getWinnerForStep(campaign.id, step.type);
        const chosen = (winner && variations.find((v: { id: string }) => v.id === winner)) ?? variations[0];
        if (chosen) {
          body = chosen.body;
          if (chosen.subject) subject = chosen.subject;
          variationId = chosen.id;
          await abStore.recordSend({
            variationId, variationBody: body, stepType: step.type,
            campaignId: campaign.id, contactId: contact.id,
            contactName: contact.name, sentAt: new Date().toISOString(),
          });
        }
      }
    }

    if (!body) { skipped++; continue; }

    console.log(`[SEND] ${campaign.name} → ${contact.name} (${contact.channel}): "${body.slice(0, 60)}…"`);
    await rateLimiter.recordSend(contact.contact);
    await campaignStore.incrementChannelAttempts(campaign.id, contact.id, contact.channel);

    let conv = await convStore.findByContact(contact.contact);
    if (!conv) {
      conv = await convStore.create({
        leadName: contact.name, leadContact: contact.contact,
        channel: contact.channel, campaignId: campaign.id, openingMessage: body,
      });
    } else {
      await convStore.addMessage(conv.id, "agent", body, contact.channel);
    }

    await campaignStore.updateContactStatus(campaign.id, contact.id, "contacted", conv.id);
    sent++;
  }

  return NextResponse.json({ sent, skipped, campaignId: id });
}
