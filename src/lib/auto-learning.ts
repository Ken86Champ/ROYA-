/**
 * Auto-Learning Engine
 * 
 * Analyzes completed conversations to extract insights automatically.
 * Closes the feedback loop: conversations → learnings → framework evolution.
 * 
 * Flow:
 *   1. Fetch recent conversation_outcomes (booked/rejected/handed_off)
 *   2. For each, load full message history
 *   3. Claude analyzes: what worked, what failed, patterns
 *   4. Store as auto_learnings
 *   5. When enough accumulate → trigger framework re-evolution
 */

import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '@/lib/supabase';
import { evolveFramework, loadEvolvedFramework } from '@/lib/framework-evolution';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface AutoLearning {
  id: string;
  sourceType: 'conversation' | 'batch_analysis';
  sourceId: string;
  outcome: string;
  frameworkVersion: number;
  insightType: 'success_pattern' | 'failure_pattern' | 'objection_handling' | 'tone_insight';
  insight: string;
  confidence: number;
  actionableRule: string;
  applied: boolean;
  createdAt: string;
}

// ── Analysis Prompt ─────────────────────────────────────────────────────────

const ANALYSIS_PROMPT = `Du bist ein Kommunikations-Analyst für einen KI-Vertriebsagenten. Deine Aufgabe: Aus einem abgeschlossenen Gespräch KONKRETE, ACTIONABLE Learnings extrahieren.

KONTEXT:
- Der Agent hatte ein Gespräch mit einem Lead (potentieller Kunde)
- Du bekommst den Gesprächsverlauf und das Ergebnis (gebucht/abgelehnt/eskaliert)
- Extrahiere WAS FUNKTIONIERT hat und WAS NICHT

REGELN:
1. Nur KONKRETE Muster extrahieren, keine vagen Aussagen
2. Jedes Insight muss eine actionable_rule enthalten (was der Agent künftig tun/lassen soll)
3. Maximal 5 Insights pro Gespräch
4. Platzhalter verwenden: [Name], [AgentName], [Unternehmen], [Angebot]
5. insight_type muss einer von: success_pattern, failure_pattern, objection_handling, tone_insight sein

Antworte AUSSCHLIESSLICH mit validem JSON:
{
  "insights": [
    {
      "insight_type": "success_pattern|failure_pattern|objection_handling|tone_insight",
      "insight": "Beschreibung des Musters",
      "actionable_rule": "Konkrete Regel für den Agent (z.B. 'Nach Preisfrage immer zuerst den Wert betonen')",
      "confidence": 60-100
    }
  ]
}

Wenn das Gespräch zu kurz oder wenig aussagekräftig ist, gib ein leeres Array zurück: {"insights": []}`;

// ── Core Analysis ───────────────────────────────────────────────────────────

interface ConversationForAnalysis {
  conversationId: string;
  outcome: string;
  frameworkVersion: number;
  messages: { role: string; content: string }[];
  leadName: string;
  turnsCount: number;
}

