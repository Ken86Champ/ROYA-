/**
 * POST /api/auto-learn
 * Triggers auto-learning from completed conversations.
 * Analyzes outcomes, extracts insights, optionally triggers framework evolution.
 *
 * GET /api/auto-learn
 * Returns auto-learning statistics and recent insights.
 */

import { NextRequest, NextResponse } from 'next/server';
import { runAutoLearning, getAutoLearningStats, triggerAutoEvolution } from '@/lib/auto-learning';

export async function GET() {
  try {
    const stats = await getAutoLearningStats();
    return NextResponse.json(stats);
  } catch (err) {
    console.error('[ROYA] Auto-learn stats error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { action, limit, minTurns } = body as {
      action?: 'analyze' | 'evolve';
      limit?: number;
      minTurns?: number;
    };

    // Force evolution with current unapplied insights
    if (action === 'evolve') {
      const result = await triggerAutoEvolution();
      if (!result) {
        return NextResponse.json({
          message: 'Keine unapplied Insights vorhanden — nichts zu evolven.',
          triggered: false,
        });
      }
      return NextResponse.json({
        message: `Framework auf v${result.version} evolved.`,
        triggered: true,
        newVersion: result.version,
      });
    }

    // Default: analyze conversations and extract insights
    const result = await runAutoLearning({ limit, minTurns });

    return NextResponse.json({
      message: result.analyzed === 0
        ? 'Keine neuen Gespräche zum Analysieren.'
        : `${result.analyzed} Gespräche analysiert, ${result.newInsights} neue Insights.`,
      ...result,
    });
  } catch (err) {
    console.error('[ROYA] Auto-learn error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
