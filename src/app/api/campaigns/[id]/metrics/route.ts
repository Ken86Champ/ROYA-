/**
 * GET /api/campaigns/[id]/metrics
 * Full metrics for a single campaign: KPIs + funnel + variants + forecast.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCampaignMetrics, getCampaignVariants, getAllCampaignMetrics } from "@/lib/analytics/kpi-service";
import { buildFunnel, buildForecast } from "@/lib/analytics/funnel-service";
import * as store from "@/lib/campaign-store";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // Load campaign to get targetLeads count
    const campaign = await store.getById(id);
    const targetLeads = campaign?.contacts.length ?? 0;

    const [metrics, variants, allMetrics] = await Promise.all([
      getCampaignMetrics(id),
      getCampaignVariants(id),
      getAllCampaignMetrics(),         // used as historical base for forecast
    ]);

    const funnel   = buildFunnel(metrics);
    const forecast = buildForecast(targetLeads, allMetrics);

    return NextResponse.json({ metrics, funnel, variants, forecast });
  } catch (err) {
    console.error("[ROYA] /api/campaigns/[id]/metrics error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
