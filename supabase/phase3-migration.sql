-- Phase 3: Conversation Events tracking table
-- Run this in the Supabase SQL editor to add conversation event tracking.

-- Conversation events (tracks framework usage + outcomes per turn)
create table if not exists conversation_events (
  id                 text primary key default gen_random_uuid()::text,
  conversation_id    text not null,
  channel            text not null default 'sms',
  framework_version  integer not null default 0,
  intent             text default '',
  action             text default '',
  confidence         integer default 0,
  state              text default '',
  created_at         timestamptz default now()
);

create index if not exists ce_conv_id on conversation_events(conversation_id);
create index if not exists ce_fw_version on conversation_events(framework_version);
create index if not exists ce_created_at on conversation_events(created_at);
