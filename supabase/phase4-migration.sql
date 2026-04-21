-- Phase 4: Conversation Outcomes + Auto-Learning Feedback Loop
-- Run this in the Supabase SQL editor.

-- Conversation outcomes (final result of each conversation)
create table if not exists conversation_outcomes (
  id                 text primary key default gen_random_uuid()::text,
  conversation_id    text not null,
  outcome            text not null default 'unknown',  -- booked|rejected|ghosted|handed_off|in_progress
  framework_version  integer not null default 0,
  turns_count        integer not null default 0,
  avg_confidence     integer not null default 0,
  final_state        text not null default '',
  channel            text not null default 'sms',
  lead_name          text default '',
  -- What worked / what didn't (auto-extracted)
  successful_angles  jsonb default '[]',
  failed_angles      jsonb default '[]',
  objections_seen    jsonb default '[]',
  key_moments        jsonb default '[]',       -- pivotal messages that changed direction
  outcome_at         timestamptz default now(),
  created_at         timestamptz default now()
);

create index if not exists co_conv_id on conversation_outcomes(conversation_id);
create index if not exists co_outcome on conversation_outcomes(outcome);
create index if not exists co_fw_version on conversation_outcomes(framework_version);
create index if not exists co_created_at on conversation_outcomes(created_at);

-- Auto-learnings (extracted by AI from successful/failed conversations)
create table if not exists auto_learnings (
  id                 text primary key default gen_random_uuid()::text,
  source_type        text not null default 'conversation',  -- conversation|batch_analysis
  source_id          text not null default '',               -- conversation_id or batch id
  outcome            text not null default '',               -- booked|rejected etc.
  framework_version  integer not null default 0,
  -- Extracted insights
  insight_type       text not null default 'general',        -- success_pattern|failure_pattern|objection_handling|tone_insight
  insight            text not null default '',
  confidence         integer not null default 0,
  actionable_rule    text default '',                        -- concrete rule to add to framework
  applied            boolean not null default false,         -- has this been fed into framework evolution?
  applied_at         timestamptz,
  created_at         timestamptz default now()
);

create index if not exists al_source_id on auto_learnings(source_id);
create index if not exists al_applied on auto_learnings(applied);
create index if not exists al_created_at on auto_learnings(created_at);
