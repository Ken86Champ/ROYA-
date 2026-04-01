import { NextRequest, NextResponse } from "next/server";
import * as abStore from "@/lib/ab-store";

export async function GET(req: NextRequest) {
  const campaignId = req.nextUrl.searchParams.get("campaignId");
  if (!campaignId) return NextResponse.json({ error: "campaignId required" }, { status: 400 });
  return NextResponse.json(await abStore.getStatsForCampaign(campaignId));
}
