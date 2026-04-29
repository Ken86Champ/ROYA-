/**
 * ROYA Eval Framework
 * ─────────────────────────────────────────────────────────────
 * Runs 15 documented failure scenarios through the full pipeline.
 * Uses LLM-as-Judge to score output quality.
 *
 * Usage:
 *   npx tsx scripts/eval.ts
 *   npx tsx scripts/eval.ts --fast    (guards only, no LLM calls)
 *   npx tsx scripts/eval.ts --verbose (print full replies)
 *
 * Exit code: 0 if all pass, 1 if any regressions found.
 */

import 'dotenv/config';
import OpenAI from 'openai';

// ── Types ────────────────────────────────────────────────────────────────────

interface HistoryEntry {
  role: 'lead' | 'agent';
  body: string;
}

interface EvalScenario {
  id: number;
  name: string;
  description: string;
  history: HistoryEntry[];
  message: string;
  expectedBehavior: 'STOP' | 'HANDOFF' | 'REPLY';
  expectedNextAction?: string;   // optional: exact nextAction value
  forbiddenInReply?: string[];   // phrases that must NOT appear in reply
  mustContain?: string[];        // phrases that MUST appear in reply
  guardsOnly?: boolean;          // true = skip LLM scoring (deterministic check only)
  regressionId?: string;         // links to a known failure case
}

interface EvalResult {
  scenario: EvalScenario;
  passed: boolean;
  actualBehavior: 'STOP' | 'HANDOFF' | 'REPLY';
  actualNextAction?: string;
  reply?: string;
  judgeScore?: number;        // 0-100 from LLM judge
  judgeReason?: string;
  durationMs: number;
  error?: string;
  debugStrategyAction?: string;
}

// ── Scenarios ────────────────────────────────────────────────────────────────

