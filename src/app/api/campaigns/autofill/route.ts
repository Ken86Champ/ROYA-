import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const { companyName, offer, leadType } = await req.json();

  if (!offer?.trim()) {
    return NextResponse.json({ error: "offer required" }, { status: 400 });
  }

  const prompt = `Du bist ein Sales-Copywriting-Experte für Revenue Reactivation Kampagnen.

Basierend auf diesen Angaben:
- Unternehmensname: ${companyName || "nicht angegeben"}
- Produkt / Dienstleistung: ${offer}
- Lead-Typ: ${leadType === "b2b" ? "B2B (Unternehmen)" : "B2C (Privatpersonen)"}

Generiere präzise, spezifische Texte für folgende Felder. Antworte NUR mit gültigem JSON, kein Markdown.

{
  "valueProp": "Kernnutzen in einem Satz — was der Lead konkret gewinnt (max 120 Zeichen)",
  "painPoint": "Hauptproblem / Frustration des Leads — präzise und direkt (max 80 Zeichen)",
  "noConvertReason": "3 typische Gründe warum Leads nicht konvertiert haben, kommagetrennt (max 80 Zeichen)",
  "cta": "Konkretes Call-to-Action was der Lead tun soll (max 60 Zeichen)",
  "targetAudience": "Zielgruppen-Beschreibung für Reaktivierung (max 80 Zeichen)"
}`;

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    });

    const text = (response.content[0] as { type: string; text: string }).text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");

    const data = JSON.parse(jsonMatch[0]);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
