/**
 * GET /api/dashboard/kpis
 * Global KPI summary across all campaigns, derived from experiment_events.
 */

import { NextResponse } from "next/server";
import { getGlobalKPIs } from "@/lib/analytics/kpi-service";

export async function GET() {
  try {
    const kpis = await getGlobalKPIs();
    return NextResponse.json(kpis);
  } catch (err) {
    console.error("[ROYA] /api/dashboard/kpis error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
