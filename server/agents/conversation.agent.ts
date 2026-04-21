import Anthropic from "@anthropic-ai/sdk";
import { getAvailableSlots, formatSlotsForAgent } from "../lib/google-calendar";
import fs from "fs";
import path from "path";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SETTINGS_FILE = path.join(process.cwd(), "roya-settings.json");

function readCalendarSettings(): Record<string, string> {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
    }
  } catch {}
  return {};
}

/**
 * Fetch formatted slot text if calendar is connected. Non-blocking fallback.
 */
async function getSlotContext(): Promise<string> {
  const settings = readCalendarSettings();
  const refreshToken = settings.googleCalendarRefreshToken;
  if (!refreshToken) return "";

  try {
    const slots = await getAvailableSlots(refreshToken, settings.googleCalendarId || "primary", {
      businessStart: settings.googleCalendarBusinessStart || "09:00",
      businessEnd: settings.googleCalendarBusinessEnd || "17:00",
      slotDuration: parseInt(settings.googleCalendarSlotDuration || "30", 10),
      lookAheadDays: parseInt(settings.googleCalendarLookAheadDays || "5", 10),
    });
    return formatSlotsForAgent(slots);
  } catch {
    return "";
  }
}

export type ContactState =
  | "not_contacted" | "first_message_sent"
  | "replied_positive" | "replied_negative"
  | "qualified" | "booking_pushed" | "booked" | "dead";

export interface ThreadMessage {
  role: "agent" | "contact";
  content: string;
  timestamp: string;
}

export interface ConversationResult {
  intent: "positiv" | "negativ" | "einwand" | "terminwunsch" | "frage" | "unbekannt";
  nextState: ContactState;
  responseMessage: string;
  humanHandoff: boolean;
  bookingRequested: boolean;
}

export async function processReply(input: {
  contactMessage: string;
  currentState: ContactState;
  threadHistory: ThreadMessage[];
  clientContext: string;
  calendarUrl?: string;
  contactName?: string;
}): Promise<ConversationResult> {
  // Check if message hints at booking interest — pre-fetch available slots
  const bookingHint = /termin|buche|wann|passt|treffen|call|gespräch|zeit|verfügbar|frei/i.test(input.contactMessage);
  const isQualifiedState = ['qualified', 'booking_pushed'].includes(input.currentState);
  const slotContext = (bookingHint || isQualifiedState) ? await getSlotContext() : "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await (client.messages.create as any)({
    model: "claude-opus-4-6",
    max_tokens: 1024,
    thinking: { type: "adaptive" },
    system: `Du bist der "Sleeping Beauty" Konversations-Agent — ein autonomer B2B-Reaktivierungs-Agent.

Deine Aufgabe:
1. Analysiere die Antwort des Kontakts
2. Erkenne den Intent (positiv/negativ/einwand/terminwunsch/frage/unbekannt)
3. Entscheide den nächsten State
4. Generiere eine passende, natürliche Antwort auf Deutsch
5. Setze humanHandoff=true bei: komplexen Einwänden, expliziter Weiterleitung

State-Übergänge:
- positiv/terminwunsch → qualified oder booking_pushed
- negativ → dead (wenn klar) oder replied_negative
- einwand → behandle Einwand, bleibe in aktuellem State
- frage → beantworte, bleibe in aktuellem State

Angebots-Kontext: ${input.clientContext}
${input.calendarUrl && !slotContext ? `Kalender-Link für Terminbuchung: ${input.calendarUrl}` : ""}
${slotContext ? `
KALENDER-INTEGRATION AKTIV — Wenn der Kontakt einen Termin möchte:
- Schlage NUR die unten gelisteten freien Zeiten vor
- Nenne 3-4 konkrete Optionen (verschiedene Tage)
- Frage welcher Termin passt
- Erfinde KEINE Zeiten, sende KEINEN Kalender-Link
- Setze bookingRequested=true

${slotContext}` : ""}`,
    messages: [
      ...input.threadHistory.map(m => ({
        role: m.role === "agent" ? "assistant" as const : "user" as const,
        content: m.content,
      })),
      {
        role: "user",
        content: `Neue Nachricht von ${input.contactName ?? "Kontakt"}: "${input.contactMessage}"

Aktueller State: ${input.currentState}

Antworte als JSON: { intent, nextState, responseMessage, humanHandoff, bookingRequested }`,
      },
    ],
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const text = response.content.find((b: any) => b.type === "text")?.text ?? "{}";
  return JSON.parse(text) as ConversationResult;
}
