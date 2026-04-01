// ─── A/B Test Store (Supabase-backed) ─────────────────────────────────────────

import { supabase, genId } from "./supabase";

export interface VariationRecord {
  variationId: string;
  variationBody: string;
  stepType: string;
  campaignId: string;
  contactId: string;
  contactName: string;
  sentAt: string;
  replied: boolean;
  repliedAt?: string;
}

export interface VariationStats {
  variationId: string;
  stepType: string;
  body: string;
  sent: number;
  replies: number;
  replyRate: number;
  isWinner: boolean;
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function recordSend(
  params: Omit<VariationRecord, "replied" | "repliedAt">
): Promise<void> {
  await supabase.from("ab_records").insert({
    id:             genId("ab"),
    variation_id:   params.variationId,
    variation_body: params.variationBody,
    step_type:      params.stepType,
    campaign_id:    params.campaignId,
    contact_id:     params.contactId,
    contact_name:   params.contactName,
    sent_at:        params.sentAt,
    replied:        false,
  });
}

export async function recordReply(contactId: string, campaignId: string): Promise<void> {
  // Find the most recent un-replied record for this contact+campaign
  const { data } = await supabase
    .from("ab_records")
    .select("id")
    .eq("contact_id", contactId)
    .eq("campaign_id", campaignId)
    .eq("replied", false)
    .order("sent_at", { ascending: false })
    .limit(1);

  if (!data?.length) return;

  await supabase.from("ab_records").update({
    replied: true, replied_at: new Date().toISOString(),
  }).eq("id", data[0].id);
}

export async function getStatsForCampaign(campaignId: string): Promise<VariationStats[]> {
  const { data: records } = await supabase
    .from("ab_records")
    .select("*")
    .eq("campaign_id", campaignId);

  if (!records?.length) return [];

  // Group by stepType + variationId
  const groups = new Map<string, typeof records>();
  for (const r of records) {
    const key = `${r.step_type}:${r.variation_id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  const stats: VariationStats[] = [];
  for (const [, recs] of groups) {
    const sent    = recs.length;
    const replies = recs.filter(r => r.replied).length;
    stats.push({
      variationId: recs[0].variation_id,
      stepType:    recs[0].step_type,
      body:        recs[0].variation_body.slice(0, 120) + (recs[0].variation_body.length > 120 ? "…" : ""),
      sent,
      replies,
      replyRate:   sent > 0 ? Math.round((replies / sent) * 100) : 0,
      isWinner:    false,
    });
  }

  // Mark winner per stepType (highest reply rate, min 3 sends)
  const byStep = new Map<string, VariationStats[]>();
  for (const s of stats) {
    if (!byStep.has(s.stepType)) byStep.set(s.stepType, []);
    byStep.get(s.stepType)!.push(s);
  }
  for (const [, stepStats] of byStep) {
    const qualified = stepStats.filter(s => s.sent >= 3);
    if (!qualified.length) continue;
    const winner = qualified.reduce((best, s) => s.replyRate > best.replyRate ? s : best);
    winner.isWinner = true;
  }

  return stats.sort((a, b) => b.replyRate - a.replyRate);
}

export async function getWinnerForStep(
  campaignId: string,
  stepType: string
): Promise<string | null> {
  const stats = await getStatsForCampaign(campaignId);
  return stats.find(s => s.stepType === stepType && s.isWinner)?.variationId ?? null;
}
