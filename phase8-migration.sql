-- ─── Phase 8: Stripe Billing Integration ──────────────────────────────────
-- Run this in Supabase SQL Editor

-- 1. Create agencies table (multi-tenant root, includes billing)
CREATE TABLE IF NOT EXISTS agencies (
  id                      TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name                    TEXT NOT NULL,
  plan                    TEXT NOT NULL DEFAULT 'starter',          -- starter|growth|agency|enterprise
  stripe_customer_id      TEXT,
  stripe_subscription_id  TEXT,
  subscription_status     TEXT DEFAULT 'none',                     -- none|active|past_due|canceling|canceled
  current_period_end      TIMESTAMPTZ,
  created_at              TIMESTAMPTZ DEFAULT now()
);

-- 2. Indexes for billing lookups
CREATE INDEX IF NOT EXISTS idx_agencies_stripe_customer
  ON agencies(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agencies_subscription_status
  ON agencies(subscription_status);

-- 3. Billing events log (audit trail)
CREATE TABLE IF NOT EXISTS billing_events (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  agency_id       TEXT REFERENCES agencies(id),
  event_type      TEXT NOT NULL,     -- 'checkout_completed', 'subscription_updated', etc.
  stripe_event_id TEXT,
  plan_from       TEXT,
  plan_to         TEXT,
  amount          INTEGER,           -- cents
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_events_agency ON billing_events(agency_id);
CREATE INDEX IF NOT EXISTS idx_billing_events_stripe ON billing_events(stripe_event_id);

-- 4. RLS
ALTER TABLE agencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_agencies" ON agencies
  FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_billing_events" ON billing_events
  FOR ALL USING (true) WITH CHECK (true);

-- 5. Seed demo agency (so dashboard works immediately)
INSERT INTO agencies (id, name, plan)
VALUES ('demo-agency', 'Agentur Demo', 'starter')
ON CONFLICT (id) DO NOTHING;
