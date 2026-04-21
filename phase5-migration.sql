-- ─── Phase 5: Campaign Execution Log + Handoff-Pauses-Campaign ─────────────
-- Run this in Supabase SQL Editor

-- 1. Campaign execution audit trail
CREATE TABLE IF NOT EXISTS campaign_execution_log (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  campaign_id TEXT NOT NULL,
  contact_id  TEXT,
  contact_name TEXT,
  event       TEXT NOT NULL,  -- 'send', 'skip', 'queued', 'error', 'channel_switch', 'handoff_pause', 'step_advance', 'closed'
  channel     TEXT,
  step_index  INTEGER,
  details     JSONB DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exec_log_campaign ON campaign_execution_log(campaign_id);
CREATE INDEX IF NOT EXISTS idx_exec_log_event    ON campaign_execution_log(event);
CREATE INDEX IF NOT EXISTS idx_exec_log_created  ON campaign_execution_log(created_at);

-- 2. Add 'human_escalated' as a valid status for campaign_contacts
--    (Postgres doesn't have an enum constraint here — status is TEXT)
--    Just add a comment for documentation:
COMMENT ON COLUMN campaign_contacts.status IS 
  'pending | contacted | replied | interested | booked | closed | opted_out | human_escalated';

-- 3. Enable RLS (optional, for multi-tenant later)
ALTER TABLE campaign_execution_log ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "service_role_exec_log" ON campaign_execution_log
  FOR ALL USING (true) WITH CHECK (true);
