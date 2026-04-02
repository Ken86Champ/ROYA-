import { NextRequest, NextResponse } from "next/server";
import * as store from "@/lib/campaign-store";
import * as clientStore from "@/lib/client-store";

export async function GET() {
  return NextResponse.json(await store.getAll());
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const campaign = await store.create({
      name:           body.name,
      clientId:       body.clientId,
      channels:       body.channels,
      contacts:       body.contacts,
      flow:           body.flow,
      offer:          body.offer,
      valueProp:      body.valueProp,
      cta:            body.cta,
      targetAudience: body.targetAudience,
      agentName:      body.agentName,
      agentTone:      body.agentTone,
    });
    if (body.clientId) {
      await clientStore.linkCampaign(body.clientId, campaign.id);
    }
    return NextResponse.json(campaign, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
