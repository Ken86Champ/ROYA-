import { NextRequest, NextResponse } from "next/server";
import * as store from "@/lib/campaign-store";
import * as clientStore from "@/lib/client-store";

export async function GET() {
  return NextResponse.json(await store.getAll());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const campaign = await store.create({
    name: body.name,
    clientId: body.clientId,
    channels: body.channels,
    contacts: body.contacts,
    flow: body.flow,
    aiFramework: body.aiFramework,
  });
  if (body.clientId) {
    await clientStore.linkCampaign(body.clientId, campaign.id);
  }
  return NextResponse.json(campaign, { status: 201 });
}
