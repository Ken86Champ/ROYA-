/**
 * Phase 1B — Strategist
 * Decides the best next move based on the interpretation.
 */

import Anthropic from '@anthropic-ai/sdk';
import { buildStrategistPrompt, buildStrategistUserPrompt } from './prompts/strategist.prompt';
import type { StrategistFrameworkOptions } from './prompts/strategist.prompt';
import type { StrategyDecision, ConversationContext, MessageInterpretation, NextAction } from '@/lib/types/conversation';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const FALLBACK_STRATEGY: StrategyDecision = {
  primaryGoal: 'Gesprächsfluss aufrechterhalten',
  nextAction: 'ask_question',
  angle: 'Interesse und Situation verstehen',
  thingsToAvoid: ['Zu viel auf einmal', 'Direkte Buchungsanfrage'],
  desiredTone: 'ruhig-neugierig',
  maxLength: 'short',
};

function buildMemoryContext(context: ConversationContext): string {
  const m = context.memory;
  const parts: string[] = [];
  if (m.summary) parts.push(`Zusammenfassung: ${m.summary}`);
  if (m.objectionsSeen.length) parts.push(`Einwände bisher: ${m.objectionsSeen.join(', ')}`);
  if (m.lastSuccessfulAngle) parts.push(`Letzter erfolgreicher Winkel: ${m.lastSuccessfulAngle}`);
  if (m.lastFailedAngle) parts.push(`Letzter gescheiterter Winkel: ${m.lastFailedAngle}`);
  if (m.interests.length) parts.push(`Interessen: ${m.interests.join(', ')}`);
  return parts.join('\n');
}

export interface StrategistOptions {
  framework?: StrategistFrameworkOptions;
  temperature?: number;
}

export async function decideStrategy(
  context: ConversationContext,
  interpretation: MessageInterpretation,
  options?: StrategistOptions,
): Promise<StrategyDecision> {
  try {
    const stream = client.messages.stream({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: buildStrategistPrompt(context.business, options?.framework),
      messages: [{
        role: 'user',
        content: buildStrategistUserPrompt({
          leadName: context.leadName,
          interpretation,
          currentState: context.currentState,
          scores: context.scores,
          memoryContext: buildMemoryContext(context),
        }),
      }],
    });
    const response = await stream.finalMessage();
    const textBlock = response.content.find(b => b.type === 'text') as { text: string } | undefined;
    const raw = (textBlock?.text ?? '').trim();
    let json = raw.replace(/^```json?\s*\n?/, '').replace(/\n?\s*```$/, '');
    const braceStart = json.indexOf('{');
    const braceEnd = json.lastIndexOf('}');
    if (braceStart !== -1 && braceEnd > braceStart) json = json.slice(braceStart, braceEnd + 1);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(json);
    } catch {
      // Repair: collapse newlines, remove trailing commas
      try {
        const repaired = json.replace(/,\s*([}\]])/g, '$1').replace(/[\r\n]+/g, ' ');
        parsed = JSON.parse(repaired);
      } catch {
        // Last resort: regex-extract key fields
        const extract = (key: string) => {
          const m = json.match(new RegExp(`"${key}"\\s*:\\s*"([^"]*?)"`));
          return m ? m[1] : '';
        };
        parsed = {
          primaryGoal: extract('primaryGoal'),
          nextAction: extract('nextAction') || 'ask_question',
          angle: extract('angle'),
          desiredTone: extract('desiredTone') || 'neutral',
          maxLength: extract('maxLength') || 'short',
          thingsToAvoid: [],
        };
        console.warn('[ROYA] Strategist JSON repair: used regex fallback');
      }
    }

    return {
      primaryGoal: (parsed.primaryGoal as string) || '',
      nextAction: ((parsed.nextAction as NextAction) || 'ask_question') as NextAction,
      angle: (parsed.angle as string) || '',
      thingsToAvoid: Array.isArray(parsed.thingsToAvoid) ? parsed.thingsToAvoid as string[] : [],
      desiredTone: (parsed.desiredTone as string) || 'neutral',
      maxLength: ((parsed.maxLength as 'short' | 'medium') || 'short') as 'short' | 'medium',
    };
  } catch (err) {
    console.error('[ROYA] Strategist failed:', err);
    return FALLBACK_STRATEGY;
  }
}
