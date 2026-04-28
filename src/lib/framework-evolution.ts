/**
 * Framework Evolution Engine
 * 
 * Merges ROYA Standard Framework + Learned Rules into ONE evolved framework.
 * Primary: Supabase `evolved_frameworks` table (works on Vercel).
 * Fallback: local roya-evolved-framework.json (dev / offline).
 * Auto-migrates local data → Supabase on first load.
 */

import fs from 'fs';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM_FRAMEWORKS } from '@/lib/framework-store';
import { loadLearnedRules, buildLearnedRulesPrompt } from '@/lib/learned-rules-store';
import { supabase, genId } from '@/lib/supabase';

const EVOLVED_FILE = path.join(process.cwd(), 'roya-evolved-framework.json');
const EVOLVED_BACKUP = path.join(process.cwd(), 'roya-evolved-framework.backup.json');

export interface EvolvedFramework {
  version: number;
  evolvedAt: string;
  learningsUsed: number;
  writerInstructions: string;
  strategistInstructions: string;
  interpreterInstructions: string;
  rules: string[];
  forbiddenPhrases: string[];
  temperature: number;
  exampleMessages: { context: string; message: string }[];
  evolutionLog: string[];
}

// ── DB ↔ TypeScript mapping ─────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToEvolved(row: any): EvolvedFramework {
  return {
    version: row.version ?? 1,
    evolvedAt: row.evolved_at ?? row.created_at ?? new Date().toISOString(),
    learningsUsed: row.learnings_used ?? 0,
    writerInstructions: row.writer_instructions ?? '',
    strategistInstructions: row.strategist_instructions ?? '',
    interpreterInstructions: row.interpreter_instructions ?? '',
    rules: row.rules ?? [],
    forbiddenPhrases: row.forbidden_phrases ?? [],
    temperature: Number(row.temperature ?? 0.3),
    exampleMessages: row.example_messages ?? [],
    evolutionLog: row.evolution_log ?? [],
  };
}

function evolvedToRow(fw: EvolvedFramework, id: string, agencyId?: string) {
  return {
    id,
    agency_id: agencyId ?? null,
    version: fw.version,
    evolved_at: fw.evolvedAt,
    learnings_used: fw.learningsUsed,
    writer_instructions: fw.writerInstructions,
    strategist_instructions: fw.strategistInstructions,
    interpreter_instructions: fw.interpreterInstructions,
    rules: fw.rules,
    forbidden_phrases: fw.forbiddenPhrases,
    temperature: fw.temperature,
    example_messages: fw.exampleMessages,
    evolution_log: fw.evolutionLog,
  };
}

// ── Local file helpers (fallback) ───────────────────────────────────────────

function loadFromFile(): EvolvedFramework | null {
  try {
    if (fs.existsSync(EVOLVED_FILE)) {
      const raw = fs.readFileSync(EVOLVED_FILE, 'utf-8');
      const data = JSON.parse(raw) as EvolvedFramework;
      if (data.writerInstructions && data.strategistInstructions) return data;
    }
    if (fs.existsSync(EVOLVED_BACKUP)) {
      const raw = fs.readFileSync(EVOLVED_BACKUP, 'utf-8');
      const data = JSON.parse(raw) as EvolvedFramework;
      if (data.writerInstructions && data.strategistInstructions) return data;
    }
  } catch { /* ignore */ }
  return null;
}

function saveToFile(fw: EvolvedFramework): void {
  try {
    const json = JSON.stringify(fw, null, 2);
    fs.writeFileSync(EVOLVED_FILE, json, 'utf-8');
    fs.writeFileSync(EVOLVED_BACKUP, json, 'utf-8');
  } catch { /* ignore in production */ }
}

// ── Supabase CRUD ───────────────────────────────────────────────────────────

const EVOLVED_ROW_ID = 'evolved-main'; // Single row, upserted on each evolution
let _migrated = false;

async function autoMigrateToDb(): Promise<void> {
  if (_migrated) return;
  _migrated = true;
  try {
    const { data: rows } = await supabase
      .from('evolved_frameworks')
      .select('id')
      .eq('id', EVOLVED_ROW_ID)
      .limit(1);

    if (rows && rows.length > 0) return; // DB already has data

    const local = loadFromFile();
    if (!local) return;

    console.log(`[ROYA] Auto-migrating evolved framework v${local.version} from local file → Supabase`);
    const row = evolvedToRow(local, EVOLVED_ROW_ID);
    const { error } = await supabase.from('evolved_frameworks').insert([row]);
    if (error) {
      console.error('[ROYA] Evolution migration failed:', error.message);
      _migrated = false;
    } else {
      console.log(`[ROYA] Successfully migrated evolved framework v${local.version} to Supabase`);
    }
  } catch (err) {
    console.error('[ROYA] Auto-migration error:', err);
    _migrated = false;
  }
}

