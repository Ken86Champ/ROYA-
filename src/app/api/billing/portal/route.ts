import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/server/lib/stripe";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ─── Create Stripe Customer Portal Session ──────────────────────────────────
export async function POST(req: NextRequest) {
  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  try {
    const { agencyId } = await req.json() as { agencyId: string };

    if (!agencyId) {
      return NextResponse.json({ error: "Missing agencyId" }, { status: 400 });
    }

    const { data: agency } = await supabase
      .from("agencies")
      .select("stripe_customer_id")
      .eq("id", agencyId)
      .single();

    if (!agency?.stripe_customer_id) {
      return NextResponse.json({ error: "No billing account found. Please subscribe first." }, { status: 400 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

    const session = await stripe.billingPortal.sessions.create({
      customer: agency.stripe_customer_id,
      return_url: `${baseUrl}/dashboard/settings`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[billing/portal] Error:", err);
    const message = err instanceof Error ? err.message : "Portal creation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
