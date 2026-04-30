/**
 * Persistent learned style rules store.
 * Primary: Supabase `style_learnings` table (works on Vercel).
 * Fallback: local roya-learned-rules.json (dev / offline).
 * Auto-migrates local data → Supabase on first load.
 */

import fs from 'fs';
import path from 'path';
import { supabase } from '@/lib/supabase';

const RULES_FILE = path.join(process.cwd(), 'roya-learned-rules.json');
const BACKUP_FILE = path.join(process.cwd(), 'roya-learned-rules.backup.json');

export interface PlaybookEntry {
  trigger: string;           // e.g. "Lead zeigt Zweifel"
  response: string;          // e.g. "Spiegeln + 1 offene Frage"
}

export interface StyleLearning {
  id: string;
  source: string;           // filename of the upload
  extractedAt: string;       // ISO timestamp
  // Extracted style rules
  toneProfile: string;       // e.g. "Locker, direkt, freundschaftlich"
  sentenceStyle: string;     // e.g. "Kurz, 1-2 Sätze, keine Ausrufezeichen"
  conversationPatterns: string[];  // How conversations flow
  phrasesToUse: string[];    // Good phrases found in the doc
  phrasesToAvoid: string[];  // Bad phrases or patterns to avoid
  rules: string[];           // Concrete rules extracted
  exampleMessages: string[]; // Best example messages from the doc
  summary: string;           // One-paragraph summary of what was learned
  playbook?: PlaybookEntry[];  // Situational trigger → response mapping
}

export interface LearnedRulesData {
  version: number;
  lastUpdated: string;
  learnings: StyleLearning[];
}

function getDefaultData(): LearnedRulesData {
  return { version: 1, lastUpdated: new Date().toISOString(), learnings: [] };
}

// ── DB ↔ TypeScript mapping ─────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToLearning(row: any): StyleLearning {
  return {
    id: row.id,
    source: row.source ?? '',
    extractedAt: row.extracted_at ?? row.created_at ?? new Date().toISOString(),
    toneProfile: row.tone_profile ?? '',
    sentenceStyle: row.sentence_style ?? '',
    conversationPatterns: row.conversation_patterns ?? [],
    phrasesToUse: row.phrases_to_use ?? [],
    phrasesToAvoid: row.phrases_to_avoid ?? [],
    rules: row.rules ?? [],
    exampleMessages: row.example_messages ?? [],
    summary: row.summary ?? '',
    playbook: row.playbook ?? [],
  };
}

function learningToRow(l: StyleLearning, agencyId?: string) {
  return {
    id: l.id,
    agency_id: agencyId ?? null,
    source: l.source,
    extracted_at: l.extractedAt,
    tone_profile: l.toneProfile,
    sentence_style: l.sentenceStyle,
    conversation_patterns: l.conversationPatterns,
    phrases_to_use: l.phrasesToUse,
    phrases_to_avoid: l.phrasesToAvoid,
    rules: l.rules,
    example_messages: l.exampleMessages,
    summary: l.summary,
    playbook: l.playbook ?? [],
  };
}

// ── Local file helpers (fallback) ───────────────────────────────────────────

function loadFromFile(): LearnedRulesData {
  try {
    if (fs.existsSync(RULES_FILE)) {
      const raw = fs.readFileSync(RULES_FILE, 'utf-8');
      const data = JSON.parse(raw) as LearnedRulesData;
      if (data.learnings.length === 0 && fs.existsSync(BACKUP_FILE)) {
        const backupRaw = fs.readFileSync(BACKUP_FILE, 'utf-8');
        const backup = JSON.parse(backupRaw) as LearnedRulesData;
        if (backup.learnings.length > 0) return backup;
      }
      return data;
    }
    if (fs.existsSync(BACKUP_FILE)) {
      const backupRaw = fs.readFileSync(BACKUP_FILE, 'utf-8');
      const backup = JSON.parse(backupRaw) as LearnedRulesData;
      if (backup.learnings.length > 0) return backup;
    }
  } catch { /* ignore */ }
  return getDefaultData();
}

function saveToFile(data: LearnedRulesData): void {
  try {
    data.lastUpdated = new Date().toISOString();
    const json = JSON.stringify(data, null, 2);
    fs.writeFileSync(RULES_FILE, json, 'utf-8');
    if (data.learnings.length > 0) {
      fs.writeFileSync(BACKUP_FILE, json, 'utf-8');
    }
  } catch { /* ignore in production */ }
}

// ── Supabase CRUD ───────────────────────────────────────────────────────────

let _migrated = false;