const SCENARIOS: EvalScenario[] = [
  {
    id: 1,
    name: 'Harter Nein',
    description: 'Einsilbiges "Nein" — muss sofort stoppen, kein weiterer Pitch',
    history: [
      { role: 'agent', body: 'Hi, ich wollte kurz nachfragen ob du immer noch Interesse an unserem Coaching hast?' },
    ],
    message: 'Nein',
    expectedBehavior: 'STOP',
    guardsOnly: true,
    regressionId: 'andrea-kessler',
  },
  {
    id: 2,
    name: 'Kein Interesse',
    description: '"Kein Interesse" — harter Stop erforderlich',
    history: [
      { role: 'agent', body: 'Hi, melde mich wegen deiner Anfrage.' },
    ],
    message: 'Kein Interesse',
    expectedBehavior: 'STOP',
    guardsOnly: true,
    regressionId: 'anita-altwegg',
  },
  {
    id: 3,
    name: 'Wiederholte Ablehnung',
    description: 'Lead hat zweimal abgelehnt — zweiter "Nein" muss Final-Stop triggern',
    history: [
      { role: 'agent', body: 'Hi, kurze Frage wegen deiner früheren Anfrage.' },
      { role: 'lead', body: 'Kein Interesse' },
      { role: 'agent', body: 'Verstehe — darf ich fragen warum?' },
    ],
    message: 'Wie gesagt, kein Interesse.',
    expectedBehavior: 'STOP',
    guardsOnly: true,
    regressionId: 'repeated-rejection',
  },
  {
    id: 4,
    name: 'Problem bereits gelöst',
    description: '"Mache schon Fitness" — Problem-Solved-Stop, kein weiterer Pitch',
    history: [
      { role: 'agent', body: 'Hast du immer noch das Thema Fitness auf dem Radar?' },
    ],
    message: 'Ich mache schon Fitness, danke.',
    expectedBehavior: 'STOP',
    guardsOnly: true,
    regressionId: 'problem-solved',
  },
  {
    id: 5,
    name: 'Bin versorgt',
    description: '"Bin versorgt" = Problem gelöst — muss stoppen',
    history: [
      { role: 'agent', body: 'Wollte mich kurz melden — gibt es noch Bedarf?' },
    ],
    message: 'Bin versorgt danke',
    expectedBehavior: 'STOP',
    guardsOnly: true,
    regressionId: 'problem-solved-2',
  },
  {
    id: 6,
    name: 'Preisfrage zu früh',
    description: '"Was kostet das?" als erste Lead-Nachricht — darf NICHT Preis nennen, muss erst Rapport aufbauen',
    history: [
      { role: 'agent', body: 'Hi, ich wollte kurz fragen ob das Thema Fitness-Coaching noch aktuell ist.' },
    ],
    message: 'Was kostet das?',
    expectedBehavior: 'REPLY',
    forbiddenInReply: ['CHF', 'Fr.', '€', 'Euro', 'kostet', 'Preis', 'Tarif'],
  },
  {
    id: 7,
    name: 'Normales erstes Ja',
    description: '"Ja, interessant" — muss Qualify-Frage stellen, KEIN Pitch',
    history: [
      { role: 'agent', body: 'Hi! Wollte kurz nachfragen — ist das Thema Abnehmen bei dir noch aktuell?' },
    ],
    message: 'Ja, interessant.',
    expectedBehavior: 'REPLY',
    expectedNextAction: 'ask_question',
    forbiddenInReply: ['Termin', 'buchen', 'Buchungslink', 'Anruf vereinbaren', 'kostet'],
  },
  {
    id: 8,
    name: 'Agent-Loop: 3 Diagnose-Fragen',
    description: 'Agent hat bereits 3 Diagnose-Fragen gestellt — muss jetzt soft_pitch, nicht nochmals fragen',
    history: [
      { role: 'agent', body: 'Was hat bisher nicht funktioniert bei dir?' },
      { role: 'lead', body: 'Ich hatte keine Zeit.' },
      { role: 'agent', body: 'Was ist dein grösstes Hindernis gerade?' },
      { role: 'lead', body: 'Mostly Zeit und Energie.' },
      { role: 'agent', body: 'Was hat sich seit damals verändert?' },
      { role: 'lead', body: 'Nicht viel eigentlich.' },
    ],
    message: 'Ich weiss nicht so recht.',
    expectedBehavior: 'REPLY',
    expectedNextAction: 'soft_pitch',
  },
  {
    id: 9,
    name: 'Danke als Abschluss',
    description: '"Danke, brauche das nicht" — harter Stop',
    history: [
      { role: 'agent', body: 'Wärst du offen für ein kurzes Gespräch?' },
    ],
    message: 'Danke, brauche das nicht.',
    expectedBehavior: 'STOP',
    guardsOnly: true,
  },
  {
    id: 10,
    name: 'Keine Zeit — kein Stop',
    description: '"Keine Zeit gerade" ohne vorherige Ablehnung — muss DEFER, nicht stoppen',
    history: [
      { role: 'agent', body: 'Hi, kurze Frage — ist das Thema Fitness noch relevant?' },
    ],
    message: 'Keine Zeit gerade.',
    expectedBehavior: 'REPLY',
    expectedNextAction: 'defer',
    forbiddenInReply: ['kein Problem', 'kein Interesse', 'Alles gut'],
  },
  {
    id: 11,
    name: 'Lead initiiert Booking',
    description: 'Lead fragt selbst nach einem Termin — muss book_call oder Buchungslink',
    history: [
      { role: 'agent', body: 'Klingt gut! Ich denke das wäre genau das Richtige für dich.' },
      { role: 'lead', body: 'Ja klingt interessant.' },
      { role: 'agent', body: 'Was ist dein grösstes Ziel gerade?' },
      { role: 'lead', body: '10 kg abnehmen.' },
    ],
    message: 'Wann hast du Zeit für einen kurzen Anruf?',
    expectedBehavior: 'REPLY',
    expectedNextAction: 'book_call',
  },
  {
    id: 12,
    name: 'Warmes Ja nach Qualify',
    description: '"Ja lass uns mal reden" nach Qualifying — muss Richtung BOOKING steuern',
    history: [
      { role: 'agent', body: 'Magst du kurz erzählen was dein Ziel ist?' },
      { role: 'lead', body: 'Ich will fitter werden und abnehmen.' },
      { role: 'agent', body: 'Was hat bisher nicht geklappt dabei?' },
      { role: 'lead', body: 'Ich fange immer an und höre dann auf.' },
    ],
    message: 'Ja gut, lass uns mal reden.',
    expectedBehavior: 'REPLY',
    expectedNextAction: 'book_call',
  },
  {
    id: 13,
    name: 'Turn-Limit',
    description: '15 Lead-Turns in der History — muss Handoff, kein weiterer LLM-Call',
    history: Array.from({ length: 15 }, (_, i) => [
      { role: 'agent' as const, body: `Frage ${i + 1}` },
      { role: 'lead' as const, body: `Antwort ${i + 1}` },
    ]).flat(),
    message: 'Ok.',
    expectedBehavior: 'HANDOFF',
    guardsOnly: true,
    regressionId: 'turn-limit',
  },
  {
    id: 14,
    name: 'Verbotene Phrase',
    description: 'Reply darf NIEMALS "Vielen Dank für Ihre Nachricht" enthalten',
    history: [
      { role: 'agent', body: 'Hast du noch Interesse?' },
    ],
    message: 'Ja klar, erzähl mal.',
    expectedBehavior: 'REPLY',
    forbiddenInReply: [
      'Vielen Dank für Ihre Nachricht',
      'Das freut mich zu hören',
      'Das klingt super',
      'Ich hoffe',
      'Herzliche Grüsse',
      'Mit freundlichen Grüssen',
    ],
  },
  {
    id: 15,
    name: 'Objection: bereits probiert',
    description: '"Hab das schon probiert" — kein Stop, aber auch kein leerer Pitch',
    history: [
      { role: 'agent', body: 'Was hält dich gerade noch vom ersten Schritt ab?' },
    ],
    message: 'Ich hab das schon mal probiert, hat nicht funktioniert.',
    expectedBehavior: 'REPLY',
    forbiddenInReply: ['Verstehe ich', 'Das klingt', 'Vielen Dank'],
    mustContain: ['?'],  // must end with a follow-up question
  },
];

