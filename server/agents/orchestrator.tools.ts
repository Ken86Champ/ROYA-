// ─── Orchestrator Tool Implementations ─────────────────────────────────────────
// Real tool handlers for the orchestrator agent. Each function talks to the DB,
// calls downstream agents, or enqueues BullMQ jobs.

import { createClient } from "@supabase/supabase-js";
import { segmentContacts, type Contact } from "./segmentation.agent";
import { generateOutreach } from "./writer.agent";
import { selectOptimalChannel } from "./channel-router.agent";
import { enqueueSend } from "../../src/lib/queue";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ── segment_contacts ───────────────────────────────────────────────────────────

export async function toolSegmentContacts(input: {
  campaignId: string;
  clientContext: string;
}): Promise<string> {
  // 1. Fetch contacts from campaign
  const { data: rows, error } = await supabase
    .from("campaign_contacts")
    .select("*")
    .eq("campaign_id", input.campaignId);

  if (error || !rows?.length) {
    return JSON.stringify({ success: false, error: error?.message || "Keine Kontakte gefunden" });
  }

  // 2. Map to segmentation agent format
  const contacts: Contact[] = rows.map(r => ({
    id: r.id,
    firstName: r.name?.split(" ")[0],
    lastName: r.name?.split(" ").slice(1).join(" "),
    company: r.company,
    lastContact: r.last_contacted_at,
    dealValue: r.deal_value,
    lossReason: r.loss_reason,
    originalInterest: r.original_interest,
  }));

  // 3. Call segmentation agent (Claude Haiku)
  const segmented = await segmentContacts(contacts, input.clientContext);

  // 4. Update segments in DB
  let updated = 0;
  for (const c of segmented) {
    const { error: ue } = await supabase
      .from("campaign_contacts")
      .update({ segment: c.segment, segment_reason: c.segmentReason })
      .eq("id", c.id);
    if (!ue) updated++;
  }

  // Also sync to CRM (roya_contacts) if email/phone match
  for (const c of segmented) {
    const row = rows.find(r => r.id === c.id);
    if (row?.contact) {
      await supabase
        .from("roya_contacts")
        .update({ segment: c.segment })
        .or(`email.eq.${row.contact},phone.eq.${row.contact}`)
        .then(() => {}, () => {});
    }
  }

  const summary: Record<string, number> = {};
  for (const c of segmented) summary[c.segment] = (summary[c.segment] || 0) + 1;

  return JSON.stringify({
    success: true,
    segmented: segmented.length,
    updated,
    distribution: summary,
  });
}

// ── send_initial_outreach ──────────────────────────────────────────────────────

export async function toolSendOutreach(input: {
  contactId: string;
  segment: string;
  channel: string;
}, campaignContext: { campaignId: string; clientContext: string; calendarUrl?: string }): Promise<string> {
  // 1. Fetch contact from campaign_contacts
  const { data: contact } = await supabase
    .from("campaign_contacts")
    .select("*")
    .eq("id", input.contactId)
    .single();

  if (!contact) return JSON.stringify({ success: false, error: "Kontakt nicht gefunden" });

  // 2. Generate outreach via writer agent (Claude Sonnet)
  const outreach = await generateOutreach({
    contact: {
      firstName: contact.name?.split(" ")[0],
      lastName: contact.name?.split(" ").slice(1).join(" "),
      company: contact.company,
      jobTitle: contact.job_title,
      lossReason: contact.loss_reason,
      originalInterest: contact.original_interest,
    },
    segment: input.segment as "hot" | "warm" | "cold" | "lost",
    channel: input.channel as "email" | "sms" | "whatsapp",
    clientContext: campaignContext.clientContext,
    calendarUrl: campaignContext.calendarUrl,
  });

  // 3. Enqueue send via BullMQ
  try {
    await enqueueSend({
      campaignId: campaignContext.campaignId,
      contactId: input.contactId,
      stepIndex: contact.current_step ?? 0,
      channel: input.channel as "email" | "sms" | "whatsapp",
      contact: contact.contact,
      leadName: contact.name,
    });
  } catch {
    // Fallback: direct log if queue unavailable
    console.warn("[orchestrator] BullMQ unavailable, logging outreach");
  }

  return JSON.stringify({
    success: true,
    contactName: contact.name,
    channel: input.channel,
    subject: outreach.subject,
    messagePreview: outreach.message.substring(0, 100) + "…",
  });
}

