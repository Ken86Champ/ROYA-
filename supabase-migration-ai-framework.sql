-- ─── ROYA — AI Framework Migration ───────────────────────────────────────────
-- Run this once in your Supabase SQL editor.

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS ai_framework jsonb DEFAULT '{}'::jsonb;
