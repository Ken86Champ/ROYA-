import { NextRequest, NextResponse } from "next/server";
import { classifyIntent } from "@/lib/intent-classifier";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const msg = body.message || "Ja ich will einen Termin buchen";
  
  try {
    const result = await classifyIntent({
      leadName: "Test Lead",
      channel: "sms",
      history: [],
      latestMessage: msg,
    });
    return NextResponse.json({ ok: true, result });
  } catch (err: unknown) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
