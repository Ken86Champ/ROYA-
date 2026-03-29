import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const segmentContactsTool = betaZodTool({
  name: "segment_contacts",
  description: "Segmentiert CRM-Kontakte in hot/warm/cold/lost Kategorien",
  inputSchema: z.object({
    campaignId: z.string(),
    clientContext: z.string(),
  }),
  run: async ({ campaignId, clientContext }) => {
    return { success: true, message: `Contacts segmented for campaign ${campaignId}` };
  },
});

const sendInitialOutreach = betaZodTool({
  name: "send_initial_outreach",
  description: "Generiert und sendet personalisierte Erstnachricht an Kontakt",
  inputSchema: z.object({
    contactId: z.string(),
    segment: z.enum(["hot", "warm", "cold", "lost"]),
    channel: z.enum(["email", "sms", "whatsapp"]),
  }),
  run: async ({ contactId, segment, channel }) => {
    return { success: true, message: `Outreach sent to ${contactId} via ${channel}` };
  },
});

const scheduleFollowUp = betaZodTool({
  name: "schedule_follow_up",
  description: "Plant ein automatisches Follow-up für einen Kontakt",
  inputSchema: z.object({
    contactId: z.string(),
    delayDays: z.number(),
    channel: z.enum(["email", "sms", "whatsapp"]),
    step: z.number(),
  }),
  run: async ({ contactId, delayDays, step }) => {
    return { success: true, message: `Follow-up step ${step} scheduled for ${contactId} in ${delayDays} days` };
  },
});

const markContactBooked = betaZodTool({
  name: "mark_contact_booked",
  description: "Markiert einen Kontakt als gebucht und trackt Revenue",
  inputSchema: z.object({
    contactId: z.string(),
    dealValue: z.number().optional(),
  }),
  run: async ({ contactId, dealValue }) => {
    return { success: true, message: `Contact ${contactId} booked. Deal: ${dealValue ?? 0}` };
  },
});

export async function runCampaignOrchestrator(campaign: {
  id: string;
  name: string;
  clientName: string;
  clientContext: string;
  totalContacts: number;
  channels: string[];
  calendarUrl?: string;
}) {
  const finalMessage = await client.beta.messages.toolRunner({
    model: "claude-opus-4-6",
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    system: `Du bist der Master-Orchestrator eines autonomen Revenue Reactivation Systems.

Du koordinierst eine vollautomatische Kampagne für: ${campaign.clientName}
Angebots-Kontext: ${campaign.clientContext}
Verfügbare Kanäle: ${campaign.channels.join(", ")}
${campaign.calendarUrl ? `Kalender für Termine: ${campaign.calendarUrl}` : ""}

Deine Aufgaben:
1. Segmentiere alle Kontakte
2. Priorisiere hot > warm > cold > lost
3. Wähle optimalen Kanal pro Kontakt
4. Plane Follow-up-Sequenzen (3, 7, 14 Tage)
5. Tracke Buchungen und Revenue

Agiere AUTONOM.`,
    tools: [segmentContactsTool, sendInitialOutreach, scheduleFollowUp, markContactBooked],
    messages: [{
      role: "user",
      content: `Starte Kampagne "${campaign.name}" (ID: ${campaign.id}).
${campaign.totalContacts} Kontakte warten auf Reaktivierung.`,
    }],
  });

  return finalMessage;
}
