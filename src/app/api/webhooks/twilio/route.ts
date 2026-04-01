import { NextRequest, NextResponse } from "next/server";
import * as store from "@/lib/conversation-store";
import { classifyIntent } from "@/lib/intent-classifier";
import * as rateLimiter from "@/lib/rate-limiter";
import * as abStore from "@/lib/ab-store";
import { notifyHandoff } from "@/lib/notify";
import { enqueueReminder } from "@/lib/queue";

async function sendTwilioReply(to: string, body: string, channel: store.Channel) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const from       = process.env.TWILIO_FROM_NUMBER;
  if (!accountSid || !authToken || !from) return;

  const params = new URLSearchParams();
  params.append("To",   channel === "whatsapp" ? `whatsapp:${to}` : to);
  params.append("From", channel === "whatsapp" ? `whatsapp:${from}` : from);
  params.append("Body", body);

  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
}

const TWIML_EMPTY = "<?xml version='1.0' encoding='UTF-8'?><Response></Response>";

export async function POST(req: NextRequest) {
  try {
    const body    = await req.formData();
    const from    = (body.get("From") as string) || "";
    const msgBody = (body.get("Body") as string) || "";

    const channel: store.Channel = from.startsWith("whatsapp:") ? "whatsapp" : "sms";
    const contact = from.replace("whatsapp:", "");

    if (!contact || !msgBody) {
      return new NextResponse(TWIML_EMPTY, { headers: { "Content-Type": "text/xml" } });
    }

    // STOP / opt-out
    if (rateLimiter.isStopKeyword(msgBody)) {
      await rateLimiter.optOut(contact);
      await sendTwilioReply(contact, "Du wurdest abgemeldet. Du erhältst keine weiteren Nachrichten.", channel);
      return new NextResponse(TWIML_EMPTY, { headers: { "Content-Type": "text/xml" } });
    }

    // Find or create conversation
    let conv = await store.findByContact(contact);
    if (!conv) {
      conv = await store.create({ leadName: contact, leadContact: contact, channel });
    }

    await store.addMessage(conv.id, "lead", msgBody, channel);

    if (conv.campaignId) {
      await abStore.recordReply(contact, conv.campaignId);
    }

    // Intent classification
    try {
      const result = await classifyIntent({
        leadName:      conv.leadName,
        channel,
        history:       conv.messages.slice(0, -1),
        latestMessage: msgBody,
      });

      const applied = await store.applyIntent(conv.id, result);

      // Human handoff notification
      if (
        applied.nextAction === "human_handoff" ||
        applied.confidence < 70 ||
        applied.sentiment === "negative"
      ) {
        await notifyHandoff({
          convId:           conv.id,
          leadName:         conv.leadName,
          leadContact:      contact,
          channel,
          reason:           applied.nextAction === "human_handoff"
            ? applied.reasoning.includes("Auto-escalation") ? "repeated_question" : "human_requested"
            : applied.sentiment === "negative" ? "frustrated" : "low_confidence",
          lastMessage:      msgBody,
          suggestedResponse: applied.suggestedResponse,
          confidence:       applied.confidence,
        });
      }

      // Auto-reply
      if (
        applied.confidence >= 65 &&
        (applied.nextAction === "reply" || applied.nextAction === "book") &&
        applied.suggestedResponse
      ) {
        await sendTwilioReply(contact, applied.suggestedResponse, channel);
        await store.addMessage(conv.id, "agent", applied.suggestedResponse, channel);
      }

      // Schedule booking reminder (24h before appointment)
      if (applied.nextAction === "book") {
        const reminderAt = new Date(Date.now() + 23 * 3600 * 1000);  // ~24h from now
        const delayMs    = reminderAt.getTime() - Date.now();
        await enqueueReminder(
          {
            convId:        conv.id,
            contact,
            channel,
            leadName:      conv.leadName,
            appointmentAt: reminderAt.toISOString(),
          },
          delayMs
        ).catch(() => {});  // non-fatal if Redis unavailable
      }
    } catch (classifyErr) {
      console.error("[ROYA] Intent classification failed:", classifyErr);
    }

    return new NextResponse(TWIML_EMPTY, { headers: { "Content-Type": "text/xml" } });
  } catch (err) {
    console.error("Twilio webhook error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