async function analyzeConversation(conv: ConversationForAnalysis): Promise<{
  insightType: string;
  insight: string;
  actionableRule: string;
  confidence: number;
}[]> {
  if (conv.messages.length < 3) return []; // Too short to learn from

  const transcript = conv.messages
    .map(m => `${m.role === 'lead' || m.role === 'inbound' ? '[Lead]' : '[Agent]'}: ${m.content}`)
    .join('\n');

  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1000,
    temperature: 0.2,
    system: ANALYSIS_PROMPT,
    messages: [{
      role: 'user',
      content: `ERGEBNIS: ${conv.outcome.toUpperCase()} (${conv.turnsCount} Nachrichten-Wechsel)

GESPRÄCHSVERLAUF:
${transcript}`,
    }],
  });

  const raw = (response.content[0] as { text: string }).text.trim();

  try {
    let json = raw.replace(/^```json?\s*\n?/, '').replace(/\n?\s*```$/, '');
    const braceStart = json.indexOf('{');
    const braceEnd = json.lastIndexOf('}');
    if (braceStart !== -1 && braceEnd > braceStart) {
      json = json.slice(braceStart, braceEnd + 1);
    }
    const parsed = JSON.parse(json);
    return (parsed.insights || []).filter(
      (i: { confidence?: number }) => (i.confidence ?? 0) >= 60,
    );
  } catch {
    console.warn('[ROYA] Auto-learning JSON parse failed for', conv.conversationId);
    return [];
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Analyze recent completed conversations and store auto-learnings.
 * Returns count of new insights extracted.
 */
export async function runAutoLearning(options?: {
  limit?: number;
  minTurns?: number;
}): Promise<{
  analyzed: number;
  newInsights: number;
  triggeredEvolution: boolean;
  newFrameworkVersion?: number;
}> {
  const limit = options?.limit ?? 10;
  const minTurns = options?.minTurns ?? 3;

  // 1. Fetch outcomes that haven't been analyzed yet.
  //    Include 'ghosted' — silent leads reveal tone/friction issues.
  const { data: outcomes } = await supabase
    .from('conversation_outcomes')
    .select('*')
    .in('outcome', ['booked', 'rejected', 'handed_off', 'ghosted'])
    .gte('turns_count', minTurns)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!outcomes || outcomes.length === 0) {
    return { analyzed: 0, newInsights: 0, triggeredEvolution: false };
  }

  // Filter out already-analyzed conversations
  const { data: existingLearnings } = await supabase
    .from('auto_learnings')
    .select('source_id')
    .in('source_id', outcomes.map(o => o.conversation_id));

  const analyzedIds = new Set((existingLearnings ?? []).map(l => l.source_id));
  const toAnalyze = outcomes.filter(o => !analyzedIds.has(o.conversation_id));

  if (toAnalyze.length === 0) {
    return { analyzed: 0, newInsights: 0, triggeredEvolution: false };
  }

  let totalInsights = 0;

  // 2. For each, load messages and run analysis
  for (const outcome of toAnalyze) {
    const { data: messages } = await supabase
      .from('messages')
      .select('direction, content')
      .eq('conversation_id', outcome.conversation_id)
      .order('created_at', { ascending: true })
      .limit(30);

    if (!messages || messages.length < 3) continue;

    const conv: ConversationForAnalysis = {
      conversationId: outcome.conversation_id,
      outcome: outcome.outcome,
      frameworkVersion: outcome.framework_version,
      messages: messages.map(m => ({
        role: m.direction === 'inbound' ? 'lead' : 'agent',
        content: m.content,
      })),
      leadName: outcome.lead_name || 'Lead',
      turnsCount: outcome.turns_count,
    };

    const insights = await analyzeConversation(conv);

    // 3. Store insights
    for (const insight of insights) {
      await supabase.from('auto_learnings').insert([{
        source_type: 'conversation',
        source_id: outcome.conversation_id,
        outcome: outcome.outcome,
        framework_version: outcome.framework_version,
        insight_type: insight.insightType,
        insight: insight.insight,
        confidence: insight.confidence,
        actionable_rule: insight.actionableRule,
        applied: false,
      }]);
      totalInsights++;
    }
  }

  // 4. Check if we should trigger auto-evolution
  const { data: unapplied } = await supabase
    .from('auto_learnings')
    .select('id')
    .eq('applied', false);

  const unappliedCount = unapplied?.length ?? 0;
  let triggeredEvolution = false;
  let newFrameworkVersion: number | undefined;

  // Auto-evolve when 2+ unapplied insights accumulate — faster learning cycle
  if (unappliedCount >= 2) {
    try {
      const evolved = await triggerAutoEvolution();
      if (evolved) {
        triggeredEvolution = true;
        newFrameworkVersion = evolved.version;
      }
    } catch (err) {
      console.warn('[ROYA] Auto-evolution failed:', err);
    }
  }

  console.log(
    `[ROYA] Auto-learning: analyzed=${toAnalyze.length} ` +
    `insights=${totalInsights} unapplied=${unappliedCount} ` +
    `evolved=${triggeredEvolution}`,
  );

  return {
    analyzed: toAnalyze.length,
    newInsights: totalInsights,
    triggeredEvolution,
    newFrameworkVersion,
  };
}

