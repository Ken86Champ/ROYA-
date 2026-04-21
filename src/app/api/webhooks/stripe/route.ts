import { NextRequest, NextResponse } from "next/server";
import { stripe, planFromPriceId } from "@/server/lib/stripe";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

// ─── Stripe Webhook Handler ─────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }
  if (!endpointSecret) {
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 503 });
  }

  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, endpointSecret);
  } catch (err) {
    console.error("[stripe-webhook] Signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      // ── Checkout completed → activate subscription ──
      case "checkout.session.completed": {
        const session = event.data.object;
        const agencyId = session.metadata?.agencyId;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;

        if (agencyId && subscriptionId) {
          // Fetch subscription to get plan
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          const priceId = sub.items.data[0]?.price.id;
          const plan = priceId ? planFromPriceId(priceId) : null;

          await supabase.from("agencies").update({
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            plan: plan ?? "starter",
            subscription_status: "active",
            current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
          }).eq("id", agencyId);

          console.log(`[stripe-webhook] Agency ${agencyId} → plan=${plan}, sub=${subscriptionId}`);
        }
        break;
      }

      // ── Subscription updated (plan change, renewal) ──
      case "customer.subscription.updated": {
        const sub = event.data.object;
        const customerId = sub.customer as string;
        const priceId = sub.items.data[0]?.price.id;
        const plan = priceId ? planFromPriceId(priceId) : null;

        const status = sub.cancel_at_period_end ? "canceling" : sub.status === "active" ? "active" : sub.status;

        await supabase.from("agencies").update({
          plan: plan ?? undefined,
          subscription_status: status,
          current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
        }).eq("stripe_customer_id", customerId);

        console.log(`[stripe-webhook] Subscription updated: customer=${customerId}, plan=${plan}, status=${status}`);
        break;
      }

      // ── Subscription deleted (expired/canceled) ──
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const customerId = sub.customer as string;

        await supabase.from("agencies").update({
          plan: "starter", // downgrade to free tier
          subscription_status: "canceled",
          stripe_subscription_id: null,
          current_period_end: null,
        }).eq("stripe_customer_id", customerId);

        console.log(`[stripe-webhook] Subscription canceled: customer=${customerId} → downgraded to starter`);
        break;
      }

      // ── Invoice paid (confirms payment) ──
      case "invoice.paid": {
        const invoice = event.data.object;
        const customerId = invoice.customer as string;

        await supabase.from("agencies").update({
          subscription_status: "active",
        }).eq("stripe_customer_id", customerId);

        console.log(`[stripe-webhook] Invoice paid: customer=${customerId}`);
        break;
      }

      // ── Invoice payment failed ──
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const customerId = invoice.customer as string;

        await supabase.from("agencies").update({
          subscription_status: "past_due",
        }).eq("stripe_customer_id", customerId);

        console.log(`[stripe-webhook] Payment failed: customer=${customerId}`);
        break;
      }

      default:
        console.log(`[stripe-webhook] Unhandled event: ${event.type}`);
    }
  } catch (err) {
    console.error(`[stripe-webhook] Error processing ${event.type}:`, err);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
