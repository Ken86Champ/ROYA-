// ─── Send Reminder Worker ──────────────────────────────────────────────────────
// Fires before a booked appointment to send a confirmation/reminder.
// Enqueued when a lead replies with booking intent (nextAction === "book").

import type { Job } from "bullmq";
import type { SendReminderPayload } from "../../src/lib/queue";
import * as convStore from "../../src/lib/conversation-store";
import type { Channel } from "../../src/lib/conversation-store";

async function sendViaTwilio(to: string, body: string, channel: Channel): Promise<boolean> {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from  = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) return false;

  const params = new URLSearchParams();
  params.append("To",   channel === "whatsapp" ? `whatsapp:${to}` : to);
  params.append("From", channel === "whatsapp" ? `whatsapp:${from}` : from);
  params.append("Body", body);

  const r = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    }
  );
  return r.ok;
}

async function sendViaMailgun(to: string, subject: string, body: string): Promise<boolean> {
  const apiKey = process.env.MAILGUN_API_KEY;
  const domain = process.env.MAILGUN_DOMAIN;
  const from   = process.env.MAILGUN_FROM;
  if (!apiKey || !domain || !from) return false;

  const params = new URLSearchParams();
  params.append("from", from); params.append("to", to);
  params.append("subject", subject); params.append("text", body);

  const r = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  return r.ok;
}

export async function handleSendReminder(job: Job<SendReminderPayload>): Promise<void> {
  const { convId, contact, channel, leadName, appointmentAt } = job.data;

  const apptDate = new Date(appointmentAt).toLocaleDateString("de-CH", {
    weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit"
  });

  const firstName = leadName.split(" ")[0];
  const body = `Hallo ${firstName}, kurze Erinnerung: Unser Gespräch ist am ${apptDate}. Ich freue mich! Falls du verschieben möchtest, meld dich kurz.`;
  const subject = `Erinnerung: Unser Gespräch am ${apptDate}`;

  let sent = false;
  if (channel === "email") {
    sent = await sendViaMailgun(contact, subject, body);
  } else {
    sent = await sendViaTwilio(contact, body, channel as Channel);
  }

  if (!sent && process.env.NODE_ENV === "development") {
    console.log(`[REMINDER DEV] ${leadName}: "${body}"`);
    sent = true;
  }

  if (sent) {
    await convStore.addMessage(convId, "agent", body, channel as Channel);
    console.log(`[REMINDER] ✓ Sent reminder to ${leadName} for ${apptDate}`);
  } else {
    throw new Error(`Reminder send failed for ${leadName}`);
  }
}
