import Anthropic from "@anthropic-ai/sdk";
import { getAvailableSlots, formatSlotsForAgent, type TimeSlot } from "../lib/google-calendar";
import fs from "fs";
import path from "path";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SETTINGS_FILE = path.join(process.cwd(), "roya-settings.json");

function readSettings(): Record<string, string> {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
    }
  } catch {}
  return {};
}

/**
 * Fetch available calendar slots. Returns empty array if calendar not connected.
 */
async function fetchAvailableSlots(): Promise<{ slots: TimeSlot[]; formatted: string; connected: boolean }> {
  const settings = readSettings();
  const refreshToken = settings.googleCalendarRefreshToken;
  const calendarId = settings.googleCalendarId || "primary";

  if (!refreshToken) {
    return { slots: [], formatted: "", connected: false };
  }

  try {
    const slots = await getAvailableSlots(refreshToken, calendarId, {
      businessStart: settings.googleCalendarBusinessStart || "09:00",
      businessEnd: settings.googleCalendarBusinessEnd || "17:00",
      slotDuration: parseInt(settings.googleCalendarSlotDuration || "30", 10),
      lookAheadDays: parseInt(settings.googleCalendarLookAheadDays || "5", 10),
    });
    return { slots, formatted: formatSlotsForAgent(slots), connected: true };
  } catch (err) {
    console.error("[ROYA] Booking agent calendar fetch failed:", err);
    return { slots: [], formatted: "", connected: true };
  }
}

export async function pushBooking(input: {
  contactId: string;
  contactName: string;
  calendarUrl: string;
  channel: "email" | "sms" | "whatsapp";
  context: string;
}): Promise<{ message: string; sent: boolean; slotsUsed: boolean }> {
  // ── Fetch real calendar availability ──
  const { slots, formatted, connected } = await fetchAvailableSlots();
  const hasSlots = slots.length > 0;

  const systemPrompt = hasSlots
    ? `Du bist ein Termin-Assistent. Schlage dem Kontakt KONKRETE freie Termine vor.
Sprache: Deutsch. Ton: professionell aber persönlich.
Für ${input.channel === "email" ? "E-Mail" : input.channel === "sms" ? "SMS (max 300 Zeichen)" : "WhatsApp"}.

WICHTIG:
- Nenne NUR die unten aufgelisteten freien Zeiten
- Schlage 3-4 Optionen vor (verschiedene Tage/Zeiten)
- Frage welcher Termin am besten passt
- Erfinde KEINE Zeiten, die nicht in der Liste stehen
- KEIN Kalender-Link nötig — du nennst die Zeiten direkt`
    : `Generiere eine kurze, freundliche Nachricht um einen Termin-Link zu senden.
Sprache: Deutsch. Ton: professionell aber persönlich.
Für ${input.channel === "email" ? "E-Mail" : input.channel === "sms" ? "SMS (max 160 Zeichen)" : "WhatsApp"}.`;

  const userContent = hasSlots
    ? `Kontakt: ${input.contactName}
Kontext: ${input.context}

${formatted}

Generiere NUR die Nachricht mit konkreten Terminvorschlägen, nichts anderes.`
    : `Kontakt: ${input.contactName}
Kalender-Link: ${input.calendarUrl}
Kontext: ${input.context}

Generiere NUR die Nachricht, nichts anderes.`;

  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 400,
    system: systemPrompt,
    messages: [{ role: "user", content: userContent }],
  });

  const message = response.content.find(b => b.type === "text")?.text ?? "";

  // If no real slots available, fall back to calendar link
  const fullMessage = hasSlots ? message : `${message}\n\n${input.calendarUrl}`;

  return { message: fullMessage, sent: true, slotsUsed: hasSlots };
}
