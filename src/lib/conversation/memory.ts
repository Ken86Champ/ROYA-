/**
 * Memory Layer
 * Fetches and updates conversation context.
 * Primary: Supabase (conversation_memory table)
 * Fallback: Twilio message history
 */

import { supabase } from '@/lib/supabase';
import type {
  ConversationContext,
  ConversationMemory,
  ConversationScores,
  ConversationState,
  HistoryMessage,
  BusinessPersona,
  EMPTY_MEMORY,
  DEFAULT_SCORES,
} from '@/lib/types/conversation';
import { DEFAULT_PERSONA } from '@/lib/types/conversation';

// Re-export constants for convenience
export { EMPTY_MEMORY, DEFAULT_SCORES } from '@/lib/types/conversation';

// ── Twilio history fallback ───────────────────────────────────────────────────

async function fetchTwilioHistory(contact: string): Promise<HistoryMessage[]> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  if (!accountSid || !authToken || !fromNumber) return [];

  const auth = `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`;

  async function fetchMsgs(params: Record<string, string>): Promise<TwilioMsg[]> {
    const url = new URL(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url.toString(), { headers: { Authorization: auth } });
    if (!res.ok) return [];
    const d = await res.json();
    return d.messages || [];
  }

  const [inbound, outbound] = await Promise.all([
    fetchMsgs({ To: fromNumber, From: contact, PageSize: '30' }),
    fetchMsgs({ From: fromNumber, To: contact, PageSize: '30' }),
  ]);

  const all: HistoryMessage[] = [
    ...inbound.map(m => ({
      role: 'lead' as const,
      content: m.body,
      timestamp: m.date_sent || m.date_created,
    })),
    ...outbound.map(m => ({
      role: 'agent' as const,
      content: m.body.replace(/^Sent from your Twilio trial account - /, ''),
      timestamp: m.date_sent || m.date_created,
    })),
  ];

  return all.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

interface TwilioMsg {
  body: string;
  date_sent: string;
  date_created: string;
}

// ── Supabase memory helpers ───────────────────────────────────────────────────

