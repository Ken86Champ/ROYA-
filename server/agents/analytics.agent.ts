import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface CampaignMetrics {
  totalContacts: number;
  contacted: number;
  replied: number;
  qualified: number;
  booked: number;
  revenue: number;
  commissions: number;
  bySegment: Record<string, { count: number; booked: number }>;
  byChannel: Record<string, { sent: number; replied: number }>;
}

export async function generateInsights(
  metrics: CampaignMetrics,
  clientName: string
): Promise<{
  summary: string;
  topInsights: string[];
  recommendations: string[];
  nextActions: string[];
}> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: `Du bist ein B2B-Revenue-Analytics-Experte.
Analysiere Kampagnen-Metriken und generiere actionable Insights auf Deutsch.
Fokus: Was funktioniert? Was optimieren? Welche Segmente performen?`,
    messages: [{
      role: "user",
      content: `Kampagne für: ${clientName}
Metriken: ${JSON.stringify(metrics, null, 2)}

Antworte als JSON: { summary, topInsights: string[], recommendations: string[], nextActions: string[] }`,
    }],
  });

  const text = response.content.find(b => b.type === "text")?.text ?? "{}";
  return JSON.parse(text);
}