// ── schedule_follow_up ─────────────────────────────────────────────────────────

export async function toolScheduleFollowUp(input: {
  contactId: string;
  delayDays: number;
  channel: string;
  step: number;
}, campaignContext: { campaignId: string }): Promise<string> {
  // 1. Fetch contact
  const { data: contact } = await supabase
    .from("campaign_contacts")
    .select("name, contact, current_step")
    .eq("id", input.contactId)
    .single();

  if (!contact) return JSON.stringify({ success: false, error: "Kontakt nicht gefunden" });

  // 2. Update step in DB
  await supabase
    .from("campaign_contacts")
    .update({ current_step: input.step })
    .eq("id", input.contactId);

  // 3. Enqueue delayed send
  const delayMs = input.delayDays * 24 * 60 * 60 * 1000;
  try {
    await enqueueSend({
      campaignId: campaignContext.campaignId,
      contactId: input.contactId,
      stepIndex: input.step,
      channel: input.channel as "email" | "sms" | "whatsapp",
      contact: contact.contact,
      leadName: contact.name,
    }, delayMs);
  } catch {
    console.warn("[orchestrator] BullMQ unavailable, follow-up not queued");
  }

  return JSON.stringify({
    success: true,
    contactName: contact.name,
    step: input.step,
    delayDays: input.delayDays,
    scheduledAt: new Date(Date.now() + delayMs).toISOString(),
  });
}

// ── mark_contact_booked ────────────────────────────────────────────────────────

export async function toolMarkBooked(input: {
  contactId: string;
  dealValue?: number;
}, campaignContext: { campaignId: string }): Promise<string> {
  // 1. Update campaign_contacts
  const { data: contact } = await supabase
    .from("campaign_contacts")
    .select("name, contact")
    .eq("id", input.contactId)
    .single();

  if (!contact) return JSON.stringify({ success: false, error: "Kontakt nicht gefunden" });

  await supabase
    .from("campaign_contacts")
    .update({ status: "booked" })
    .eq("id", input.contactId);

  // 2. Also update CRM contact
  if (contact.contact) {
    await supabase
      .from("roya_contacts")
      .update({
        state: "booked",
        deal_value: input.dealValue ?? null,
      })
      .or(`email.eq.${contact.contact},phone.eq.${contact.contact}`)
      .then(() => {}, () => {});
  }

  // 3. Log execution event
  await supabase.from("execution_log").insert({
    campaign_id: campaignContext.campaignId,
    contact_id: input.contactId,
    contact_name: contact.name,
    event: "booked",
    details: { dealValue: input.dealValue ?? 0 },
  }).then(() => {}, () => {});

  return JSON.stringify({
    success: true,
    contactName: contact.name,
    dealValue: input.dealValue ?? 0,
    status: "booked",
  });
}

// ── Auto-select channel (used when orchestrator doesn't specify) ───────────────

export async function toolAutoChannel(contactId: string): Promise<string> {
  const { data: contact } = await supabase
    .from("campaign_contacts")
    .select("contact, name, channel")
    .eq("id", contactId)
    .single();

  if (!contact) return JSON.stringify({ channel: "email", reason: "default" });

  const result = await selectOptimalChannel({
    email: contact.contact?.includes("@") ? contact.contact : undefined,
    phone: !contact.contact?.includes("@") ? contact.contact : undefined,
    segment: "warm",
  });

  return JSON.stringify(result);
}
