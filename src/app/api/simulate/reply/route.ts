import { NextRequest, NextResponse } from "next/server";
import { llmChat } from "@/lib/ai/llm-client";
import type { AIFramework } from "@/lib/campaign-store";

const RULE_TEXT: Record<string, string> = {
  max_2_sentences:    "Antworte mit maximal 2 kurzen Sätzen.",
  end_with_question:  "Beende jede Antwort mit einer Frage.",
  no_price_in_opener: "Erwähne niemals Preise im ersten Kontakt.",
  use_first_name:     "Sprich den Lead mit Vornamen an.",
  no_emoji:           "Verwende keine Emojis.",
  swiss_german_ok:    "Schweizerdeutsche Ausdrücke sind erlaubt.",
};

function shouldEscalate(
  history: { role: string }[],
  lastMessage: string,
  escalation: AIFramework["escalation"]
): boolean {
  const leadTurns = history.filter(m => m.role === "lead").length;
  if (leadTurns >= escalation.afterTurns) return true;
  const lower = lastMessage.toLowerCase();
  const escalateWords = ["preis", "kosten", "teuer", "einwand", "nein", "kein interesse", "buchen", "termin"];
  if (escalation.onIntents?.length && escalateWords.some(w => lower.includes(w))) return true;
  return false;
}

export async function POST(req: NextRequest) {
  const {
    leadName,
    message,
    history = [],
    business,
    examples = [],
    framework,
  }: {
    leadName: string;
    message: string;
    history: { role: "lead" | "agent"; body: string }[];
    business: { agentName: string; companyName: string; offer: string; goal: string; tone: string };
    examples?: { original: string; edited: string }[];
    framework?: AIFramework;
  } = await req.json();

  // Determine which model to use — model IDs are passed through directly
  const fw = framework;
  const escalate = fw ? shouldEscalate(history, message, fw.escalation) : false;
  const modelId = fw
    ? (escalate ? fw.premiumModel : fw.standardModel) ?? "gpt-4o-mini"
    : "claude-haiku-4-5-20251001";

  const agentName = fw?.agentName || business?.agentName || "Lena";
  const tone = fw?.tone || business?.tone || "Warm, direkt, menschlich";
  const lang = fw?.language || "de";

  // Build rules text
  const rulesText = fw?.rules?.length
    ? "\nRegeln:\n" + fw.rules.map(r => `- ${RULE_TEXT[r] || r}`).join("\n")
    : "\n- Maximal 2 kurze Sätze\n- Natürlich wie ein Mensch";

  // Custom system prompt
  const customInstructions = fw?.systemPrompt
    ? `\n\nSpezielle Anweisungen:\n${fw.systemPrompt}`
    : "";

  // Examples for style guidance
  const examplesText = examples.length > 0
    ? `\n\nBevorzugter Stil (Beispiele vom Nutzer bearbeitet):\n${examples.map(e => `- "${e.edited}"`).join("\n")}`
    : "";

  const historyText = history
    .map(m => `${m.role === "agent" ? agentName : leadName}: ${m.body}`)
    .join("\n");

  const systemPrompt = `Du bist ${agentName}${fw?.agentRole ? `, ${fw.agentRole}` : ""} von ${business?.companyName || "ROYA"}.
Produkt/Angebot: ${business?.offer || ""}
Gesprächsziel: ${business?.goal || "Termin buchen"}
Ton: ${tone}
Sprache: ${lang === "de" ? "Deutsch" : lang}${customInstructions}${examplesText}
${rulesText}

Antworte NUR mit JSON: {"reply": "deine Antwort"}`;

  const userPrompt = `Bisheriger Verlauf:\n${historyText}\n${leadName}: ${message}\n\n→ Deine Antwort als ${agentName}:`;

  try {
    const text = (await llmChat({
      model: modelId,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      maxTokens: 300,
    })).trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON");
    const { reply } = JSON.parse(match[0]);
    return NextResponse.json({ reply, model: modelId, escalated: escalate });
  } catch {
    return NextResponse.json({
      reply: `Interessant, ${leadName}! Wann würde sich ein kurzes Gespräch für dich lohnen?`,
      model: modelId,
      escalated: escalate,
    });
  }
}
