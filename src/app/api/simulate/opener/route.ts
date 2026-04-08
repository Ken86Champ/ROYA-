import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const { leadName, agentName, companyName, offer, goal } = await req.json();

  const prompt = `Du bist ${agentName} von ${companyName}.

Schreibe die allererste SMS-Nachricht an ${leadName} zu: "${offer}".
Ziel des Gesprächs: ${goal || "ein kurzes Kennenlerngespräch buchen"}.

Regeln (absolut):
- Maximal 2 kurze Sätze
- Kein Pitch, keine Produkterklärung
- Nur kurz fragen ob das Thema noch relevant ist
- Klingt wie ein Mensch, nicht wie ein Bot
- Du-Form, locker aber respektvoll
- Auf Deutsch (Schweizer Stil erlaubt)
- Stell dich kurz vor (Name + Firma) und frage dann direkt

Antworte NUR mit gültigem JSON, kein Markdown:
{"opener": "die SMS-Nachricht hier"}`;

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    });

    const text = ((response.content[0] as { text: string }).text || "").trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON");
    const { opener } = JSON.parse(match[0]);
    return NextResponse.json({ opener });
  } catch {
    return NextResponse.json({
      opener: `Hallo ${leadName}, hier ${agentName} von ${companyName}. Kurze Frage — ist das Thema ${offer} für dich noch aktuell?`,
    });
  }
}