export async function loadEvolvedFramework(): Promise<EvolvedFramework | null> {
  try {
    await autoMigrateToDb();
    const { data: rows, error } = await supabase
      .from('evolved_frameworks')
      .select('*')
      .eq('id', EVOLVED_ROW_ID)
      .limit(1);

    if (!error && rows && rows.length > 0) {
      const fw = rowToEvolved(rows[0]);
      if (fw.writerInstructions && fw.strategistInstructions) {
        console.log(`[ROYA] Loaded evolved framework v${fw.version} from Supabase (${fw.learningsUsed} learnings)`);
        return fw;
      }
    }

    if (error) {
      console.warn('[ROYA] Supabase query failed, falling back to local file:', error.message);
    }
  } catch (err) {
    console.warn('[ROYA] Supabase unavailable, falling back to local file:', err);
  }

  // Fallback to local file
  const local = loadFromFile();
  if (local) {
    console.log(`[ROYA] Loaded evolved framework v${local.version} from local file (fallback)`);
  }
  return local;
}

async function saveEvolvedFramework(fw: EvolvedFramework): Promise<void> {
  // Always write local file as backup
  saveToFile(fw);

  // Upsert to Supabase
  try {
    const row = evolvedToRow(fw, EVOLVED_ROW_ID);
    const { error } = await supabase.from('evolved_frameworks').upsert([row], { onConflict: 'id' });
    if (error) console.error('[ROYA] Supabase evolved save error:', error.message);
    else console.log(`[ROYA] Saved evolved framework v${fw.version} to Supabase`);
  } catch (err) {
    console.warn('[ROYA] Supabase evolved save failed (local file ok):', err);
  }
}

// ── Evolution Engine ────────────────────────────────────────────────────────

const EVOLUTION_PROMPT = `Du bist der ROYA Framework-Architekt. Deine Aufgabe: Zwei Quellen zu EINEM einheitlichen Framework verschmelzen.

QUELLE 1: "ROYA Standard" — das bewährte Basis-Framework mit Gesprächs-Blueprint, Phasen, Schreibregeln.
QUELLE 2: "Gelernte Methode" — extrahierte Regeln aus echten Chat-Uploads des Nutzers. Das sind REALE, BEWÄHRTE Gesprächsmuster.

VERSCHMELZUNGS-REGELN:
1. STRUKTUR vom Standard übernehmen (Phasen-Blueprint, Checker, Einwand-Strategien)
2. INHALT/STIL von den Learnings übernehmen wo sie spezifischer sind
3. Bei WIDERSPRÜCHEN gewinnen IMMER die Learnings — sie kommen von echten erfolgreichen Gesprächen
4. PLAYBOOK-EINTRÄGE aus Learnings ERSETZEN die Standard-Einwand-Strategien komplett
5. Wenn eine Einwand-Strategie im Standard steht UND im Playbook anders behandelt wird → NUR die Playbook-Version verwenden
6. BEISPIEL-NACHRICHTEN: Übernimm ALLE Beispiele aus den Learnings (sie sind echte bewährte Nachrichten). Ergänze mit Standard-Beispielen NUR für Phasen die in den Learnings fehlen.
7. TONE/STYLE aus Learnings überschreibt generischen Ton
8. Alle PLATZHALTER beibehalten: [Name], [AgentName], [Unternehmen], [Angebot], [typisches Problem]
9. Temperatur 0.3 (gelernte Methode = weniger Kreativität nötig)
10. exampleMessages als Array von {context, message} — MINDESTENS 15 Beispiele

WICHTIG: 
- Das Ergebnis muss EIN kohärentes Framework sein, NICHT zwei nebeneinander.
- Die Learnings sollen IN den Blueprint integriert werden, nicht als Anhang.
- JEDE Einwand-Strategie im Ergebnis muss mit der Playbook-Version übereinstimmen.

Antworte AUSSCHLIESSLICH mit validem JSON:
{
  "writerInstructions": "...(kompletter Writer-Prompt mit integrierten Learnings)...",
  "strategistInstructions": "...(kompletter Strategist-Prompt mit integrierten Learnings)...",
  "interpreterInstructions": "...(kompletter Interpreter-Prompt, minimal angepasst)...",
  "rules": ["...", "..."],
  "forbiddenPhrases": ["...", "..."],
  "temperature": 0.3,
  "exampleMessages": [{"context": "...", "message": "..."}, ...],
  "evolutionSummary": "...(1-2 Sätze was sich geändert hat)..."
}`;

