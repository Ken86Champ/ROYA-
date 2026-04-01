// ─── Streaming Message Generator ──────────────────────────────────────────────
// POST /api/generate-message/stream
// Returns a Server-Sent Events stream of the generated message.
// Used by the Flow Designer preview for real-time output.

import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const STEP_INSTRUCTIONS: Record<string, string> = {
  opener: `Write a cold outreach opener. Rules:
- Max 3 sentences. No "I hope this email finds you well" or similar filler.
- First sentence: reference something specific about them (company, role, or last interaction).
- Do NOT pitch. Create curiosity instead.
- End with a single, low-commitment question.
- Sound like a real person, not a salesperson.`,

  followup: `Write a follow-up message. Rules:
- Acknowledge they may be busy — don't guilt-trip.
- Add ONE piece of new value (insight, data point, or relevant observation).
- Different angle than the opener. Shorter.
- Soft CTA, not pushy.`,

  breakup: `Write a break-up message. Rules:
- This is the last message. Say so explicitly but with dignity.
- No desperation, no discounts.
- Leave the door open with grace: "If anything changes, you know where I am."
- Max 2-3 sentences. Respect their time.`,

  booking: `Write a booking confirmation message. Rules:
- Warm and personal, not corporate.
- Confirm the meeting clearly.
- Add a micro-commitment: ask them one question they can prepare for.
- Keep it under 4 sentences.`,
};

export async function POST(req: NextRequest) {
  const { stepType, leadName, leadCompany, channel, agentName, companyName, product, valueProp, ctaGoal } =
    await req.json();

  const channelInstruction = channel === "email"
    ? "Format: Subject line on first line (Subject: ...), then blank line, then body. Max 150 words."
    : "Format: Body only. Max 60 words. WhatsApp/SMS style — conversational, no formal structure.";

  const context = [
    `Lead: ${leadName}${leadCompany ? ` at ${leadCompany}` : ""}`,
    agentName && companyName ? `Agent: ${agentName} from ${companyName}` : "",
    product ? `Product: ${product}` : "",
    valueProp ? `Value Prop: ${valueProp}` : "",
    ctaGoal   ? `Goal: ${ctaGoal}` : "",
  ].filter(Boolean).join("\n");

  const prompt = `${STEP_INSTRUCTIONS[stepType] || STEP_INSTRUCTIONS.opener}

${channelInstruction}

Context:
${context}

Write ONE message variation only. No label, no preamble.`;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const anthropicStream = client.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 512,
          messages: [{ role: "user", content: prompt }],
        });

        for await (const chunk of anthropicStream) {
          if (
            chunk.type === "content_block_delta" &&
            chunk.delta.type === "text_delta"
          ) {
            const data = `data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`;
            controller.enqueue(encoder.encode(data));
          }
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err) {
        const errData = `data: ${JSON.stringify({ error: String(err) })}\n\n`;
        controller.enqueue(encoder.encode(errData));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection":    "keep-alive",
    },
  });
}