async function autoMigrateToDb(): Promise<void> {
  if (_migrated) return;
  _migrated = true;
  try {
    const { count } = await supabase
      .from('style_learnings')
      .select('id', { count: 'exact', head: true });

    if ((count ?? 0) > 0) return; // DB already has data

    const local = loadFromFile();
    if (local.learnings.length === 0) return;

    console.log(`[ROYA] Auto-migrating ${local.learnings.length} learnings from local file → Supabase`);
    const rows = local.learnings.map(l => learningToRow(l));
    const { error } = await supabase.from('style_learnings').insert(rows);
    if (error) {
      console.error('[ROYA] Migration failed:', error.message);
      _migrated = false; // retry next time
    } else {
      console.log(`[ROYA] Successfully migrated ${rows.length} learnings to Supabase`);
    }
  } catch (err) {
    console.error('[ROYA] Auto-migration error:', err);
    _migrated = false;
  }
}

export async function loadLearnedRules(): Promise<LearnedRulesData> {
  try {
    await autoMigrateToDb();
    const { data: rows, error } = await supabase
      .from('style_learnings')
      .select('*')
      .order('created_at', { ascending: true });

    if (!error && rows && rows.length > 0) {
      const learnings = rows.map(rowToLearning);
      console.log(`[ROYA] Loaded ${learnings.length} learnings from Supabase`);
      return { version: 1, lastUpdated: new Date().toISOString(), learnings };
    }

    if (error) {
      console.warn('[ROYA] Supabase query failed, falling back to local file:', error.message);
    }
  } catch (err) {
    console.warn('[ROYA] Supabase unavailable, falling back to local file:', err);
  }

  // Fallback to local file
  const local = loadFromFile();
  console.log(`[ROYA] Loaded ${local.learnings.length} learnings from local file (fallback)`);
  return local;
}

export async function saveLearnedRules(data: LearnedRulesData): Promise<void> {
  // Always write local file as backup
  saveToFile(data);

  // Sync full state to Supabase: delete all, re-insert
  try {
    await supabase.from('style_learnings').delete().neq('id', '__never__');
    if (data.learnings.length > 0) {
      const rows = data.learnings.map(l => learningToRow(l));
      const { error } = await supabase.from('style_learnings').insert(rows);
      if (error) console.error('[ROYA] Supabase save error:', error.message);
      else console.log(`[ROYA] Saved ${rows.length} learnings to Supabase`);
    }
  } catch (err) {
    console.warn('[ROYA] Supabase save failed (local file ok):', err);
  }
}

export async function addLearning(learning: StyleLearning): Promise<LearnedRulesData> {
  // Check for existing learning with same source filename — prevent duplicates
  try {
    const { data: existing } = await supabase
      .from('style_learnings')
      .select('id')
      .eq('source', learning.source)
      .maybeSingle();
    if (existing) {
      // Replace the old entry with the new one (re-upload updates the learning)
      await supabase.from('style_learnings').delete().eq('source', learning.source);
      console.log(`[ROYA] Replaced existing learning for source: ${learning.source}`);
    }
  } catch { /* continue with insert */ }

  // Insert into DB
  try {
    const row = learningToRow(learning);
    const { error } = await supabase.from('style_learnings').insert([row]);
    if (error) console.error('[ROYA] Supabase insert error:', error.message);
  } catch { /* fallback below */ }

  // Re-read full state
  const data = await loadLearnedRules();
  // If DB insert failed, ensure the learning is in local data (replace by source if exists)
  const existingLocalIdx = data.learnings.findIndex(l => l.source === learning.source);
  if (existingLocalIdx >= 0) {
    data.learnings[existingLocalIdx] = learning;
  } else if (!data.learnings.find(l => l.id === learning.id)) {
    data.learnings.push(learning);
  }
  saveToFile(data);
  return data;
}

export async function removeLearning(id: string): Promise<LearnedRulesData> {
  // Delete from DB
  try {
    const { error } = await supabase.from('style_learnings').delete().eq('id', id);
    if (error) console.error('[ROYA] Supabase delete error:', error.message);
  } catch { /* fallback below */ }

  // Re-read full state
  const data = await loadLearnedRules();
  data.learnings = data.learnings.filter(l => l.id !== id);
  saveToFile(data);
  return data;
}

/** Returns true when ≥3 learnings exist — enough to skip generic rules and lower temperature. */
export async function hasStrongLearnings(): Promise<boolean> {
  return (await loadLearnedRules()).learnings.length >= 3;
}

// ── Fuzzy dedup helpers ─────────────────────────────────────────────────────

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-zäöüß0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function tokenize(s: string): Set<string> {
  return new Set(normalize(s).split(' ').filter(Boolean));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 1 : inter / union;
}

