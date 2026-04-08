// ─── Campaign Store (Supabase-backed) ─────────────────────────────────────────

import { supabase, genId } from "./supabase";
import type { Channel } from "./conversation-store";

// Re-export all types and constants from the client-safe types file
export type { CampaignStatus, StepType, AIModelId, AIEscalation, AIFramework, FlowBranch, FlowStep, CampaignContact, CampaignStats, BusinessContext, ObjectionResponse, Campaign, Channel as CampaignChannel } from "./campaign-types";
export { AI_MODELS, DEFAULT_AI_FRAMEWORK, DEFAULT_BUSINESS_CONTEXT } from "./campaign-types";

import type { CampaignStatus, CampaignStats, FlowStep, AIFramework, CampaignContact, Campaign, BusinessContext } from "./campaign-types";
import { DEFAULT_AI_FRAMEWORK, DEFAULT_BUSINESS_CONTEXT } from "./campaign-types";

// ── Helpers ────────────────────────────────────────────────────────────────────

function computeStats(contacts: CampaignContact[]): CampaignStats {
  const total      = contacts.length;
  const contacted  = contacts.filter(c => c.status !== "pending").length;
  const replied    = contacts.filter(c => ["replied","interested","booked"].includes(c.status)).length;
  const interested = contacts.filter(c => ["interested","booked"].includes(c.status)).length;
  const booked     = contacts.filter(c => c.status === "booked").length;
  const optedOut   = contacts.filter(c => c.status === "opted_out").length;
  return {
    total, contacted, replied, interested, booked, optedOut,
    replyRate:   contacted > 0 ? Math.round((replied   / contacted) * 100) : 0,
    bookingRate: replied   > 0 ? Math.round((booked    / replied)   * 100) : 0,
  };
}

function rowToContact(r: Record<string, unknown>): CampaignContact {
  return {
    id:               r.id as string,
    name:             r.name as string,
    contact:          r.contact as string,
    channel:          r.channel as Channel,
    status:           r.status as CampaignContact["status"],
    currentStep:      r.current_step as number,
    lastContactedAt:  r.last_contacted_at as string | undefined,
    convId:           r.conv_id as string | undefined,
    emailAttempts:    (r.email_attempts as number) ?? 0,
    smsAttempts:      (r.sms_attempts as number) ?? 0,
    whatsappAttempts: (r.whatsapp_attempts as number) ?? 0,
    altContact:       r.alt_contact as string | undefined,
    altChannel:       r.alt_channel as Channel | undefined,
  };
}

function rowToCampaign(r: Record<string, unknown>, contacts: CampaignContact[]): Campaign {
  const extra = (r.business_extra as Record<string, unknown>) ?? {};
  return {
    id:          r.id as string,
    name:        r.name as string,
    clientId:    r.client_id as string | undefined,
    channels:    r.channels as Channel[],
    status:      r.status as CampaignStatus,
    flow:        (r.flow as FlowStep[]) ?? [],
    aiFramework: (r.ai_framework as AIFramework) ?? DEFAULT_AI_FRAMEWORK,
    businessContext: {
      // Block 1: Unternehmen
      companyName:        (r.company_name as string) || '',
      industry:           (extra.industry as string) || '',
      companyDescription: (extra.companyDescription as string) || '',
      location:           (extra.location as string) || '',
      usps:               (extra.usps as string) || '',
      // Block 2: Kampagnen-Produkt
      allServices:        (extra.allServices as string) || '',
      offer:              (r.offer as string) || '',
      priceRange:         (extra.priceRange as string) || '',
      valueProp:          (r.value_prop as string) || '',
      specialOffer:       (extra.specialOffer as string) || '',
      // Block 3: Zielgruppe & Lead-Beziehung
      leadType:           (r.lead_type as string) || 'b2c',
      targetAudience:     (r.target_audience as string) || '',
      leadRelationship:   (extra.leadRelationship as string) || 'former_customer',
      noConvertReason:    (r.no_convert_reason as string) || '',
      painPoint:          (r.pain_point as string) || '',
      // Block 4: Gesprächsziel
      cta:                (r.cta as string) || '',
      afterCta:           (extra.afterCta as string) || '',
      bookingLink:        (r.booking_link as string) || '',
      urgency:            (extra.urgency as string) || '',
      // Block 5: Agent-Wissen
      objections:           (extra.objections as { objection: string; response: string }[]) || [],
      doNotSay:             (extra.doNotSay as string) || '',
      insiderKnowledge:     (extra.insiderKnowledge as string) || '',
      exampleConversation:  (extra.exampleConversation as string) || '',
    },
    contacts,
    stats:       computeStats(contacts),
    createdAt:   r.created_at as string,
    startedAt:   r.started_at as string | undefined,
    completedAt: r.completed_at as string | undefined,
  };
}