export async function evolveFramework(): Promise<EvolvedFramework> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const royaStandard = SYSTEM_FRAMEWORKS[0];
  const learnedRules = await loadLearnedRules();
  const learnedPrompt = await buildLearnedRulesPrompt();

  // Load existing evolved framework for version tracking
  const existing = await loadEvolvedFramework();
  const nextVersion = (existing?.version ?? 0) + 1;

  console.log(`[ROYA] Evolving framework v${nextVersion} with ${learnedRules.learnings.length} learnings...`);

  const stream = client.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 16000,
    system: EVOLUTION_PROMPT,
    messages: [{
      role: 'user',
      content: `QUELLE 1 — ROYA STANDARD WRITER:
${royaStandard.writerInstructions}

---

QUELLE 1 — ROYA STANDARD STRATEGIST:
${royaStandard.strategistInstructions}

---

QUELLE 1 — ROYA STANDARD INTERPRETER:
${royaStandard.interpreterInstructions}

---

QUELLE 1 — REGELN: ${JSON.stringify(royaStandard.rules)}
QUELLE 1 — VERBOTENE PHRASEN: ${JSON.stringify(royaStandard.forbiddenPhrases)}
QUELLE 1 — BEISPIELE: ${JSON.stringify(royaStandard.exampleMessages)}

===

QUELLE 2 — GELERNTE METHODE (aus ${learnedRules.learnings.length} Chat-Uploads):
${learnedPrompt || '(Keine Learnings vorhanden — verwende ROYA Standard unverändert)'}

===

Verschmelze jetzt beide Quellen zu EINEM Framework. Learnings haben Vorrang bei Widersprüchen.`,
    }],
  });
  const response = await stream.finalMessage();

  const textBlock = response.content.find(b => b.type === 'text') as { text: string } | undefined;
  const raw = (textBlock?.text ?? '').trim();
  if (!raw) throw new Error('Keine Antwort von Claude erhalten');
  // Robust JSON extraction
  let json = raw.replace(/^```json?\s*\n?/, '').replace(/\n?\s*```$/, '');
  const braceStart = json.indexOf('{');
  const braceEnd = json.lastIndexOf('}');
  if (braceStart !== -1 && braceEnd > braceStart) {
    json = json.slice(braceStart, braceEnd + 1);
  }

  let extracted: Record<string, unknown>;
  try {
    extracted = JSON.parse(json);
  } catch (firstErr) {
    console.warn('[ROYA] First JSON parse failed, attempting repair:', (firstErr as Error).message);
    // Common fixes: trailing commas, unescaped newlines in strings
    let repaired = json
      .replace(/,\s*([}\]])/g, '$1')           // trailing commas
      .replace(/[\r\n]+/g, ' ')                 // collapse newlines
      .replace(/"\s*\n\s*"/g, '", "');          // broken array elements
    try {
      extracted = JSON.parse(repaired);
    } catch {
      // Last resort: ask Claude to fix its own JSON
      console.warn('[ROYA] Repair failed, asking Claude to fix JSON...');
      const fixStream = client.messages.stream({
        model: 'claude-sonnet-4-6',
        max_tokens: 8000,
        messages: [{
          role: 'user',
          content: `Fix the following malformed JSON. Return ONLY valid JSON, nothing else:\n\n${json.slice(0, 25000)}`,
        }],
      });
      const fixResponse = await fixStream.finalMessage();
      const fixTextBlock = fixResponse.content.find(b => b.type === 'text') as { text: string } | undefined;
      const fixRaw = (fixTextBlock?.text ?? '').trim();
      const fixJson = fixRaw.replace(/^```json?\s*\n?/, '').replace(/\n?\s*```$/, '');
      const fixBraceStart = fixJson.indexOf('{');
      const fixBraceEnd = fixJson.lastIndexOf('}');
      extracted = JSON.parse(fixJson.slice(fixBraceStart !== -1 ? fixBraceStart : 0, fixBraceEnd !== -1 ? fixBraceEnd + 1 : undefined));
    }
  }

  const evolved: EvolvedFramework = {
    version: nextVersion,
    evolvedAt: new Date().toISOString(),
    learningsUsed: learnedRules.learnings.length,
    writerInstructions: (extracted.writerInstructions as string) || royaStandard.writerInstructions,
    strategistInstructions: (extracted.strategistInstructions as string) || royaStandard.strategistInstructions,
    interpreterInstructions: (extracted.interpreterInstructions as string) || (royaStandard.interpreterInstructions ?? ''),
    rules: (extracted.rules as string[]) || [...royaStandard.rules],
    forbiddenPhrases: (extracted.forbiddenPhrases as string[]) || [...royaStandard.forbiddenPhrases],
    temperature: (extracted.temperature as number) ?? 0.3,
    exampleMessages: (extracted.exampleMessages as { context: string; message: string }[]) || [...royaStandard.exampleMessages],
    evolutionLog: [
      ...(existing?.evolutionLog ?? []),
      `v${nextVersion} (${new Date().toISOString().slice(0, 16)}): ${(extracted.evolutionSummary as string) || `Merged with ${learnedRules.learnings.length} learnings`}`,
    ],
  };

  await saveEvolvedFramework(evolved);
  console.log(`[ROYA] Framework evolved to v${nextVersion} successfully`);

  return evolved;
}
