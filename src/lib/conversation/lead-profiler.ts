/**
 * Lead Profiler — Persistent, incremental memory per contact.
 *
 * Instead of re-computing memory from full history every turn,
 * we store a structured profile in the DB and update it incrementally.
 *
 * Each update is one tiny LLM call that only extracts NEW information
 * from the latest lead message. The profile is loaded instantly at
 * the start of each turn — no re-computation, no inconsistency.
 */

import { llmChat } from '@/lib/ai/llm-client';
import { supabase } from '@/lib/supabase';

export interface LeadProfile {
  goal?: string;         // What the lead wants to achieve
  painPoint?: string;    // The main obstacle they face
  availability?: string; // When they are available
  objections: string[];  // All objections seen (deduped)
  budgetSignals: string[]; // Budget-related signals
  interests: string[];   // Topics/things they showed interest in
  rawNotes: string;      // Freeform catch-all notes
  updatedAtTurn: number;
}

export const EMPTY_LEAD_PROFILE: LeadProfile = {
  objections: [],
  budgetSignals: [],
  interests: [],
  rawNotes: '',
  updatedAtTurn: 0,
};

// ── DB operations ────────────────────────────────────────────────────────────

export async function loadLeadProfile(contactId: string): Promise<LeadProfile> {
  try {
    const { data, error } = await supabase
      .from('lead_profiles')
      .select('*')
      .eq('contact_id', contactId)
      .single();

    if (error || !data) return EMPTY_LEAD_PROFILE;

    return {
      goal: data.goal ?? undefined,
      painPoint: data.pain_point ?? undefined,
      availability: data.availability ?? undefined,
      objections: (data.objections as string[]) ?? [],
      budgetSignals: (data.budget_signals as string[]) ?? [],
      interests: (data.interests as string[]) ?? [],
      rawNotes: data.raw_notes ?? '',
      updatedAtTurn: data.updated_at_turn ?? 0,
    };
  } catch {
    return EMPTY_LEAD_PROFILE;
  }
}

export async function saveLeadProfile(contactId: string, profile: LeadProfile): Promise<void> {
  try {
    await supabase
      .from('lead_profiles')
      .upsert({
        contact_id: contactId,
        goal: profile.goal,
        pain_point: profile.painPoint,
        availability: profile.availability,
        objections: profile.objections,
        budget_signals: profile.budgetSignals,
        interests: profile.interests,
        raw_notes: profile.rawNotes,
        updated_at_turn: profile.updatedAtTurn,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'contact_id' });
  } catch (err) {
    // Non-blocking — log and continue
    console.warn('[ROYA] saveLeadProfile failed (non-blocking):', err);
  }
}

// ── LLM extraction ───────────────────────────────────────────────────────────

interface ProfileDelta {
  goal?: string;
  painPoint?: string;
  availability?: string;
  objections?: string[];
  budgetSignals?: string[];
  interests?: string[];
  rawNotes?: string;
}

async function extractDelta(message: string, currentProfile: LeadProfile): Promise<ProfileDelta> {
  const prompt = `Du extrahierst strukturierte Fakten aus Lead-Nachrichten für ein CRM.

Aktuelles Profil (bereits bekannt — NICHT wiederholen):
${JSON.stringify({
  goal: currentProfile.goal,
  painPoint: currentProfile.painPoint,
  availability: currentProfile.availability,
  objections: currentProfile.objections,
  interests: currentProfile.interests,
}, null, 2)}

Neue Nachricht vom Lead:
"${message}"

Extrahiere NUR neue Informationen, die noch nicht im Profil stehen.
Wenn die Nachricht keine neuen Informationen enthält, gib leere Felder zurück.

Antworte ausschließlich mit validem JSON:
{
  "goal": "neues Ziel oder null",
  "painPoint": "neuer Schmerzpunkt oder null",
  "availability": "Verfügbarkeit (Zeiten, Tage) oder null",
  "objections": ["neue Einwände, die noch nicht bekannt sind"],
  "budgetSignals": ["Budget-Hinweise wie 'zu teuer', 'kein Budget', 'prüfe das'"],
  "interests": ["neue Interessen oder Themen"],
  "rawNotes": "sonstiges Wichtiges das nicht in andere Felder passt, oder leer"
}`;

  try {
    const raw = (await llmChat({
      model: 'gpt-4o-mini',
      system: 'Du bist ein präziser CRM-Daten-Extraktor. Antworte nur mit JSON.',
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 300,
      temperature: 0.1,
    })).trim();

    let json = raw.replace(/^```json?\s*\n?/, '').replace(/\n?\s*```$/, '');
    const bs = json.indexOf('{');
    const be = json.lastIndexOf('}');
    if (bs !== -1 && be > bs) json = json.slice(bs, be + 1);
    return JSON.parse(json) as ProfileDelta;
  } catch {
    return {};
  }
}

function mergeProfiles(current: LeadProfile, delta: ProfileDelta, turnCount: number): LeadProfile {
  // Merge arrays deduped, update string fields only if provided
  const mergeArr = (cur: string[], next?: string[]): string[] => {
    if (!next?.length) return cur;
    const combined = [...cur, ...next];
    return [...new Set(combined)].slice(-10); // keep last 10 unique
  };

  return {
    goal: delta.goal || current.goal,
    painPoint: delta.painPoint || current.painPoint,
    availability: delta.availability || current.availability,
    objections: mergeArr(current.objections, delta.objections),
    budgetSignals: mergeArr(current.budgetSignals, delta.budgetSignals),
    interests: mergeArr(current.interests, delta.interests),
    rawNotes: delta.rawNotes
      ? (current.rawNotes ? `${current.rawNotes}\n${delta.rawNotes}` : delta.rawNotes)
      : current.rawNotes,
    updatedAtTurn: turnCount,
  };
}

/**
 * Main entry point: load profile → extract delta → merge → save → return.
 * Non-blocking save; returns updated profile immediately for use in this turn.
 */
export async function updateLeadProfile(
  contactId: string,
  leadMessage: string,
  turnCount: number,
): Promise<LeadProfile> {
  const current = await loadLeadProfile(contactId);

  // Skip extraction if message is very short (pure pleasantries / single words)
  if (leadMessage.trim().split(/\s+/).length < 3) return current;

  const delta = await extractDelta(leadMessage, current);
  const updated = mergeProfiles(current, delta, turnCount);

  // Fire-and-forget save — doesn't block the response
  saveLeadProfile(contactId, updated).catch(() => {});

  return updated;
}

/**
 * Formats a lead profile into a context block for the LLM prompts.
 */
export function profileToContextBlock(profile: LeadProfile): string {
  const lines: string[] = [];
  if (profile.goal)                    lines.push(`Ziel: ${profile.goal}`);
  if (profile.painPoint)               lines.push(`Schmerzpunkt: ${profile.painPoint}`);
  if (profile.availability)            lines.push(`Verfügbarkeit: ${profile.availability}`);
  if (profile.objections.length)       lines.push(`Einwände: ${profile.objections.join('; ')}`);
  if (profile.budgetSignals.length)    lines.push(`Budget-Signale: ${profile.budgetSignals.join('; ')}`);
  if (profile.interests.length)        lines.push(`Interessen: ${profile.interests.join('; ')}`);
  if (profile.rawNotes)                lines.push(`Notizen: ${profile.rawNotes}`);
  return lines.length ? lines.join('\n') : '';
}
