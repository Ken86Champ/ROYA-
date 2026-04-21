import { NextRequest, NextResponse } from "next/server";
import { stripe, priceIdForPlan, type PlanId } from "@/server/lib/stripe";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ─── Create Stripe Checkout Session ─────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  try {
    const { agencyId, plan } = await req.json() as { agencyId: string; plan: PlanId };

    if (!agencyId || !plan) {
      return NextResponse.json({ error: "Missing agencyId or plan" }, { status: 400 });
    }

    const priceId = priceIdForPlan(plan);
    if (!priceId) {
      return NextResponse.json({ error: `No Stripe price configured for plan: ${plan}` }, { status: 400 });
    }

    // Get or create Stripe customer
    const { data: agency } = await supabase
      .from("agencies")
      .select("stripe_customer_id, name")
      .eq("id", agencyId)
      .single();

    let customerId = agency?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        metadata: { agencyId },
        name: agency?.name || undefined,
      });
      customerId = customer.id;
      await supabase.from("agencies").update({
        stripe_customer_id: customerId,
      }).eq("id", agencyId);
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/dashboard/settings?billing=success`,
      cancel_url: `${baseUrl}/dashboard/settings?billing=canceled`,
      metadata: { agencyId },
      subscription_data: {
        metadata: { agencyId },
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[billing/checkout] Error:", err);
    const message = err instanceof Error ? err.message : "Checkout failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
