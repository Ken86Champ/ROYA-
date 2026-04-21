// ─── POST /api/campaigns/[id]/orchestrate ─────────────────────────────────────
// Triggers the Orchestrator Agent for a campaign.
// 1. If Redis/BullMQ available → enqueue to orchestratorQueue (async)
// 2. Fallback → run inline (sync, slower)

import { NextRequest, NextResponse } from "next/server";
import * as campaignStore from "@/lib/campaign-store";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const campaign = await campaignStore.getById(id);
  if (!campaign) {
    return NextResponse.json({ error: "Kampagne nicht gefunden" }, { status: 404 });
  }

  if (campaign.status !== "active") {
    return NextResponse.json({ error: "Kampagne ist nicht aktiv" }, { status: 400 });
  }

  const bc = campaign.businessContext;
  const orchestratorInput = {
    id: campaign.id,
    name: campaign.name,
    clientName: bc?.companyName || campaign.name,
    clientContext: bc ? `${bc.companyName} — ${bc.offer}. ${bc.valueProp}. Zielgruppe: ${bc.targetAudience}. CTA: ${bc.cta}` : "",
    totalContacts: campaign.contacts.length,
    channels: [...new Set(campaign.contacts.map(c => c.channel))],
    calendarUrl: bc?.bookingLink,
  };

  // Try BullMQ first
  try {
    const { orchestratorQueue } = await import("@/server/queues/agent.queue");
    await orchestratorQueue.add("orchestrate", { campaign: orchestratorInput }, {
      jobId: `orch-${id}-${Date.now()}`,
      attempts: 2,
      backoff: { type: "exponential", delay: 5000 },
    });
    return NextResponse.json({
      status: "queued",
      message: "Orchestrator-Agent gestartet (BullMQ)",
      campaignId: id,
    });
  } catch {
    // Redis unavailable — run inline
  }

  // Inline fallback
  try {
    const { runCampaignOrchestrator } = await import("@/server/agents/orchestrator.agent");
    const messages = await runCampaignOrchestrator(orchestratorInput);

    // Extract summary from last assistant message
    const lastAssistant = [...messages].reverse().find(m => m.role === "assistant");
    let summary = "";
    if (lastAssistant && Array.isArray(lastAssistant.content)) {
      const textBlock = lastAssistant.content.find(
        (b: { type: string }) => b.type === "text",
      ) as { type: "text"; text: string } | undefined;
      summary = textBlock?.text ?? "";
    }

    return NextResponse.json({
      status: "completed",
      message: "Orchestrator-Agent abgeschlossen (inline)",
      campaignId: id,
      iterations: messages.filter(m => m.role === "assistant").length,
      summary: summary.substring(0, 500),
    });
  } catch (err) {
    console.error("[orchestrate] Error:", err);
    const msg = err instanceof Error ? err.message : "Orchestrator fehlgeschlagen";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
