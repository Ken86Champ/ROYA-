import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { channel, to, body, accountSid: sidFromClient, authToken: tokenFromClient, from: fromFromClient, whatsappFrom: waFromClient } = await req.json();

    // Prefer client-provided credentials (from Settings), fall back to environment variables
    const accountSid = sidFromClient || process.env.TWILIO_ACCOUNT_SID;
    const authToken  = tokenFromClient || process.env.TWILIO_AUTH_TOKEN;
    const smsFrom    = fromFromClient  || process.env.TWILIO_FROM_NUMBER;
    const waFrom     = waFromClient    || process.env.TWILIO_WHATSAPP_FROM;
    const from       = channel === "whatsapp" ? (waFrom || smsFrom) : smsFrom;

    if (!accountSid || !authToken || !from) {
      return NextResponse.json({ error: channel === "whatsapp" && !waFrom
        ? "WhatsApp Absender-Nummer fehlt. Bitte in den Einstellungen konfigurieren (z.B. +14155238886 für Sandbox)."
        : "Twilio-Zugangsdaten fehlen. Bitte in den Einstellungen konfigurieren." }, { status: 400 });
    }
    if (!to || !body) {
      return NextResponse.json({ error: "Empfänger und Nachricht erforderlich." }, { status: 400 });
    }

    // Normalize phone number to E.164 format (+41786215258)
    const normalizePhone = (num: string) => {
      const digits = num.replace(/\s/g, "");
      if (digits.startsWith("+")) return digits;
      if (digits.startsWith("00")) return "+" + digits.slice(2);
      if (digits.startsWith("0")) return "+41" + digits.slice(1); // Swiss default
      return digits;
    };

    const toNormalized = channel === "whatsapp"
      ? `whatsapp:${normalizePhone(to)}`
      : normalizePhone(to);
    const fromNumber = channel === "whatsapp" ? `whatsapp:${from}` : from;

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

    const params = new URLSearchParams();
    params.append("To", toNormalized);
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

    let data: Record<string, string> = {};
    try { data = await response.json(); } catch {}

    if (!response.ok) {
      return NextResponse.json(
        { error: data.message || `Twilio-Fehler (${response.status}). Zugangsdaten prüfen.` },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, sid: data.sid });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unbekannter Fehler";
    return NextResponse.json({ error: `Server-Fehler: ${message}` }, { status: 500 });
  }
}
