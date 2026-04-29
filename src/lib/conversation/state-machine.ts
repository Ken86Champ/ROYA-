/**
 * State Machine — calculates next conversation state and scores
 * based on interpretation and current state.
 */

import type {
  ConversationState,
  ConversationScores,
  MessageInterpretation,
  StrategyDecision,
} from '@/lib/types/conversation';

// State transition map — what states can follow from each state
const STATE_TRANSITIONS: Record<ConversationState, ConversationState[]> = {
  new_unaware:        ['lightly_engaged', 'guarded', 'dead', 'handoff_required'],
  lightly_engaged:    ['curious', 'guarded', 'skeptical', 'warm', 'not_now', 'dead'],
  curious:            ['warm', 'needs_clarity', 'pricing_probe', 'qualified_ready', 'guarded'],
  guarded:            ['lightly_engaged', 'curious', 'skeptical', 'not_now', 'dead'],
  skeptical:          ['guarded', 'needs_clarity', 'not_now', 'dead', 'handoff_required'],
  warm:               ['curious', 'interested_but_busy', 'qualified_ready', 'needs_clarity'],
  interested_but_busy:['warm', 'not_now', 'qualified_ready', 'dead'],
  needs_clarity:      ['curious', 'warm', 'guarded', 'not_now'],
  pricing_probe:      ['warm', 'needs_clarity', 'not_now', 'dead', 'handoff_required'],
  qualified_ready:    ['interested_but_busy', 'warm', 'handoff_required'],
  not_now:            ['lightly_engaged', 'dead'],
  dead:               ['dead'],
  handoff_required:   ['handoff_required'],
};

export function calculateNextState(
  current: ConversationState,
  interpretation: MessageInterpretation,
  strategy: StrategyDecision,
): ConversationState {
  // Always trust the interpretation's recommendation if valid transition
  const recommended = interpretation.stateRecommendation;
  const allowed = STATE_TRANSITIONS[current] || [];

  if (recommended === current || allowed.includes(recommended)) {
    return recommended;
  }

  // Fallback state rules
  if (strategy.nextAction === 'handoff') return 'handoff_required';
  if (strategy.nextAction === 'stop') return 'dead';

  switch (interpretation.microIntent) {
    case 'hard_rejection': return 'dead';
    case 'soft_rejection': return 'not_now';
    case 'angry':          return 'handoff_required';
    case 'showing_interest': return 'curious';
    case 'asking_price':   return 'pricing_probe';
    case 'asking_question': return current === 'new_unaware' ? 'lightly_engaged' : current;
    case 'timing_issue':   return 'interested_but_busy';
  }

  return current; // stay in current state if no clear signal
}

// Score delta rules based on interpretation
interface ScoreDelta {
  temperature: number;
  friction: number;
  bookingReadiness: number;
  trust: number;
  risk: number;
}

function clamp(val: number): number {
  return Math.max(0, Math.min(100, Math.round(val)));
}

export function calculateScoreDeltas(
  interpretation: MessageInterpretation,
  nextAction: StrategyDecision['nextAction'],
): ScoreDelta {
  const delta: ScoreDelta = { temperature: 0, friction: 0, bookingReadiness: 0, trust: 0, risk: 0 };

  // Tone effects
  switch (interpretation.emotionalTone) {
    case 'positive':   delta.temperature += 15; delta.friction -= 10; delta.trust += 10; break;
    case 'negative':   delta.temperature -= 15; delta.friction += 20; delta.risk += 20; break;
    case 'guarded':    delta.friction += 10; delta.trust -= 5; break;
    case 'skeptical':  delta.friction += 15; delta.trust -= 10; delta.risk += 10; break;
    case 'confused':   delta.friction += 5; break;
    case 'neutral':    break;
  }

  // Intent effects
  switch (interpretation.microIntent) {
    case 'showing_interest':    delta.temperature += 20; delta.bookingReadiness += 15; break;
    case 'asking_question':     delta.temperature += 5;  delta.bookingReadiness += 5; break;
    case 'asking_price':        delta.bookingReadiness += 20; delta.temperature += 10; break;
    case 'testing_legitimacy':  delta.trust -= 5; delta.friction += 10; break;
    case 'objecting':           delta.friction += 15; delta.temperature -= 5; break;
    case 'timing_issue':        delta.temperature -= 5; delta.friction += 5; break;
    case 'soft_rejection':      delta.temperature -= 20; delta.friction += 10; break;
    case 'hard_rejection':      delta.temperature -= 40; delta.risk += 30; break;
    case 'angry':               delta.risk += 40; delta.friction += 30; break;
    case 'replying_politely':   delta.trust += 5; break;
  }

  // Risk flag bonuses
  if (interpretation.riskFlags.length > 0) {
    delta.risk += interpretation.riskFlags.length * 5;
  }

  // Booking action
  if (nextAction === 'book_call') delta.bookingReadiness += 10;

  return delta;
}

