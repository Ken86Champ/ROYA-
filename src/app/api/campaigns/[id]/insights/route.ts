// ─── GET /api/campaigns/[id]/insights ──────────────────────────────────────────
// Calls the analytics.agent.ts to generate AI-powered campaign insights.

import { NextRequest, NextResponse } from "next/server";
import * as campaignStore from "@/lib/campaign-store";
import { generateInsights, type CampaignMetrics } from "@/server/agents/analytics.agent";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const campaign = await campaignStore.getById(id);

  if (!campaign) {
    return NextResponse.json({ error: "Kampagne nicht gefunden" }, { status: 404 });
  }

  const contacts = campaign.contacts;

  // Build metrics from campaign contacts
  const bySegment: Record<string, { count: number; booked: number }> = {};
  const byChannel: Record<string, { sent: number; replied: number }> = {};

  for (const c of contacts) {
    const seg = ((c as unknown) as Record<string, unknown>).segment as string || "unknown";
    if (!bySegment[seg]) bySegment[seg] = { count: 0, booked: 0 };
    bySegment[seg].count++;
    if (c.status === "booked") bySegment[seg].booked++;

    const ch = c.channel || "email";
    if (!byChannel[ch]) byChannel[ch] = { sent: 0, replied: 0 };
    if (c.status !== "pending") byChannel[ch].sent++;
    if (["replied", "interested", "booked"].includes(c.status)) byChannel[ch].replied++;
  }

  const metrics: CampaignMetrics = {
    totalContacts: contacts.length,
    contacted: contacts.filter(c => c.status !== "pending").length,
    replied: contacts.filter(c => ["replied", "interested", "booked"].includes(c.status)).length,
    qualified: contacts.filter(c => ["interested", "booked"].includes(c.status)).length,
    booked: contacts.filter(c => c.status === "booked").length,
    revenue: 0,
    commissions: 0,
    bySegment,
    byChannel,
  };

  try {
    const clientName = campaign.businessContext?.companyName || campaign.name;
    const insights = await generateInsights(metrics, clientName);
    return NextResponse.json({ ...insights, metrics });
  } catch (err) {
    console.error("[insights] Error:", err);
    const msg = err instanceof Error ? err.message : "Insights fehlgeschlagen";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
