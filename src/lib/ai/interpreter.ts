/**
 * Phase 1A — Interpreter
 * Reads the incoming message and understands what's REALLY being said.
 */

import { llmChat } from '@/lib/ai/llm-client';
import { buildInterpreterPrompt, buildInterpreterUserPrompt } from './prompts/interpreter.prompt';
import type { InterpreterFrameworkOptions } from './prompts/interpreter.prompt';
import type { MessageInterpretation, ConversationContext, EmotionalTone, MicroIntent, ConversationState } from '@/lib/types/conversation';

function historyToText(context: ConversationContext, limit = 10): string {
  return context.history
    .slice(-limit)
    .map(m => `${m.role === 'agent' ? context.business.agentName : context.leadName}: ${m.content}`)
    .join('\n');
}

const FALLBACK_INTERPRETATION: MessageInterpretation = {
  explicitMeaning: 'Nachricht empfangen',
  implicitMeaning: 'Unklar',
  emotionalTone: 'neutral',
  microIntent: 'other',
  likelyNeed: 'Klärung',
  hiddenConcern: 'Unbekannt',
  stateRecommendation: 'lightly_engaged',
  riskFlags: [],
};

export interface InterpreterOptions {
  framework?: InterpreterFrameworkOptions;
  temperature?: number;
  model?: string;
}

export async function interpretMessage(
  context: ConversationContext,
  incomingMessage: string,
  options?: InterpreterOptions,
): Promise<MessageInterpretation> {
  try {
    const raw = (await llmChat({
      model: options?.model || 'gpt-4o-mini',
      system: buildInterpreterPrompt(context.business, options?.framework),
      messages: [{
        role: 'user',
        content: buildInterpreterUserPrompt({
          leadName: context.leadName,
          historyText: historyToText(context),
          incomingMessage,
          currentState: context.currentState,
        }),
      }],
      maxTokens: 600,
      temperature: options?.temperature,
    })).trim();
    let json = raw.replace(/^```json?\s*\n?/, '').replace(/\n?\s*```$/, '');
    const braceStart = json.indexOf('{');
    const braceEnd = json.lastIndexOf('}');
    if (braceStart !== -1 && braceEnd > braceStart) json = json.slice(braceStart, braceEnd + 1);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(json);
    } catch {
      const repaired = json.replace(/,\s*([}\]])/g, '$1').replace(/[\r\n]+/g, ' ');
      parsed = JSON.parse(repaired);
    }

    return {
      explicitMeaning: (parsed.explicitMeaning as string) || '',
      implicitMeaning: (parsed.implicitMeaning as string) || '',
      emotionalTone: ((parsed.emotionalTone as EmotionalTone) || 'neutral') as EmotionalTone,
      microIntent: ((parsed.microIntent as MicroIntent) || 'other') as MicroIntent,
      likelyNeed: (parsed.likelyNeed as string) || '',
      hiddenConcern: (parsed.hiddenConcern as string) || '',
      stateRecommendation: ((parsed.stateRecommendation as ConversationState) || 'lightly_engaged') as ConversationState,
      riskFlags: Array.isArray(parsed.riskFlags) ? parsed.riskFlags as string[] : [],
    };
  } catch (err) {
    console.error('[ROYA] Interpreter failed:', err);
    return FALLBACK_INTERPRETATION;
  }
}

export { historyToText };
