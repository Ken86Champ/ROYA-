/**
 * POST /api/converse
 * Used by the SMS Simulator and any direct API consumers.
 * Runs the full V2 Orchestrator pipeline.
 */

import { NextRequest, NextResponse } from 'next/server';
import { interpretMessage } from '@/lib/ai/interpreter';
import { decideStrategy } from '@/lib/ai/strategist';
import { writeAndCheck } from '@/lib/ai/writer';
import { DEFAULT_PERSONA } from '@/lib/types/conversation';
import { SYSTEM_FRAMEWORKS } from '@/lib/framework-store';
import { loadEvolvedFramework } from '@/lib/framework-evolution';
import { supabase } from '@/lib/supabase';
import { fetchCalendarSlotsForWriter } from '@/lib/calendar-slots';
import {
  buildGuards,
  detectProblemSolved,
  countExplicitRejections,
  detectRepeatedLeadMessages,
  detectRepeatedAgentQuestions,
} from '@/lib/conversation/guards';
import {
  derivePhaseFromGuards,
  transitionPhase,
  phaseToSystemHint,
} from '@/lib/conversation/state-machine';
import { traceTurn } from '@/lib/conversation/tracer';
import type {
  ConversationContext,
  HistoryMessage,
  ConversationScores,
  BusinessPersona,
  ConversationMemory,
  ConversationState,
  ConversationGuards,
} from '@/lib/types/conversation';

const DEFAULT_SCORES: ConversationScores = {
  temperature: 20, friction: 30, bookingReadiness: 0, trust: 10, risk: 20,
};
const EMPTY_MEMORY: ConversationMemory = {
  summary: '', keyFacts: [], objectionsSeen: [], interests: [],
  constraints: [], lastSuccessfulAngle: '', lastFailedAngle: '',
  bookingReadinessNotes: '',
};

// ── Derive dynamic scores from conversation history ──
function deriveScores(history: { role: string; body: string }[]): ConversationScores {
  const leadMsgs = history.filter(m => m.role === 'lead').map(m => m.body.toLowerCase());
  const turns = leadMsgs.length;
  let temperature = 20;
  let friction = 30;
  let bookingReadiness = 0;
  let trust = 10;
  let risk = 20;

  // Positive signals boost temperature & trust
  const positiveWords = /ja|interessant|klingt gut|gerne|cool|super|perfekt|top|auf jeden|lets go|bin dabei/;
  const negativeWords = /nein|kein interesse|stop|lass mich|nervt|aufhören|nie wieder|zu teuer|keine zeit/;
  const bookingWords = /termin|buche|wann|passt|anruf|treffen|call|gespräch|link/;
  const questionWords = /was kostet|wie viel|preis|wie funktioniert|mehr info|erzähl/;

  for (const msg of leadMsgs) {
    if (positiveWords.test(msg)) { temperature += 15; trust += 10; friction = Math.max(0, friction - 10); }
    if (negativeWords.test(msg)) { temperature -= 10; friction += 15; risk += 10; }
    if (bookingWords.test(msg)) { bookingReadiness += 25; temperature += 10; }
    if (questionWords.test(msg)) { temperature += 5; trust += 5; }
  }

  // Each turn of conversation builds some trust
  trust += turns * 5;
  temperature += turns * 3;

  // Clamp all scores 0-100
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  return {
    temperature: clamp(temperature),
    friction: clamp(friction),
    bookingReadiness: clamp(bookingReadiness),
    trust: clamp(trust),
    risk: clamp(risk),
  };
}

// ── Derive conversation state from scores ──
function deriveState(scores: ConversationScores, turns: number): ConversationState {
  if (scores.bookingReadiness >= 60) return 'qualified_ready';
  if (scores.temperature >= 60 && scores.trust >= 40) return 'warm';
  if (scores.temperature >= 40) return 'curious';
  if (scores.temperature >= 30 || turns >= 2) return 'lightly_engaged';
  return 'new_unaware';
}

