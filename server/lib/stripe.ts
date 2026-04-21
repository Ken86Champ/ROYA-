import Stripe from "stripe";

// ─── Stripe Client ──────────────────────────────────────────────────────────
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
export const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, { apiVersion: "2024-06-20" as Stripe.LatestApiVersion })
  : null;

// ─── Plan Definitions ───────────────────────────────────────────────────────
export type PlanId = "starter" | "growth" | "agency" | "enterprise";

export interface PlanLimits {
  maxContacts: number;
  maxClients: number;
  channels: ("email" | "sms" | "whatsapp")[];
  features: string[];
  priceMonthly: number; // EUR cents
}

export const PLANS: Record<PlanId, PlanLimits> = {
  starter: {
    maxContacts: 250,
    maxClients: 1,
    channels: ["email"],
    features: ["ai_reactivation", "basic_analytics"],
    priceMonthly: 9900, // €99
  },
  growth: {
    maxContacts: 1000,
    maxClients: 5,
    channels: ["email", "sms"],
    features: ["ai_reactivation", "basic_analytics", "ab_testing", "escalation_queue"],
    priceMonthly: 29900, // €299
  },
  agency: {
    maxContacts: 5000,
    maxClients: 25,
    channels: ["email", "sms", "whatsapp"],
    features: ["ai_reactivation", "basic_analytics", "ab_testing", "escalation_queue", "advanced_analytics", "white_label", "api_access"],
    priceMonthly: 79900, // €799
  },
  enterprise: {
    maxContacts: Infinity,
    maxClients: Infinity,
    channels: ["email", "sms", "whatsapp"],
    features: ["ai_reactivation", "basic_analytics", "ab_testing", "escalation_queue", "advanced_analytics", "white_label", "api_access", "dedicated_support", "custom_agents"],
    priceMonthly: 0, // custom pricing
  },
};

export const PLAN_LABELS: Record<PlanId, string> = {
  starter: "Starter",
  growth: "Growth",
  agency: "Agency",
  enterprise: "Enterprise",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Map Stripe price ID → plan. Set STRIPE_PRICE_* env vars. */
export function planFromPriceId(priceId: string): PlanId | null {
  const map: Record<string, PlanId> = {};
  if (process.env.STRIPE_PRICE_STARTER)    map[process.env.STRIPE_PRICE_STARTER]    = "starter";
  if (process.env.STRIPE_PRICE_GROWTH)     map[process.env.STRIPE_PRICE_GROWTH]     = "growth";
  if (process.env.STRIPE_PRICE_AGENCY)     map[process.env.STRIPE_PRICE_AGENCY]     = "agency";
  if (process.env.STRIPE_PRICE_ENTERPRISE) map[process.env.STRIPE_PRICE_ENTERPRISE] = "enterprise";
  return map[priceId] ?? null;
}

/** Get the Stripe price ID for a plan */
export function priceIdForPlan(plan: PlanId): string | null {
  const envKey = `STRIPE_PRICE_${plan.toUpperCase()}`;
  return process.env[envKey] ?? null;
}
