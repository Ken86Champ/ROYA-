import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export type Channel = "email" | "sms" | "whatsapp";

export async function selectOptimalChannel(contact: {
  email?: string;
  phone?: string;
  jobTitle?: string;
  company?: string;
  segment: string;
  lastContactChannel?: string;
}): Promise<{ channel: Channel; reason: string }> {
  const availableChannels: Channel[] = [];
  if (contact.email) availableChannels.push("email");
  if (contact.phone) availableChannels.push("sms", "whatsapp");

  if (availableChannels.length === 1) {
    return { channel: availableChannels[0], reason: "Einziger verfügbarer Kanal" };
  }

  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 256,
    system: `Wähle den optimalen Kommunikationskanal für B2B Revenue Reactivation.
Regeln:
- C-Level/Entscheider: Email bevorzugt
- Hot segment: direktester Kanal (oft WhatsApp)
- Letzter erfolgreicher Kanal: gleichen nutzen
- SMS für kurze, dringende Nachrichten`,
    messages: [{
      role: "user",
      content: `Kontakt: ${JSON.stringify(contact)}
Verfügbare Kanäle: ${availableChannels.join(", ")}

Antworte als JSON: {"channel": "email|sms|whatsapp", "reason": "..."}`,
    }],
  });

  const text = response.content.find(b => b.type === "text")?.text ?? "{}";
  return JSON.parse(text);
}
