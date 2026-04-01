/**
 * Phase 2 — Writer + Checker (combined for performance)
 * Writes a natural message, then immediately checks it for bot-like qualities.
 * Uses Sonnet for higher quality human-like output.
 */

import Anthropic from '@anthropic-ai/sdk';
import { buildWriterAndCheckerPrompt, buildWriterUserPrompt } from './prompts/writer.prompt';
import type {
  Phase2Result,
  ConversationContext,
  MessageInterpretation,
  StrategyDecision,
} from '@/lib/types/conversation';
import { historyToText } from './interpreter';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function writeAndCheck(
  context: ConversationContext,
  incomingMessage: string,
  interpretation: MessageInterpretation,
  strategy: StrategyDecision,
): Promise<Phase2Result> {
  // Hard stops — no AI call needed
  if (strategy.nextAction === 'stop') {
    return { finalMessage: '', confidence: 100, shouldHandoff: false };
  }
  if (strategy.nextAction === 'handoff') {
    return {
      finalMessage: '',
      confidence: 0,
      shouldHandoff: true,
      handoffReason: strategy.primaryGoal,
    };
  }

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      system: buildWriterAndCheckerPrompt(context.business),
      messages: [{
        role: 'user',
        content: buildWriterUserPrompt({
          leadName: context.leadName,
          incomingMessage,
          historyText: historyToText(context, 8),
          interpretation,
          strategy,
        }),
      }],
    });

    const raw = (response.content[0] as { text: string }).text.trim();
    const json = raw.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
    const parsed = JSON.parse(json);

    return {
      finalMessage: parsed.finalMessage || '',
      confidence: Number(parsed.confidence) || 70,
      shouldHandoff: Boolean(parsed.shouldHandoff),
      handoffReason: parsed.handoffReason || undefined,
    };
  } catch (err) {
    console.error('[ROYA] Writer failed:', err);
    // Fallback: simple contextual response
    return {
      finalMessage: '',
      confidence: 0,
      shouldHandoff: true,
      handoffReason: 'Writer-Fehler — manuell prüfen',
    };
  }
}
