// ─── Rate Limiter & Compliance (Supabase-backed) ──────────────────────────────

import { supabase } from "./supabase";

export const STOP_KEYWORDS = [
  "stop", "stopp", "unsubscribe", "abmelden", "aufhoeren", "aufhören",
  "kein interesse", "bitte nicht mehr", "no more", "remove me", "opt out",
  "optout", "cancel", "abbestellen",
];

const MAX_PER_DAY         = 1;
const MIN_HOURS_BETWEEN   = 23;
const CUTOFF_DAYS         = 30;  // only keep last 30 days of send timestamps

function normalize(contact: string) {
  return contact.toLowerCase().replace(/\s/g, "");
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isStopKeyword(message: string): boolean {
  const lower = message.toLowerCase().trim();
  return STOP_KEYWORDS.some(kw => lower.includes(kw));
}

export async function isOptedOut(contact: string): Promise<boolean> {
  const { data } = await supabase
    .from("rate_limits")
    .select("opted_out")
    .eq("contact", normalize(contact))
    .single();
  return data?.opted_out === true;
}

export async function optOut(contact: string): Promise<void> {
  const key = normalize(contact);
  await supabase.from("rate_limits").upsert({
    contact:    key,
    opted_out:  true,
    updated_at: new Date().toISOString(),
  }, { onConflict: "contact" });
}

export async function canSend(
  contact: string
): Promise<{ allowed: boolean; reason?: string }> {
  const key = normalize(contact);

  const { data } = await supabase
    .from("rate_limits")
    .select("opted_out, send_timestamps")
    .eq("contact", key)
    .single();

  if (data?.opted_out) {
    return { allowed: false, reason: "Opted out" };
  }

  const cutoff = Date.now() - CUTOFF_DAYS * 86400000;
  const timestamps: string[] = (data?.send_timestamps ?? [])
    .filter((ts: string) => new Date(ts).getTime() > cutoff);

  if (timestamps.length > 0) {
    const lastMs = Math.max(...timestamps.map(ts => new Date(ts).getTime()));
    const hoursElapsed = (Date.now() - lastMs) / 3600000;
    if (hoursElapsed < MIN_HOURS_BETWEEN) {
      return {
        allowed: false,
        reason: `Min. ${MIN_HOURS_BETWEEN}h zwischen Sends (${Math.round(MIN_HOURS_BETWEEN - hoursElapsed)}h verbleibend)`,
      };
    }

    const todaySends = timestamps.filter(ts => ts.startsWith(today())).length;
    if (todaySends >= MAX_PER_DAY) {
      return { allowed: false, reason: `Max ${MAX_PER_DAY} Send/Tag erreicht` };
    }
  }

  return { allowed: true };
}

export async function recordSend(contact: string): Promise<void> {
  const key = normalize(contact);
  const now = new Date().toISOString();

  // Fetch existing, prune old, append new
  const { data } = await supabase
    .from("rate_limits")
    .select("send_timestamps")
    .eq("contact", key)
    .single();

  const cutoff = Date.now() - CUTOFF_DAYS * 86400000;
  const existing: string[] = (data?.send_timestamps ?? [])
    .filter((ts: string) => new Date(ts).getTime() > cutoff);

  await supabase.from("rate_limits").upsert({
    contact:          key,
    opted_out:        false,
    send_timestamps:  [...existing, now],
    updated_at:       now,
  }, { onConflict: "contact" });
}

export async function getStats() {
  const { data } = await supabase
    .from("rate_limits")
    .select("contact, opted_out");

  const optOuts = (data ?? []).filter(r => r.opted_out).map(r => r.contact);
  return {
    optOutCount:      optOuts.length,
    trackedContacts:  (data ?? []).length,
    optOuts,
  };
}