// ── Default flow ───────────────────────────────────────────────────────────────

export function defaultFlow(): FlowStep[] {
  return [
    { id: genId("step"), type: "opener",   label: "Opener",      delayDays: 0,  condition: "no_reply", messageTemplate: "" },
    { id: genId("step"), type: "followup", label: "Follow-up 1", delayDays: 3,  condition: "no_reply", messageTemplate: "" },
    { id: genId("step"), type: "followup", label: "Follow-up 2", delayDays: 7,  condition: "no_reply", messageTemplate: "" },
    { id: genId("step"), type: "breakup",  label: "Break-up",    delayDays: 14, condition: "no_reply", messageTemplate: "" },
  ];
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function getAll(): Promise<Campaign[]> {
  const { data: campRows, error: campErr } = await supabase
    .from("campaigns")
    .select("*")
    .order("created_at", { ascending: false });

  if (campErr) console.error("[campaign-store] getAll campaigns error:", campErr.message);
  if (!campRows?.length) return [];

  const ids = campRows.map(r => r.id);
  const { data: contactRows, error: contactErr } = await supabase
    .from("campaign_contacts")
    .select("*")
    .in("campaign_id", ids);

  if (contactErr) console.error("[campaign-store] getAll contacts error:", contactErr.message);

  const contactMap = new Map<string, CampaignContact[]>();
  for (const c of contactRows ?? []) {
    if (!contactMap.has(c.campaign_id)) contactMap.set(c.campaign_id, []);
    contactMap.get(c.campaign_id)!.push(rowToContact(c));
  }

  return campRows.map(r => rowToCampaign(r, contactMap.get(r.id) ?? []));
}

export async function getById(id: string): Promise<Campaign | null> {
  const { data: row, error: campErr } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", id)
    .single();

  if (campErr) console.error("[campaign-store] getById campaign error:", campErr.message);
  if (!row) return null;

  const { data: contactRows, error: contactErr } = await supabase
    .from("campaign_contacts")
    .select("*")
    .eq("campaign_id", id);

  if (contactErr) console.error("[campaign-store] getById contacts error:", contactErr.message, "campaign_id:", id);

  return rowToCampaign(row, (contactRows ?? []).map(rowToContact));
}

export async function create(params: {
  name: string;
  clientId?: string;
  channels: Channel[];
  contacts?: Omit<CampaignContact, "id" | "status" | "currentStep" | "emailAttempts" | "smsAttempts" | "whatsappAttempts">[];
  flow?: FlowStep[];
  aiFramework?: AIFramework;
  businessContext?: BusinessContext;
}): Promise<Campaign> {
  const now = new Date().toISOString();
  const id  = genId("camp");
  const bc = params.businessContext ?? DEFAULT_BUSINESS_CONTEXT;

  const { error: campInsertErr } = await supabase.from("campaigns").insert({
    id, name: params.name, client_id: params.clientId ?? null,
    channels: params.channels, status: "draft",
    flow: params.flow ?? defaultFlow(),
    ai_framework: params.aiFramework ?? DEFAULT_AI_FRAMEWORK,
    company_name: bc.companyName || null,
    offer: bc.offer || null,
    value_prop: bc.valueProp || null,
    pain_point: bc.painPoint || null,
    no_convert_reason: bc.noConvertReason || null,
    cta: bc.cta || null,
    booking_link: bc.bookingLink || null,
    target_audience: bc.targetAudience || null,
    lead_type: bc.leadType || null,
    business_extra: {
      industry: bc.industry || '',
      companyDescription: bc.companyDescription || '',
      location: bc.location || '',
      usps: bc.usps || '',
      allServices: bc.allServices || '',
      priceRange: bc.priceRange || '',
      specialOffer: bc.specialOffer || '',
      leadRelationship: bc.leadRelationship || 'former_customer',
      afterCta: bc.afterCta || '',
      urgency: bc.urgency || '',
      objections: bc.objections || [],
      doNotSay: bc.doNotSay || '',
      insiderKnowledge: bc.insiderKnowledge || '',
      exampleConversation: bc.exampleConversation || '',
    },
    created_at: now,
  });

  if (campInsertErr) console.error("[campaign-store] create campaign error:", campInsertErr.message);

  const contacts: CampaignContact[] = [];

  if (params.contacts?.length) {
    const rows = params.contacts.map(c => ({
      id:               genId("contact"),
      campaign_id:      id,
      name:             c.name,
      contact:          c.contact,
      channel:          c.channel,
      status:           "pending",
      current_step:     0,
      email_attempts:   0,
      sms_attempts:     0,
      whatsapp_attempts: 0,
      alt_contact:      c.altContact ?? null,
      alt_channel:      c.altChannel ?? null,
    }));
    const { error: contactInsertErr } = await supabase.from("campaign_contacts").insert(rows);
    if (contactInsertErr) console.error("[campaign-store] create contacts error:", contactInsertErr.message, "count:", rows.length);
    for (const r of rows) contacts.push(rowToContact({ ...r, campaign_id: id }));
  }

  return {
    id, name: params.name, clientId: params.clientId,
    channels: params.channels, status: "draft",
    flow: params.flow ?? defaultFlow(),
    aiFramework: params.aiFramework ?? DEFAULT_AI_FRAMEWORK,
    businessContext: bc,
    contacts,
    stats: computeStats(contacts), createdAt: now,
  };
}

export async function start(id: string): Promise<Campaign | null> {
  await supabase.from("campaigns").update({
    status: "active", started_at: new Date().toISOString(),
  }).eq("id", id);
  return getById(id);
}

export async function pause(id: string): Promise<void> {
  await supabase.from("campaigns").update({ status: "paused" }).eq("id", id);
}

export async function updateContactStatus(
  campaignId: string,
  contactId: string,
  status: CampaignContact["status"],
  convId?: string,
): Promise<void> {
  await supabase.from("campaign_contacts").update({
    status,
    last_contacted_at: new Date().toISOString(),
    ...(convId ? { conv_id: convId } : {}),
  }).eq("id", contactId).eq("campaign_id", campaignId);
}

export async function incrementChannelAttempts(
  campaignId: string,
  contactId: string,
  channel: Channel,
): Promise<void> {
  const col = `${channel}_attempts` as "email_attempts" | "sms_attempts" | "whatsapp_attempts";
  const { data } = await supabase
    .from("campaign_contacts")
    .select(col)
    .eq("id", contactId)
    .single();
  if (!data) return;
  const current = (data as Record<string, number>)[col] ?? 0;
  await supabase.from("campaign_contacts").update({
    [col]: current + 1,
  }).eq("id", contactId).eq("campaign_id", campaignId);
}

/** Advance a contact's current step (used after condition node evaluation). */
export async function setContactStep(
  campaignId: string,
  contactId: string,
  stepIndex: number,
): Promise<void> {
  await supabase.from("campaign_contacts")
    .update({ current_step: stepIndex })
    .eq("id", contactId)
    .eq("campaign_id", campaignId);
}

/** Switch a contact to their alt channel (email→SMS or vice versa) and reset flow. */
export async function switchToAltChannel(
  campaignId: string,
  contactId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("campaign_contacts")
    .select("alt_contact, alt_channel")
    .eq("id", contactId)
    .single();

  if (!data?.alt_contact || !data?.alt_channel) return false;

  await supabase.from("campaign_contacts").update({
    contact:           data.alt_contact,
    channel:           data.alt_channel,
    alt_contact:       null,
    alt_channel:       null,
    current_step:      0,
    status:            "pending",
    email_attempts:    0,
    sms_attempts:      0,
    whatsapp_attempts: 0,
  }).eq("id", contactId).eq("campaign_id", campaignId);

  return true;
}

export async function updateFlow(campaignId: string, flow: FlowStep[]): Promise<void> {
  await supabase.from("campaigns").update({ flow }).eq("id", campaignId);
}

export async function updateAIFramework(campaignId: string, aiFramework: AIFramework): Promise<void> {
  await supabase.from("campaigns").update({ ai_framework: aiFramework }).eq("id", campaignId);
}

export async function updateBusinessContext(campaignId: string, bc: Partial<BusinessContext>): Promise<void> {
  const patch: Record<string, unknown> = {};
  // Existing text columns
  if (bc.companyName !== undefined)     patch.company_name = bc.companyName;
  if (bc.offer !== undefined)           patch.offer = bc.offer;
  if (bc.valueProp !== undefined)       patch.value_prop = bc.valueProp;
  if (bc.painPoint !== undefined)       patch.pain_point = bc.painPoint;
  if (bc.noConvertReason !== undefined) patch.no_convert_reason = bc.noConvertReason;
  if (bc.cta !== undefined)             patch.cta = bc.cta;
  if (bc.bookingLink !== undefined)     patch.booking_link = bc.bookingLink;
  if (bc.targetAudience !== undefined)  patch.target_audience = bc.targetAudience;
  if (bc.leadType !== undefined)        patch.lead_type = bc.leadType;

  // Build business_extra JSONB for extended fields
  const extraKeys = [
    'industry', 'companyDescription', 'location', 'usps',
    'allServices', 'priceRange', 'specialOffer',
    'leadRelationship', 'afterCta', 'urgency',
    'objections', 'doNotSay', 'insiderKnowledge', 'exampleConversation',
  ] as const;
  const hasExtra = extraKeys.some(k => (bc as Record<string, unknown>)[k] !== undefined);
  if (hasExtra) {
    // Fetch existing business_extra to merge
    const { data: existing } = await supabase.from("campaigns").select("business_extra").eq("id", campaignId).single();
    const prev = (existing?.business_extra as Record<string, unknown>) ?? {};
    const extra: Record<string, unknown> = { ...prev };
    for (const k of extraKeys) {
      if ((bc as Record<string, unknown>)[k] !== undefined) {
        extra[k] = (bc as Record<string, unknown>)[k];
      }
    }
    patch.business_extra = extra;
  }

  if (Object.keys(patch).length === 0) return;
  const { error } = await supabase.from("campaigns").update(patch).eq("id", campaignId);
  if (error) console.error("[campaign-store] updateBusinessContext error:", error.message);
}

export async function updateCampaign(
  campaignId: string,
  fields: { name?: string; clientId?: string | null; channels?: Channel[] },
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (fields.name !== undefined)     patch.name = fields.name;
  if (fields.clientId !== undefined)  patch.client_id = fields.clientId;
  if (fields.channels !== undefined)  patch.channels = fields.channels;
  if (Object.keys(patch).length === 0) return;
  const { error } = await supabase.from("campaigns").update(patch).eq("id", campaignId);
  if (error) console.error("[campaign-store] updateCampaign error:", error.message);
}

export async function replaceContacts(
  campaignId: string,
  contacts: Omit<CampaignContact, "id" | "status" | "currentStep" | "emailAttempts" | "smsAttempts" | "whatsappAttempts">[],
): Promise<CampaignContact[]> {
  // Delete existing contacts
  const { error: delErr } = await supabase
    .from("campaign_contacts")
    .delete()
    .eq("campaign_id", campaignId);
  if (delErr) console.error("[campaign-store] replaceContacts delete error:", delErr.message);

  if (!contacts.length) return [];

  const rows = contacts.map(c => ({
    id:               genId("contact"),
    campaign_id:      campaignId,
    name:             c.name,
    contact:          c.contact,
    channel:          c.channel,
    status:           "pending",
    current_step:     0,
    email_attempts:   0,
    sms_attempts:     0,
    whatsapp_attempts: 0,
    alt_contact:      c.altContact ?? null,
    alt_channel:      c.altChannel ?? null,
  }));
  const { error: insErr } = await supabase.from("campaign_contacts").insert(rows);
  if (insErr) console.error("[campaign-store] replaceContacts insert error:", insErr.message);
  return rows.map(r => rowToContact(r));
}

export async function globalStats() {
  const all = await getAll();
  return {
    totalCampaigns:  all.length,
    activeCampaigns: all.filter(c => c.status === "active").length,
    totalContacts:   all.reduce((s, c) => s + c.stats.total, 0),
    totalBooked:     all.reduce((s, c) => s + c.stats.booked, 0),
    totalReplied:    all.reduce((s, c) => s + c.stats.replied, 0),
    avgReplyRate:    all.length
      ? Math.round(all.reduce((s, c) => s + c.stats.replyRate, 0) / all.length)
      : 0,
  };
}
