/**
 * Phase 2 — Writer + Checker (combined for performance)
 * Writes a natural message, then immediately checks it for bot-like qualities.
 * Uses Sonnet for higher quality human-like output.
 */

import Anthropic from '@anthropic-ai/sdk';
import { buildWriterAndCheckerPrompt, buildWriterUserPrompt } from './prompts/writer.prompt';
import type { WriterFrameworkOptions } from './prompts/writer.prompt';
import type {
  Phase2Result,
  ConversationContext,
  MessageInterpretation,
  StrategyDecision,
} from '@/lib/types/conversation';
import { historyToText } from './interpreter';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface WriteOptions {
  framework?: WriterFrameworkOptions;
  temperature?: number;
}

export async function writeAndCheck(
  context: ConversationContext,
  incomingMessage: string,
  interpretation: MessageInterpretation,
  strategy: StrategyDecision,
  options?: WriteOptions,
): Promise<Phase2Result> {
  // Hard stops — no AI call needed
  if (strategy.nextAction === 'stop') {
    return { finalMessage: '', confidence: 100, shouldHandoff: false };
  }
  // For handoff, still generate a human message (the agent should say something before handing off)
  // Only skip if explicitly flagged as silent handoff

  try {
    const stream = client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      system: buildWriterAndCheckerPrompt(context.business, options?.framework),
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
      const repaired = json.replace(/,\s*([}\]])/g, '$1').replace(/[\r\n]+/g, ' ');
      parsed = JSON.parse(repaired);
    }

    return {
      finalMessage: validateResponse((parsed.finalMessage as string) || '', options?.framework),
      confidence: Number(parsed.confidence) || 70,
      shouldHandoff: Boolean(parsed.shouldHandoff),
      handoffReason: (parsed.handoffReason as string) || undefined,
    };
  } catch (err) {
    const errStr = String(err);
    console.error('[ROYA] Writer failed:', err);
    // Detect API credit/billing errors
    if (errStr.includes('credit balance') || errStr.includes('billing') || errStr.includes('too low')) {
      return {
        finalMessage: '',
        confidence: 0,
        shouldHandoff: false,
        handoffReason: 'API_CREDIT_ERROR',
      };
    }
    // Fallback: simple contextual response
    return {
      finalMessage: '',
      confidence: 0,
      shouldHandoff: true,
      handoffReason: 'Writer-Fehler — manuell prüfen',
    };
  }
}

// ── Post-generation validation ─────────────────────────────────────────────────

const EMOJI_REGEX = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}]/gu;
const TEXT_SMILEY_REGEX = /\s*[:;][-']?[)(DPp|/\\]\s*/g;

function validateResponse(message: string, framework?: WriterFrameworkOptions): string {
  if (!message) return message;
  let result = message;
  const rules = framework?.rules ?? [];
  const forbidden = framework?.forbiddenPhrases ?? [];

  // Rule: no_emoji — strip emoji characters AND text smileys like :) ;) :D
  if (rules.includes('no_emoji')) {
    result = result.replace(EMOJI_REGEX, '').replace(TEXT_SMILEY_REGEX, ' ').replace(/\s{2,}/g, ' ').trim();
  }

  // Rule: no_dashes — strip em-dashes, en-dashes, and isolated hyphens used as dashes
  if (rules.includes('no_dashes')) {
    result = result.replace(/\s*[\u2014\u2013]\s*/g, ', ').replace(/,\s*,/g, ',').replace(/^,\s*/, '').replace(/\s{2,}/g, ' ').trim();
  }

  // Rule: max_2_sentences — truncate to 2 sentences
  if (rules.includes('max_2_sentences')) {
    const sentences = result.split(/(?<=[.!?])\s+/).filter(Boolean);
    if (sentences.length > 2) {
      result = sentences.slice(0, 2).join(' ');
    }
  }

  // Rule: end_with_question — append soft question if missing
  // BUT NOT on close/booking confirmations, rejections, or goodbyes
  if (rules.includes('end_with_question') && !result.includes('?')) {
    const isClose = /\b(trage dich|eingetragen|rufe dich|melde mich|bis\s+(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag|dann)|steht\.?)\b/i.test(result);
    const isGoodbye = /\b(alles gute|viel erfolg|melde dich|tsch[uü]ss|ciao|bye)\b/i.test(result);
    if (!isClose && !isGoodbye && result.length > 10) {
      result = result.replace(/[.!]?\s*$/, '') + ', was meinst du?';
    }
  }

  // Check forbidden phrases (case-insensitive)
  for (const phrase of forbidden) {
    const regex = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    result = result.replace(regex, '').replace(/\s{2,}/g, ' ').trim();
  }

  return result;
}
