/**
 * Handoff Layer
 * Creates entries in handoff_queue (Supabase) and sends Slack/Email notifications.
 */

import { supabase } from '@/lib/supabase';
import type { MessageInterpretation, StrategyDecision, ConversationContext } from '@/lib/types/conversation';

export interface HandoffPayload {
  conversationId: string;
  leadId?: string;
  leadName: string;
  leadContact: string;
  channel: string;
  reason: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  incomingMessage: string;
  suggestedReply?: string;
  interpretation: MessageInterpretation;
  strategy: StrategyDecision;
}

function calcPriority(
  interpretation: MessageInterpretation,
  confidence: number,
): 'low' | 'normal' | 'high' | 'urgent' {
  if (interpretation.microIntent === 'angry') return 'urgent';
  if (interpretation.microIntent === 'asking_price' || interpretation.microIntent === 'showing_interest') return 'high';
  if (confidence < 40) return 'high';
  return 'normal';
}

export async function createHandoff(payload: HandoffPayload): Promise<void> {
  // 1. DB queue (primary)
  try {
    await supabase.from('handoff_queue').insert({
      conversation_id: payload.conversationId,
      lead_id:         payload.leadId || null,
      priority:        payload.priority,
      reason:          payload.reason,
      status:          'open',
      payload: {
        leadName:         payload.leadName,
        leadContact:      payload.leadContact,
        channel:          payload.channel,
        incomingMessage:  payload.incomingMessage,
        suggestedReply:   payload.suggestedReply,
        interpretation:   payload.interpretation,
        strategy:         payload.strategy,
      },
    });
  } catch {
    // Supabase may not be configured
  }

  // 2. Slack notification (optional)
  const slackUrl = process.env.SLACK_WEBHOOK_URL;
  if (slackUrl) {
    const icon =
      payload.priority === 'urgent' ? '🚨' :
      payload.priority === 'high'   ? '⚠️' : '📋';

    await fetch(slackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blocks: [
          {
            type: 'header',
            text: { type: 'plain_text', text: `${icon} Handoff — ${payload.priority.toUpperCase()}` },
          },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: `*Lead:*\n${payload.leadName} (${payload.leadContact})` },
              { type: 'mrkdwn', text: `*Grund:*\n${payload.reason}` },
              { type: 'mrkdwn', text: `*Intent:*\n${payload.interpretation.microIntent}` },
              { type: 'mrkdwn', text: `*Ton:*\n${payload.interpretation.emotionalTone}` },
            ],
          },
          {
            type: 'section',
            text: { type: 'mrkdwn', text: `*Nachricht:*\n>${payload.incomingMessage}` },
          },
          ...(payload.suggestedReply ? [{
            type: 'section',
            text: { type: 'mrkdwn', text: `*Vorgeschlagene Antwort:*\n_${payload.suggestedReply}_` },
          }] : []),
        ],
      }),
    }).catch(err => console.error('[ROYA] Slack handoff error:', err));
  }
}

// Convenience wrapper used by the orchestrator
export async function maybeCreateHandoff(params: {
  context: ConversationContext;
  incomingMessage: string;
  reason: string;
  confidence: number;
  interpretation: MessageInterpretation;
  strategy: StrategyDecision;
  suggestedReply?: string;
  leadContact: string;
}): Promise<void> {
  await createHandoff({
    conversationId:  params.context.conversationId,
    leadId:          params.context.leadId,
    leadName:        params.context.leadName,
    leadContact:     params.leadContact,
    channel:         params.context.channel,
    reason:          params.reason,
    priority:        calcPriority(params.interpretation, params.confidence),
    incomingMessage: params.incomingMessage,
    suggestedReply:  params.suggestedReply,
    interpretation:  params.interpretation,
    strategy:        params.strategy,
  });
}
