import { NextRequest, NextResponse } from "next/server";
import * as store from "@/lib/conversation-store";

export async function GET() {
  return NextResponse.json(await store.getAll());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const conv = await store.create({
    leadName: body.leadName,
    leadContact: body.leadContact,
    channel: body.channel,
    campaignId: body.campaignId,
    openingMessage: body.openingMessage,
  });
  return NextResponse.json(conv, { status: 201 });
}
