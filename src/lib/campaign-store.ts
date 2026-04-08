// ─── Campaign Store (Supabase-backed) ─────────────────────────────────────────

import { supabase, genId } from "./supabase";
import type { Channel } from "./conversation-store";

export type CampaignStatus = "draft" | "active" | "paused" | "completed";
export type StepType = "opener" | "followup" | "breakup" | "booking" | "condition" | "exit";

// ─── AI Framework ──────────────────────────────────────────────────────────────

export type AIModelId =
  | "claude-haiku-4-5-20251001"
  | "claude-sonnet-4-6"
  | "claude-opus-4-6"
  | "gpt-4o-mini"      // coming soon
  | "gpt-4o"           // coming soon
  | "gemini-2.5-flash"; // coming soon

export const AI_MODELS: { id: AIModelId; label: string; badge: string; provider: "anthropic" | "openai" | "google"; available: boolean; desc: string }[] = [
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5",   badge: "Schnell",    provider: "anthropic", available: true,  desc: "Günstig · schnell · Routing & Klassifizierung" },
  { id: "claude-sonnet-4-6",         label: "Claude Sonnet 4.6",  badge: "Standard",   provider: "anthropic", available: true,  desc: "Beste Balance · empfohlen für Reply-Handling" },
  { id: "claude-opus-4-6",           label: "Claude Opus 4.6",    badge: "Premium",    provider: "anthropic", available: true,  desc: "Stärkstes Modell · schwierige Einwände & High-Value" },
  { id: "gpt-4o-mini",               label: "GPT-4o mini",        badge: "Bald",       provider: "openai",    available: false, desc: "OpenAI · günstig · agentische Abläufe" },
  { id: "gpt-4o",                    label: "GPT-4o",             badge: "Bald",       provider: "openai",    available: false, desc: "OpenAI · Frontier · komplexe Workflows" },
  { id: "gemini-2.5-flash",          label: "Gemini 2.5 Flash",   badge: "Bald",       provider: "google",    available: false, desc: "Google · günstig · Volumen-Workloads" },
];

export interface AIEscalation {
  afterTurns: number;         // escalate to premiumModel after N lead turns
  onIntents: string[];        // e.g. ["objecting","asking_price","booking"]
}

export interface AIFramework {
  agentName: string;
  agentRole: string;
  tone: string;
  language: string;
  standardModel: AIModelId;
  premiumModel: AIModelId;
  escalation: AIEscalation;
  systemPrompt: string;        // custom instructions injected into every call
  rules: string[];             // e.g. "max_2_sentences","end_with_question"
}

export const DEFAULT_AI_FRAMEWORK: AIFramework = {
  agentName: "Lena",
  agentRole: "KI-Reaktivierungsagentin",
  tone: "Warm, direkt und menschlich — wie eine Freundin die im Bereich arbeitet",
  language: "de",
  standardModel: "claude-sonnet-4-6",
  premiumModel: "claude-opus-4-6",
  escalation: { afterTurns: 4, onIntents: ["objecting", "asking_price"] },
  systemPrompt: "",
  rules: ["max_2_sentences", "end_with_question", "no_price_in_opener", "use_first_name"],
};

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

export interface Campaign {
  id: string;
  name: string;
  clientId?: string;
  channels: Channel[];
  status: CampaignStatus;
  flow: FlowStep[];
  aiFramework: AIFramework;
  contacts: CampaignContact[];
  stats: CampaignStats;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
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
    id:          r.id as string,
    name:        r.name as string,
    clientId:    r.client_id as string | undefined,
    channels:    r.channels as Channel[],
    status:      r.status as CampaignStatus,
    flow:        (r.flow as FlowStep[]) ?? [],
    aiFramework: (r.ai_framework as AIFramework) ?? DEFAULT_AI_FRAMEWORK,
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
  aiFramework?: AIFramework;
}): Promise<Campaign> {
  const now = new Date().toISOString();
  const id  = genId("camp");

  await supabase.from("campaigns").insert({
    id, name: params.name, client_id: params.clientId ?? null,
    channels: params.channels, status: "draft",
    flow: params.flow ?? defaultFlow(),
    ai_framework: params.aiFramework ?? DEFAULT_AI_FRAMEWORK,
    created_at: now,
  });

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
    flow: params.flow ?? defaultFlow(),
    aiFramework: params.aiFramework ?? DEFAULT_AI_FRAMEWORK,
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
