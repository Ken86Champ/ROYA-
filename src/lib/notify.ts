// ─── Human Handoff Notifications ──────────────────────────────────────────────
// Sends Slack webhook + optional Mailgun email when a conversation needs
// human attention (confidence < 70%, frustrated sentiment, repeated failures).

import { supabase, genId } from "./supabase";

export interface HandoffPayload {
  convId: string;
  leadName: string;
  leadContact: string;
  channel: string;
  reason: string;          // e.g. "low_confidence" | "frustrated" | "human_requested"
  lastMessage: string;
  suggestedResponse?: string;
  confidence?: number;
}

async function sendSlack(payload: HandoffPayload): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;

  const channelIcon: Record<string, string> = {
    sms: "📱", whatsapp: "💬", email: "✉️"
  };

  const blocks = [
    {
      type: "header",
      text: { type: "plain_text", text: "🚨 Human Handoff Required" }
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Lead:*\n${payload.leadName}` },
        { type: "mrkdwn", text: `*Channel:*\n${channelIcon[payload.channel] ?? ""} ${payload.channel}` },
        { type: "mrkdwn", text: `*Contact:*\n${payload.leadContact}` },
        { type: "mrkdwn", text: `*Reason:*\n${payload.reason}${payload.confidence ? ` (${payload.confidence}% confidence)` : ""}` },
      ]
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*Last message:*\n>${payload.lastMessage.slice(0, 300)}` }
    },
  ];

  if (payload.suggestedResponse) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*Suggested reply:*\n_${payload.suggestedResponse.slice(0, 300)}_` }
    });
  }

  blocks.push({
    type: "actions",
    // @ts-expect-error Slack block types
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: "Open Conversation →" },
        url: `${process.env.NEXT_PUBLIC_BASE_URL}/dashboard/conversations?id=${payload.convId}`,
        style: "primary"
      }
    ]
  });

  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blocks }),
  }).catch(err => console.error("[NOTIFY] Slack error:", err));
}

async function sendEmail(payload: HandoffPayload): Promise<void> {
  const apiKey = process.env.MAILGUN_API_KEY;
  const domain = process.env.MAILGUN_DOMAIN;
  const from   = process.env.MAILGUN_FROM;
  const to     = process.env.HANDOFF_EMAIL;   // who receives handoff notifications
  if (!apiKey || !domain || !from || !to) return;

  const subject = `[ROYA] Handoff nötig — ${payload.leadName} (${payload.channel})`;
  const text = [
    `Lead: ${payload.leadName} <${payload.leadContact}>`,
    `Kanal: ${payload.channel}`,
    `Grund: ${payload.reason}`,
    payload.confidence ? `Confidence: ${payload.confidence}%` : "",
    ``,
    `Letzte Nachricht:`,
    payload.lastMessage,
    ``,
    payload.suggestedResponse ? `Vorgeschlagene Antwort:\n${payload.suggestedResponse}` : "",
    ``,
    `→ ${process.env.NEXT_PUBLIC_BASE_URL}/dashboard/conversations?id=${payload.convId}`,
  ].filter(Boolean).join("\n");

  const params = new URLSearchParams();
  params.append("from", from);
  params.append("to", to);
  params.append("subject", subject);
  params.append("text", text);

  await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  }).catch(err => console.error("[NOTIFY] Mailgun error:", err));
}

export async function notifyHandoff(payload: HandoffPayload): Promise<void> {
  // Log to DB
  try {
    await supabase.from("handoff_events").insert({
      id: genId("hoff"),
      conv_id: payload.convId,
      lead_name: payload.leadName,
      lead_contact: payload.leadContact,
      channel: payload.channel,
      reason: payload.reason,
      message: payload.lastMessage,
    });
  } catch { /* non-fatal */ }

  // Fire both in parallel, don't let failures block the webhook response
  await Promise.allSettled([
    sendSlack(payload),
    sendEmail(payload),
  ]);
}
