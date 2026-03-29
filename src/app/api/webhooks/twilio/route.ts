import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.formData();
    const from = body.get("From") as string;
    const message = body.get("Body") as string;

    console.log(`Inbound Twilio SMS from ${from}: ${message}`);

    // TODO: await conversationQueue.add("process-reply", { from, message, channel: "sms" });

    return new NextResponse("<?xml version='1.0' encoding='UTF-8'?><Response></Response>", {
      headers: { "Content-Type": "text/xml" },
    });
  } catch (error) {
    console.error("Twilio webhook error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
