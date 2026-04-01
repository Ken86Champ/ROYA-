// ─── Funnel Service — builds ordered funnel steps from CampaignMetrics ────────

import type { CampaignMetrics, FunnelMetrics, FunnelStep, ForecastMetrics } from "@/lib/types/analytics";
import { safeDivide } from "./kpi-service";

const FUNNEL_STAGES: { label: string; key: keyof CampaignMetrics }[] = [
  { label: "Versendet",   key: "sent" },
  { label: "Geantwortet", key: "replies" },
  { label: "Positiv",     key: "positiveReplies" },
  { label: "Qualifiziert",key: "qualified" },
  { label: "Termin",      key: "bookings" },
  { label: "Abgeschlossen",key: "dealsClosed" },
];

export function buildFunnel(metrics: CampaignMetrics): FunnelMetrics {
  const steps: FunnelStep[] = [];
  let prev = metrics.sent;

  for (const stage of FUNNEL_STAGES) {
    const count = metrics[stage.key] as number;
    // Skip trailing zero stages (e.g. dealsClosed = 0 is common)
    if (count === 0 && stage.key !== "sent" && stage.key !== "replies") {
      if (steps.length >= 4) break; // keep at least sent→replied→positive→booked
    }
    steps.push({
      label:      stage.label,
      count,
      pctOfSent:  safeDivide(count, metrics.sent),
      pctOfPrev:  safeDivide(count, prev),
    });
    prev = count > 0 ? count : prev; // don't let zero reset the denominator
  }

  return { campaignId: metrics.campaignId, steps };
}

/**
 * Build a simple forecast given a target number of leads and historical
 * average rates derived from existing campaign metrics.
 */
export function buildForecast(
  targetLeads: number,
  historicalMetrics: CampaignMetrics[],
): ForecastMetrics {
  const n = historicalMetrics.length;

  if (n === 0 || targetLeads === 0) {
    return {
      targetLeads,
      expectedReplies: 0,
      expectedPositiveReplies: 0,
      expectedBookings: 0,
      expectedDeals: 0,
      avgReplyRate: 0,
      avgPositiveReplyRate: 0,
      avgBookingRate: 0,
      avgCloseRate: 0,
    };
  }

  const totalSent            = historicalMetrics.reduce((s, m) => s + m.sent, 0);
  const totalReplies         = historicalMetrics.reduce((s, m) => s + m.replies, 0);
  const totalPositiveReplies = historicalMetrics.reduce((s, m) => s + m.positiveReplies, 0);
  const totalBookings        = historicalMetrics.reduce((s, m) => s + m.bookings, 0);
  const totalDeals           = historicalMetrics.reduce((s, m) => s + m.dealsClosed, 0);

  // Use aggregate rates (more accurate than averaging rates)
  const avgReplyRate         = safeDivide(totalReplies,         totalSent) / 100;
  const avgPositiveReplyRate = safeDivide(totalPositiveReplies, totalSent) / 100;
  const avgBookingRate       = safeDivide(totalBookings,        totalSent) / 100;
  const avgCloseRate         = safeDivide(totalDeals,           totalSent) / 100;

  return {
    targetLeads,
    expectedReplies:         Math.round(targetLeads * avgReplyRate),
    expectedPositiveReplies: Math.round(targetLeads * avgPositiveReplyRate),
    expectedBookings:        Math.round(targetLeads * avgBookingRate),
    expectedDeals:           Math.round(targetLeads * avgCloseRate),
    avgReplyRate:            Math.round(avgReplyRate         * 1000) / 10,
    avgPositiveReplyRate:    Math.round(avgPositiveReplyRate * 1000) / 10,
    avgBookingRate:          Math.round(avgBookingRate       * 1000) / 10,
    avgCloseRate:            Math.round(avgCloseRate         * 1000) / 10,
  };
}
