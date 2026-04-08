import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const { companyName, offer, leadType, industry } = await req.json();

  if (!offer?.trim()) {
    return NextResponse.json({ error: "offer required" }, { status: 400 });
  }

  const prompt = `Du bist ein Sales-Copywriting-Experte für Revenue Reactivation Kampagnen.

Basierend auf diesen Angaben:
- Unternehmensname: ${companyName || "nicht angegeben"}
- Produkt / Dienstleistung: ${offer}
- Lead-Typ: ${leadType === "b2b" ? "B2B (Unternehmen)" : "B2C (Privatpersonen)"}
${industry ? `- Branche: ${industry}` : ""}

Generiere präzise, spezifische Texte für folgende Felder. Antworte NUR mit gültigem JSON, kein Markdown.

{
  "industry": "Branche des Unternehmens (max 30 Zeichen)",
  "companyDescription": "1-Satz Beschreibung was das Unternehmen macht (max 120 Zeichen)",
  "usps": "2-3 Alleinstellungsmerkmale, kommagetrennt (max 100 Zeichen)",
  "allServices": "Alle Dienstleistungen des Unternehmens, kommagetrennt (max 150 Zeichen)",
  "valueProp": "Kernnutzen — was der Lead konkret gewinnt (max 120 Zeichen)",
  "painPoint": "Hauptproblem / Frustration des Leads (max 80 Zeichen)",
  "noConvertReason": "3 typische Gründe warum Leads abspringen, kommagetrennt (max 80 Zeichen)",
  "cta": "Konkretes Call-to-Action (max 60 Zeichen)",
  "targetAudience": "Zielgruppen-Beschreibung (max 80 Zeichen)",
  "afterCta": "Was passiert nachdem der Lead den CTA annimmt (max 80 Zeichen)",
  "specialOffer": "Ein passendes Sonderangebot / Incentive (max 60 Zeichen)",
  "objections": [
    {"objection": "Typischer Einwand 1", "response": "Passende Antwort darauf"},
    {"objection": "Typischer Einwand 2", "response": "Passende Antwort darauf"},
    {"objection": "Typischer Einwand 3", "response": "Passende Antwort darauf"}
  ]
}`;

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
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
