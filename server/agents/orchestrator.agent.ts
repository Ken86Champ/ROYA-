import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const tools: Anthropic.Tool[] = [
  {
    name: "segment_contacts",
    description: "Segmentiert CRM-Kontakte in hot/warm/cold/lost Kategorien",
    input_schema: {
      type: "object" as const,
      properties: {
        campaignId:    { type: "string" },
        clientContext: { type: "string" },
      },
      required: ["campaignId", "clientContext"],
    },
  },
  {
    name: "send_initial_outreach",
    description: "Generiert und sendet personalisierte Erstnachricht an Kontakt",
    input_schema: {
      type: "object" as const,
      properties: {
        contactId: { type: "string" },
        segment:   { type: "string", enum: ["hot", "warm", "cold", "lost"] },
        channel:   { type: "string", enum: ["email", "sms", "whatsapp"] },
      },
      required: ["contactId", "segment", "channel"],
    },
  },
  {
    name: "schedule_follow_up",
    description: "Plant ein automatisches Follow-up für einen Kontakt",
    input_schema: {
      type: "object" as const,
      properties: {
        contactId:  { type: "string" },
        delayDays:  { type: "number" },
        channel:    { type: "string", enum: ["email", "sms", "whatsapp"] },
        step:       { type: "number" },
      },
      required: ["contactId", "delayDays", "channel", "step"],
    },
  },
  {
    name: "mark_contact_booked",
    description: "Markiert einen Kontakt als gebucht und trackt Revenue",
    input_schema: {
      type: "object" as const,
      properties: {
        contactId:  { type: "string" },
        dealValue:  { type: "number" },
      },
      required: ["contactId"],
    },
  },
];

function runTool(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case "segment_contacts":
      return JSON.stringify({ success: true, message: `Contacts segmented for campaign ${input.campaignId}` });
    case "send_initial_outreach":
      return JSON.stringify({ success: true, message: `Outreach sent to ${input.contactId} via ${input.channel}` });
    case "schedule_follow_up":
      return JSON.stringify({ success: true, message: `Follow-up step ${input.step} scheduled for ${input.contactId} in ${input.delayDays} days` });
    case "mark_contact_booked":
      return JSON.stringify({ success: true, message: `Contact ${input.contactId} booked. Deal: ${input.dealValue ?? 0}` });
    default:
      return JSON.stringify({ error: "Unknown tool" });
  }
}

export async function runCampaignOrchestrator(campaign: {
  id: string;
  name: string;
  clientName: string;
  clientContext: string;
  totalContacts: number;
  channels: string[];
  calendarUrl?: string;
}) {
  const messages: Anthropic.MessageParam[] = [{
    role: "user",
    content: `Starte Kampagne "${campaign.name}" (ID: ${campaign.id}). ${campaign.totalContacts} Kontakte warten auf Reaktivierung.`,
  }];

  // Agentic loop — max 10 iterations
  for (let i = 0; i < 10; i++) {
    const response = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 4096,
      system: `Du bist der Master-Orchestrator eines autonomen Revenue Reactivation Systems.
Du koordinierst eine vollautomatische Kampagne für: ${campaign.clientName}
Angebots-Kontext: ${campaign.clientContext}
Verfügbare Kanäle: ${campaign.channels.join(", ")}
${campaign.calendarUrl ? `Kalender: ${campaign.calendarUrl}` : ""}
Agiere autonom: Segmentiere → Priorisiere → Sende → Plane Follow-ups → Tracke Buchungen.`,
      tools,
      messages,
    });

    // Append assistant response
    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "end_turn") break;

    if (response.stop_reason === "tool_use") {
      const toolResults: Anthropic.ToolResultBlockParam[] = response.content
        .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
        .map(b => ({
          type: "tool_result" as const,
          tool_use_id: b.id,
          content: runTool(b.name, b.input as Record<string, unknown>),
        }));
      messages.push({ role: "user", content: toolResults });
    } else {
      break;
    }
  }

  return messages;
}