function fuzzyDedup(items: string[], threshold = 0.7): string[] {
  const result: string[] = [];
  const tokenSets: Set<string>[] = [];
  for (const item of items) {
    const ts = tokenize(item);
    if (ts.size === 0) continue;
    const isDup = tokenSets.some(existing => jaccard(existing, ts) >= threshold);
    if (!isDup) {
      result.push(item);
      tokenSets.push(ts);
    }
  }
  return result;
}

/**
 * Build a consolidated prompt section from ALL accumulated learnings.
 * This is injected into the Writer system prompt for every conversation.
 */
export async function buildLearnedRulesPrompt(): Promise<string> {
  const data = await loadLearnedRules();
  if (data.learnings.length === 0) return '';

  const allRules: string[] = [];
  const allPhrasesToUse: string[] = [];
  const allPhrasesToAvoid: string[] = [];
  const allPatterns: string[] = [];
  const allExamples: string[] = [];
  const allPlaybook: PlaybookEntry[] = [];
  const summaries: string[] = [];

  for (const l of data.learnings) {
    if (l.summary) summaries.push(l.summary);
    if (l.sentenceStyle) allRules.push(`Satzstil: ${l.sentenceStyle}`);
    allRules.push(...l.rules);
    allPhrasesToUse.push(...l.phrasesToUse);
    allPhrasesToAvoid.push(...l.phrasesToAvoid);
    allPatterns.push(...l.conversationPatterns);
    allExamples.push(...l.exampleMessages);
    if (l.playbook) allPlaybook.push(...l.playbook);
  }

  // Fuzzy dedup all collections
  const uniqueRules = fuzzyDedup(allRules);
  const uniquePhrases = fuzzyDedup(allPhrasesToUse);
  const uniqueAvoid = fuzzyDedup(allPhrasesToAvoid);
  const uniquePatterns = fuzzyDedup(allPatterns);
  const uniqueExamples = fuzzyDedup(allExamples, 0.5); // lower threshold for examples
  const uniqueSummaries = fuzzyDedup(summaries);

  let prompt = `\n\n════════════════════════════════════════════════════
GELERNTE VERKAUFSMETHODE — HÖCHSTE PRIORITÄT
(aus ${data.learnings.length} analysierten Chat-Uploads vom Nutzer)
Diese Methode ÜBERSCHREIBT alle generischen Schreibregeln.
Bei Widersprüchen gelten IMMER diese gelernten Regeln.

PLATZHALTER: Texte enthalten [Name], [AgentName], [Unternehmen],
[Angebot], [typisches Problem]. Ersetze sie durch die echten Werte
aus dem Business-Kontext oben.
════════════════════════════════════════════════════`;

  // Consolidated tone from first 3 summaries
  if (uniqueSummaries.length > 0) {
    prompt += `\n\nMETHODE IM ÜBERBLICK:`;
    for (const s of uniqueSummaries.slice(0, 3)) {
      prompt += `\n• ${s}`;
    }
  }

  // Playbook first — situational trigger→response
  if (allPlaybook.length > 0) {
    prompt += `\n\n★★★ PLAYBOOK — Situation → Reaktion:`;
    const seen = new Set<string>();
    for (const p of allPlaybook) {
      const key = normalize(p.trigger);
      if (seen.has(key)) continue;
      seen.add(key);
      prompt += `\n• WENN ${p.trigger} → DANN ${p.response}`;
    }
  }

  // Golden examples as primary guidance
  if (uniqueExamples.length > 0) {
    prompt += `\n\n★★★ GOLDENE BEISPIELE — SO klingt eine perfekte Nachricht:`;
    for (const ex of uniqueExamples.slice(0, 30)) {
      prompt += `\n★ "${ex}"`;
    }
  }

  if (uniqueRules.length > 0) {
    prompt += `\n\nVERHALTENSREGELN (strikt befolgen):`;
    for (const r of uniqueRules.slice(0, 50)) {
      prompt += `\n• ${r}`;
    }
  }

  if (uniquePatterns.length > 0) {
    prompt += `\n\nGESPRÄCHSMUSTER (so führst du Gespräche):`;
    for (const p of uniquePatterns.slice(0, 25)) {
      prompt += `\n- ${p}`;
    }
  }

  if (uniquePhrases.length > 0) {
    prompt += `\n\nGUTE FORMULIERUNGEN (nutze diese aktiv):`;
    for (const p of uniquePhrases.slice(0, 30)) {
      prompt += `\n- "${p}"`;
    }
  }

  if (uniqueAvoid.length > 0) {
    prompt += `\n\nVERMEIDE DIESE FORMULIERUNGEN:`;
    for (const p of uniqueAvoid.slice(0, 30)) {
      prompt += `\n- "${p}"`;
    }
  }

  prompt += `\n════════════════════════════════════════════════════`;

  return prompt;
}
