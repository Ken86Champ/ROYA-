import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface OutreachContent {
  subject: string;
  message: string;
  followUp1: string;
  followUp2: string;
  tone: string;
}

export async function generateOutreach(input: {
  contact: {
    firstName?: string;
    lastName?: string;
    company?: string;
    jobTitle?: string;
    lossReason?: string;
    originalInterest?: string;
  };
  segment: "hot" | "warm" | "cold" | "lost";
  channel: "email" | "sms" | "whatsapp";
  clientContext: string;
  calendarUrl?: string;
}): Promise<OutreachContent> {
  const toneMap = {
    hot: "direkt und enthusiastisch, mit konkretem CTA",
    warm: "freundlich erinnernd, wecke Interesse neu",
    cold: "neugierig machend, baue Vertrauen auf",
    lost: "verständnisvoll, biete neuen Mehrwert",
  };

  const channelGuidelines = {
    email: "Betreff + 150-200 Wörter, professionell",
    sms: "Max 160 Zeichen, direkt und klar",
    whatsapp: "Locker aber professionell, max 200 Zeichen",
  };

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: `Du bist ein B2B-Outreach-Spezialist für Revenue Reactivation im DACH-Raum.
Generiere hyperpersonalisierte Nachrichten für ${input.channel.toUpperCase()}.

Richtlinien:
- Ton: ${toneMap[input.segment]}
- Kanal-Format: ${channelGuidelines[input.channel]}
- Sprache: Deutsch (Du-Form wenn passend)
- KEIN generisches Marketing-Sprech
- Referenziere spezifische Details aus dem Kontakt-Profil

Kunden-Angebot: ${input.clientContext}
${input.calendarUrl ? `Kalender-Link: ${input.calendarUrl}` : ""}

ABSOLUTE PFLICHT-REGELN — NIEMALS VERLETZEN:
- Erwähne NIEMALS "Roya", "Reaktivierungsprogramm", "Kampagne" oder externe Automatisierungstools.
- Der Agent agiert ausschliesslich als Mitarbeiter des anbietenden Unternehmens — kein Bot, keine Plattform.
- Jede Nachricht hat konkreten Bezug zum Kunden-Angebot: ${input.clientContext}`,
    messages: [{
      role: "user",
      content: `Erstelle Outreach für:
${JSON.stringify(input.contact, null, 2)}

Segment: ${input.segment}
Kanal: ${input.channel}

Antworte als JSON: { subject, message, followUp1, followUp2, tone }`,
    }],
  });

  const text = response.content.find(b => b.type === "text")?.text ?? "{}";
  return JSON.parse(text) as OutreachContent;
}
