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
import { runAutoLearning } from '@/lib/auto-learning';
import { supabase } from '@/lib/supabase';
import { fetchCalendarSlotsForWriter } from '@/lib/calendar-slots';
import type {
  ConversationContext,
  HistoryMessage,
  ConversationScores,
  BusinessPersona,
  ConversationMemory,
  ConversationState,
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

  return {
    summary: leadMsgs.length > 0
      ? `${leadMsgs.length} Lead-Nachrichten bisher. Letzte: "${leadMsgs[leadMsgs.length - 1]}"`
      : '',
    keyFacts: keyFacts.slice(-5),
    objectionsSeen: [],
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

    // Bug 3 Fix: Validate evolved framework before using it — must have all 3 core prompts
    const evolvedIsValid = evolved &&
      evolved.writerInstructions && evolved.writerInstructions.length > 100 &&
      evolved.strategistInstructions && evolved.strategistInstructions.length > 100 &&
      evolved.interpreterInstructions && evolved.interpreterInstructions.length > 50;
    if (evolved && !evolvedIsValid) {
      console.warn('[ROYA] Evolved framework invalid/incomplete — falling back to ROYA Standard');
    }

    // Evolved framework with learnings ALWAYS wins — it contains the user's trained conversation style.
    // Client-passed framework only applies when no trained evolved framework exists yet.
    const evolvedHasLearnings = evolvedIsValid && (evolved?.learningsUsed ?? 0) > 0;
    const fw = evolvedHasLearnings
      ? {
          writerInstructions: evolved!.writerInstructions,
          strategistInstructions: evolved!.strategistInstructions,
          interpreterInstructions: evolved!.interpreterInstructions,
          rules: evolved!.rules,
          forbiddenPhrases: evolved!.forbiddenPhrases,
          temperature: evolved!.temperature,
          exampleMessages: evolved!.exampleMessages,
        }
      : framework && framework.writerInstructions
        ? framework
        : evolvedIsValid
          ? {
              writerInstructions: evolved!.writerInstructions,
              strategistInstructions: evolved!.strategistInstructions,
              interpreterInstructions: evolved!.interpreterInstructions,
              rules: evolved!.rules,
              forbiddenPhrases: evolved!.forbiddenPhrases,
              temperature: evolved!.temperature,
              exampleMessages: evolved!.exampleMessages,
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

    // ── DETERMINISTIC GOODBYE GUARD — runs before any LLM ──────────────────
    // If the agent's last message was a goodbye/close and the lead confirms
    // with a short acknowledgment → conversation is OVER. No reply.
    const AGENT_GOODBYE_PATTERNS = /melde dich|wenn sich das ändert|wenn sich etwas ändert|viel erfolg|alles gute|bis dann|tschüss|ciao|auf wiedersehen|take care|bis bald|gerne wieder|falls du doch|falls sich das|falls was ist/i;
    const LEAD_ACK_PATTERNS = /^(ok|okay|alles klar|danke|thx|thanks|gut|super|verstanden|👍|👌|passt|kk|klar|oki|k\.)\.?$/i;

    const lastAgentMsg = [...history].reverse().find(m => m.role === 'agent');
    const lastLeadMsg = message.trim();

    if (
      lastAgentMsg &&
      AGENT_GOODBYE_PATTERNS.test(lastAgentMsg.body) &&
      LEAD_ACK_PATTERNS.test(lastLeadMsg)
    ) {
      // Conversation is closed — return empty stop, no reply
      return NextResponse.json({ reply: '', action: 'stop' }, { status: 200 });
    }

    // ── HARD REJECTION GUARD — lead already rejected, agent said goodbye ──
    // If agent sent a goodbye AND lead says anything short/neutral → still stop
    const HARD_REJECTION_PATTERNS = /kein interesse|nicht aktuell|kein bedarf|bin bedient|lass mich in ruhe|hör auf|stop|unsubscribe|irisch und selbstständig|selbstständig.*danke|bin versorgt/i;
    const agentMsgs = history.filter(m => m.role === 'agent');
    const leadMsgs = history.filter(m => m.role === 'lead');

    // Check if lead previously rejected AND agent already responded to that rejection
    const leadHardRejected = leadMsgs.some(m => HARD_REJECTION_PATTERNS.test(m.body));
    const agentAlreadySaidGoodbye = agentMsgs.some(m => AGENT_GOODBYE_PATTERNS.test(m.body));
    if (leadHardRejected && agentAlreadySaidGoodbye) {
      return NextResponse.json({ reply: '', action: 'stop' }, { status: 200 });
    }

    // Build minimal context for simulator (no DB needed)
    const historyMessages: HistoryMessage[] = history.map(m => ({
      role: m.role,
      content: m.body,
      timestamp: new Date().toISOString(),
    }));

    const context: ConversationContext = {
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
    });
    const strategy = await decideStrategy(context, interpretation, {
      framework: strategistFramework,
      temperature: 0.3,
    });

    // ── Bug 2 Fix: Deterministischer Preis-Guard für Opener-Phase ─────────────
    // Turn 0 oder 1: Lead fragt nach Preis → NIEMALS nennen, erst Situation verstehen
    const isPriceQuestion = interpretation.microIntent === 'asking_price' ||
      /was kostet|wie viel|preis|kosten|gebühr|tarif|was zahlt|how much|price/i.test(message);
    if (isPriceQuestion && leadTurns <= 1) {
      strategy.nextAction = 'ask_question';
      strategy.primaryGoal = 'Erst Situation und Ziel verstehen, bevor Preis besprochen wird';
      strategy.angle = 'Konkretes Ziel oder aktuelles Problem des Leads erfragen';
      strategy.desiredTone = 'neugierig-warm';
      strategy.thingsToAvoid = ['Preis nennen', 'Konditionen erwähnen', 'Pakete beschreiben', 'Kosten erwähnen', 'Preisspanne nennen'];
      // Inject a mandatory instruction directly into writer prompt
      writerFramework.writerInstructions = (writerFramework.writerInstructions || royaStandard.writerInstructions) +
        '\n\n── PFLICHT-REGEL — PREIS IM OPENER ──\n' +
        'Die Person fragt nach dem Preis, aber du kennst ihre Situation noch nicht.\n' +
        'Antworte EXAKT so (oder sinngemäß): "Erstmal gar nichts. Wir schauen uns in Ruhe an, ob und wie wir dir helfen können. Alles Weitere klären wir dann persönlich. Was ist dein konkretes Ziel?"\n' +
        'Nenne KEINEN Preis, KEINE Preisspanne, KEINE Pakete. Leite die Frage SOFORT auf das Ziel des Leads um.';
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
    });

    // Ensure we always have a reply
    let reply = phase2.finalMessage || '';
    if (!reply && phase2.handoffReason === 'API_CREDIT_ERROR') {
      return NextResponse.json({
        reply: '⚠ Anthropic API Credits aufgebraucht — bitte unter console.anthropic.com aufladen.',
        error: 'API_CREDIT_ERROR',
      }, { status: 200 });
    }
    if (!reply) {
      console.error('[ROYA] Writer returned empty after all model attempts. handoffReason:', phase2.handoffReason);
      // Only use the name in the fallback if this is the very first agent reply.
      // After the opener the name was already used — don't repeat it.
      const agentTurnCount = history.filter(m => m.role === 'agent').length;
      const firstName = leadName.split(' ')[0];
      reply = agentTurnCount === 0
        ? `Hey ${firstName}, kurze Frage: Was ist bei dir gerade das konkrete Thema?`
        : `Kurze Frage: Was ist bei dir gerade das konkrete Thema?`;
    }

    // Track conversation event (non-blocking)
    const frameworkVersion = evolved?.version ?? 0;
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
      }]).then(() => {
        // After a real (non-simulator) terminal outcome, trigger auto-learning non-blocking.
        // Simulator conversations have no messages in DB so they'll be skipped by the engine.
        if (outcome === 'booked' || outcome === 'rejected') {
          runAutoLearning({ limit: 5, minTurns: 3 }).catch(() => {});
        }
      }, () => {});
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
