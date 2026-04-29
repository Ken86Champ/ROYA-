/**
 * Unified LLM client — routes to Anthropic or OpenAI based on model ID.
 * Add new providers here; callers don't need to change.
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not set. Add it to .env.local');
    }
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

export function isOpenAIModel(model: string): boolean {
  return model.startsWith('gpt-') || model.startsWith('o1') || model.startsWith('o3') || model.startsWith('o4');
}

export interface LLMMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Single unified chat completion call.
 * - OpenAI models (gpt-*): uses OpenAI SDK with system as first message
 * - Anthropic models (claude-*): uses Anthropic streaming → finalMessage
 */
export async function llmChat({
  model,
  system,
  messages,
  maxTokens = 600,
  temperature,
}: {
  model: string;
  system: string;
  messages: LLMMessage[];
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  if (isOpenAIModel(model)) {
    const res = await getOpenAI().chat.completions.create({
      model,
      messages: [
        { role: 'system', content: system },
        ...messages,
      ],
      max_tokens: maxTokens,
      ...(temperature !== undefined ? { temperature } : {}),
    });
    return res.choices[0]?.message?.content ?? '';
  }

  // Anthropic path
  const stream = anthropic.messages.stream({
    model,
    max_tokens: maxTokens,
    system,
    messages,
    ...(temperature !== undefined ? { temperature } : {}),
  });
  const response = await stream.finalMessage();
  const textBlock = response.content.find(b => b.type === 'text') as { text: string } | undefined;
  return textBlock?.text ?? '';
}
