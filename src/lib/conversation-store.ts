// ─── Conversation Store (Supabase-backed) ─────────────────────────────────────

import { supabase, genId } from "./supabase";

export type Channel   = "sms" | "whatsapp" | "email";
export type ConvState = "active" | "replied" | "booked" | "closed" | "human_needed";
export type FlowNode  = "opener" | "followup_1" | "followup_2" | "breakup" | "booking" | "closed";

// ── Outcome tracking ───────────────────────────────────────────────────────────
export type ConversationOutcome =
  | "booked"               // successfully booked a call/demo
  | "unqualified_budget"   // price objection, no path to close
  | "unqualified_timing"   // timing objection with no future window confirmed
  | "chose_competitor"     // explicitly went with another provider
  | "budget_defer"         // timing/budget defer — reactivate in N weeks
  | "fundamental_no"       // explicit, definitive disinterest
  | "no_response"          // never replied after all follow-ups
  | "human_escalated";     // handed off to a human agent

export interface OutcomeMetadata {
  outcome: ConversationOutcome;
  reason?: string;
  competitorMentioned?: string;
  reactivateAfter?: string;  // ISO date — when to auto-re-enroll in a campaign
  objectionType?: "price" | "time" | "trust" | "competitor" | "fundamental";
  dealValueAtClose?: number;
}
export type Intent    =
  | "hot" | "warm" | "cold" | "question"
  | "timing" | "wrong_person" | "already_solved" | "unclear";

export interface ConvMessage {
  id: string;
  role: "agent" | "lead";
  body: string;
  timestamp: string;
  channel: Channel;
}

export interface IntentResult {
  intent: Intent;
  confidence: number;
  sentiment: "positive" | "neutral" | "negative";
  suggestedResponse: string;
  nextAction: "reply" | "book" | "human_handoff" | "close" | "snooze";
  snoozeUntil?: string;
  reasoning: string;
}

export interface Conversation {
  id: string;
  leadName: string;
  leadContact: string;
  channel: Channel;
  campaignId?: string;
  messages: ConvMessage[];
  state: ConvState;
  flowNode: FlowNode;
  lastActivity: string;
  lastIntent?: IntentResult;
  sentiment: "positive" | "neutral" | "negative";
  consecutiveQuestions: number;   // triggers handoff if >= 2
  bookedAt?: string;
  outcomeData?: OutcomeMetadata;  // set when conversation is resolved
  createdAt: string;
}

// ── Row mappers ────────────────────────────────────────────────────────────────

function rowToConv(row: Record<string, unknown>, msgs: ConvMessage[] = []): Conversation {
  return {
    id:          row.id as string,
    leadName:    row.lead_name as string,
    leadContact: row.lead_contact as string,
    channel:     row.channel as Channel,
    campaignId:  row.campaign_id as string | undefined,
    messages:    msgs,
    state:       row.state as ConvState,
    flowNode:    row.flow_node as FlowNode,
    lastActivity: row.last_activity as string,
    lastIntent:  row.last_intent as IntentResult | undefined,
    sentiment:   (row.sentiment as "positive" | "neutral" | "negative") ?? "neutral",
    consecutiveQuestions: (row.consecutive_questions as number) ?? 0,
    bookedAt:    row.booked_at as string | undefined,
    outcomeData: row.outcome_data as OutcomeMetadata | undefined,
    createdAt:   row.created_at as string,
  };
}

function rowToMsg(row: Record<string, unknown>): ConvMessage {
  return {
    id:        row.id as string,
    role:      row.role as "agent" | "lead",
    body:      row.body as string,
    timestamp: row.created_at as string,
    channel:   row.channel as Channel,
  };
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function getAll(): Promise<Conversation[]> {
  const { data: convRows, error } = await supabase
    .from("conversations")
    .select("*")
    .order("last_activity", { ascending: false });

  if (error || !convRows) return [];

  const ids = convRows.map(r => r.id);
  const { data: msgRows } = await supabase
    .from("messages")
    .select("*")
    .in("conversation_id", ids)
    .order("created_at", { ascending: true });

  const msgMap = new Map<string, ConvMessage[]>();
  for (const m of msgRows ?? []) {
    if (!msgMap.has(m.conversation_id)) msgMap.set(m.conversation_id, []);
    msgMap.get(m.conversation_id)!.push(rowToMsg(m));
  }

  return convRows.map(r => rowToConv(r, msgMap.get(r.id) ?? []));
}

export async function getById(id: string): Promise<Conversation | null> {
  const { data: row } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", id)
    .single();

  if (!row) return null;

  const { data: msgs } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });

  return rowToConv(row, (msgs ?? []).map(rowToMsg));
}

export async function findByContact(contact: string): Promise<Conversation | null> {
  const normalized = contact.replace(/\s/g, "").toLowerCase();

  const { data: rows } = await supabase
    .from("conversations")
    .select("*")
    .ilike("lead_contact", normalized)
    .order("created_at", { ascending: false })
    .limit(1);

  if (!rows || rows.length === 0) return null;
  const row = rows[0];

  const { data: msgs } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", row.id)
    .order("created_at", { ascending: true });

  return rowToConv(row, (msgs ?? []).map(rowToMsg));
}

