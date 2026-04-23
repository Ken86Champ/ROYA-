/**
 * ROYA V2 — Conversation Orchestrator
 * ─────────────────────────────────────
 * Central decision layer for every incoming message.
 *
 * Flow:
 *   Phase 0:  Load evolved framework (Supabase → local fallback → ROYA Standard)
 *   Phase 1A: Interpret   (Haiku — fast JSON analysis)
 *   Phase 1B: Strategy    (Haiku — best next move)
 *   Phase 2:  Write+Check (Sonnet — natural human reply + quality check)
 *   Post:     Persist state, memory, handoff, event tracking (async, non-blocking)
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
import { loadEvolvedFramework } from '@/lib/framework-evolution';
import { SYSTEM_FRAMEWORKS } from '@/lib/framework-store';
import { supabase } from '@/lib/supabase';
import { fetchCalendarSlotsForWriter } from '@/lib/calendar-slots';
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
  framework?: {
    writerInstructions?: string;
    strategistInstructions?: string;
    interpreterInstructions?: string;
    rules?: string[];
    forbiddenPhrases?: string[];
    temperature?: number;
    exampleMessages?: { context: string; message: string }[];
    referenceDoc?: string;
  };
}

export async function runConversationTurn(params: TurnParams): Promise<OrchestratorResult> {
  // ── Phase 0: Load framework — campaign-specific → evolved → ROYA Standard ──
  let fw: {
    writerInstructions: string;
    strategistInstructions: string;
    interpreterInstructions: string;
    rules: string[];
    forbiddenPhrases: string[];
    temperature: number;
    exampleMessages: { context: string; message: string }[];
    referenceDoc?: string;
  };
  let frameworkVersion: number;

  if (params.framework?.writerInstructions) {
    // Campaign-specific framework takes highest priority
    const royaStandard = SYSTEM_FRAMEWORKS[0];
    fw = {
      writerInstructions: params.framework.writerInstructions,
      strategistInstructions: params.framework.strategistInstructions ?? royaStandard.strategistInstructions,
      interpreterInstructions: params.framework.interpreterInstructions ?? royaStandard.interpreterInstructions,
      rules: params.framework.rules ?? royaStandard.rules,
      forbiddenPhrases: params.framework.forbiddenPhrases ?? royaStandard.forbiddenPhrases,
      temperature: params.framework.temperature ?? royaStandard.temperature,
      exampleMessages: params.framework.exampleMessages ?? royaStandard.exampleMessages,
      referenceDoc: params.framework.referenceDoc,
    };
    frameworkVersion = -1; // campaign-specific, not from evolution
  } else {
    const evolved = await loadEvolvedFramework();
    const royaStandard = SYSTEM_FRAMEWORKS[0];
    fw = evolved
      ? {
          writerInstructions: evolved.writerInstructions,
          strategistInstructions: evolved.strategistInstructions,
          interpreterInstructions: evolved.interpreterInstructions,
          rules: evolved.rules,
          forbiddenPhrases: evolved.forbiddenPhrases,
          temperature: evolved.temperature,
          exampleMessages: evolved.exampleMessages,
        }
      : {
          writerInstructions: royaStandard.writerInstructions,
          strategistInstructions: royaStandard.strategistInstructions,
          interpreterInstructions: royaStandard.interpreterInstructions,
          rules: royaStandard.rules,
          forbiddenPhrases: royaStandard.forbiddenPhrases,
          temperature: royaStandard.temperature,
          exampleMessages: royaStandard.exampleMessages,
        };
    frameworkVersion = evolved?.version ?? 0;
  }

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
  const interpretation = await interpretMessage(context, params.incomingMessage, {
    framework: { interpreterInstructions: fw.interpreterInstructions },
    temperature: fw.temperature,
  });

  // ── Phase 1B: Strategy ────────────────────────────────────────────────────
  const strategy = await decideStrategy(context, interpretation, {
    framework: { strategistInstructions: fw.strategistInstructions, rules: fw.rules },
    temperature: fw.temperature,
  });

  // ── Fetch calendar slots if booking action ────────────────────────────────
  let availableSlots: string | undefined;
  let hasCalendar: boolean | undefined;
  if (strategy.nextAction === 'book_call') {
    const calResult = await fetchCalendarSlotsForWriter();
    availableSlots = calResult.formatted || undefined;
    hasCalendar = calResult.connected;
  }

  const currentDate = new Date().toLocaleDateString('de-CH', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  // ── Phase 2: Write + Check ────────────────────────────────────────────────
  const phase2 = await writeAndCheck(context, params.incomingMessage, interpretation, strategy, {
    framework: {
      writerInstructions: fw.writerInstructions,
      rules: fw.rules,
      forbiddenPhrases: fw.forbiddenPhrases,
      exampleMessages: fw.exampleMessages,
      currentDate,
      availableSlots,
      hasCalendar,
      bookingLink: params.business?.bookingLink,
      referenceDoc: fw.referenceDoc,
    },
    temperature: fw.temperature,
  });

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
  const outcome = detectOutcome(newState, action, interpretation);

  Promise.all([
    updateConversationState({
      conversationId:         params.conversationId,
      state:                  newState,
      scores:                 newScores,
      nextRecommendedAction:  strategy.nextAction,
    }),
    updateMemory(params.conversationId, updatedMemory),
    // Track conversation event with framework version
    trackConversationEvent({
      conversationId: params.conversationId,
      channel: params.channel,
      frameworkVersion,
      intent: interpretation.microIntent,
      action,
      confidence: phase2.confidence,
      state: newState,
    }),
    // Record conversation outcome if terminal
    recordConversationOutcome({
      conversationId: params.conversationId,
      outcome,
      frameworkVersion,
      finalState: newState,
      channel: params.channel,
      leadName: params.leadName,
      confidence: phase2.confidence,
      memory: updatedMemory,
    }),
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
    `intent=${interpretation.microIntent} fw=v${frameworkVersion} outcome=${outcome}`
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

// ── Conversation Event Tracking ─────────────────────────────────────────────

interface ConversationEvent {
  conversationId: string;
  channel: string;
  frameworkVersion: number;
  intent: string;
  action: string;
  confidence: number;
  state: string;
}

async function trackConversationEvent(event: ConversationEvent): Promise<void> {
  try {
    await supabase.from('conversation_events').insert([{
      conversation_id: event.conversationId,
      channel: event.channel,
      framework_version: event.frameworkVersion,
      intent: event.intent,
      action: event.action,
      confidence: event.confidence,
      state: event.state,
    }]);
  } catch (err) {
    // Non-critical — don't break conversations if tracking fails
    console.warn('[ROYA] Event tracking failed:', err);
  }
}

// ── Outcome Detection & Recording ───────────────────────────────────────────

type ConversationOutcome = 'booked' | 'rejected' | 'ghosted' | 'handed_off' | 'in_progress';

function detectOutcome(
  newState: string,
  action: string,
  interpretation: { microIntent: string },
): ConversationOutcome {
  if (newState === 'qualified_ready' || action === 'book_call') return 'booked';
  if (newState === 'handoff_required' || action === 'handoff') return 'handed_off';
  if (newState === 'dead') {
    if (interpretation.microIntent === 'hard_rejection' || interpretation.microIntent === 'soft_rejection') {
      return 'rejected';
    }
    return 'ghosted';
  }
  if (newState === 'not_now') return 'rejected';
  return 'in_progress';
}

async function recordConversationOutcome(params: {
  conversationId: string;
  outcome: ConversationOutcome;
  frameworkVersion: number;
  finalState: string;
  channel: string;
  leadName: string;
  confidence: number;
  memory: { objectionsSeen: string[]; lastSuccessfulAngle: string; lastFailedAngle: string };
}): Promise<void> {
  // Only record terminal outcomes
  if (params.outcome === 'in_progress') return;

  try {
    // Count turns and avg confidence from conversation_events
    const { data: events } = await supabase
      .from('conversation_events')
      .select('confidence')
      .eq('conversation_id', params.conversationId);

    const turnsCount = events?.length ?? 1;
    const avgConf = events && events.length > 0
      ? Math.round(events.reduce((s, e) => s + (e.confidence ?? 0), 0) / events.length)
      : params.confidence;

    await supabase.from('conversation_outcomes').upsert([{
      conversation_id: params.conversationId,
      outcome: params.outcome,
      framework_version: params.frameworkVersion,
      turns_count: turnsCount,
      avg_confidence: avgConf,
      final_state: params.finalState,
      channel: params.channel,
      lead_name: params.leadName,
      successful_angles: params.memory.lastSuccessfulAngle ? [params.memory.lastSuccessfulAngle] : [],
      failed_angles: params.memory.lastFailedAngle ? [params.memory.lastFailedAngle] : [],
      objections_seen: params.memory.objectionsSeen,
      outcome_at: new Date().toISOString(),
    }], { onConflict: 'conversation_id' });

    console.log(`[ROYA] Outcome recorded: ${params.conversationId} → ${params.outcome} (${turnsCount} turns, ${avgConf}% conf)`);
  } catch (err) {
    console.warn('[ROYA] Outcome recording failed:', err);
  }
}
