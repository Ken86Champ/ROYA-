/**
 * Conversation Tracer
 *
 * Writes one row to conversation_traces per turn.
 * Completely non-blocking — uses fire-and-forget.
 * Even if Supabase is down, the main pipeline is unaffected.
 *
 * This is the primary observability tool: you can query traces
 * to see exactly what happened in any conversation — which guards
 * fired, what the LLM decided, how long it took.
 */

import { supabase } from '@/lib/supabase';
import type { ConvPhase } from '@/lib/conversation/state-machine';
import type { MessageInterpretation, StrategyDecision } from '@/lib/types/conversation';

export interface TurnTrace {
  conversationId: string;
  contactId?: string;
  agencyId?: string;
  turnNumber: number;
  phase: ConvPhase | string;
  leadMessage: string;
  agentReply?: string;
  nextAction?: string;
  microIntent?: string;
  guardsTriggered: string[];
  rejectionCount: number;
  diagnoseQCount: number;
  interpretation?: MessageInterpretation;
  strategy?: StrategyDecision;
  durationMs: number;
  model: string;
}

/**
 * Fire-and-forget trace write. Never throws, never blocks the caller.
 */
export function traceTurn(trace: TurnTrace): void {
  supabase
    .from('conversation_traces')
    .insert({
      conversation_id:  trace.conversationId,
      contact_id:       trace.contactId,
      agency_id:        trace.agencyId,
      turn_number:      trace.turnNumber,
      conv_phase:       trace.phase,
      lead_message:     trace.leadMessage,
      agent_reply:      trace.agentReply,
      next_action:      trace.nextAction,
      micro_intent:     trace.microIntent,
      guards_triggered: trace.guardsTriggered,
      rejection_count:  trace.rejectionCount,
      diagnose_q_count: trace.diagnoseQCount,
      interpretation:   trace.interpretation,
      strategy:         trace.strategy,
      duration_ms:      trace.durationMs,
      model:            trace.model,
    })
    .then(() => {}, (err) => {
      // Silent — tracing failure must never affect message delivery
      console.warn('[ROYA] Trace write failed (non-blocking):', String(err).slice(0, 100));
    });
}
