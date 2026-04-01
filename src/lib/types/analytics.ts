// ─── ROYA Analytics Types ─────────────────────────────────────────────────────

export interface CampaignMetrics {
  campaignId: string;
  // Raw counts
  sent: number;
  replies: number;
  positiveReplies: number;
  qualified: number;
  bookings: number;
  handoffs: number;
  dead: number;
  dealsClosed: number;
  totalTargetedLeads: number;
  // Rates (0–100)
  replyRate: number;
  positiveReplyRate: number;
  qualifiedRate: number;
  bookingRate: number;
  handoffRate: number;
  deadRate: number;
  reactivationRate: number;
}

export interface FunnelStep {
  label: string;
  count: number;
  pctOfSent: number;     // percentage relative to sent
  pctOfPrev: number;     // percentage relative to previous step (drop-off view)
}

export interface FunnelMetrics {
  campaignId: string;
  steps: FunnelStep[];
}

export interface ForecastMetrics {
  targetLeads: number;
  expectedReplies: number;
  expectedPositiveReplies: number;
  expectedBookings: number;
  expectedDeals: number;
  avgReplyRate: number;
  avgPositiveReplyRate: number;
  avgBookingRate: number;
  avgCloseRate: number;
}

export interface VariantMetrics {
  variantKey: string;
  sent: number;
  replies: number;
  bookings: number;
  handoffs: number;
  replyRate: number;
  bookingRate: number;
  handoffRate: number;
  isTopPerformer: boolean;
}

export interface DashboardKPIs {
  totalSent: number;
  totalReplies: number;
  totalPositiveReplies: number;
  totalBookings: number;
  totalHandoffs: number;
  totalDead: number;
  campaignCount: number;
  avgReplyRate: number;
  avgPositiveReplyRate: number;
  avgBookingRate: number;
  avgHandoffRate: number;
  reactivationRate: number;
}

export interface CampaignMetricsResponse {
  metrics: CampaignMetrics;
  funnel: FunnelMetrics;
  variants: VariantMetrics[];
  forecast: ForecastMetrics;
}
