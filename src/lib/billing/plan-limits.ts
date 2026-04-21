import { PLANS, type PlanId } from "@/server/lib/stripe";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export interface PlanCheck {
  allowed: boolean;
  reason?: string;
  plan: PlanId;
  limit: number;
  current: number;
}

/** Check if agency can add more contacts */
export async function checkContactLimit(agencyId: string): Promise<PlanCheck> {
  const { data: agency } = await supabase
    .from("agencies")
    .select("plan")
    .eq("id", agencyId)
    .single();

  const plan = (agency?.plan || "starter") as PlanId;
  const limits = PLANS[plan];

  const { count } = await supabase
    .from("roya_contacts")
    .select("id", { count: "exact", head: true })
    .eq("agency_id", agencyId);

  const current = count ?? 0;

  return {
    allowed: current < limits.maxContacts,
    reason: current >= limits.maxContacts
      ? `Kontaktlimit erreicht (${current}/${limits.maxContacts}). Bitte upgraden.`
      : undefined,
    plan,
    limit: limits.maxContacts,
    current,
  };
}

/** Check if agency can add more clients */
export async function checkClientLimit(agencyId: string): Promise<PlanCheck> {
  const { data: agency } = await supabase
    .from("agencies")
    .select("plan")
    .eq("id", agencyId)
    .single();

  const plan = (agency?.plan || "starter") as PlanId;
  const limits = PLANS[plan];

  const { count } = await supabase
    .from("roya_clients")
    .select("id", { count: "exact", head: true })
    .eq("agency_id", agencyId);

  const current = count ?? 0;

  return {
    allowed: current < limits.maxClients,
    reason: current >= limits.maxClients
      ? `Kundenlimit erreicht (${current}/${limits.maxClients}). Bitte upgraden.`
      : undefined,
    plan,
    limit: limits.maxClients,
    current,
  };
}

/** Check if a specific channel is available on agency's plan */
export async function checkChannelAccess(
  agencyId: string,
  channel: "email" | "sms" | "whatsapp",
): Promise<{ allowed: boolean; reason?: string }> {
  const { data: agency } = await supabase
    .from("agencies")
    .select("plan")
    .eq("id", agencyId)
    .single();

  const plan = (agency?.plan || "starter") as PlanId;
  const limits = PLANS[plan];

  if (!limits.channels.includes(channel)) {
    return {
      allowed: false,
      reason: `Kanal "${channel}" nicht im ${plan}-Plan enthalten. Bitte upgraden.`,
    };
  }

  return { allowed: true };
}

/** Check if a specific feature is available */
export async function checkFeatureAccess(
  agencyId: string,
  feature: string,
): Promise<{ allowed: boolean; reason?: string }> {
  const { data: agency } = await supabase
    .from("agencies")
    .select("plan")
    .eq("id", agencyId)
    .single();

  const plan = (agency?.plan || "starter") as PlanId;
  const limits = PLANS[plan];

  if (!limits.features.includes(feature)) {
    return {
      allowed: false,
      reason: `Feature "${feature}" nicht im ${plan}-Plan enthalten. Bitte upgraden.`,
    };
  }

  return { allowed: true };
}
