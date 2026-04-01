import { NextRequest, NextResponse } from "next/server";

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN;
const FROM_NUMBER = process.env.TWILIO_FROM_NUMBER;

function twilioAuth() {
  return `Basic ${Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString("base64")}`;
}

async function fetchTwilioMessages(params: Record<string, string>) {
  const url = new URL(`https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { Authorization: twilioAuth() },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.messages || [];
}

export async function GET(req: NextRequest) {
  if (!ACCOUNT_SID || !AUTH_TOKEN || !FROM_NUMBER) {
    return NextResponse.json({ error: "Twilio not configured" }, { status: 500 });
  }

  const contact = req.nextUrl.searchParams.get("contact");

  // Single contact thread
  if (contact) {
    const [inbound, outbound] = await Promise.all([
      fetchTwilioMessages({ To: FROM_NUMBER, From: contact, PageSize: "50" }),
      fetchTwilioMessages({ From: FROM_NUMBER, To: contact, PageSize: "50" }),
    ]);

    const messages = [
      ...inbound.map((m: TwilioMessage) => ({
        sid: m.sid,
        direction: "inbound" as const,
        body: m.body,
        dateSent: m.date_sent || m.date_created,
        status: m.status,
      })),
      ...outbound.map((m: TwilioMessage) => ({
        sid: m.sid,
        direction: "outbound" as const,
        body: m.body.replace(/^Sent from your Twilio trial account - /, ""),
        dateSent: m.date_sent || m.date_created,
        status: m.status,
      })),
    ].sort((a, b) => new Date(a.dateSent).getTime() - new Date(b.dateSent).getTime());

    return NextResponse.json({ messages });
  }

  // Contacts list — fetch recent inbound + outbound, group by contact
  const [inbound, outbound] = await Promise.all([
    fetchTwilioMessages({ To: FROM_NUMBER, PageSize: "100" }),
    fetchTwilioMessages({ From: FROM_NUMBER, PageSize: "100" }),
  ]);

  const contactMap = new Map<string, { contact: string; lastMessage: string; lastAt: string; direction: string }>();

  const process = (msgs: TwilioMessage[], dir: "inbound" | "outbound") => {
    for (const m of msgs) {
      const contact = dir === "inbound" ? m.from : m.to;
      if (!contact || contact === FROM_NUMBER) continue;
      const existing = contactMap.get(contact);
      const at = m.date_sent || m.date_created;
      if (!existing || new Date(at) > new Date(existing.lastAt)) {
        contactMap.set(contact, {
          contact,
          lastMessage: m.body.replace(/^Sent from your Twilio trial account - /, ""),
          lastAt: at,
          direction: dir,
        });
      }
    }
  };

  process(inbound, "inbound");
  process(outbound, "outbound");

  const contacts = Array.from(contactMap.values())
    .sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());

  return NextResponse.json({ contacts });
}

interface TwilioMessage {
  sid: string;
  body: string;
  from: string;
  to: string;
  status: string;
  date_sent: string;
  date_created: string;
  direction: string;
}
