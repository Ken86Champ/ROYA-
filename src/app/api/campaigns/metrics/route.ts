/**
 * GET /api/campaigns/metrics
 * KPI metrics for all campaigns at once.
 */

import { NextResponse } from "next/server";
import { getAllCampaignMetrics } from "@/lib/analytics/kpi-service";
import { buildFunnel, buildForecast } from "@/lib/analytics/funnel-service";

export async function GET() {
  try {
    const allMetrics = await getAllCampaignMetrics();
    const forecast   = buildForecast(100, allMetrics); // 100-lead base for global forecast

    const result = allMetrics.map(m => ({
      metrics: m,
      funnel:  buildFunnel(m),
    }));

    return NextResponse.json({ campaigns: result, forecast });
  } catch (err) {
    console.error("[ROYA] /api/campaigns/metrics error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
