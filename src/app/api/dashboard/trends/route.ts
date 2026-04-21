// ─── GET /api/dashboard/trends ─────────────────────────────────────────────────
// Returns time-series data for dash charts: daily sends, replies, bookings.
// Sources: experiment_events + campaign_contacts + conversations.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(req: NextRequest) {
  const days = Math.min(parseInt(req.nextUrl.searchParams.get("days") || "14"), 90);
  const since = new Date(Date.now() - days * 86400000).toISOString();

  // 1. experiment_events time-series
  const { data: events } = await supabase
    .from("experiment_events")
    .select("event_type, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: true });

  // Build daily buckets
  const buckets: Record<string, { date: string; sent: number; replied: number; positive: number; booked: number; escalated: number }> = {};
  for (let d = 0; d < days; d++) {
    const date = new Date(Date.now() - (days - 1 - d) * 86400000);
    const key = date.toISOString().split("T")[0];
    buckets[key] = { date: key, sent: 0, replied: 0, positive: 0, booked: 0, escalated: 0 };
  }

  for (const e of events ?? []) {
    const key = e.created_at?.split("T")[0];
    if (!buckets[key]) continue;
    if (e.event_type === "message_sent") buckets[key].sent++;
    if (e.event_type === "lead_replied") buckets[key].replied++;
    if (e.event_type === "lead_positive_replied") buckets[key].positive++;
    if (e.event_type === "booking_confirmed") buckets[key].booked++;
    if (e.event_type === "human_handoff") buckets[key].escalated++;
  }

  // 2. Channel breakdown
  const { data: channelEvents } = await supabase
    .from("experiment_events")
    .select("event_type, metadata")
    .gte("created_at", since);

  const channels: Record<string, { sent: number; replied: number; booked: number }> = {
    email: { sent: 0, replied: 0, booked: 0 },
    sms: { sent: 0, replied: 0, booked: 0 },
    whatsapp: { sent: 0, replied: 0, booked: 0 },
  };

  for (const e of channelEvents ?? []) {
    const ch = (e.metadata as Record<string, unknown>)?.channel as string || "email";
    if (!channels[ch]) channels[ch] = { sent: 0, replied: 0, booked: 0 };
    if (e.event_type === "message_sent") channels[ch].sent++;
    if (e.event_type === "lead_replied") channels[ch].replied++;
    if (e.event_type === "booking_confirmed") channels[ch].booked++;
  }

  // 3. Campaign ranking
  const { data: campEvents } = await supabase
    .from("experiment_events")
    .select("campaign_id, event_type")
    .gte("created_at", since);

  const campMap: Record<string, { id: string; sent: number; replied: number; booked: number }> = {};
  for (const e of campEvents ?? []) {
    const id = e.campaign_id;
    if (!id) continue;
    if (!campMap[id]) campMap[id] = { id, sent: 0, replied: 0, booked: 0 };
    if (e.event_type === "message_sent") campMap[id].sent++;
    if (e.event_type === "lead_replied") campMap[id].replied++;
    if (e.event_type === "booking_confirmed") campMap[id].booked++;
  }

  return NextResponse.json({
    daily: Object.values(buckets),
    channels,
    campaigns: Object.values(campMap).sort((a, b) => b.booked - a.booked).slice(0, 10),
    period: { days, since },
  });
}
