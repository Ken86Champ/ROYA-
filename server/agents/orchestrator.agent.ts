import Anthropic from "@anthropic-ai/sdk";
import {
  toolSegmentContacts,
  toolSendOutreach,
  toolScheduleFollowUp,
  toolMarkBooked,
} from "./orchestrator.tools";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const tools: Anthropic.Tool[] = [
  {
    name: "segment_contacts",
    description: "Segmentiert CRM-Kontakte in hot/warm/cold/lost Kategorien via AI-Analyse. Schreibt Ergebnisse in die DB.",
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
    description: "Generiert personalisierte Nachricht via Writer-Agent und enqueued den Versand via BullMQ.",
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
    description: "Plant ein verzögertes Follow-up: aktualisiert den Step in der DB und enqueued Send-Job mit Delay.",
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
    description: "Markiert Kontakt als gebucht in campaign_contacts + CRM, loggt Revenue-Event.",
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

async function runTool(
  name: string,
  input: Record<string, unknown>,
  ctx: { campaignId: string; clientContext: string; calendarUrl?: string },
): Promise<string> {
  switch (name) {
    case "segment_contacts":
      return toolSegmentContacts({
        campaignId: (input.campaignId as string) || ctx.campaignId,
        clientContext: (input.clientContext as string) || ctx.clientContext,
      });
    case "send_initial_outreach":
      return toolSendOutreach(
        { contactId: input.contactId as string, segment: input.segment as string, channel: input.channel as string },
        ctx,
      );
    case "schedule_follow_up":
      return toolScheduleFollowUp(
        { contactId: input.contactId as string, delayDays: input.delayDays as number, channel: input.channel as string, step: input.step as number },
        ctx,
      );
    case "mark_contact_booked":
      return toolMarkBooked(
        { contactId: input.contactId as string, dealValue: input.dealValue as number | undefined },
        ctx,
      );
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

  const toolCtx = {
    campaignId: campaign.id,
    clientContext: campaign.clientContext,
    calendarUrl: campaign.calendarUrl,
  };

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
Kampagnen-ID: ${campaign.id}

Deine Tools führen ECHTE Aktionen aus:
- segment_contacts: Ruft den Segmentation-Agent auf (Claude Haiku) → speichert Ergebnisse in DB
- send_initial_outreach: Ruft den Writer-Agent auf (Claude Sonnet) → enqueued BullMQ Send-Job
- schedule_follow_up: Aktualisiert Step in DB → enqueued verzögertes BullMQ Send-Job
- mark_contact_booked: Updates Status in campaign_contacts + CRM → loggt Revenue-Event

Agiere autonom: Segmentiere → Priorisiere Hot → Sende → Plane Follow-ups für Warm/Cold.`,
      tools,
      messages,
    });

    // Append assistant response
    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "end_turn") break;

    if (response.stop_reason === "tool_use") {
      const toolBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const b of toolBlocks) {
        const result = await runTool(b.name, b.input as Record<string, unknown>, toolCtx);
        toolResults.push({
          type: "tool_result" as const,
          tool_use_id: b.id,
          content: result,
        });
      }
      messages.push({ role: "user", content: toolResults });
    } else {
      break;
    }
  }

  return messages;
}
