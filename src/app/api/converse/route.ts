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
import type {
  ConversationContext,
  HistoryMessage,
  ConversationScores,
  BusinessPersona,
  ConversationMemory,
} from '@/lib/types/conversation';

const DEFAULT_SCORES: ConversationScores = {
  temperature: 20, friction: 30, bookingReadiness: 0, trust: 10, risk: 20,
};
const EMPTY_MEMORY: ConversationMemory = {
  summary: '', keyFacts: [], objectionsSeen: [], interests: [],
  constraints: [], lastSuccessfulAngle: '', lastFailedAngle: '',
  bookingReadinessNotes: '',
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      leadName = 'Lead',
      message,
      history = [],
      business,
    }: {
      leadName?: string;
      message: string;
      history?: { role: 'lead' | 'agent'; body: string }[];
      business?: BusinessPersona;
    } = body;

    if (!message) {
      return NextResponse.json({ error: 'message required' }, { status: 400 });
    }

    const persona = business || DEFAULT_PERSONA;

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
      currentState: 'new_unaware',
      scores: DEFAULT_SCORES,
      history: historyMessages,
      memory: EMPTY_MEMORY,
      business: persona,
    };

    // Run the 4-phase pipeline
    const [interpretation, strategy] = await Promise.all([
      interpretMessage(context, message),
      // Strategy needs interpretation first — run sequentially
    ]).then(async ([interp]) => {
      const strat = await decideStrategy(context, interp);
      return [interp, strat] as const;
    });

    const phase2 = await writeAndCheck(context, message, interpretation, strategy);

    return NextResponse.json({
      reply:          phase2.finalMessage,
      intent:         interpretation.microIntent,
      sentiment:      interpretation.emotionalTone,
      confidence:     phase2.confidence,
      nextAction:     strategy.nextAction,
      shouldHandoff:  phase2.shouldHandoff,
      reasoning:      interpretation.implicitMeaning,
      // Full debug data for simulator UI
      interpretation,
      strategy,
    });
  } catch (err) {
    console.error('[ROYA] /api/converse error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
