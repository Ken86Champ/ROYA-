-- ROYA Phase 5 Migration
-- Adds: lead_profiles, conversation_traces, conv_phase column to agent threads
-- Run in Supabase SQL Editor

-- ── 1. Add conv_phase column to existing agent threads ──────────────────────
ALTER TABLE roya_agent_threads
  ADD COLUMN IF NOT EXISTS conv_phase TEXT DEFAULT 'OPENER';

-- ── 2. Lead Profiles — persistent incremental memory per contact ─────────────
CREATE TABLE IF NOT EXISTS lead_profiles (
  contact_id      TEXT PRIMARY KEY,
  goal            TEXT,
  pain_point      TEXT,
  availability    TEXT,
  objections      JSONB DEFAULT '[]'::jsonb,
  budget_signals  JSONB DEFAULT '[]'::jsonb,
  interests       JSONB DEFAULT '[]'::jsonb,
  raw_notes       TEXT,
  updated_at_turn INTEGER DEFAULT 0,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── 3. Conversation Traces — full observability, one row per turn ─────────────
CREATE TABLE IF NOT EXISTS conversation_traces (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  conversation_id  TEXT NOT NULL,
  contact_id       TEXT,
  agency_id        TEXT,
  turn_number      INTEGER NOT NULL,
  conv_phase       TEXT NOT NULL,
  lead_message     TEXT NOT NULL,
  agent_reply      TEXT,
  next_action      TEXT,
  micro_intent     TEXT,
  guards_triggered JSONB DEFAULT '[]'::jsonb,
  rejection_count  INTEGER DEFAULT 0,
  diagnose_q_count INTEGER DEFAULT 0,
  interpretation   JSONB,
  strategy         JSONB,
  duration_ms      INTEGER,
  model            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups by conversation
CREATE INDEX IF NOT EXISTS idx_traces_conv_id ON conversation_traces(conversation_id);
CREATE INDEX IF NOT EXISTS idx_traces_contact_id ON conversation_traces(contact_id);
CREATE INDEX IF NOT EXISTS idx_traces_created ON conversation_traces(created_at DESC);

-- Index for lead profiles
CREATE INDEX IF NOT EXISTS idx_lead_profiles_updated ON lead_profiles(updated_at DESC);

-- ── RLS: traces and profiles are readable by service role only ────────────────
ALTER TABLE lead_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_traces ENABLE ROW LEVEL SECURITY;

-- Service role bypass (needed for server-side writes)
DROP POLICY IF EXISTS "service_role_all_lead_profiles" ON lead_profiles;
CREATE POLICY "service_role_all_lead_profiles" ON lead_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_all_conv_traces" ON conversation_traces;
CREATE POLICY "service_role_all_conv_traces" ON conversation_traces FOR ALL TO service_role USING (true) WITH CHECK (true);
