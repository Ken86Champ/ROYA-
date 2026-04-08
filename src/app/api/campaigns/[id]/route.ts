import { NextRequest, NextResponse } from "next/server";
import * as store from "@/lib/campaign-store";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const campaign = await store.getById(id);
    if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(campaign);
  } catch (err) {
    console.error("[api/campaigns/id] GET error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { action, flow, aiFramework } = body;

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
  if (action === "update_framework" && aiFramework) {
    await store.updateAIFramework(id, aiFramework);
    return NextResponse.json(await store.getById(id));
  }
  if (action === "update_all") {
    const { name, clientId, channels, flow: updFlow, aiFramework: updFw, contacts, businessContext } = body;
    await store.updateCampaign(id, { name, clientId, channels });
    if (updFlow) await store.updateFlow(id, updFlow);
    if (updFw) await store.updateAIFramework(id, updFw);
    if (businessContext) await store.updateBusinessContext(id, businessContext);
    if (contacts) await store.replaceContacts(id, contacts);
    return NextResponse.json(await store.getById(id));
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
