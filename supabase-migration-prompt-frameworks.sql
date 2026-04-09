-- ─── Prompt Frameworks Table ──────────────────────────────────────────────────
-- Stores reusable prompt framework templates per agency.
-- System frameworks (is_system = true) are shared across all agencies.

CREATE TABLE IF NOT EXISTS prompt_frameworks (
  id                       TEXT PRIMARY KEY,
  agency_id                TEXT,              -- NULL = system-wide default
  name                     TEXT NOT NULL,
  description              TEXT DEFAULT '',
  is_system                BOOLEAN DEFAULT false,
  writer_instructions      TEXT DEFAULT '',
  strategist_instructions  TEXT DEFAULT '',
  interpreter_instructions TEXT DEFAULT '',
  rules                    TEXT[] DEFAULT '{}',
  forbidden_phrases        TEXT[] DEFAULT '{}',
  temperature              NUMERIC DEFAULT 0.5,
  example_messages         JSONB DEFAULT '[]',
  created_at               TIMESTAMPTZ DEFAULT now(),
  updated_at               TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pf_agency_id ON prompt_frameworks(agency_id);
CREATE INDEX IF NOT EXISTS pf_is_system ON prompt_frameworks(is_system);

-- Link campaigns to a prompt framework
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS framework_id TEXT REFERENCES prompt_frameworks(id) ON DELETE SET NULL;
