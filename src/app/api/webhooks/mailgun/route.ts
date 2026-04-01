import { NextRequest, NextResponse } from "next/server";
import * as store from "@/lib/conversation-store";
import { classifyIntent } from "@/lib/intent-classifier";
import * as rateLimiter from "@/lib/rate-limiter";
import * as abStore from "@/lib/ab-store";
import { notifyHandoff } from "@/lib/notify";
import { enqueueReminder } from "@/lib/queue";

async function sendMailgunReply(to: string, subject: string, body: string) {
  const apiKey = process.env.MAILGUN_API_KEY;
  const domain = process.env.MAILGUN_DOMAIN;
  const from   = process.env.MAILGUN_FROM;
  if (!apiKey || !domain || !from) return;

  const params = new URLSearchParams();
  params.append("from", from);
  params.append("to", to);
  params.append("subject", subject.startsWith("Re:") ? subject : `Re: ${subject}`);
  params.append("text", body);

  await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(async () => {
      const form = await req.formData();
      return Object.fromEntries(form.entries());
    });

    const from    = (body.sender || body.from || "") as string;
    const msgBody = (body["stripped-text"] || body["body-plain"] || "") as string;
    const subject = (body.subject || "Re: ROYA") as string;

    if (!from || !msgBody) return NextResponse.json({ success: true });

    // STOP / opt-out
    if (rateLimiter.isStopKeyword(msgBody)) {
      await rateLimiter.optOut(from);
      await sendMailgunReply(from, subject, "Du wurdest abgemeldet. Du erhältst keine weiteren Nachrichten.");
      return NextResponse.json({ success: true });
    }

    // Find or create conversation
    let conv = await store.findByContact(from);
    if (!conv) {
      conv = await store.create({ leadName: from, leadContact: from, channel: "email" });
    }

    await store.addMessage(conv.id, "lead", msgBody, "email");

    if (conv.campaignId) {
      await abStore.recordReply(from, conv.campaignId);
    }

    // Intent classification
    try {
      const result = await classifyIntent({
        leadName:      conv.leadName,
        channel:       "email",
        history:       conv.messages.slice(0, -1),
        latestMessage: msgBody,
      });

      const applied = await store.applyIntent(conv.id, result);

      // Human handoff
      if (
        applied.nextAction === "human_handoff" ||
        applied.confidence < 70 ||
        applied.sentiment === "negative"
      ) {
        await notifyHandoff({
          convId:           conv.id,
          leadName:         conv.leadName,
          leadContact:      from,
          channel:          "email",
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
        await sendMailgunReply(from, subject, applied.suggestedResponse);
        await store.addMessage(conv.id, "agent", applied.suggestedResponse, "email");
      }

      // Schedule booking reminder
      if (applied.nextAction === "book") {
        const reminderAt = new Date(Date.now() + 23 * 3600 * 1000);
        await enqueueReminder(
          { convId: conv.id, contact: from, channel: "email", leadName: conv.leadName, appointmentAt: reminderAt.toISOString() },
          reminderAt.getTime() - Date.now()
        ).catch(() => {});
      }
    } catch (classifyErr) {
      console.error("[ROYA] Intent classification failed:", classifyErr);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Mailgun webhook error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
