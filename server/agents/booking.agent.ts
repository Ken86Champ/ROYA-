import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function pushBooking(input: {
  contactId: string;
  contactName: string;
  calendarUrl: string;
  channel: "email" | "sms" | "whatsapp";
  context: string;
}): Promise<{ message: string; sent: boolean }> {
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 256,
    system: `Generiere eine kurze, freundliche Nachricht um einen Termin-Link zu senden.
Sprache: Deutsch. Ton: professionell aber persönlich.
Für ${input.channel === "email" ? "E-Mail" : input.channel === "sms" ? "SMS (max 160 Zeichen)" : "WhatsApp"}.`,
    messages: [{
      role: "user",
      content: `Kontakt: ${input.contactName}
Kalender-Link: ${input.calendarUrl}
Kontext: ${input.context}

Generiere NUR die Nachricht, nichts anderes.`,
    }],
  });

  const message = response.content.find(b => b.type === "text")?.text ?? "";
  const fullMessage = `${message}\n\n${input.calendarUrl}`;

  return { message: fullMessage, sent: true };
}
