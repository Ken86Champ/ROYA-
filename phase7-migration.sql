-- ─── Phase 7: Webhook Security + Delivery Tracking ────────────────────────
-- Run this in Supabase SQL Editor

-- 1. Webhook idempotency table (prevents duplicate processing)
CREATE TABLE IF NOT EXISTS webhook_events (
  id          TEXT PRIMARY KEY,
  provider    TEXT NOT NULL,     -- 'twilio' | 'mailgun'
  event_type  TEXT NOT NULL,     -- 'inbound', 'delivered', 'bounced', 'opened', etc.
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_provider ON webhook_events(provider);
CREATE INDEX IF NOT EXISTS idx_webhook_events_created  ON webhook_events(created_at);

-- Auto-cleanup: delete events older than 7 days (keeps table small)
-- Run periodically via pg_cron or manual cleanup:
-- DELETE FROM webhook_events WHERE created_at < now() - interval '7 days';

-- 2. RLS
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_webhook_events" ON webhook_events
  FOR ALL USING (true) WITH CHECK (true);
