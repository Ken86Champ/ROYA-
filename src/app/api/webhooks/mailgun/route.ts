import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const from = body.sender;
    const message = body["stripped-text"] ?? body["body-plain"];

    console.log(`Inbound Mailgun from ${from}: ${message?.slice(0, 100)}`);

    // TODO: await conversationQueue.add("process-reply", { from, message, channel: "email" });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Mailgun webhook error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