/**
 * Trigger framework re-evolution with unapplied auto-learnings.
 */
export async function triggerAutoEvolution(): Promise<{ version: number } | null> {
  // Load unapplied auto-learnings
  const { data: unapplied } = await supabase
    .from('auto_learnings')
    .select('*')
    .eq('applied', false)
    .order('confidence', { ascending: false })
    .limit(20);

  if (!unapplied || unapplied.length === 0) return null;

  console.log(`[ROYA] Triggering auto-evolution with ${unapplied.length} new insights...`);

  // Evolve the framework (this already loads current learnings + evolved framework)
  const evolved = await evolveFramework();

  // Mark auto-learnings as applied
  const ids = unapplied.map(l => l.id);
  await supabase
    .from('auto_learnings')
    .update({ applied: true, applied_at: new Date().toISOString() })
    .in('id', ids);

  console.log(`[ROYA] Auto-evolution complete: v${evolved.version}, marked ${ids.length} insights as applied`);

  return { version: evolved.version };
}

/**
 * Get auto-learning statistics.
 */
export async function getAutoLearningStats(): Promise<{
  totalInsights: number;
  unappliedInsights: number;
  appliedInsights: number;
  byOutcome: Record<string, number>;
  byType: Record<string, number>;
  recentInsights: AutoLearning[];
  outcomeSummary: {
    total: number;
    booked: number;
    rejected: number;
    ghosted: number;
    handedOff: number;
    avgTurns: number;
    avgConfidence: number;
  };
}> {
  // Fetch all auto-learnings
  const { data: learnings } = await supabase
    .from('auto_learnings')
    .select('*')
    .order('created_at', { ascending: false });

  const all = learnings ?? [];
  const byOutcome: Record<string, number> = {};
  const byType: Record<string, number> = {};

  for (const l of all) {
    byOutcome[l.outcome] = (byOutcome[l.outcome] || 0) + 1;
    byType[l.insight_type] = (byType[l.insight_type] || 0) + 1;
  }

  // Fetch outcome summary
  const { data: outcomes } = await supabase
    .from('conversation_outcomes')
    .select('*');

  const allOutcomes = outcomes ?? [];
  const booked = allOutcomes.filter(o => o.outcome === 'booked').length;
  const rejected = allOutcomes.filter(o => o.outcome === 'rejected').length;
  const ghosted = allOutcomes.filter(o => o.outcome === 'ghosted').length;
  const handedOff = allOutcomes.filter(o => o.outcome === 'handed_off').length;
  const avgTurns = allOutcomes.length > 0
    ? Math.round(allOutcomes.reduce((s, o) => s + (o.turns_count ?? 0), 0) / allOutcomes.length)
    : 0;
  const avgConf = allOutcomes.length > 0
    ? Math.round(allOutcomes.reduce((s, o) => s + (o.avg_confidence ?? 0), 0) / allOutcomes.length)
    : 0;

  return {
    totalInsights: all.length,
    unappliedInsights: all.filter(l => !l.applied).length,
    appliedInsights: all.filter(l => l.applied).length,
    byOutcome,
    byType,
    recentInsights: all.slice(0, 10).map(l => ({
      id: l.id,
      sourceType: l.source_type,
      sourceId: l.source_id,
      outcome: l.outcome,
      frameworkVersion: l.framework_version,
      insightType: l.insight_type,
      insight: l.insight,
      confidence: l.confidence,
      actionableRule: l.actionable_rule,
      applied: l.applied,
      createdAt: l.created_at,
    })),
    outcomeSummary: {
      total: allOutcomes.length,
      booked,
      rejected,
      ghosted,
      handedOff,
      avgTurns,
      avgConfidence: avgConf,
    },
  };
}
