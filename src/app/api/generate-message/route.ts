import { NextRequest, NextResponse } from "next/server";
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
  const {
    stepType,       // "opener" | "followup" | "breakup" | "booking"
    leadName,
    leadCompany,
    leadRole,
    channel,        // "email" | "sms" | "whatsapp"
    agentName,
    companyName,
    product,
    valueProp,
    ctaGoal,
    bookingLink,
    previousMessages, // string[]
    count = 3,       // number of variations
  } = await req.json();

  const channelInstruction = channel === "email"
    ? "Format: Subject line on first line (Subject: ...), then blank line, then body. Max 150 words."
    : "Format: Body only. Max 60 words. WhatsApp/SMS style — conversational, no formal structure.";

  const context = [
    `Lead: ${leadName}${leadCompany ? ` at ${leadCompany}` : ""}${leadRole ? `, ${leadRole}` : ""}`,
    `Agent: ${agentName} from ${companyName}`,
    `Product: ${product}`,
    valueProp ? `Value Prop: ${valueProp}` : "",
    ctaGoal   ? `Goal: ${ctaGoal}` : "",
    bookingLink ? `Booking Link: ${bookingLink}` : "",
    previousMessages?.length
      ? `Previous messages:\n${previousMessages.slice(-3).join("\n---\n")}`
      : "",
  ].filter(Boolean).join("\n");

  const prompt = `${STEP_INSTRUCTIONS[stepType] || STEP_INSTRUCTIONS.opener}

${channelInstruction}

Context:
${context}

Write exactly ${count} variations. Separate each with "---VARIATION---".
Each variation should have a meaningfully different angle/tone.`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
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