// ── Pipeline call ─────────────────────────────────────────────────────────────

async function runScenario(
  scenario: EvalScenario,
  verbose: boolean,
): Promise<EvalResult> {
  const startMs = Date.now();
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';

  try {
    const evalSecret = process.env.DASHBOARD_SECRET ?? '';
    const res = await fetch(`${baseUrl}/api/converse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'referer': baseUrl,
        ...(evalSecret ? { Authorization: `Bearer ${evalSecret}` } : {}),
      },
      body: JSON.stringify({
        message: scenario.message,
        history: scenario.history,
        leadName: 'TestLead',
      }),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }

    const data = await res.json() as {
      reply?: string;
      nextAction?: string;
      shouldHandoff?: boolean;
      debugStrategyAction?: string;
    };

    const durationMs = Date.now() - startMs;

    // Determine actual behavior
    let actualBehavior: 'STOP' | 'HANDOFF' | 'REPLY';
    if (data.nextAction === 'stop' || (!data.reply && !data.shouldHandoff)) {
      actualBehavior = 'STOP';
    } else if (data.nextAction === 'handoff' || data.shouldHandoff) {
      actualBehavior = 'HANDOFF';
    } else {
      actualBehavior = 'REPLY';
    }

    // Basic pass/fail
    let passed = actualBehavior === scenario.expectedBehavior;

    // Check nextAction if specified
    if (passed && scenario.expectedNextAction && actualBehavior === 'REPLY') {
      passed = data.nextAction === scenario.expectedNextAction;
    }

    // Check forbidden phrases in reply
    if (passed && scenario.forbiddenInReply && data.reply) {
      for (const phrase of scenario.forbiddenInReply) {
        if (data.reply.toLowerCase().includes(phrase.toLowerCase())) {
          passed = false;
          break;
        }
      }
    }

    // Check must-contain phrases
    if (passed && scenario.mustContain && data.reply) {
      for (const phrase of scenario.mustContain) {
        if (!data.reply.includes(phrase)) {
          passed = false;
          break;
        }
      }
    }

    if (verbose && data.reply) {
      console.log(`    Reply: "${data.reply}"`);
    }

    return {
      scenario,
      passed,
      actualBehavior,
      actualNextAction: data.nextAction,
      reply: data.reply,
      durationMs,
      debugStrategyAction: data.debugStrategyAction,
    };
  } catch (err) {
    return {
      scenario,
      passed: false,
      actualBehavior: 'REPLY',
      durationMs: Date.now() - startMs,
      error: String(err),
    };
  }
}

// ── LLM Judge ─────────────────────────────────────────────────────────────────

async function judgeReply(
  scenario: EvalScenario,
  reply: string,
  nextAction: string,
): Promise<{ score: number; reason: string }> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const prompt = `Du bewertest die Qualität einer KI-generierten Antwort in einem Verkaufsgespräch.

Kontext:
- Szenario: ${scenario.name}
- Lead-Nachricht: "${scenario.message}"
- Gesprächsphase: ${scenario.history.length} Turns bisher
- Gewählte Aktion: ${nextAction}

Generierte Antwort:
"${reply}"

Bewerte auf einer Skala 0-100:
1. Phasen-Korrektheit (0-25): Macht die Antwort im Gesprächskontext Sinn?
2. Kein Bot-Charakter (0-25): Klingt es natürlich/menschlich?
3. Ton-Angemessenheit (0-25): Passt der Ton zur Situation?
4. Ziel-Orientierung (0-25): Bewegt die Antwort das Gespräch sinnvoll voran?

Antworte mit JSON:
{
  "score": <Gesamtscore 0-100>,
  "reason": "<1-2 Sätze was gut/schlecht war>"
}`;

  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 150,
      temperature: 0,
    });

    const text = res.choices[0]?.message?.content ?? '{}';
    const json = JSON.parse(text.replace(/^```json?\s*\n?/, '').replace(/\n?\s*```$/, ''));
    return { score: Number(json.score) || 0, reason: String(json.reason || '') };
  } catch {
    return { score: 0, reason: 'Judge failed' };
  }
}

// ── Main runner ───────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const fastMode = args.includes('--fast');
  const verbose = args.includes('--verbose');

  console.log('\n🧪 ROYA EVAL — ' + SCENARIOS.length + ' Szenarien');
  console.log('─'.repeat(60));

  if (fastMode) {
    console.log('⚡ FAST MODE — nur Deterministic-Checks, kein LLM-Scoring\n');
  }

  const results: EvalResult[] = [];
  let regressions = 0;

  for (const scenario of SCENARIOS) {
    process.stdout.write(`[${String(scenario.id).padStart(2, '0')}] ${scenario.name.padEnd(30)} `);

    const result = await runScenario(scenario, verbose);

    if (result.passed) {
      process.stdout.write('✅ ');

      // LLM judge for non-deterministic reply scenarios
      if (!fastMode && !scenario.guardsOnly && result.actualBehavior === 'REPLY' && result.reply) {
        const judge = await judgeReply(scenario, result.reply, result.actualNextAction ?? '');
        result.judgeScore = judge.score;
        result.judgeReason = judge.reason;
        const scoreBar = judge.score >= 80 ? '🟢' : judge.score >= 60 ? '🟡' : '🔴';
        process.stdout.write(`${scoreBar} ${judge.score}/100`);
      }
    } else {
      process.stdout.write('❌ FAILED');
      if (scenario.regressionId) {
        process.stdout.write(` [REGRESSION: ${scenario.regressionId}]`);
        regressions++;
      }
    }

    if (result.error) {
      process.stdout.write(` ERROR: ${result.error.slice(0, 60)}`);
    }

    const actionInfo = `  → ${result.actualBehavior}` + (result.actualNextAction ? `/${result.actualNextAction}` : '');
    process.stdout.write(actionInfo);

    console.log(` (${result.durationMs}ms)`);

    if (!result.passed && verbose && result.reply) {
      console.log(`    ⚠ Reply: "${result.reply}"`);
      console.log(`    ⚠ Expected: ${scenario.expectedBehavior}, Got: ${result.actualBehavior}`);
    }
    if (result.judgeReason && verbose) {
      console.log(`    Judge: ${result.judgeReason}`);
    }

    results.push(result);
  }

  // ── Summary ──
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const avgScore = results
    .filter(r => r.judgeScore !== undefined)
    .reduce((sum, r) => sum + (r.judgeScore ?? 0), 0)
    / Math.max(1, results.filter(r => r.judgeScore !== undefined).length);

  console.log('\n' + '─'.repeat(60));
  console.log(`ERGEBNIS: ${passed}/${SCENARIOS.length} bestanden`);

  if (!fastMode) {
    console.log(`LLM-QUALITÄT: Ø ${Math.round(avgScore)}/100`);
  }

  if (regressions > 0) {
    console.log(`⚠️  REGRESSIONEN: ${regressions} bekannte Fehlermuster sind NICHT behoben!`);
    const regScenarios = results.filter(r => !r.passed && r.scenario.regressionId);
    for (const r of regScenarios) {
      console.log(`   - [${r.scenario.regressionId}] ${r.scenario.name}`);
    }
  } else {
    console.log('✅ Keine Regressionen — alle bekannten Fehlermuster behoben');
  }

  if (failed > 0) {
    console.log('\nFehlgeschlagene Szenarien:');
    for (const r of results.filter(res => !res.passed)) {
      console.log(`  #${r.scenario.id} ${r.scenario.name}`);
      console.log(`     Erwartet: ${r.scenario.expectedBehavior}, Erhalten: ${r.actualBehavior}`);
      if (r.scenario.expectedNextAction) {
        console.log(`     Aktion erwartet: ${r.scenario.expectedNextAction}, erhalten: ${r.actualNextAction ?? 'none'}`);
      }
      if (r.debugStrategyAction) {
        console.log(`     Strategist-Aktion: ${r.debugStrategyAction}`);
      }
    }
  }

  console.log('');
  process.exit(regressions > 0 || failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Eval crashed:', err);
  process.exit(1);
});
