/**
 * Phase 1A — Interpreter
 * Reads the incoming message and understands what's REALLY being said.
 */

import Anthropic from '@anthropic-ai/sdk';
import { buildInterpreterPrompt, buildInterpreterUserPrompt } from './prompts/interpreter.prompt';
import type { InterpreterFrameworkOptions } from './prompts/interpreter.prompt';
import type { MessageInterpretation, ConversationContext } from '@/lib/types/conversation';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
}

export async function interpretMessage(
  context: ConversationContext,
  incomingMessage: string,
  options?: InterpreterOptions,
): Promise<MessageInterpretation> {
  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      temperature: options?.temperature ?? 0.3,
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
    });

    const raw = (response.content[0] as { text: string }).text.trim();
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
      explicitMeaning: parsed.explicitMeaning || '',
      implicitMeaning: parsed.implicitMeaning || '',
      emotionalTone: parsed.emotionalTone || 'neutral',
      microIntent: parsed.microIntent || 'other',
      likelyNeed: parsed.likelyNeed || '',
      hiddenConcern: parsed.hiddenConcern || '',
      stateRecommendation: parsed.stateRecommendation || 'lightly_engaged',
      riskFlags: Array.isArray(parsed.riskFlags) ? parsed.riskFlags : [],
    };
  } catch (err) {
    console.error('[ROYA] Interpreter failed:', err);
    return FALLBACK_INTERPRETATION;
  }
}

export { historyToText };
