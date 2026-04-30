import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_FRAMEWORKS } from "@/lib/framework-store";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ROYA Standard phase instructions — aligned with the framework blueprint
const STEP_INSTRUCTIONS: Record<string, string> = {
  opener: `Schreib eine kurze Reaktivierungs-SMS. Regeln:
- Max 3 Sätze.
- Satz 1: Vorstellen + erwähnen dass früher Kontakt war (konkret, z.B. wegen dem Angebot).
- KEIN Pitch. Nur fragen ob das Thema noch aktuell ist.
- Letzter Satz: Einfache Frage ("Ist das aktuell noch ein Thema bei dir?")
- Klingt wie ein Mensch, nicht wie Werbung. Keine Emojis. Kein "Ich hoffe...".`,

  followup: `Schreib eine kurze Follow-up SMS (1. Nachfassung). Regeln:
- 2-3 Sätze. Kein Vorwurf wegen Nicht-Antwort.
- Neuer Winkel als beim Opener — z.B. Ergebnis/Nutzen erwähnen.
- Sanfte Frage am Schluss, kein Druck.
- Kein Sales-Jargon. Kein "Ich würde mich freuen..."`,

  breakup: `Schreib eine letzte SMS (Break-up). Regeln:
- Max 2 Sätze. Sauber, würdevoll, kein Druck.
- Mach klar dass dies die letzte Nachricht ist, aber die Tür bleibt offen.
- Kein "Letzte Chance!", kein Discount, keine Verzweiflung.
- Beispiel: "Ich melde mich nicht mehr. Falls sich das ändert, weißt du wo ich bin."`,

  booking: `Schreib eine Buchungsbestätigung. Regeln:
- Warm und persönlich. Termin klar bestätigen.
- Füge eine kurze Frage hinzu damit sich die Person vorbereiten kann.
- Max 3 Sätze. Kein Corporate-Ton.`,
};

export async function POST(req: NextRequest) {
  const {
    stepType,
    leadName,
    channel,
    count = 2,
    // Business context from campaign
    agentName,
    companyName,
    offer,
    valueProp,
    painPoint,
    noConvertReason,
    language = "de",
  } = await req.json();

  const royaStandard = SYSTEM_FRAMEWORKS[0];
  const firstName = (leadName || "").split(" ")[0] || leadName;

  const channelInstruction = channel === "email"
    ? "Format: Betreffzeile in der ersten Zeile (Betreff: ...), dann Leerzeile, dann Text. Max 120 Wörter."
    : "Format: Nur SMS-Text. Max 2-3 kurze Sätze. Kein formaler Aufbau. Wie eine echte SMS.";

  const context = [
    `Lead-Vorname: ${firstName}`,
    agentName   ? `Agent: ${agentName}` : "",
    companyName ? `Unternehmen: ${companyName}` : "",
    offer       ? `Angebot / Produkt: ${offer}` : "",
    valueProp   ? `Ergebnisse: ${valueProp}` : "",
    painPoint   ? `Pain Point der Zielgruppe: ${painPoint}` : "",
    noConvertReason ? `Warum Leads abgesprungen sind: ${noConvertReason}` : "",
  ].filter(Boolean).join("\n");

  const forbiddenPhrases = (royaStandard.forbiddenPhrases ?? []).map(p => `- "${p}"`).join("\n");

  const prompt = `${STEP_INSTRUCTIONS[stepType] || STEP_INSTRUCTIONS.opener}

${channelInstruction}

Kontext:
${context}

VERBOTEN — diese Phrasen NIEMALS verwenden:
${forbiddenPhrases}

STIL-REGELN (aus dem ROYA Standard):
- Kein "Ich freue mich", "Schönen Tag", "Danke für dein Vertrauen"
- Keine Emojis, keine Gedankenstriche (—)
- Du-Form. Kurz. Menschlich.
- Sprache: ${language === "de" ? "Deutsch" : language}

Schreib genau ${count} Variationen. Trenne jede mit "---VARIATION---".
Jede Variation soll einen anderen Winkel/Ton haben.`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 800,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = (response.content[0] as { type: string; text: string }).text;
  const variations = raw
    .split("---VARIATION---")
    .map(v => v.trim())
    .filter(Boolean)
    .slice(0, count)
    .map((text, i) => {
      // Parse subject for email
      const subjectMatch = text.match(/^Subject:\s*(.+)\n/i);
      const subject = subjectMatch ? subjectMatch[1].trim() : undefined;
      const body = subjectMatch ? text.replace(/^Subject:\s*.+\n\n?/i, "").trim() : text;
      return { id: `var_${i + 1}`, subject, body, label: `Variation ${i + 1}` };
    });

  return NextResponse.json({ variations });
}
