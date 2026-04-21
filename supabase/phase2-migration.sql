-- Phase 2: Style Learnings + Evolved Frameworks tables
-- Run this in the Supabase SQL editor to add the new tables.

-- Style learnings (extracted from uploaded chat exports)
create table if not exists style_learnings (
  id                    text primary key,
  agency_id             text,
  source                text not null default '',
  extracted_at          timestamptz default now(),
  tone_profile          text default '',
  sentence_style        text default '',
  conversation_patterns jsonb default '[]',
  phrases_to_use        jsonb default '[]',
  phrases_to_avoid      jsonb default '[]',
  rules                 jsonb default '[]',
  example_messages      jsonb default '[]',
  summary               text default '',
  playbook              jsonb default '[]',
  created_at            timestamptz default now()
);

create index if not exists sl_agency_id on style_learnings(agency_id);

-- Evolved frameworks (merged ROYA Standard + learnings)
create table if not exists evolved_frameworks (
  id                       text primary key,
  agency_id                text,
  version                  integer not null default 1,
  evolved_at               timestamptz default now(),
  learnings_used           integer not null default 0,
  writer_instructions      text default '',
  strategist_instructions  text default '',
  interpreter_instructions text default '',
  rules                    text[] default '{}',
  forbidden_phrases        text[] default '{}',
  temperature              numeric default 0.3,
  example_messages         jsonb default '[]',
  evolution_log            jsonb default '[]',
  created_at               timestamptz default now()
);

create index if not exists ef_agency_id on evolved_frameworks(agency_id);
