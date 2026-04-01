import { NextRequest, NextResponse } from "next/server";
import * as store from "@/lib/conversation-store";
import { classifyIntent } from "@/lib/intent-classifier";

// GET /api/conversations/:id
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const conv = await store.getById(id);
  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(conv);
}

// POST /api/conversations/:id/reply — send agent reply manually
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const conv = await store.getById(id);
  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { body } = await req.json();
  const msg = await store.addMessage(id, "agent", body, conv.channel);
  return NextResponse.json(msg);
}

// PATCH /api/conversations/:id — update state/node
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const conv = await store.getById(id);
  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { action, leadMessage } = await req.json();

  if (action === "classify" && leadMessage) {
    const result = await classifyIntent({
      leadName: conv.leadName,
      channel: conv.channel,
      history: conv.messages,
      latestMessage: leadMessage,
    });
    const applied = await store.applyIntent(id, result);
    return NextResponse.json(applied);
  }

  if (action === "mark_booked") {
    await store.markBooked(id);
  }

  return NextResponse.json(await store.getById(id));
}
