import { NextRequest, NextResponse } from 'next/server';
import * as execLog from '@/lib/execution-log';

export async function GET(req: NextRequest) {
  const campaignId = req.nextUrl.searchParams.get('campaignId');
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') || '50'), 200);

  const entries = campaignId
    ? await execLog.getForCampaign(campaignId, limit)
    : await execLog.getRecent(limit);

  return NextResponse.json({ entries, count: entries.length });
}
