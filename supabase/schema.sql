-- ─── ROYA SaaS — Supabase Schema ─────────────────────────────────────────────
-- Run this in the Supabase SQL editor to set up the database.

-- Clients (agency end-customers)
create table if not exists clients (
  id         text primary key,
  company    text not null,
  contact    text default '',
  email      text,
  phone      text default '',
  industry   text default '',
  notes      text default '',
  created_at timestamptz default now()
);

-- Campaigns
create table if not exists campaigns (
  id               text primary key,
  name             text not null,
  client_id        text references clients(id) on delete set null,
  channels         text[] not null default '{}',
  status           text not null default 'draft',   -- draft|active|paused|completed
  flow             jsonb not null default '[]',
  created_at       timestamptz default now(),
  started_at       timestamptz,
  paused_at        timestamptz,
  completed_at     timestamptz,
  -- Kampagnen-Kontext (Single Source of Truth)
  agent_name        text,
  agent_tone        text,
  company_name      text,
  offer             text,
  value_prop        text,
  pain_point        text,
  no_convert_reason text,
  cta               text,
  booking_link      text,
  target_audience   text,
  lead_type         text,   -- b2b|b2c
  mode              text not null default 'draft',  -- draft|test|live
  framework_id      text                            -- references prompt_frameworks(id)
);

-- Prompt Frameworks (reusable AI behavior templates)
create table if not exists prompt_frameworks (
  id                       text primary key,
  agency_id                text,
  name                     text not null,
  description              text default '',
  is_system                boolean default false,
  writer_instructions      text default '',
  strategist_instructions  text default '',
  interpreter_instructions text default '',
  rules                    text[] default '{}',
  forbidden_phrases        text[] default '{}',
  temperature              numeric default 0.5,
  example_messages         jsonb default '[]',
  created_at               timestamptz default now(),
  updated_at               timestamptz default now()
);

create index if not exists pf_agency_id on prompt_frameworks(agency_id);

-- Campaign contacts (one row per lead per campaign)
create table if not exists campaign_contacts (
  id                text primary key,
  campaign_id       text not null references campaigns(id) on delete cascade,
  name              text not null,
  contact           text not null,   -- phone or email
  channel           text not null,   -- sms|whatsapp|email
  status            text not null default 'pending',
  current_step      integer not null default 0,
  last_contacted_at timestamptz,
  conv_id           text,
  email_attempts    integer not null default 0,
  sms_attempts      integer not null default 0,
  whatsapp_attempts integer not null default 0
);

create index if not exists cc_campaign_id on campaign_contacts(campaign_id);
create index if not exists cc_contact     on campaign_contacts(contact);

-- Conversations
create table if not exists conversations (
  id            text primary key,
  lead_name     text not null,
  lead_contact  text not null,
  channel       text not null,
  campaign_id   text references campaigns(id) on delete set null,
  state         text not null default 'active',  -- active|replied|booked|closed|human_needed
  flow_node     text not null default 'opener',
  last_intent   jsonb,
  sentiment     text not null default 'neutral',
  booked_at     timestamptz,
  last_activity timestamptz default now(),
  created_at    timestamptz default now()
);

create index if not exists conv_contact on conversations(lead_contact);

-- Messages (conversation history)
create table if not exists messages (
  id              text primary key,
  conversation_id text not null references conversations(id) on delete cascade,
  role            text not null,   -- agent|lead
  body            text not null,
  channel         text not null,
  created_at      timestamptz default now()
);

create index if not exists msg_conv_id on messages(conversation_id, created_at);

-- A/B test variation records
create table if not exists ab_records (
  id             text primary key,
  variation_id   text not null,
  variation_body text not null,
  step_type      text not null,
  campaign_id    text not null,
  contact_id     text not null,
  contact_name   text not null,
  sent_at        timestamptz default now(),
  replied        boolean not null default false,
  replied_at     timestamptz
);

create index if not exists ab_campaign on ab_records(campaign_id);
create index if not exists ab_contact  on ab_records(contact_id, campaign_id);

-- Rate limiting & opt-outs
create table if not exists rate_limits (
  contact          text primary key,
  opted_out        boolean not null default false,
  send_timestamps  text[]  not null default '{}',   -- ISO strings, last 30 days
  updated_at       timestamptz default now()
);

-- Job queue (BullMQ fallback / audit log)
create table if not exists jobs (
  id           text primary key,
  type         text not null,   -- send_message|check_no_reply|send_reminder
  payload      jsonb not null default '{}',
  status       text not null default 'pending',   -- pending|processing|done|failed
  scheduled_at timestamptz not null default now(),
  processed_at timestamptz,
  error        text,
  attempts     integer not null default 0,
  created_at   timestamptz default now()
);

create index if not exists jobs_queue on jobs(status, scheduled_at)
  where status = 'pending';

-- Add alt-channel fields (for email→SMS orchestration)
alter table campaign_contacts add column if not exists alt_contact text;
alter table campaign_contacts add column if not exists alt_channel text;

-- Track consecutive unanswered questions per conversation
alter table conversations add column if not exists consecutive_questions integer not null default 0;

-- Human handoff notifications log
create table if not exists handoff_events (
  id          text primary key,
  conv_id     text not null,
  lead_name   text not null,
  lead_contact text not null,
  channel     text not null,
  reason      text not null,
  message     text not null,
  notified_at timestamptz default now()
);
