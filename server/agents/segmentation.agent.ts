import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface Contact {
  id: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  lastContact?: string;
  dealValue?: number;
  lossReason?: string;
  originalInterest?: string;
}

export type Segment = "hot" | "warm" | "cold" | "lost";

export interface SegmentedContact extends Contact {
  segment: Segment;
  segmentReason: string;
}

export async function segmentContacts(
  contacts: Contact[],
  clientContext: string
): Promise<SegmentedContact[]> {
  const batchSize = 20;
  const results: SegmentedContact[] = [];

  for (let i = 0; i < contacts.length; i += batchSize) {
    const batch = contacts.slice(i, i + batchSize);

    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 2048,
      system: `Du bist ein B2B-Vertriebs-Analyst für ein Revenue Reactivation System.
Analysiere CRM-Kontakte und segmentiere sie:
- hot: Hohe Kaufwahrscheinlichkeit (letzter Kontakt < 3 Monate, positiver Deal-Verlauf)
- warm: Mittlere Kaufwahrscheinlichkeit (3-12 Monate, unklarer Abbruch)
- cold: Niedrige Kaufwahrscheinlichkeit (> 12 Monate, kein klarer Abbruch)
- lost: Explizit abgesagt oder nicht erreichbar

Kunden-Kontext: ${clientContext}

Antworte NUR als JSON-Array.`,
      messages: [{
        role: "user",
        content: `Segmentiere diese Kontakte:\n${JSON.stringify(batch, null, 2)}\n\nFormat: [{"id": "...", "segment": "hot|warm|cold|lost", "segmentReason": "..."}]`,
      }],
    });

    const text = response.content.find(b => b.type === "text")?.text ?? "[]";
    const segmented = JSON.parse(text) as { id: string; segment: Segment; segmentReason: string }[];

    for (const contact of batch) {
      const result = segmented.find(s => s.id === contact.id);
      results.push({
        ...contact,
        segment: result?.segment ?? "cold",
        segmentReason: result?.segmentReason ?? "Nicht analysiert",
      });
    }
  }

  return results;
}
