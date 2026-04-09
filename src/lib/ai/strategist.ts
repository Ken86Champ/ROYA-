/**
 * Phase 1B — Strategist
 * Decides the best next move based on the interpretation.
 */

import Anthropic from '@anthropic-ai/sdk';
import { buildStrategistPrompt, buildStrategistUserPrompt } from './prompts/strategist.prompt';
import type { StrategistFrameworkOptions } from './prompts/strategist.prompt';
import type { StrategyDecision, ConversationContext, MessageInterpretation } from '@/lib/types/conversation';

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
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      temperature: options?.temperature ?? 0.3,
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

    const raw = (response.content[0] as { text: string }).text.trim();
    const json = raw.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
    const parsed = JSON.parse(json);

    return {
      primaryGoal: parsed.primaryGoal || '',
      nextAction: parsed.nextAction || 'ask_question',
      angle: parsed.angle || '',
      thingsToAvoid: Array.isArray(parsed.thingsToAvoid) ? parsed.thingsToAvoid : [],
      desiredTone: parsed.desiredTone || 'neutral',
      maxLength: parsed.maxLength || 'short',
    };
  } catch (err) {
    console.error('[ROYA] Strategist failed:', err);
    return FALLBACK_STRATEGY;
  }
}
