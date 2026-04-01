import Anthropic from "@anthropic-ai/sdk";
import type { ConvMessage, IntentResult, Intent } from "./conversation-store";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const INTENT_SYSTEM = `You are an expert B2B sales conversation analyst.
Analyze the last message from a lead and classify their intent.

Respond with ONLY valid JSON — no explanation, no markdown.

Intent options:
- "hot"            → clearly wants to move forward, book a call, demo, etc.
- "warm"           → interested but has objections, questions, or needs more info
- "cold"           → clear rejection, not interested
- "question"       → has a specific question to answer before deciding
- "timing"         → interested but not right now (budget, Q, priorities)
- "wrong_person"   → they are not the right decision maker
- "already_solved" → they found another solution
- "unclear"        → truly ambiguous, cannot determine

nextAction options:
- "reply"           → AI continues the conversation
- "book"            → jump straight to booking flow
- "human_handoff"   → flag for human review
- "close"           → gracefully close the conversation
- "snooze"          → schedule a follow-up for later

Sentiment: "positive", "neutral", or "negative"

Response format (EXACTLY this, no extra fields):
{
  "intent": "warm",
  "confidence": 82,
  "sentiment": "positive",
  "suggestedResponse": "...",
  "nextAction": "reply",
  "snoozeUntil": null,
  "reasoning": "..."
}`;

function buildPrompt(
  leadName: string,
  channel: string,
  history: ConvMessage[],
  latestMessage: string,
): string {
  const historyText = history
    .slice(-6) // last 6 messages for context
    .map(m => `[${m.role === "agent" ? "AGENT" : "LEAD"}]: ${m.body}`)
    .join("\n");

  return `Lead name: ${leadName}
Channel: ${channel}
Conversation history:
${historyText}

Latest message from lead:
"${latestMessage}"

Classify the intent of this latest message and suggest the ideal next response.
The suggested response must sound like a real human — warm, direct, not salesy.
Max 3 sentences. Never use "Ich hoffe diese E-Mail findet Sie gut" or similar filler.`;
}

export async function classifyIntent(params: {
  leadName: string;
  channel: string;
  history: ConvMessage[];
  latestMessage: string;
}): Promise<IntentResult> {
  const prompt = buildPrompt(params.leadName, params.channel, params.history, params.latestMessage);

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    system: INTENT_SYSTEM,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = (response.content[0] as { type: string; text: string }).text.trim();

  // Strip potential markdown code fences
  const jsonStr = raw.replace(/^```json?\n?/, "").replace(/\n?```$/, "").trim();
  const parsed = JSON.parse(jsonStr);

  return {
    intent: parsed.intent as Intent,
    confidence: Number(parsed.confidence) || 70,
    sentiment: parsed.sentiment || "neutral",
    suggestedResponse: parsed.suggestedResponse || "",
    nextAction: parsed.nextAction || "reply",
    snoozeUntil: parsed.snoozeUntil || undefined,
    reasoning: parsed.reasoning || "",
  };
}
