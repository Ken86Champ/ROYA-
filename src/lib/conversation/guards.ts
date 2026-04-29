/**
 * ROYA Conversation Guards
 *
 * Deterministic TypeScript checks on conversation history.
 * These run BEFORE the LLM pipeline — no latency, 100% reliable.
 * The LLM cannot override these decisions.
 */

import type { HistoryMessage, ConversationGuards, MessageInterpretation } from '@/lib/types/conversation';

// ── Internal helpers ────────────────────────────────────────────────────────

function leadMessages(history: HistoryMessage[]): HistoryMessage[] {
  return history.filter(m => m.role === 'lead');
}

function agentMessages(history: HistoryMessage[]): HistoryMessage[] {
  return history.filter(m => m.role === 'agent');
}

function normalize(text: string): string {
  return text.toLowerCase().trim().replace(/[.,!?;:]/g, '').replace(/\s+/g, ' ');
}

function wordOverlap(a: string, b: string): number {
  const wa = new Set(normalize(a).split(' ').filter(w => w.length > 2));
  const wb = new Set(normalize(b).split(' ').filter(w => w.length > 2));
  if (wa.size === 0 || wb.size === 0) return 0;
  let common = 0;
  for (const w of wa) { if (wb.has(w)) common++; }
  return common / Math.max(wa.size, wb.size);
}

function isSimilar(a: string, b: string, threshold = 0.7): boolean {
  // Short messages: exact match after normalize
  if (normalize(a).length < 20) return normalize(a) === normalize(b);
  return wordOverlap(a, b) >= threshold;
}

// ── Rejection & Problem-Solved patterns ────────────────────────────────────

const REJECTION_PATTERNS = [
  /\bkein\s*interesse\b/i,
  /\bnicht\s*interessiert\b/i,
  /\bkein\s*bedarf\b/i,
  /\bdanke[\s,]*nein\b/i,
  /\bpasst\s*nicht\b/i,
  /\bm[oö]chte\s*nicht\b/i,
  /\bwill\s*nicht\b/i,
  /\bh[oö]r\s*auf\b/i,
  /\bbitte\s*nicht\s*mehr\b/i,
  /\babmelden\b/i,
  /\bstop\b/i,
  /\bnein\b/i,
  /\bbin\s*bedient\b/i,
];

const PROBLEM_SOLVED_PATTERNS = [
  /\bmache\s*schon\b/i,
  /\bhabe\s*schon\b/i,
  /\bproblem\s*(hat\s*sich\s*)?(gel[oö]st|ist\s*weg)\b/i,
  /\bl[aä]uft\s*schon\b/i,
  /\bbin\s*versorgt\b/i,
  /\bbereits\s*(trainer|coach|gym|fitnessstudio)\b/i,
  /\bfunktioniert\s*schon\b/i,
  /\bklappt\s*schon\b/i,
];

const DIAGNOSE_PATTERNS = [
  /\bwas\s+hat\s+(bisher\s+)?nicht\s+funktioniert\b/i,
  /\bwas\s+ist\s+(dein|deine|das)\s+gr[oö](?:ss|ß)te[rns]?\s+(challenge|herausforderung|problem|hindernis)\b/i,
  /\bworan\s+hat\s+es\s+(gelegen|gescheitert)\b/i,
  /\bwas\s+hat\s+dich\s+(bisher\s+)?aufgehalten\b/i,
  /\bwas\s+hat\s+nicht\s+geklappt\b/i,
  /\bwas\s+hat\s+sich\b.{0,30}\bver[aä]ndert\b/i,
  /\bwar\s+(das|es)\s+bei\s+dir\s+eher\b/i,
  /\bwas\s+(hat|ist)\s+dein\s+(konkretes\s+)?ziel\b/i,
  /\bwelche[sr]?\s+ziel\b/i,
  /\bwas\s+m[oö]chtest\s+du\s+erreichen\b/i,
  /\bwas\s+ist\s+der\s+(gr[oö](?:ss|ß)te[rns]?|wichtigste)\s+(grund|anlass)\b/i,
];

// ── Exported guard functions ────────────────────────────────────────────────

/**
 * Detects how many times recent lead messages are duplicates of each other.
 */