export function applyScoreDeltas(
  current: ConversationScores,
  delta: ScoreDelta,
): ConversationScores {
  return {
    temperature:     clamp(current.temperature     + delta.temperature),
    friction:        clamp(current.friction        + delta.friction),
    bookingReadiness:clamp(current.bookingReadiness + delta.bookingReadiness),
    trust:           clamp(current.trust           + delta.trust),
    risk:            clamp(current.risk            + delta.risk),
  };
}

// Determine if handoff should be triggered based on scores
export function shouldTriggerHandoff(
  scores: ConversationScores,
  interpretation: MessageInterpretation,
  confidence: number,
): { handoff: boolean; reason: string } {
  if (interpretation.microIntent === 'angry') {
    return { handoff: true, reason: 'Aggressiver Ton' };
  }
  if (scores.risk >= 75) {
    return { handoff: true, reason: `Hohes Risiko (${scores.risk}/100)` };
  }
  if (confidence < 45) {
    return { handoff: true, reason: `Niedrige Confidence (${confidence}%)` };
  }
  if (interpretation.microIntent === 'asking_price' && scores.trust < 30) {
    return { handoff: true, reason: 'Preisfrage bei niedrigem Vertrauen' };
  }
  if (interpretation.riskFlags.some(f =>
    f.toLowerCase().includes('legal') ||
    f.toLowerCase().includes('recht') ||
    f.toLowerCase().includes('medizin')
  )) {
    return { handoff: true, reason: 'Sensibles Thema erkannt' };
  }
  return { handoff: false, reason: '' };
}

// ══════════════════════════════════════════════════════════════════════════════
// CONV PHASE — deterministic 6-phase state machine
// ══════════════════════════════════════════════════════════════════════════════

/**
 * The 6 conversation phases + 4 terminal states.
 * Stored explicitly in DB for real conversations.
 * Derived from guards for simulator.
 */
export type ConvPhase =
  | 'OPENER'           // First message sent, awaiting lead response
  | 'QUALIFY'          // Understand lead goal/situation
  | 'DIAGNOSE'         // Deep-dive: max 2 diagnose questions total
  | 'OFFER'            // Reframe + bridge to solution / soft pitch
  | 'BOOKING'          // Negotiate appointment
  | 'CLOSED_BOOKED'    // Terminal: appointment confirmed
  | 'CLOSED_REJECTED'  // Terminal: 2+ rejections
  | 'CLOSED_RESOLVED'  // Terminal: lead already has a solution
  | 'CLOSED_TIMEOUT';  // Terminal: too many turns

const TERMINAL_PHASES: ConvPhase[] = [
  'CLOSED_BOOKED', 'CLOSED_REJECTED', 'CLOSED_RESOLVED', 'CLOSED_TIMEOUT',
];

export function isTerminalPhase(phase: ConvPhase): boolean {
  return TERMINAL_PHASES.includes(phase);
}

export interface PhaseTransitionInput {
  currentPhase: ConvPhase;
  leadTurnCount: number;
  rejectionCount: number;
  diagnoseQuestionCount: number;
  isProblemSolved: boolean;
  bookingConfirmed?: boolean;
  agentLastAction?: string; // NextAction value from previous turn
}

/**
 * Pure function — given current state, returns next phase.
 * 50 lines, guaranteed deterministic, fully testable.
 */
