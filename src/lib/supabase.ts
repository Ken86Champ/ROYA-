import { createClient } from "@supabase/supabase-js";

const url  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url || !key) {
  console.warn("[ROYA] Supabase env vars missing — using in-memory stores as fallback.");
}

// Service-role client (bypasses RLS — server-side only)
export const supabase = createClient(url ?? "http://localhost:54321", key ?? "anon");

export function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}
