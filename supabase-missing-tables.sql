-- ─── RUN THIS IN: supabase.com → your project → SQL Editor ───────────────────
-- Creates 3 missing tables: style_learnings, evolved_frameworks, prompt_frameworks

CREATE TABLE IF NOT EXISTS style_learnings (
  id                    text PRIMARY KEY,
  agency_id             text,
  source                text NOT NULL DEFAULT '',
  extracted_at          timestamptz DEFAULT now(),
  tone_profile          text DEFAULT '',
  sentence_style        text DEFAULT '',
  conversation_patterns jsonb DEFAULT '[]',
  phrases_to_use        jsonb DEFAULT '[]',
  phrases_to_avoid      jsonb DEFAULT '[]',
  rules                 jsonb DEFAULT '[]',
  example_messages      jsonb DEFAULT '[]',
  summary               text DEFAULT '',
  playbook              jsonb DEFAULT '[]',
  created_at            timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sl_agency_id ON style_learnings(agency_id);

CREATE TABLE IF NOT EXISTS evolved_frameworks (
  id                       text PRIMARY KEY,
  agency_id                text,
  version                  integer NOT NULL DEFAULT 1,
  evolved_at               timestamptz DEFAULT now(),
  learnings_used           integer NOT NULL DEFAULT 0,
  writer_instructions      text DEFAULT '',
  strategist_instructions  text DEFAULT '',
  interpreter_instructions text DEFAULT '',
  rules                    text[] DEFAULT '{}',
  forbidden_phrases        text[] DEFAULT '{}',
  temperature              numeric DEFAULT 0.3,
  example_messages         jsonb DEFAULT '[]',
  evolution_log            jsonb DEFAULT '[]',
  created_at               timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ef_agency_id ON evolved_frameworks(agency_id);

CREATE TABLE IF NOT EXISTS prompt_frameworks (
  id                       text PRIMARY KEY,
  agency_id                text,
  name                     text NOT NULL,
  description              text DEFAULT '',
  is_system                boolean DEFAULT false,
  writer_instructions      text DEFAULT '',
  strategist_instructions  text DEFAULT '',
  interpreter_instructions text DEFAULT '',
  rules                    text[] DEFAULT '{}',
  forbidden_phrases        text[] DEFAULT '{}',
  temperature              numeric DEFAULT 0.5,
  example_messages         jsonb DEFAULT '[]',
  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pf_agency_id ON prompt_frameworks(agency_id);
CREATE INDEX IF NOT EXISTS pf_is_system ON prompt_frameworks(is_system);

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS framework_id text;