export function transitionPhase(input: PhaseTransitionInput): ConvPhase {
  const {
    currentPhase, leadTurnCount, rejectionCount,
    diagnoseQuestionCount, isProblemSolved, bookingConfirmed, agentLastAction,
  } = input;

  // Terminal phases never transition
  if (isTerminalPhase(currentPhase)) return currentPhase;

  // ── Global overrides — always win, checked before phase logic ──
  if (isProblemSolved)        return 'CLOSED_RESOLVED';
  if (rejectionCount >= 2)    return 'CLOSED_REJECTED';
  if (leadTurnCount >= 12)    return 'CLOSED_TIMEOUT';
  if (bookingConfirmed)       return 'CLOSED_BOOKED';

  // ── Phase-specific transitions ──
  switch (currentPhase) {
    case 'OPENER':
      // Advances as soon as lead has responded
      return leadTurnCount >= 1 ? 'QUALIFY' : 'OPENER';

    case 'QUALIFY':
      // After 2 lead turns, move to diagnose
      return leadTurnCount >= 2 ? 'DIAGNOSE' : 'QUALIFY';

    case 'DIAGNOSE':
      // Move to offer if: 2 diagnose questions asked, soft rejection, or 4+ turns
      if (diagnoseQuestionCount >= 2) return 'OFFER';
      if (rejectionCount >= 1)        return 'OFFER';
      if (leadTurnCount >= 4)         return 'OFFER';
      return 'DIAGNOSE';

    case 'OFFER':
      // Move to booking when agent triggers book_call action
      if (agentLastAction === 'book_call') return 'BOOKING';
      return 'OFFER';

    case 'BOOKING':
      // Stays in BOOKING until confirmed or global override triggers
      return 'BOOKING';

    default:
      return currentPhase;
  }
}

/**
 * Maps a ConvPhase to an instruction block injected into strategist/writer prompts.
 * This is the "what you are allowed to do" contract per phase.
 */
export function phaseToSystemHint(phase: ConvPhase): string {
  const hints: Record<ConvPhase, string> = {
    OPENER:           'PHASE 1 — OPENER: Neugierde wecken. KEINE Diagnose-Fragen. KEIN Pitch. Maximal eine kurze offene Frage.',
    QUALIFY:          'PHASE 2 — QUALIFY: Eine offene Frage zum Ziel/Situation. Noch kein Pitch. Kein Diagnose-Trichter.',
    DIAGNOSE:         'PHASE 3 — DIAGNOSE: Maximal 2 Diagnose-Fragen im gesamten Gespräch. Danach SOFORT zu OFFER wechseln.',
    OFFER:            'PHASE 4 — OFFER: Reframe + sanfter Pitch. Verbindung zwischen Lead-Ziel und Angebot herstellen. Termin vorschlagen.',
    BOOKING:          'PHASE 5 — BOOKING: Datum/Zeit für Termin fixieren oder Buchungslink schicken. Kein neues Thema, kein neuer Pitch.',
    CLOSED_BOOKED:    'TERMINAL: Buchung bestätigt.',
    CLOSED_REJECTED:  'TERMINAL: Lead hat abgelehnt — kein weiterer Kontakt.',
    CLOSED_RESOLVED:  'TERMINAL: Lead hat eigene Lösung — kein weiterer Kontakt.',
    CLOSED_TIMEOUT:   'TERMINAL: Gesprächslimit erreicht — Handoff.',
  };
  return hints[phase] ?? '';
}

/**
 * Derives the starting ConvPhase from guards data (for simulator / new threads).
 * Does NOT replace the DB-persisted phase for real conversations.
 */
export function derivePhaseFromGuards(guards: {
  turnCount: number;
  rejectionCount: number;
  diagnoseQuestionCount: number;
  isProblemSolved: boolean;
}): ConvPhase {
  if (guards.isProblemSolved)       return 'CLOSED_RESOLVED';
  if (guards.rejectionCount >= 2)   return 'CLOSED_REJECTED';
  if (guards.turnCount >= 12)       return 'CLOSED_TIMEOUT';
  if (guards.turnCount === 0)       return 'OPENER';
  if (guards.turnCount === 1)       return 'QUALIFY';
  if (guards.diagnoseQuestionCount >= 2 || guards.turnCount >= 4) return 'OFFER';
  if (guards.turnCount >= 2)        return 'DIAGNOSE';
  return 'QUALIFY';
}