export function detectRepeatedLeadMessages(history: HistoryMessage[], window = 4): number {
  const msgs = leadMessages(history).slice(-window);
  if (msgs.length < 2) return 0;
  let count = 0;
  for (let i = 1; i < msgs.length; i++) {
    if (isSimilar(msgs[i].content, msgs[i - 1].content)) count++;
  }
  return count;
}

/**
 * Detects how many times the agent repeated the same question.
 */
export function detectRepeatedAgentQuestions(history: HistoryMessage[]): number {
  const msgs = agentMessages(history);
  if (msgs.length < 2) return 0;
  let maxRepeat = 0;
  for (let i = 0; i < msgs.length; i++) {
    let count = 1;
    for (let j = i + 1; j < msgs.length; j++) {
      if (isSimilar(msgs[i].content, msgs[j].content, 0.6)) count++;
    }
    maxRepeat = Math.max(maxRepeat, count);
  }
  return maxRepeat;
}

/**
 * Counts explicit rejections in lead history.
 */
export function countExplicitRejections(history: HistoryMessage[]): number {
  return leadMessages(history).filter(m =>
    REJECTION_PATTERNS.some(p => p.test(m.content))
  ).length;
}

/**
 * Detects "problem solved" signal in a single message.
 */
export function detectProblemSolved(message: string): boolean {
  return PROBLEM_SOLVED_PATTERNS.some(p => p.test(message));
}

/**
 * Counts how many diagnose questions the agent has already asked.
 */
export function countDiagnoseQuestionsByAgent(history: HistoryMessage[]): number {
  return agentMessages(history).filter(m =>
    DIAGNOSE_PATTERNS.some(p => p.test(m.content))
  ).length;
}

/**
 * Derives the current conversation phase (1–6) deterministically from history.
 *
 * Phase 1: Opener sent, first lead response
 * Phase 2: Goal clarification
 * Phase 3: Diagnosis (max 2 questions)
 * Phase 4: Reframe + Bridge to booking
 * Phase 5: Booking negotiation
 * Phase 6: Booking confirmed / close
 */
export function derivePhase(
  history: HistoryMessage[],
  currentMessage: string,
): 1 | 2 | 3 | 4 | 5 | 6 {
  const turns = leadMessages(history).length;
  const agentMsgs = agentMessages(history).map(m => m.content.toLowerCase());

  // Phase 6: booking confirmed
  const bookingConfirmed = agentMsgs.some(m =>
    /\bbis\s+(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b/i.test(m) ||
    /\beingetragen\b/i.test(m) || /\bbestätigt\b/i.test(m)
  );
  if (bookingConfirmed) return 6;

  // Phase 5: booking being negotiated
  const bookingInProgress = agentMsgs.some(m =>
    /\btermin\b/i.test(m) || /\bwann\s+passt\b/i.test(m) || /\bkurzer\s+anruf\b/i.test(m)
  );
  if (bookingInProgress && turns >= 3) return 5;

  // Phase 4: reframe happening (soft pitch or bridge)
  const diagnoseCount = countDiagnoseQuestionsByAgent(history);
  if (diagnoseCount >= 2) return 4;

  // Phase 3: diagnosis started
  if (diagnoseCount >= 1 || turns >= 3) return 3;

  // Phase 2: goal clarification
  if (turns >= 1) return 2;

  return 1;
}

/**
 * Aggregates all guards into a ConversationGuards object.
 */
export function buildGuards(
  history: HistoryMessage[],
  currentMessage: string,
  interpretation?: MessageInterpretation,
): ConversationGuards {
  const isProblemSolvedCurrent = detectProblemSolved(currentMessage);
  const isProblemSolvedInterpreted = interpretation?.isProblemSolved ?? false;

  // Check if there was a previous rejection in history (before current message)
  const prevRejectionCount = countExplicitRejections(history);

  return {
    turnCount: leadMessages(history).length,
    rejectionCount: countExplicitRejections([
      ...history,
      { role: 'lead', content: currentMessage, timestamp: new Date().toISOString() },
    ]),
    diagnoseQuestionCount: countDiagnoseQuestionsByAgent(history),
    duplicateAgentQuestions: detectRepeatedAgentQuestions(history),
    duplicateLeadMessages: detectRepeatedLeadMessages(history),
    currentPhase: derivePhase(history, currentMessage),
    isProblemSolved: isProblemSolvedCurrent || isProblemSolvedInterpreted,
    previousRejection: prevRejectionCount >= 1,
  };
}
