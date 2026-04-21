-- ─── Phase 6: Human Takeover — Handoff Queue Enhancements ─────────────────
-- Run this in Supabase SQL Editor

-- 1. Add team management columns to handoff_queue
ALTER TABLE handoff_queue ADD COLUMN IF NOT EXISTS assigned_to TEXT;
ALTER TABLE handoff_queue ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;
ALTER TABLE handoff_queue ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

-- 2. Index for assignment queries
CREATE INDEX IF NOT EXISTS idx_handoff_assigned ON handoff_queue(assigned_to);
CREATE INDEX IF NOT EXISTS idx_handoff_claimed  ON handoff_queue(claimed_at);

-- 3. Update comment on status
COMMENT ON COLUMN handoff_queue.status IS 'open | in_progress | resolved';
