// ─── Campaign Store (Supabase-backed) ─────────────────────────────────────────

import { supabase, genId } from "./supabase";
import type { Channel } from "./conversation-store";

export type CampaignStatus = "draft" | "active" | "paused" | "completed";
export type StepType = "opener" | "followup" | "breakup" | "booking" | "condition" | "exit";

export interface FlowBranch {
  intent: "hot" | "warm" | "cold" | "question" | "timing" | "no_reply" | "default";
  nextStepIndex: number;   // index in campaign.flow[]
}

export interface FlowStep {
  id: string;
  type: StepType;
  label: string;
  delayDays: number;
  messageTemplate: string;
  condition: "no_reply" | "any" | "interested";
  branches?: FlowBranch[];   // only used for type="condition"
}

export interface CampaignContact {
  id: string;
  name: string;
  contact: string;
  channel: Channel;
  status: "pending" | "contacted" | "replied" | "interested" | "booked" | "closed" | "opted_out";
  currentStep: number;
  lastContactedAt?: string;
  convId?: string;
  emailAttempts: number;
  smsAttempts: number;
  whatsappAttempts: number;
  altContact?: string;   // fallback contact (phone if primary=email, email if primary=phone)
  altChannel?: Channel;  // channel for altContact
}

export interface CampaignStats {
  total: number;
  contacted: number;
  replied: number;
  interested: number;
  booked: number;
  optedOut: number;
  replyRate: number;
  bookingRate: number;
}

export type CampaignMode = "draft" | "test" | "live";

export interface Campaign {
  id: string;
  name: string;
  clientId?: string;
  channels: Channel[];
  status: CampaignStatus;
  flow: FlowStep[];
  contacts: CampaignContact[];
  stats: CampaignStats;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  // Kampagnen-Kontext (Single Source of Truth)
  offer?: string;
  valueProp?: string;
  cta?: string;
  targetAudience?: string;
  agentName?: string;
  agentTone?: string;
  mode?: CampaignMode;
}

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
  return {
    id:             r.id as string,
    name:           r.name as string,
    clientId:       r.client_id as string | undefined,
    channels:       r.channels as Channel[],
    status:         r.status as CampaignStatus,
    flow:           (r.flow as FlowStep[]) ?? [],
    contacts,
    stats:          computeStats(contacts),
    createdAt:      r.created_at as string,
    startedAt:      r.started_at as string | undefined,
    completedAt:    r.completed_at as string | undefined,
    offer:          r.offer as string | undefined,
    valueProp:      r.value_prop as string | undefined,
    cta:            r.cta as string | undefined,
    targetAudience: r.target_audience as string | undefined,
    agentName:      r.agent_name as string | undefined,
    agentTone:      r.agent_tone as string | undefined,
    mode:           (r.mode as CampaignMode | undefined) ?? "draft",
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
  const { data: campRows } = await supabase
    .from("campaigns")
    .select("*")
    .order("created_at", { ascending: false });

  if (!campRows?.length) return [];

  const ids = campRows.map(r => r.id);
  const { data: contactRows } = await supabase
    .from("campaign_contacts")
    .select("*")
    .in("campaign_id", ids);

  const contactMap = new Map<string, CampaignContact[]>();
  for (const c of contactRows ?? []) {
    if (!contactMap.has(c.campaign_id)) contactMap.set(c.campaign_id, []);
    contactMap.get(c.campaign_id)!.push(rowToContact(c));
  }

  return campRows.map(r => rowToCampaign(r, contactMap.get(r.id) ?? []));
}

export async function getById(id: string): Promise<Campaign | null> {
  const { data: row } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", id)
    .single();

  if (!row) return null;

  const { data: contactRows } = await supabase
    .from("campaign_contacts")
    .select("*")
    .eq("campaign_id", id);

  return rowToCampaign(row, (contactRows ?? []).map(rowToContact));
}

export async function create(params: {
  name: string;
  clientId?: string;
  channels: Channel[];
  contacts?: Omit<CampaignContact, "id" | "status" | "currentStep" | "emailAttempts" | "smsAttempts" | "whatsappAttempts">[];
  flow?: FlowStep[];
  offer?: string;
  valueProp?: string;
  cta?: string;
  targetAudience?: string;
  agentName?: string;
  agentTone?: string;
}): Promise<Campaign> {
  const now = new Date().toISOString();
  const id  = genId("camp");

  const { error: insertError } = await supabase.from("campaigns").insert({
    id, name: params.name, client_id: params.clientId ?? null,
    channels: params.channels, status: "draft",
    flow: params.flow ?? defaultFlow(), created_at: now,
    offer:           params.offer          ?? null,
    value_prop:      params.valueProp      ?? null,
    cta:             params.cta            ?? null,
    target_audience: params.targetAudience ?? null,
    agent_name:      params.agentName      ?? null,
    agent_tone:      params.agentTone      ?? null,
    mode:            "draft",
  });

  // If context columns don't exist yet (migration pending), retry without them
  if (insertError) {
    const { error: fallbackError } = await supabase.from("campaigns").insert({
      id, name: params.name, client_id: params.clientId ?? null,
      channels: params.channels, status: "draft",
      flow: params.flow ?? defaultFlow(), created_at: now,
    });
    if (fallbackError) throw new Error(`Campaign insert failed: ${fallbackError.message}`);
  }

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
    await supabase.from("campaign_contacts").insert(rows);
    for (const r of rows) contacts.push(rowToContact({ ...r, campaign_id: id }));
  }

  return {
    id, name: params.name, clientId: params.clientId,
    channels: params.channels, status: "draft",
    flow: params.flow ?? defaultFlow(), contacts,
    stats: computeStats(contacts), createdAt: now,
    offer: params.offer, valueProp: params.valueProp, cta: params.cta,
    targetAudience: params.targetAudience, agentName: params.agentName,
    agentTone: params.agentTone, mode: "draft" as CampaignMode,
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
