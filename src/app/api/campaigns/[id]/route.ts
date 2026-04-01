import { NextRequest, NextResponse } from "next/server";
import * as store from "@/lib/campaign-store";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const campaign = await store.getById(id);
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(campaign);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { action, flow } = await req.json();

  if (action === "start") {
    const campaign = await store.start(id);
    if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(campaign);
  }
  if (action === "pause") {
    await store.pause(id);
    return NextResponse.json(await store.getById(id));
  }
  if (action === "update_flow" && flow) {
    await store.updateFlow(id, flow);
    return NextResponse.json(await store.getById(id));
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
