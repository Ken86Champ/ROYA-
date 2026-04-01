import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { channel, to, body, accountSid, authToken, from } = await req.json();

  if (!accountSid || !authToken || !from) {
    return NextResponse.json({ error: "Twilio-Zugangsdaten fehlen. Bitte in den Einstellungen konfigurieren." }, { status: 400 });
  }
  if (!to || !body) {
    return NextResponse.json({ error: "Empfänger und Nachricht erforderlich." }, { status: 400 });
  }

  // Determine Twilio messaging service type
  const toNumber = channel === "whatsapp" ? `whatsapp:${to}` : to;
  const fromNumber = channel === "whatsapp" ? `whatsapp:${from}` : from;

  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

  const params = new URLSearchParams();
  params.append("To", toNumber);
  params.append("From", fromNumber);
  params.append("Body", body);

  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  const response = await fetch(twilioUrl, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const data = await response.json();

  if (!response.ok) {
    return NextResponse.json({ error: data.message || "Twilio-Fehler" }, { status: response.status });
  }

  return NextResponse.json({ success: true, sid: data.sid });
}
