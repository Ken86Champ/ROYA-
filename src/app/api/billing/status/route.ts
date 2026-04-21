import { NextRequest, NextResponse } from "next/server";
import { PLANS, PLAN_LABELS, type PlanId } from "@/server/lib/stripe";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ─── Billing Status (plan, limits, usage) ───────────────────────────────────
export async function GET(req: NextRequest) {
  const agencyId = req.nextUrl.searchParams.get("agencyId");

  // Default demo agency fallback
  const { data: agency } = agencyId
    ? await supabase.from("agencies").select("*").eq("id", agencyId).single()
    : await supabase.from("agencies").select("*").limit(1).single();

  if (!agency) {
    return NextResponse.json({ error: "Agency not found" }, { status: 404 });
  }

  const plan = (agency.plan || "starter") as PlanId;
  const limits = PLANS[plan] || PLANS.starter;

  // Count current contacts
  const { count: contactCount } = await supabase
    .from("roya_contacts")
    .select("id", { count: "exact", head: true })
    .eq("agency_id", agency.id);

  // Count current clients
  const { count: clientCount } = await supabase
    .from("roya_clients")
    .select("id", { count: "exact", head: true })
    .eq("agency_id", agency.id);

  return NextResponse.json({
    agencyId: agency.id,
    agencyName: agency.name,
    plan,
    planLabel: PLAN_LABELS[plan],
    subscriptionStatus: agency.subscription_status || "none",
    currentPeriodEnd: agency.current_period_end || null,
    hasStripeCustomer: !!agency.stripe_customer_id,
    hasSubscription: !!agency.stripe_subscription_id,
    limits,
    usage: {
      contacts: contactCount ?? 0,
      clients: clientCount ?? 0,
    },
    contactsPercent: limits.maxContacts === Infinity
      ? 0
      : Math.round(((contactCount ?? 0) / limits.maxContacts) * 100),
    allPlans: Object.entries(PLANS).map(([id, p]) => ({
      id,
      label: PLAN_LABELS[id as PlanId],
      ...p,
    })),
  });
}
