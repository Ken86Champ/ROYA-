-- Phase 11: Analytics Dashboard + Navigation + Agent Settings
-- Run in Supabase SQL Editor

-- 1. Agency Settings table (stores per-agency agent config as JSONB)
CREATE TABLE IF NOT EXISTS agency_settings (
  agency_id TEXT PRIMARY KEY REFERENCES agencies(id) ON DELETE CASCADE,
  config JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. RLS
ALTER TABLE agency_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agency_settings_all" ON agency_settings
  FOR ALL USING (true) WITH CHECK (true);

-- 3. Seed default config for demo agency
INSERT INTO agency_settings (agency_id, config, updated_at)
VALUES (
  'demo-agency',
  '{
    "persona": {
      "companyName": "",
      "industry": "",
      "tone": "professionell",
      "language": "deutsch-sie",
      "agentName": "Roya"
    },
    "agents": {
      "orchestrator":   { "model": "claude-opus-4-6",   "enabled": true },
      "conversation":   { "model": "claude-opus-4-6",   "enabled": true },
      "writer":         { "model": "claude-sonnet-4-6",  "enabled": true },
      "segmentation":   { "model": "claude-haiku-4-5",  "enabled": true },
      "booking":        { "model": "claude-haiku-4-5",  "enabled": true },
      "channelRouter":  { "model": "claude-haiku-4-5",  "enabled": true },
      "analytics":      { "model": "claude-sonnet-4-6",  "enabled": true }
    },
    "notifications": {
      "escalationEmail": true,
      "dailySummary": false,
      "bookingAlert": true,
      "emailAddress": ""
    }
  }'::jsonb,
  now()
)
ON CONFLICT (agency_id) DO NOTHING;
