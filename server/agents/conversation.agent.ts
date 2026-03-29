import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 1024,
    thinking: { type: "adaptive" },
    system: `Du bist der "Sleeping Beauty" Konversations-Agent — ein autonomer B2B-Reaktivierungs-Agent.

Deine Aufgabe:
1. Analysiere die Antwort des Kontakts
2. Erkenne den Intent (positiv/negativ/einwand/terminwunsch/frage/unbekannt)
3. Entscheide den nächsten State
4. Generiere eine passende, natürliche Antwort auf Deutsch
5. Setze humanHandoff=true bei: Terminwunsch, komplexen Einwänden, expliziter Weiterleitung

State-Übergänge:
- positiv/terminwunsch → qualified oder booking_pushed
- negativ → dead (wenn klar) oder replied_negative
- einwand → behandle Einwand, bleibe in aktuellem State
- frage → beantworte, bleibe in aktuellem State

Angebots-Kontext: ${input.clientContext}
${input.calendarUrl ? `Kalender-Link für Terminbuchung: ${input.calendarUrl}` : ""}`,
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

  const text = response.content.find(b => b.type === "text")?.text ?? "{}";
  return JSON.parse(text) as ConversationResult;
}
