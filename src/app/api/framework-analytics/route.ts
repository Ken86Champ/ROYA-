/**
 * GET /api/framework-analytics
 * Returns performance metrics aggregated by framework version.
 * Tracks: conversations, reply rate, confidence, intent distribution, outcomes.
 */

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { loadEvolvedFramework } from '@/lib/framework-evolution';
import { loadLearnedRules } from '@/lib/learned-rules-store';

interface FrameworkVersionStats {
  version: number;
  totalTurns: number;
  uniqueConversations: number;
  avgConfidence: number;
  intentDistribution: Record<string, number>;
  actionDistribution: Record<string, number>;
  stateDistribution: Record<string, number>;
  channelDistribution: Record<string, number>;
  firstSeen: string;
  lastSeen: string;
  // Outcome data
  outcomes: Record<string, number>;
  bookingRate: number;
}

export async function GET() {
  try {
    // Fetch all conversation events
    const { data: events, error } = await supabase
      .from('conversation_events')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      console.warn('[ROYA] Analytics query failed:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Aggregate by framework version
    const byVersion = new Map<number, FrameworkVersionStats>();

    for (const ev of events ?? []) {
      const ver = ev.framework_version ?? 0;
      let stats = byVersion.get(ver);
      if (!stats) {
        stats = {
          version: ver,
          totalTurns: 0,
          uniqueConversations: 0,
          avgConfidence: 0,
          intentDistribution: {},
          actionDistribution: {},
          stateDistribution: {},
          channelDistribution: {},
          firstSeen: ev.created_at,
          lastSeen: ev.created_at,
          outcomes: {},
          bookingRate: 0,
        };
        byVersion.set(ver, stats);
      }
      stats!.totalTurns++;
      stats!.avgConfidence += ev.confidence ?? 0;
      stats!.lastSeen = ev.created_at;
      // Intent
      const intent = ev.intent || 'unknown';
      stats!.intentDistribution[intent] = (stats!.intentDistribution[intent] || 0) + 1;
      // Action
      const action = ev.action || 'unknown';
      stats!.actionDistribution[action] = (stats!.actionDistribution[action] || 0) + 1;
      // State
      const state = ev.state || 'unknown';
      stats!.stateDistribution[state] = (stats!.stateDistribution[state] || 0) + 1;
      // Channel
      const channel = ev.channel || 'sms';
      stats!.channelDistribution[channel] = (stats!.channelDistribution[channel] || 0) + 1;
    }

    // Calculate averages and unique conversations
    const convSets = new Map<number, Set<string>>();
    for (const ev of events ?? []) {
      const ver = ev.framework_version ?? 0;
      if (!convSets.has(ver)) convSets.set(ver, new Set());
      convSets.get(ver)!.add(ev.conversation_id);
    }

    // Fetch outcomes for per-version breakdown
    const { data: outcomes } = await supabase
      .from('conversation_outcomes')
      .select('outcome, framework_version')
      .order('created_at', { ascending: false });

    const outcomeByVersion = new Map<number, Record<string, number>>();
    for (const o of outcomes ?? []) {
      const ver = o.framework_version ?? 0;
      if (!outcomeByVersion.has(ver)) outcomeByVersion.set(ver, {});
      const m = outcomeByVersion.get(ver)!;
      m[o.outcome] = (m[o.outcome] || 0) + 1;
    }

    // Fetch auto-learning stats
    const { data: autoLearnings } = await supabase
      .from('auto_learnings')
      .select('id, applied, insight_type, confidence, created_at')
      .order('created_at', { ascending: false });

    const versions: FrameworkVersionStats[] = [];
    for (const [ver, stats] of byVersion) {
      stats.avgConfidence = stats.totalTurns > 0
        ? Math.round(stats.avgConfidence / stats.totalTurns)
        : 0;
      stats.uniqueConversations = convSets.get(ver)?.size ?? 0;
      stats.outcomes = outcomeByVersion.get(ver) ?? {};
      const totalOutcomes = Object.values(stats.outcomes).reduce((s, n) => s + n, 0);
      stats.bookingRate = totalOutcomes > 0
        ? Math.round(((stats.outcomes['booked'] ?? 0) / totalOutcomes) * 100)
        : 0;
      versions.push(stats);
    }

    // Sort by version descending (newest first)
    versions.sort((a, b) => b.version - a.version);

    // Load current framework state
    const evolved = await loadEvolvedFramework();
    const learnings = await loadLearnedRules();

    // Compute outcome totals
    const allOutcomes = outcomes ?? [];
    const outcomeTotals = {
      total: allOutcomes.length,
      booked: allOutcomes.filter(o => o.outcome === 'booked').length,
      rejected: allOutcomes.filter(o => o.outcome === 'rejected').length,
      ghosted: allOutcomes.filter(o => o.outcome === 'ghosted').length,
      handedOff: allOutcomes.filter(o => o.outcome === 'handed_off').length,
    };

    const allAL = autoLearnings ?? [];
    const feedbackLoop = {
      totalAutoInsights: allAL.length,
      unappliedInsights: allAL.filter(l => !l.applied).length,
      appliedInsights: allAL.filter(l => l.applied).length,
      readyForEvolution: allAL.filter(l => !l.applied).length >= 5,
    };

    return NextResponse.json({
      versions,
      currentFramework: evolved ? {
        version: evolved.version,
        evolvedAt: evolved.evolvedAt,
        learningsUsed: evolved.learningsUsed,
        rulesCount: evolved.rules.length,
        forbiddenCount: evolved.forbiddenPhrases.length,
        examplesCount: evolved.exampleMessages.length,
        temperature: evolved.temperature,
        evolutionLog: evolved.evolutionLog,
      } : null,
      totalLearnings: learnings.learnings.length,
      totalEvents: events?.length ?? 0,
      outcomes: outcomeTotals,
      feedbackLoop,
    });
  } catch (err) {
    console.error('[ROYA] Framework analytics error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
