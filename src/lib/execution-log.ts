/**
 * Campaign Execution Log — Audit trail for scheduler & worker actions
 */

import { supabase, genId } from './supabase';

export type ExecutionEvent =
  | 'send'
  | 'skip'
  | 'queued'
  | 'error'
  | 'channel_switch'
  | 'handoff_pause'
  | 'step_advance'
  | 'closed';

export interface LogEntry {
  id: string;
  campaignId: string;
  contactId?: string;
  contactName?: string;
  event: ExecutionEvent;
  channel?: string;
  stepIndex?: number;
  details: Record<string, unknown>;
  createdAt: string;
}

export async function log(params: {
  campaignId: string;
  contactId?: string;
  contactName?: string;
  event: ExecutionEvent;
  channel?: string;
  stepIndex?: number;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    await supabase.from('campaign_execution_log').insert({
      id: genId('elog'),
      campaign_id: params.campaignId,
      contact_id: params.contactId ?? null,
      contact_name: params.contactName ?? null,
      event: params.event,
      channel: params.channel ?? null,
      step_index: params.stepIndex ?? null,
      details: params.details ?? {},
    });
  } catch (err) {
    // Non-blocking — execution log must never break the pipeline
    console.error('[EXEC-LOG] write error:', err);
  }
}

export async function getForCampaign(campaignId: string, limit = 50): Promise<LogEntry[]> {
  const { data, error } = await supabase
    .from('campaign_execution_log')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[EXEC-LOG] read error:', error.message);
    return [];
  }

  return (data ?? []).map(r => ({
    id: r.id,
    campaignId: r.campaign_id,
    contactId: r.contact_id,
    contactName: r.contact_name,
    event: r.event as ExecutionEvent,
    channel: r.channel,
    stepIndex: r.step_index,
    details: r.details ?? {},
    createdAt: r.created_at,
  }));
}

export async function getRecent(limit = 100): Promise<LogEntry[]> {
  const { data, error } = await supabase
    .from('campaign_execution_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[EXEC-LOG] read error:', error.message);
    return [];
  }

  return (data ?? []).map(r => ({
    id: r.id,
    campaignId: r.campaign_id,
    contactId: r.contact_id,
    contactName: r.contact_name,
    event: r.event as ExecutionEvent,
    channel: r.channel,
    stepIndex: r.step_index,
    details: r.details ?? {},
    createdAt: r.created_at,
  }));
}