async function loadSupabaseHistory(conversationId: string): Promise<HistoryMessage[]> {
  try {
    const { data } = await supabase
      .from('messages')
      .select('direction, content, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(40);

    if (!data?.length) return [];

    return data.map(m => ({
      role: (m.direction === 'inbound' ? 'lead' : 'agent') as 'lead' | 'agent',
      content: m.content,
      timestamp: m.created_at,
    }));
  } catch {
    return [];
  }
}

async function loadSupabaseMemory(conversationId: string): Promise<ConversationMemory | null> {
  try {
    const { data } = await supabase
      .from('conversation_memory')
      .select('*')
      .eq('conversation_id', conversationId)
      .single();

    if (!data) return null;

    return {
      summary: data.summary || '',
      keyFacts: data.key_facts || [],
      objectionsSeen: data.objections_seen || [],
      interests: data.interests || [],
      constraints: data.constraints || [],
      lastSuccessfulAngle: data.last_successful_angle || '',
      lastFailedAngle: data.last_failed_angle || '',
      bookingReadinessNotes: data.booking_readiness_notes || '',
    };
  } catch {
    return null;
  }
}

async function loadSupabaseConversation(conversationId: string): Promise<{
  state: ConversationState;
  scores: ConversationScores;
} | null> {
  try {
    const { data } = await supabase
      .from('conversations')
      .select('current_state, temperature, friction, booking_readiness, trust_score, risk_score')
      .eq('id', conversationId)
      .single();

    if (!data) return null;

    return {
      state: (data.current_state || 'new_unaware') as ConversationState,
      scores: {
        temperature:      data.temperature || 20,
        friction:         data.friction || 30,
        bookingReadiness: data.booking_readiness || 0,
        trust:            data.trust_score || 10,
        risk:             data.risk_score || 20,
      },
    };
  } catch {
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getConversationContext(params: {
  conversationId: string;
  leadId?: string;
  leadName: string;
  channel: 'sms' | 'whatsapp' | 'email';
  contact?: string;                   // phone/email for Twilio fallback
  business?: BusinessPersona;
}): Promise<ConversationContext> {
  const business = params.business || DEFAULT_PERSONA;
  const emptyMemory: ConversationMemory = {
    summary: '',
    keyFacts: [],
    objectionsSeen: [],
    interests: [],
    constraints: [],
    lastSuccessfulAngle: '',
    lastFailedAngle: '',
    bookingReadinessNotes: '',
  };
  const defaultScores: ConversationScores = {
    temperature: 20, friction: 30, bookingReadiness: 0, trust: 10, risk: 20,
  };

  // Try Supabase first
  const [supabaseConv, supabaseHistory, supabaseMemory] = await Promise.all([
    loadSupabaseConversation(params.conversationId),
    loadSupabaseHistory(params.conversationId),
    loadSupabaseMemory(params.conversationId),
  ]);

  if (supabaseHistory.length > 0) {
    return {
      conversationId: params.conversationId,
      leadId: params.leadId,
      leadName: params.leadName,
      channel: params.channel,
      currentState: supabaseConv?.state || 'new_unaware',
      scores: supabaseConv?.scores || defaultScores,
      history: supabaseHistory,
      memory: supabaseMemory || emptyMemory,
      business,
    };
  }

  // Fallback: Twilio history
  const twilioHistory = params.contact
    ? await fetchTwilioHistory(params.contact)
    : [];

  return {
    conversationId: params.conversationId,
    leadId: params.leadId,
    leadName: params.leadName,
    channel: params.channel,
    currentState: 'new_unaware',
    scores: defaultScores,
    history: twilioHistory,
    memory: emptyMemory,
    business,
  };
}

// ── Persistence (non-fatal) ───────────────────────────────────────────────────

export async function persistMessage(params: {
  conversationId: string;
  leadId?: string;
  direction: 'inbound' | 'outbound';
  channel: string;
  content: string;
  generatedByAI: boolean;
  confidence?: number;
  detectedIntent?: string;
  sentiment?: string;
}): Promise<void> {
  try {
    await supabase.from('messages').insert({
      conversation_id:  params.conversationId,
      lead_id:          params.leadId || null,
      direction:        params.direction,
      channel:          params.channel,
      content:          params.content,
      generated_by_ai:  params.generatedByAI,
      model_name:       params.generatedByAI ? 'claude-sonnet-4-6' : null,
      confidence:       params.confidence || null,
      detected_intent:  params.detectedIntent || null,
      sentiment:        params.sentiment || null,
    });
  } catch {
    // Non-fatal — Supabase may not be configured
  }
}

export async function updateConversationState(params: {
  conversationId: string;
  state: ConversationState;
  scores: ConversationScores;
  nextRecommendedAction?: string;
}): Promise<void> {
  try {
    await supabase.from('conversations').update({
      current_state:            params.state,
      temperature:              params.scores.temperature,
      friction:                 params.scores.friction,
      booking_readiness:        params.scores.bookingReadiness,
      trust_score:              params.scores.trust,
      risk_score:               params.scores.risk,
      last_message_at:          new Date().toISOString(),
      next_recommended_action:  params.nextRecommendedAction || null,
      updated_at:               new Date().toISOString(),
    }).eq('id', params.conversationId);
  } catch {
    // Non-fatal
  }
}

export async function updateMemory(
  conversationId: string,
  memory: ConversationMemory,
): Promise<void> {
  try {
    await supabase.from('conversation_memory').upsert({
      conversation_id:          conversationId,
      summary:                  memory.summary,
      key_facts:                memory.keyFacts,
      objections_seen:          memory.objectionsSeen,
      interests:                memory.interests,
      constraints:              memory.constraints,
      last_successful_angle:    memory.lastSuccessfulAngle,
      last_failed_angle:        memory.lastFailedAngle,
      booking_readiness_notes:  memory.bookingReadinessNotes,
      updated_at:               new Date().toISOString(),
    }, { onConflict: 'conversation_id' });
  } catch {
    // Non-fatal
  }
}

// Enriches memory with new observations (without AI, just rule-based)
export function enrichMemory(
  memory: ConversationMemory,
  interpretation: { microIntent: string; hiddenConcern: string; emotionalTone: string },
  strategy: { angle: string; nextAction: string },
  confidence: number,
): ConversationMemory {
  const updated = { ...memory };

  // Track objections
  if (
    ['objecting', 'timing_issue', 'soft_rejection', 'hard_rejection'].includes(interpretation.microIntent) &&
    interpretation.hiddenConcern &&
    !updated.objectionsSeen.includes(interpretation.hiddenConcern)
  ) {
    updated.objectionsSeen = [...updated.objectionsSeen.slice(-4), interpretation.hiddenConcern];
  }

  // Track successful angles (high confidence reply)
  if (confidence >= 75 && strategy.nextAction === 'ask_question') {
    updated.lastSuccessfulAngle = strategy.angle;
  }

  // Track failed angles (handoff or very low confidence)
  if (confidence < 40) {
    updated.lastFailedAngle = strategy.angle;
  }

  return updated;
}
