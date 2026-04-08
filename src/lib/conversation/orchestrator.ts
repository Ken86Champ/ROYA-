/**
 * ROYA V2 — Conversation Orchestrator
 * ─────────────────────────────────────
 * Central decision layer for every incoming message.
 *
 * Flow:
 *   Phase 1A: Interpret   (Haiku — fast JSON analysis)
 *   Phase 1B: Strategy    (Haiku — best next move)
 *   Phase 2:  Write+Check (Sonnet — natural human reply + quality check)
 *   Post:     Persist state, memory, handoff (async, non-blocking)
 */

import { interpretMessage } from '@/lib/ai/interpreter';
import { decideStrategy } from '@/lib/ai/strategist';
import { writeAndCheck } from '@/lib/ai/writer';
import {
  calculateNextState,
  calculateScoreDeltas,
  applyScoreDeltas,
  shouldTriggerHandoff,
} from '@/lib/conversation/state-machine';
import {
  getConversationContext,
  persistMessage,
  updateConversationState,
  updateMemory,
  enrichMemory,
} from '@/lib/conversation/memory';
import { maybeCreateHandoff } from '@/lib/conversation/handoff';
import type {
  OrchestratorResult,
  BusinessPersona,
} from '@/lib/types/conversation';

export interface TurnParams {
  conversationId: string;
  leadId?: string;
  leadName: string;
  channel: 'sms' | 'whatsapp' | 'email';
  incomingMessage: string;
  leadContact: string;
  business?: BusinessPersona;
}

export async function runConversationTurn(params: TurnParams): Promise<OrchestratorResult> {
  // ── Load context (Supabase or Twilio fallback) ────────────────────────────
  let context = await getConversationContext({
    conversationId: params.conversationId,
    leadId:         params.leadId,
    leadName:       params.leadName,
    channel:        params.channel,
    contact:        params.leadContact,
    business:       params.business,
  });

  // Reset terminal states on new inbound — allows conversations to restart
  // (e.g. lead replies to a new campaign opener after previous conversation ended)
  if (context.currentState === 'dead' || context.currentState === 'handoff_required') {
    context = {
      ...context,
      currentState: 'new_unaware',
      scores: { temperature: 20, friction: 30, bookingReadiness: 0, trust: 10, risk: 20 },
    };
  }

  // Persist inbound message
  persistMessage({
    conversationId: params.conversationId,
    leadId:         params.leadId,
    direction:      'inbound',
    channel:        params.channel,
    content:        params.incomingMessage,
    generatedByAI:  false,
  }).catch(() => {});

  // ── Phase 1A: Interpret ───────────────────────────────────────────────────
  const interpretation = await interpretMessage(context, params.incomingMessage);

  // ── Phase 1B: Strategy ────────────────────────────────────────────────────
  const strategy = await decideStrategy(context, interpretation);

  // ── Phase 2: Write + Check ────────────────────────────────────────────────
  const phase2 = await writeAndCheck(context, params.incomingMessage, interpretation, strategy);

  // ── Determine final action ────────────────────────────────────────────────
  const stateHandoffCheck = shouldTriggerHandoff(
    context.scores,
    interpretation,
    phase2.confidence,
  );

  const needsHandoff =
    phase2.shouldHandoff ||
    stateHandoffCheck.handoff ||
    strategy.nextAction === 'handoff';

  const handoffReason =
    phase2.handoffReason ||
    stateHandoffCheck.reason ||
    'Strategie-Entscheidung';

  // ── Calculate new state and scores ───────────────────────────────────────
  const newState = calculateNextState(
    context.currentState,
    interpretation,
    strategy,
  );

  const scoreDelta = calculateScoreDeltas(interpretation, strategy.nextAction);
  const newScores  = applyScoreDeltas(context.scores, scoreDelta);

  // ── Enrich memory ─────────────────────────────────────────────────────────
  const updatedMemory = enrichMemory(
    context.memory,
    interpretation,
    strategy,
    phase2.confidence,
  );

  // ── Determine final action ────────────────────────────────────────────────
  let action: OrchestratorResult['action'] = 'reply';
  let reply: string | null = phase2.finalMessage || null;

  if (strategy.nextAction === 'stop' || newState === 'dead') {
    action = 'stop';
    reply  = null;
  } else if (needsHandoff) {
    action = 'handoff';
    reply  = null; // human will reply manually
  } else if (!reply) {
    action = 'stop';
  }

  // ── Async persistence (non-blocking) ─────────────────────────────────────
  Promise.all([
    updateConversationState({
      conversationId:         params.conversationId,
      state:                  newState,
      scores:                 newScores,
      nextRecommendedAction:  strategy.nextAction,
    }),
    updateMemory(params.conversationId, updatedMemory),
    ...(action === 'reply' && reply ? [
      persistMessage({
        conversationId: params.conversationId,
        leadId:         params.leadId,
        direction:      'outbound',
        channel:        params.channel,
        content:        reply,
        generatedByAI:  true,
        confidence:     phase2.confidence,
        detectedIntent: interpretation.microIntent,
        sentiment:      interpretation.emotionalTone,
      }),
    ] : []),
    ...(needsHandoff ? [
      maybeCreateHandoff({
        context,
        incomingMessage: params.incomingMessage,
        reason:          handoffReason,
        confidence:      phase2.confidence,
        interpretation,
        strategy,
        suggestedReply:  phase2.finalMessage || undefined,
        leadContact:     params.leadContact,
      }),
    ] : []),
  ]).catch(err => console.error('[ROYA] Async persistence error:', err));

  console.log(
    `[ROYA] ${params.leadContact}: "${params.incomingMessage.slice(0, 30)}" → ` +
    `state=${newState} action=${action} conf=${phase2.confidence}% ` +
    `intent=${interpretation.microIntent}`
  );

  return {
    action,
    reply,
    newState,
    scores:         newScores,
    interpretation,
    strategy,
    confidence:     phase2.confidence,
  };
}