export async function create(params: {
  leadName: string;
  leadContact: string;
  channel: Channel;
  campaignId?: string;
  openingMessage?: string;
}): Promise<Conversation> {
  const now = new Date().toISOString();
  const id  = genId("conv");

  await supabase.from("conversations").insert({
    id,
    lead_name:     params.leadName,
    lead_contact:  params.leadContact,
    channel:       params.channel,
    campaign_id:   params.campaignId ?? null,
    state:         "active",
    flow_node:     "opener",
    sentiment:     "neutral",
    last_activity: now,
    created_at:    now,
  });

  const messages: ConvMessage[] = [];

  if (params.openingMessage) {
    const msg: ConvMessage = {
      id: genId("msg"), role: "agent", body: params.openingMessage,
      timestamp: now, channel: params.channel,
    };
    await supabase.from("messages").insert({
      id:              msg.id,
      conversation_id: id,
      role:            "agent",
      body:            params.openingMessage,
      channel:         params.channel,
      created_at:      now,
    });
    messages.push(msg);
  }

  return {
    id, leadName: params.leadName, leadContact: params.leadContact,
    channel: params.channel, campaignId: params.campaignId,
    messages, state: "active", flowNode: "opener",
    lastActivity: now, sentiment: "neutral",
    consecutiveQuestions: 0, createdAt: now,
  };
}

export async function addMessage(
  convId: string,
  role: "agent" | "lead",
  body: string,
  channel: Channel,
): Promise<ConvMessage | null> {
  const now = new Date().toISOString();
  const msg: ConvMessage = { id: genId("msg"), role, body, timestamp: now, channel };

  await supabase.from("messages").insert({
    id: msg.id, conversation_id: convId, role, body, channel, created_at: now,
  });

  await supabase.from("conversations").update({
    last_activity: now,
    state: role === "lead" ? "replied" : undefined,
  }).eq("id", convId);

  return msg;
}

export async function applyIntent(convId: string, result: IntentResult): Promise<IntentResult> {
  // Track consecutive unanswered questions → handoff at 2
  const { data: current } = await supabase
    .from("conversations")
    .select("consecutive_questions")
    .eq("id", convId)
    .single();

  const prevCount = (current?.consecutive_questions as number) ?? 0;
  const newCount  = result.intent === "question" ? prevCount + 1 : 0;

  // Override to human handoff if same question repeats ≥ 2 times
  if (newCount >= 2 && result.nextAction !== "human_handoff") {
    result = {
      ...result,
      nextAction: "human_handoff",
      reasoning:  result.reasoning + " [Auto-escalation: 2+ consecutive unanswered questions]",
    };
  }

  let state: ConvState = "replied";
  let flowNode: FlowNode | undefined;

  switch (result.nextAction) {
    case "book":          state = "booked";       flowNode = "booking"; break;
    case "human_handoff": state = "human_needed"; break;
    case "close":         state = "closed";       flowNode = "closed";  break;
    case "snooze":        state = "active";       break;
  }

  await supabase.from("conversations").update({
    last_intent:            result,
    sentiment:              result.sentiment,
    state,
    consecutive_questions:  newCount,
    ...(flowNode ? { flow_node: flowNode } : {}),
    ...(state === "booked" ? { booked_at: new Date().toISOString() } : {}),
  }).eq("id", convId);

  return result;  // return (possibly modified) result so callers can check nextAction
}

export async function markBooked(convId: string): Promise<void> {
  await supabase.from("conversations").update({
    state:     "booked",
    flow_node: "booking",
    booked_at: new Date().toISOString(),
  }).eq("id", convId);
}

export async function advanceNode(convId: string, node: FlowNode): Promise<void> {
  await supabase.from("conversations").update({ flow_node: node }).eq("id", convId);
}

export async function setOutcome(
  convId: string,
  outcome: ConversationOutcome,
  meta?: Omit<OutcomeMetadata, "outcome">
): Promise<void> {
  const outcomeData: OutcomeMetadata = { outcome, ...meta };
  const finalState: ConvState =
    outcome === "booked"           ? "booked"       :
    outcome === "human_escalated"  ? "human_needed" :
    "closed";

  await supabase.from("conversations").update({
    outcome_data: outcomeData,
    state:        finalState,
    flow_node:    "closed",
    ...(outcome === "booked" ? { booked_at: new Date().toISOString() } : {}),
  }).eq("id", convId);
}

// ── Outcome analytics helper ───────────────────────────────────────────────────
// Returns aggregated outcome counts for a campaign (or all if no campaignId).
export async function getOutcomeSummary(campaignId?: string): Promise<Record<ConversationOutcome, number>> {
  const query = supabase
    .from("conversations")
    .select("outcome_data")
    .not("outcome_data", "is", null);

  if (campaignId) query.eq("campaign_id", campaignId);

  const { data } = await query;

  const counts: Record<ConversationOutcome, number> = {
    booked: 0, unqualified_budget: 0, unqualified_timing: 0,
    chose_competitor: 0, budget_defer: 0, fundamental_no: 0,
    no_response: 0, human_escalated: 0,
  };

  for (const row of data ?? []) {
    const o = (row.outcome_data as OutcomeMetadata)?.outcome;
    if (o && o in counts) counts[o]++;
  }
  return counts;
}
