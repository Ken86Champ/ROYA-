-- ─── ROYA V2 — Supabase Schema ───────────────────────────────────────────────
-- Run this in your Supabase SQL editor to set up all tables.
-- Existing tables will not be overwritten.

-- ── LEADS ─────────────────────────────────────────────────────────────────────
create table if not exists leads (
  id           uuid primary key default gen_random_uuid(),
  first_name   text,
  last_name    text,
  full_name    text not null,
  phone        text unique,
  email        text,
  company      text,
  source       text,
  segment      text,
  language     text default 'de',
  timezone     text,
  owner_user_id uuid,
  status       text default 'active',
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create index if not exists leads_phone_idx on leads (phone);
create index if not exists leads_status_idx on leads (status);

-- ── CONVERSATIONS ─────────────────────────────────────────────────────────────
create table if not exists conversations (
  id                        uuid primary key default gen_random_uuid(),
  lead_id                   uuid references leads(id) on delete cascade,
  channel                   text not null,
  current_state             text not null default 'new_unaware',
  temperature               int default 20,
  friction                  int default 30,
  booking_readiness         int default 0,
  trust_score               int default 10,
  risk_score                int default 20,
  handoff_status            text default 'none',
  last_message_at           timestamptz,
  next_recommended_action   text,
  created_at                timestamptz default now(),
  updated_at                timestamptz default now()
);

create index if not exists conv_lead_idx on conversations (lead_id);
create index if not exists conv_state_idx on conversations (current_state);
create index if not exists conv_updated_idx on conversations (updated_at desc);

-- ── MESSAGES ─────────────────────────────────────────────────────────────────
create table if not exists messages (
  id                uuid primary key default gen_random_uuid(),
  conversation_id   uuid references conversations(id) on delete cascade,
  lead_id           uuid references leads(id) on delete cascade,
  direction         text not null,    -- 'inbound' | 'outbound'
  channel           text not null,
  content           text not null,
  raw_payload       jsonb,
  generated_by_ai   boolean default false,
  model_name        text,
  prompt_version    text,
  confidence        int,
  detected_intent   text,
  sentiment         text,
  created_at        timestamptz default now()
);

create index if not exists msg_conv_idx on messages (conversation_id);
create index if not exists msg_created_idx on messages (created_at desc);

-- ── CONVERSATION MEMORY ───────────────────────────────────────────────────────
create table if not exists conversation_memory (
  conversation_id         uuid primary key references conversations(id) on delete cascade,
  summary                 text,
  key_facts               jsonb default '[]'::jsonb,
  objections_seen         jsonb default '[]'::jsonb,
  interests               jsonb default '[]'::jsonb,
  constraints             jsonb default '[]'::jsonb,
  last_successful_angle   text,
  last_failed_angle       text,
  booking_readiness_notes text,
  updated_at              timestamptz default now()
);

-- ── CAMPAIGNS ─────────────────────────────────────────────────────────────────
create table if not exists campaigns (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  channel     text not null,
  offer_name  text,
  status      text default 'draft',  -- draft | active | paused | completed
  config      jsonb default '{}'::jsonb,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ── CAMPAIGN STEPS ────────────────────────────────────────────────────────────
create table if not exists campaign_steps (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid references campaigns(id) on delete cascade,
  step_number   int not null,
  message_type  text not null,    -- opener | followup | breakup | booking
  delay_hours   int default 24,
  goal          text,
  config        jsonb default '{}'::jsonb,
  created_at    timestamptz default now()
);

-- ── EXPERIMENT EVENTS ─────────────────────────────────────────────────────────
-- Tracks: message_sent | lead_replied | lead_positive_replied | lead_qualified
--         booking_requested | booking_confirmed | human_handoff
--         conversation_closed_dead
create table if not exists experiment_events (
  id                   uuid primary key default gen_random_uuid(),
  campaign_id          uuid references campaigns(id) on delete cascade,
  campaign_step_id     uuid references campaign_steps(id) on delete cascade,
  lead_id              uuid references leads(id) on delete cascade,
  conversation_id      uuid references conversations(id) on delete cascade,
  variant_key          text,
  event_type           text not null,
  value                numeric,
  metadata             jsonb default '{}'::jsonb,
  created_at           timestamptz default now()
);

create index if not exists exp_campaign_idx on experiment_events (campaign_id);
create index if not exists exp_event_type_idx on experiment_events (event_type);

-- ── HANDOFF QUEUE ─────────────────────────────────────────────────────────────
create table if not exists handoff_queue (
  id                uuid primary key default gen_random_uuid(),
  conversation_id   uuid references conversations(id) on delete cascade,
  lead_id           uuid references leads(id) on delete cascade,
  priority          text default 'normal',  -- low | normal | high | urgent
  reason            text,
  status            text default 'open',    -- open | in_progress | resolved
  payload           jsonb default '{}'::jsonb,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create index if not exists handoff_status_idx on handoff_queue (status);
create index if not exists handoff_priority_idx on handoff_queue (priority, created_at desc);

-- ── RATE LIMITS ───────────────────────────────────────────────────────────────
create table if not exists rate_limits (
  contact           text primary key,
  opted_out         boolean default false,
  send_timestamps   text[] default '{}',
  updated_at        timestamptz default now()
);

-- ── ROW LEVEL SECURITY (enable for production) ────────────────────────────────
-- alter table leads           enable row level security;
-- alter table conversations   enable row level security;
-- alter table messages        enable row level security;
-- alter table handoff_queue   enable row level security;
-- (Add policies as needed for multi-tenant setup)
