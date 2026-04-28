/**
 * POST /api/run-migration — ONE-TIME use. Delete after running.
 * Creates missing Supabase tables: style_learnings, evolved_frameworks, prompt_frameworks
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST() {
  const results: Record<string, string> = {};

  // style_learnings
  const { error: e1 } = await supabase.rpc('run_migration_style_learnings').maybeSingle().catch(() => ({ error: null })) as { error: unknown };
  void e1;

  // We can't run DDL directly. Use insert-or-ignore trick to detect existence,
  // then return SQL for the user to run manually.
  const checks = await Promise.all([
    supabase.from('style_learnings').select('id').limit(1),
    supabase.from('evolved_frameworks').select('id').limit(1),
    supabase.from('prompt_frameworks').select('id').limit(1),
  ]);

  results.style_learnings     = checks[0].error ? 'MISSING' : 'EXISTS';
  results.evolved_frameworks  = checks[1].error ? 'MISSING' : 'EXISTS';
  results.prompt_frameworks   = checks[2].error ? 'MISSING' : 'EXISTS';

  const sql = `
-- Run this in your Supabase SQL Editor:

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
`;

  return NextResponse.json({ results, sql });
}
