/**
 * ROYA Conversation Engine
 * ─────────────────────────
 * Generates human-like, contextual SMS responses.
 * The agent knows the business, the lead's history, and responds naturally.
 */

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Business Persona ──────────────────────────────────────────────────────────

export interface BusinessContext {
  agentName: string;        // e.g. "Tanja"
  companyName: string;      // e.g. "10X Personaltraining"
  offer: string;            // What you're offering
  goal: string;             // What the agent wants (booking, call, etc.)
  tone: string;             // Communication style
}

export const DEFAULT_BUSINESS: BusinessContext = {
  agentName: "Tanja",
  companyName: "10X Personaltraining",
  offer: "Persönliches Training, Ernährungscoaching und individuelle Fitness-Programme für nachhaltige Ergebnisse",
  goal: "Ein kostenloses 15-minütiges Beratungsgespräch vereinbaren",
  tone: "Warm, direkt, menschlich — wie eine Freundin, die zufällig im Fitness-Bereich arbeitet. Nie salesig.",
};

// ── Message Types ─────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "lead" | "agent";
  body: string;
  timestamp?: string;
}

export interface ConversationResult {
  reply: string;
  intent: string;
  sentiment: "positive" | "neutral" | "negative";
  confidence: number;
  nextAction: "reply" | "book" | "human_handoff" | "close";
  reasoning: string;
}

// ── System Prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(biz: BusinessContext): string {
  return `Du bist ${biz.agentName} und arbeitest bei ${biz.companyName}.

Was du anbietest: ${biz.offer}
Was du willst: ${biz.goal}

---

DU BIST KEIN BOT. DU BIST EIN MENSCH.

Das bedeutet: Du liest nicht nur was jemand schreibt — du liest was er MEINT. Du spürst die Emotion hinter den Worten. Und du antwortest darauf, nicht auf die Oberfläche.

Wie du denkst bevor du antwortest:
1. Was hat die Person gerade wirklich gesagt? Was ist der Subtext?
2. Wie fühlt sie sich gerade? Genervt? Neugierig? Gestresst? Offen?
3. Was braucht sie jetzt von mir als Mensch — nicht als Verkäuferin?
4. Was ist die eine Sache, die ich ansprechen will?

Wie du schreibst:
- Kurz. Eine SMS, nicht ein Aufsatz. 1-3 Sätze.
- Direkt. Kein Einleitungsmüll. Fang einfach an.
- Menschlich. Schreib wie du einer Freundin schreiben würdest.
- Maximal eine Frage. Und nur wenn sie natürlich ist.
- Du-Form, entspannt, nie formal.
- Kein "Ich hoffe...", kein "Herzliche Grüsse", keine Floskeln.
- Niemals mehrere Optionen auf einmal anbieten.

Was du nie tust:
- Du überspringst nie eine Frage um schneller zum Ziel zu kommen. Erst antworten, dann weiterführen.
- Du ignorierst nie was die Person gesagt hat. Wenn sie etwas erzählt, nimmst du es auf.
- Du bist nie aufdringlich. Wenn jemand klar Nein sagt, respektierst du das sofort.
- Du weichst nie aus. Wenn du etwas nicht weisst, sagst du es.
- Du stellst nie rhetorische Fragen. Nur echte, die dir wirklich etwas sagen.

Wenn die Situation unklar ist: Frag nach, bevor du antwortest. Besser eine kurze Rückfrage als eine lange Antwort die am Thema vorbeizielt.

Du antwortest auf Deutsch. Schweizerdeutsche Wendungen dürfen rein wenn es natürlich wirkt (gerne, super, chli, etc.).

${biz.tone}`;
}

// ── User Prompt ───────────────────────────────────────────────────────────────

function buildUserPrompt(
  leadName: string,
  history: ChatMessage[],
  latestMessage: string,
): string {
  const historyText = history
    .slice(-14)
    .map(m => `${m.role === "agent" ? "DU" : leadName}: ${m.body}`)
    .join("\n");

  return `${historyText ? `BISHERIGES GESPRÄCH:\n${historyText}\n\n` : ""}${leadName} schreibt jetzt:
"${latestMessage}"

Bevor du antwortest, denk kurz nach:
- Was meint er/sie damit wirklich?
- Was ist die Emotion dahinter?
- Was braucht diese Person gerade?

Dann: Schreib deine Antwort als SMS. Natürlich, direkt, menschlich.

Format der Ausgabe — genau so, nichts weglassen:
[Deine Antwort als SMS-Text]
##INTENT:hot|warm|cold|question|timing|objection|confused|angry|already_solved|unclear
##NEXTACTION:reply|book|human_handoff|close
##SENTIMENT:positive|neutral|negative
##CONFIDENCE:0-100
##REASONING:Was steckt hinter der Nachricht und warum antwortest du so`;
}

// ── Parse Response ────────────────────────────────────────────────────────────

function parseResponse(raw: string): ConversationResult {
  const lines = raw.trim().split("\n");
  const replyLines: string[] = [];
  const meta: Record<string, string> = {};

  for (const line of lines) {
    const metaMatch = line.match(/^##(\w+):(.+)$/);
    if (metaMatch) {
      meta[metaMatch[1]] = metaMatch[2].trim();
    } else {
      replyLines.push(line);
    }
  }

  return {
    reply: replyLines.join("\n").trim(),
    intent: meta.INTENT || "unclear",
    sentiment: (meta.SENTIMENT as ConversationResult["sentiment"]) || "neutral",
    confidence: parseInt(meta.CONFIDENCE || "75"),
    nextAction: (meta.NEXTACTION as ConversationResult["nextAction"]) || "reply",
    reasoning: meta.REASONING || "",
  };
}

// ── Main Conversation Function ────────────────────────────────────────────────

export async function generateReply(params: {
  leadName: string;
  history: ChatMessage[];
  latestMessage: string;
  business?: BusinessContext;
}): Promise<ConversationResult> {
  const biz = params.business || DEFAULT_BUSINESS;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",   // Sonnet: besser für nuancierte, menschliche Konversation
    max_tokens: 500,
    system: buildSystemPrompt(biz),
    messages: [{
      role: "user",
      content: buildUserPrompt(params.leadName, params.history, params.latestMessage),
    }],
  });

  const raw = (response.content[0] as { text: string }).text;
  return parseResponse(raw);
}

// ── Twilio History Fetcher ────────────────────────────────────────────────────

export async function fetchTwilioHistory(contact: string): Promise<ChatMessage[]> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  if (!accountSid || !authToken || !fromNumber) return [];

  const auth = `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;

  async function fetch_msgs(params: Record<string, string>) {
    const url = new URL(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url.toString(), { headers: { Authorization: auth } });
    if (!res.ok) return [];
    const d = await res.json();
    return (d.messages || []) as TwilioMsg[];
  }

  const [inbound, outbound] = await Promise.all([
    fetch_msgs({ To: fromNumber, From: contact, PageSize: "30" }),
    fetch_msgs({ From: fromNumber, To: contact, PageSize: "30" }),
  ]);

  const all: ChatMessage[] = [
    ...inbound.map(m => ({
      role: "lead" as const,
      body: m.body,
      timestamp: m.date_sent || m.date_created,
    })),
    ...outbound.map(m => ({
      role: "agent" as const,
      body: m.body.replace(/^Sent from your Twilio trial account - /, ""),
      timestamp: m.date_sent || m.date_created,
    })),
  ];

  return all.sort((a, b) =>
    new Date(a.timestamp!).getTime() - new Date(b.timestamp!).getTime()
  );
}

interface TwilioMsg {
  body: string;
  date_sent: string;
  date_created: string;
}