// ── Build memory summary from history ──
function buildMemoryFromHistory(history: { role: string; body: string }[]): ConversationMemory {
  const leadMsgs = history.filter(m => m.role === 'lead').map(m => m.body);
  const agentMsgs = history.filter(m => m.role === 'agent').map(m => m.body);
  const interests: string[] = [];
  const keyFacts: string[] = [];

  for (const msg of leadMsgs) {
    if (msg.length > 5) keyFacts.push(`Lead sagte: "${msg}"`);
  }

  // Detect rejections from lead messages
  const REJECTION_PATTERN = /\b(nein|kein interesse|keine zeit|nicht interessiert|kein bedarf|danke nein|passt nicht|möchte nicht|will nicht|hör auf|bitte nicht mehr|abmelden|stop)\b/i;
  const objectionsSeen = leadMsgs
    .filter(msg => REJECTION_PATTERN.test(msg))
    .slice(-5);

  return {
    summary: leadMsgs.length > 0
      ? `${leadMsgs.length} Lead-Nachrichten bisher. Letzte: "${leadMsgs[leadMsgs.length - 1]}"`
      : '',
    keyFacts: keyFacts.slice(-5),
    objectionsSeen,
    interests,
    constraints: [],
    lastSuccessfulAngle: agentMsgs.length > 0 ? agentMsgs[agentMsgs.length - 1] : '',
    lastFailedAngle: '',
    bookingReadinessNotes: '',
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      leadName = 'Lead',
      message,
      history = [],
      business,
      framework,
      referenceDoc,
    }: {
      leadName?: string;
      message: string;
      history?: { role: 'lead' | 'agent'; body: string }[];
      business?: BusinessPersona & { rules?: string[]; systemPrompt?: string };
      referenceDoc?: string;
      framework?: {
        writerInstructions?: string;
        strategistInstructions?: string;
        interpreterInstructions?: string;
        rules?: string[];
        forbiddenPhrases?: string[];
        temperature?: number;
        exampleMessages?: { context: string; message: string }[];
      };
    } = body;

    if (!message) {
      return NextResponse.json({ error: 'message required' }, { status: 400 });
    }

    const persona = business || DEFAULT_PERSONA;

    // ── Build framework options from dedicated framework field, evolved framework, or ROYA Standard fallback ──
    const royaStandard = SYSTEM_FRAMEWORKS[0]; // ROYA Standard is always last resort
    const evolved = await loadEvolvedFramework();
    const fw = framework && framework.writerInstructions
      ? framework
      : evolved
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
    const bizAny = business as unknown as Record<string, unknown> | undefined;
    const rules = fw.rules ?? (bizAny?.rules as string[] | undefined) ?? [];
    const forbiddenPhrases = fw.forbiddenPhrases ?? [];
    const temperature = fw.temperature ?? 0.5;
    const customSystemPrompt = (bizAny?.systemPrompt as string | undefined) ?? '';
    // Model selection — passed from campaign's aiFramework.standardModel, default gpt-4o-mini
    const pipelineModel = (bizAny?.standardModel as string | undefined) || 'gpt-4o-mini';

    const writerFramework = {
      writerInstructions: fw.writerInstructions,
      rules,
      forbiddenPhrases,
      exampleMessages: fw.exampleMessages,
      customSystemPrompt,
      referenceDoc: referenceDoc || undefined,
      currentDate: new Date().toLocaleDateString('de-CH', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      }),
      bookingLink: (persona as unknown as Record<string, unknown>).bookingLink as string | undefined,
      availableSlots: undefined as string | undefined,
      hasCalendar: undefined as boolean | undefined,
    };
    const strategistFramework = {
      strategistInstructions: fw.strategistInstructions,
      rules,
    };
    const interpreterFramework = {
      interpreterInstructions: fw.interpreterInstructions,
    };

    // Derive dynamic scores and state from conversation history
    const scores = deriveScores(history);
    const leadTurns = history.filter(m => m.role === 'lead').length;
    const currentState = deriveState(scores, leadTurns);
    const memory = buildMemoryFromHistory(history);

  // ── Stop/Handoff helpers ──────────────────────────────────────────────────
  const GOODBYE_MESSAGE = 'Alles gut. Meld dich gern, wenn das Thema wieder aktuell wird.';

  function makeHandoffResponse(reason: string) {
    return NextResponse.json({
      reply: '',
      nextAction: 'handoff',
      shouldHandoff: true,
      handoffReason: reason,
      scores,
      state: currentState,
      frameworkVersion: 0,
    });
  }

  function makeStopResponse() {
    return NextResponse.json({
      reply: GOODBYE_MESSAGE,
      nextAction: 'stop',
      shouldHandoff: false,
      scores,
      state: 'dead',
      frameworkVersion: 0,
    });
  }

  // Build historyMessages early for guards
  const historyMessages: HistoryMessage[] = history.map(m => ({
    role: m.role,
    content: m.body,
    timestamp: new Date().toISOString(),
  }));

  // ── PRE-CHECKS: Deterministic guards before any LLM call ──────────────────

  // Hard Stop 1: More than 15 lead turns — structural loop
  if (leadTurns >= 15) {
    return makeHandoffResponse('Conversation überschreitet 15 Lead-Turns — Handoff erforderlich');
  }

  // Hard Stop 2: Lead repeating same message 3+ times
  const duplicateLeadCount = detectRepeatedLeadMessages(historyMessages);
  if (duplicateLeadCount >= 3) {
    return makeHandoffResponse(`Lead wiederholt dieselbe Nachricht ${duplicateLeadCount}x — Loop erkannt`);
  }

  // Hard Stop 3: Agent repeating same question 3+ times
  const duplicateAgentCount = detectRepeatedAgentQuestions(historyMessages);
  if (duplicateAgentCount >= 3) {
    return makeHandoffResponse(`Agent hat dieselbe Frage ${duplicateAgentCount}x gestellt — Loop erkannt`);
  }

  // Hard Stop 4: "Problem solved" signal in current message
  if (detectProblemSolved(message)) {
    return makeStopResponse();
  }

  // Hard Stop 5: 2+ explicit rejections (regex-based, no LLM needed)
  const preRejectionCount = countExplicitRejections([
    ...historyMessages,
    { role: 'lead', content: message, timestamp: new Date().toISOString() },
  ]);
  if (preRejectionCount >= 2) {
    return makeStopResponse();
  }

  const context = {
      conversationId: 'simulator',
      leadName,
      channel: 'sms',
      currentState,
      scores,
      history: historyMessages,
      memory,
      business: persona,
    };

    // Run pipeline: Interpreter → Strategist → Writer (with framework options)
    const interpretation = await interpretMessage(context, message, {
      framework: interpreterFramework,
      temperature: 0.3,
      model: pipelineModel,
    });

    // ── POST-INTERPRETER GUARDS: combine LLM signals with deterministic checks ──
    const guards = buildGuards(historyMessages, message, interpretation);

    if (interpretation.isProblemSolved || guards.isProblemSolved) {
      traceTurn({
        conversationId: 'simulator',
        turnNumber: leadTurns,
        phase: 'CLOSED_RESOLVED',
        leadMessage: message,
        guardsTriggered: ['isProblemSolved'],
        rejectionCount: guards.rejectionCount,
        diagnoseQCount: guards.diagnoseQuestionCount,
        durationMs: 0,
        model: 'guards',
      });
      return makeStopResponse();
    }
    if (guards.rejectionCount >= 2 || interpretation.isExplicitRejection) {
      traceTurn({
        conversationId: 'simulator',
        turnNumber: leadTurns,
        phase: 'CLOSED_REJECTED',
        leadMessage: message,
        guardsTriggered: ['rejectionCount >= 2'],
        rejectionCount: guards.rejectionCount,
        diagnoseQCount: guards.diagnoseQuestionCount,
        durationMs: 0,
        model: 'guards',
      });
      return makeStopResponse();
    }

    // ── Derive phase from guards and inject into strategist framework ──────────
    const convPhase = derivePhaseFromGuards({
      turnCount: guards.turnCount,
      rejectionCount: guards.rejectionCount,
      diagnoseQuestionCount: guards.diagnoseQuestionCount,
      isProblemSolved: guards.isProblemSolved,
    });
    const phaseHint = phaseToSystemHint(convPhase);
    // Prepend phase hint to strategist instructions so it sees current phase context
    strategistFramework.strategistInstructions = phaseHint
      + (strategistFramework.strategistInstructions ? '\n\n' + strategistFramework.strategistInstructions : '');

    const pipelineStartMs = Date.now();

    const strategy = await decideStrategy(context, interpretation, {
      framework: strategistFramework,
      temperature: 0.3,
      model: pipelineModel,
      guards,
    });

    // Override: if agent is looping on diagnose questions, force pitch
    if (strategy.nextAction === 'ask_question' && guards.diagnoseQuestionCount >= 3) {
      console.warn('[ROYA] Forcing soft_pitch — agent asked 3+ diagnose questions already');
      (strategy as { nextAction: string }).nextAction = 'soft_pitch';
    }

    // ── Fetch real calendar slots if booking action ──────────────────────────
    if (strategy.nextAction === 'book_call') {
      const calResult = await fetchCalendarSlotsForWriter();
      writerFramework.availableSlots = calResult.formatted || undefined;
      writerFramework.hasCalendar = calResult.connected;
    }

    const phase2 = await writeAndCheck(context, message, interpretation, strategy, {
      framework: writerFramework,
      temperature,
      model: pipelineModel,
    });

    // Ensure we always have a reply — but NOT for stop actions (empty is correct)
    let reply = phase2.finalMessage || '';
    if (!reply && phase2.handoffReason === 'API_CREDIT_ERROR') {
      return NextResponse.json({
        reply: '⚠ Anthropic API Credits aufgebraucht — bitte unter console.anthropic.com aufladen.',
        error: 'API_CREDIT_ERROR',
      }, { status: 200 });
    }
    // IMPORTANT: stop action intentionally returns empty finalMessage — do NOT fallback
    if (!reply && strategy.nextAction === 'stop') {
      // Silent stop — return structured response with no reply text
      return NextResponse.json({
        reply: '',
        intent: interpretation.microIntent,
        sentiment: interpretation.emotionalTone,
        confidence: 100,
        nextAction: 'stop',
        shouldHandoff: false,
        reasoning: 'Gesprächsende — Lead hat abgelehnt oder Problem ist gelöst',
        scores,
        state: currentState,
        interpretation,
        strategy,
        frameworkVersion: evolved?.version ?? 0,
      });
    }
    if (!reply) {
      console.warn('[ROYA] Writer returned empty without stop intent — handoff');
      return NextResponse.json({
        reply: '',
        nextAction: 'handoff',
        shouldHandoff: true,
        handoffReason: 'Writer leer — manuelle Prüfung erforderlich',
        scores,
        state: currentState,
        frameworkVersion: evolved?.version ?? 0,
      });
    }

    // Track conversation event (non-blocking)
    const frameworkVersion = evolved?.version ?? 0;
    const pipelineDurationMs = Date.now() - pipelineStartMs;

    // ── Full turn trace for observability ─────────────────────────────────────
    traceTurn({
      conversationId: 'simulator',
      turnNumber: leadTurns,
      phase: convPhase,
      leadMessage: message,
      agentReply: reply,
      nextAction: strategy.nextAction,
      microIntent: interpretation.microIntent,
      guardsTriggered: [],
      rejectionCount: guards.rejectionCount,
      diagnoseQCount: guards.diagnoseQuestionCount,
      interpretation,
      strategy,
      durationMs: pipelineDurationMs,
      model: pipelineModel,
    });

    supabase.from('conversation_events').insert([{
      conversation_id: 'simulator',
      channel: 'sms',
      framework_version: frameworkVersion,
      intent: interpretation.microIntent,
      action: 'reply',
      confidence: phase2.confidence,
      state: currentState,
    }]).then(() => {}, () => {});

    // Track outcome for terminal states or terminal intents (non-blocking)
    const terminalStates = ['dead', 'not_now', 'handoff_required', 'qualified_ready'];
    const terminalIntents = ['hard_rejection', 'soft_rejection', 'angry'];
    const isTerminal = terminalStates.includes(currentState) || phase2.shouldHandoff
      || terminalIntents.includes(interpretation.microIntent)
      || strategy.nextAction === 'stop' || strategy.nextAction === 'close_loop'
      || strategy.nextAction === 'book_call';
    if (isTerminal) {
      const outcome = currentState === 'qualified_ready' || strategy.nextAction === 'book_call' ? 'booked'
        : currentState === 'handoff_required' || phase2.shouldHandoff || interpretation.microIntent === 'angry' ? 'handed_off'
        : interpretation.microIntent === 'hard_rejection' || interpretation.microIntent === 'soft_rejection' ? 'rejected'
        : strategy.nextAction === 'stop' || strategy.nextAction === 'close_loop' ? 'rejected'
        : 'ghosted';
      supabase.from('conversation_outcomes').insert([{
        conversation_id: `sim-${Date.now()}`,
        outcome,
        framework_version: frameworkVersion,
        turns_count: leadTurns + 1,
        avg_confidence: phase2.confidence,
        final_state: currentState,
        channel: 'sms',
        lead_name: leadName,
      }]).then(() => {}, () => {});
    }

    return NextResponse.json({
      reply,
      intent:         interpretation.microIntent,
      sentiment:      interpretation.emotionalTone,
      confidence:     phase2.confidence,
      nextAction:     strategy.nextAction,
      shouldHandoff:  phase2.shouldHandoff,
      reasoning:      interpretation.implicitMeaning,
      scores,
      state: currentState,
      interpretation,
      strategy,
      frameworkVersion,
    });
  } catch (err) {
    console.error('[ROYA] /api/converse error:', err);
    return NextResponse.json({
      reply: 'Kurze technische Störung — ich bin gleich wieder da!',
      error: String(err),
    }, { status: 200 });
  }
}
