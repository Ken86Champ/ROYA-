// ─── KPI Service — aggregates experiment_events from Supabase ─────────────────

import { supabase } from "@/lib/supabase";
import type {
  CampaignMetrics,
  DashboardKPIs,
  VariantMetrics,
} from "@/lib/types/analytics";

// Event types tracked in experiment_events
const EVENT_TYPES = [
  "message_sent",
  "lead_replied",
  "lead_positive_replied",
  "lead_qualified",
  "booking_confirmed",
  "human_handoff",
  "conversation_closed_dead",
  "deal_closed",
] as const;

type EventType = (typeof EVENT_TYPES)[number];

type EventRow = {
  campaign_id: string;
  event_type: string;
  variant_key: string | null;
  lead_id: string | null;
};

/** Never divide by zero. Returns 0–100 rounded rate. */
export function safeDivide(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 100 * 10) / 10; // 1 decimal
}

/** Build a counts map from raw event rows. */
function countEvents(rows: EventRow[]): Record<EventType, number> {
  const counts: Record<string, number> = {};
  for (const et of EVENT_TYPES) counts[et] = 0;
  for (const row of rows) {
    if (counts[row.event_type] !== undefined) counts[row.event_type]++;
  }
  return counts as Record<EventType, number>;
}

/** Build CampaignMetrics from event counts. */
function buildMetrics(
  campaignId: string,
  counts: Record<EventType, number>,
  totalTargetedLeads: number,
): CampaignMetrics {
  const sent             = counts["message_sent"];
  const replies          = counts["lead_replied"];
  const positiveReplies  = counts["lead_positive_replied"];
  const qualified        = counts["lead_qualified"];
  const bookings         = counts["booking_confirmed"];
  const handoffs         = counts["human_handoff"];
  const dead             = counts["conversation_closed_dead"];
  const dealsClosed      = counts["deal_closed"];

  return {
    campaignId,
    sent,
    replies,
    positiveReplies,
    qualified,
    bookings,
    handoffs,
    dead,
    dealsClosed,
    totalTargetedLeads,
    replyRate:         safeDivide(replies,         sent),
    positiveReplyRate: safeDivide(positiveReplies, sent),
    qualifiedRate:     safeDivide(qualified,        sent),
    bookingRate:       safeDivide(bookings,         sent),
    handoffRate:       safeDivide(handoffs,         replies),
    deadRate:          safeDivide(dead,             sent),
    reactivationRate:  safeDivide(positiveReplies,  totalTargetedLeads),
  };
}

/** Fetch and compute metrics for a single campaign. */
export async function getCampaignMetrics(campaignId: string): Promise<CampaignMetrics> {
  const { data: rows, error } = await supabase
    .from("experiment_events")
    .select("campaign_id, event_type, variant_key, lead_id")
    .eq("campaign_id", campaignId);

  if (error || !rows) {
    return buildMetrics(campaignId, countEvents([]), 0);
  }

  // Unique leads targeted = unique lead_ids across all events
  const uniqueLeads = new Set(rows.map(r => r.lead_id).filter(Boolean)).size;
  const counts = countEvents(rows as EventRow[]);
  return buildMetrics(campaignId, counts, uniqueLeads);
}

/** Fetch and compute metrics for all campaigns at once (single DB round-trip). */
export async function getAllCampaignMetrics(): Promise<CampaignMetrics[]> {
  const { data: rows, error } = await supabase
    .from("experiment_events")
    .select("campaign_id, event_type, variant_key, lead_id");

  if (error || !rows) return [];

  // Group by campaign_id
  const grouped = new Map<string, EventRow[]>();
  for (const row of rows as EventRow[]) {
    if (!row.campaign_id) continue;
    if (!grouped.has(row.campaign_id)) grouped.set(row.campaign_id, []);
    grouped.get(row.campaign_id)!.push(row);
  }

  return Array.from(grouped.entries()).map(([campaignId, campaignRows]) => {
    const uniqueLeads = new Set(campaignRows.map(r => r.lead_id).filter(Boolean)).size;
    return buildMetrics(campaignId, countEvents(campaignRows), uniqueLeads);
  });
}

/** Aggregate across all campaigns into a single DashboardKPIs object. */
export async function getGlobalKPIs(): Promise<DashboardKPIs> {
  const all = await getAllCampaignMetrics();

  if (all.length === 0) {
    return {
      totalSent: 0, totalReplies: 0, totalPositiveReplies: 0,
      totalBookings: 0, totalHandoffs: 0, totalDead: 0,
      campaignCount: 0,
      avgReplyRate: 0, avgPositiveReplyRate: 0,
      avgBookingRate: 0, avgHandoffRate: 0, reactivationRate: 0,
    };
  }

  const totalSent            = all.reduce((s, m) => s + m.sent, 0);
  const totalReplies         = all.reduce((s, m) => s + m.replies, 0);
  const totalPositiveReplies = all.reduce((s, m) => s + m.positiveReplies, 0);
  const totalBookings        = all.reduce((s, m) => s + m.bookings, 0);
  const totalHandoffs        = all.reduce((s, m) => s + m.handoffs, 0);
  const totalDead            = all.reduce((s, m) => s + m.dead, 0);
  const totalLeads           = all.reduce((s, m) => s + m.totalTargetedLeads, 0);

  return {
    totalSent,
    totalReplies,
    totalPositiveReplies,
    totalBookings,
    totalHandoffs,
    totalDead,
    campaignCount: all.length,
    avgReplyRate:         safeDivide(totalReplies,         totalSent),
    avgPositiveReplyRate: safeDivide(totalPositiveReplies, totalSent),
    avgBookingRate:       safeDivide(totalBookings,        totalSent),
    avgHandoffRate:       safeDivide(totalHandoffs,        totalReplies),
    reactivationRate:     safeDivide(totalPositiveReplies, totalLeads),
  };
}

/** Compute per-variant metrics for a campaign. */
export async function getCampaignVariants(campaignId: string): Promise<VariantMetrics[]> {
  const { data: rows, error } = await supabase
    .from("experiment_events")
    .select("event_type, variant_key")
    .eq("campaign_id", campaignId)
    .not("variant_key", "is", null);

  if (error || !rows || rows.length === 0) return [];

  // Group by variant_key
  const grouped = new Map<string, Record<string, number>>();
  for (const row of rows) {
    const vk = (row.variant_key as string) ?? "__none__";
    if (!grouped.has(vk)) {
      grouped.set(vk, { message_sent: 0, lead_replied: 0, booking_confirmed: 0, human_handoff: 0 });
    }
    const g = grouped.get(vk)!;
    if (g[row.event_type] !== undefined) g[row.event_type]++;
  }

  const variants: VariantMetrics[] = Array.from(grouped.entries()).map(([vk, c]) => ({
    variantKey:    vk,
    sent:          c["message_sent"],
    replies:       c["lead_replied"],
    bookings:      c["booking_confirmed"],
    handoffs:      c["human_handoff"],
    replyRate:     safeDivide(c["lead_replied"],        c["message_sent"]),
    bookingRate:   safeDivide(c["booking_confirmed"],   c["message_sent"]),
    handoffRate:   safeDivide(c["human_handoff"],       c["lead_replied"]),
    isTopPerformer: false,
  }));

  // Mark top performer by reply rate
  if (variants.length > 0) {
    const best = variants.reduce((a, b) => a.replyRate >= b.replyRate ? a : b);
    best.isTopPerformer = true;
  }

  return variants.sort((a, b) => b.replyRate - a.replyRate);
}
