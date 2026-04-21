/**
 * POST /api/learn-style
 * Analyzes an uploaded chat export or style document.
 * Extracts persistent style rules using Claude and saves them.
 * These rules automatically improve ALL future agent conversations.
 */

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { addLearning, loadLearnedRules, removeLearning } from '@/lib/learned-rules-store';
import { evolveFramework } from '@/lib/framework-evolution';
import type { StyleLearning, PlaybookEntry } from '@/lib/learned-rules-store';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const EXTRACTION_PROMPT = `Du bist ein Kommunikations-Analyst. Deine Aufgabe: Aus dem folgenden Chat-Protokoll eine UNIVERSELLE VERKAUFSMETHODE extrahieren, die ein KI-Agent in JEDER Branche anwenden kann.

WICHTIG — PLATZHALTER NUTZEN:
Ersetze alle branchenspezifischen Begriffe durch Platzhalter:
- Firmenname → [Unternehmen]
- Personenname des Agents → [AgentName]
- Name des Leads → [Name]
- Produkt/Dienstleistung → [Angebot]
- Typisches Kundenproblem → [typisches Problem]
- Branchenspezifische Begriffe → abstrakte Beschreibung

NICHT extrahieren: Konkrete Firmennamen, Adressen, Preise, branchenspezifische Fachbegriffe.

Extrahiere folgendes:

1. **toneProfile**: Beschreibe den Gesamtton in 1-2 Sätzen (z.B. "Locker, direkt, freundschaftlich, wie ein Kumpel der zufällig Experte ist")

2. **sentenceStyle**: Wie sind die Sätze aufgebaut? (Länge, Struktur, Interpunktion, Grossschreibung)

3. **conversationPatterns**: Wie wird das Gespräch geführt? Beschreibe die METHODE, nicht den Inhalt. (z.B. "Erst spiegeln was [Name] gesagt hat, dann genau 1 offene Frage", "Nach Einwand: nicht widersprechen, sondern reframen")

4. **phrasesToUse**: Konkrete Formulierungsmuster MIT Platzhaltern (z.B. "Hey [Name], das klingt als ob [typisches Problem] bei dir auch ein Thema ist")

5. **phrasesToAvoid**: Formulierungen die NICHT zum Stil passen (z.B. zu formell, zu pushy, zu lang)

6. **rules**: Konkrete, actionable Regeln die der Agent befolgen soll (z.B. "Maximal 2 Sätze", "Nie 2 Fragen stellen", "Immer Du-Form")

7. **exampleMessages**: Die besten 5-10 Beispiel-Nachrichten aus dem Dokument. Ersetze branchenspezifische Details durch Platzhalter.

8. **summary**: 2-3 Sätze die die VERKAUFSMETHODE zusammenfassen (nicht den Inhalt)

9. **playbook**: Array von Situation→Reaktion Mappings. Extrahiere ALLE wiederkehrenden Muster:
   z.B. {"trigger": "Lead antwortet skeptisch", "response": "Nicht dagegen argumentieren. Gefühl spiegeln, dann offene Frage stellen."}

Antworte AUSSCHLIESSLICH mit validem JSON:
{
  "toneProfile": "...",
  "sentenceStyle": "...",
  "conversationPatterns": ["...", "..."],
  "phrasesToUse": ["...", "..."],
  "phrasesToAvoid": ["...", "..."],
  "rules": ["...", "..."],
  "exampleMessages": ["...", "..."],
  "summary": "...",
  "playbook": [{"trigger": "...", "response": "..."}, ...]
}`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, text, fileName, learningId } = body as {
      action?: string;
      text?: string;
      fileName?: string;
      learningId?: string;
    };

    // ── DELETE action ──
    if (action === 'delete' && learningId) {
      const data = await removeLearning(learningId);
      // Re-evolve framework without the deleted learning
      let frameworkVersion = 0;
      try {
        if (data.learnings.length > 0) {
          const evolved = await evolveFramework();
          frameworkVersion = evolved.version;
        }
      } catch {}
      return NextResponse.json({
        success: true,
        remaining: data.learnings.length,
        frameworkVersion,
        message: `Gelerntes entfernt. ${data.learnings.length} Learnings verbleiben.`,
      });
    }

    // ── ANALYZE action (default) ──
    if (!text || text.trim().length < 50) {
      return NextResponse.json(
        { error: 'Text zu kurz. Mindestens 50 Zeichen für Analyse nötig.' },
        { status: 400 }
      );
    }

    // Truncate very long documents
    const docText = text.slice(0, 20000);

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      temperature: 0.3,
      system: EXTRACTION_PROMPT,
      messages: [{
        role: 'user',
        content: `Analysiere dieses Dokument und extrahiere Stilregeln:\n\n---\n${docText}\n---`,
      }],
    });

    const raw = (response.content[0] as { text: string }).text.trim();
    // Robust JSON extraction — Claude sometimes returns markdown-wrapped or slightly malformed JSON
    let json = raw.replace(/^```json?\s*\n?/, '').replace(/\n?\s*```$/, '');
    // Extract the outermost { ... } if there's surrounding text
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
        .replace(/[\r\n]+/g, ' ')                  // collapse newlines
        .replace(/"\s*\n\s*"/g, '", "');           // broken array elements
      try {
        extracted = JSON.parse(repaired);
      } catch {
        // Last resort: ask Claude to fix its own JSON
        console.warn('[ROYA] Repair failed, asking Claude to fix JSON...');
        const fixResponse = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 2500,
          temperature: 0,
          messages: [{
            role: 'user',
            content: `Fix the following malformed JSON. Return ONLY valid JSON, nothing else:\n\n${json}`,
          }],
        });
        const fixRaw = (fixResponse.content[0] as { text: string }).text.trim();
        const fixJson = fixRaw.replace(/^```json?\s*\n?/, '').replace(/\n?\s*```$/, '');
        const fixBraceStart = fixJson.indexOf('{');
        const fixBraceEnd = fixJson.lastIndexOf('}');
        extracted = JSON.parse(fixJson.slice(fixBraceStart !== -1 ? fixBraceStart : 0, fixBraceEnd !== -1 ? fixBraceEnd + 1 : undefined));
      }
    }

    // Build learning entry
    const learning: StyleLearning = {
      id: `learn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      source: fileName || 'Unbenanntes Dokument',
      extractedAt: new Date().toISOString(),
      toneProfile: (extracted.toneProfile as string) || '',
      sentenceStyle: (extracted.sentenceStyle as string) || '',
      conversationPatterns: (extracted.conversationPatterns as string[]) || [],
      phrasesToUse: (extracted.phrasesToUse as string[]) || [],
      phrasesToAvoid: (extracted.phrasesToAvoid as string[]) || [],
      rules: (extracted.rules as string[]) || [],
      exampleMessages: (extracted.exampleMessages as string[]) || [],
      summary: (extracted.summary as string) || '',
      playbook: (extracted.playbook as PlaybookEntry[]) || [],
    };

    // Save persistently
    const data = await addLearning(learning);

    // Evolve the unified framework with all learnings
    let frameworkVersion = 0;
    try {
      const evolved = await evolveFramework();
      frameworkVersion = evolved.version;
      console.log(`[ROYA] Framework evolved to v${evolved.version} after learning from ${fileName}`);
    } catch (evoErr) {
      console.error('[ROYA] Framework evolution failed (learnings still saved):', evoErr);
    }

    return NextResponse.json({
      success: true,
      learning,
      totalLearnings: data.learnings.length,
      frameworkVersion,
      message: `${learning.rules.length} Regeln, ${learning.phrasesToUse.length} Formulierungen und ${learning.exampleMessages.length} Beispiele gelernt. Framework v${frameworkVersion} erstellt.`,
    });
  } catch (err) {
    console.error('[ROYA] Style learning failed:', err);
    const errStr = String(err);
    if (errStr.includes('credit balance') || errStr.includes('billing')) {
      return NextResponse.json(
        { error: 'Anthropic API Credits aufgebraucht — bitte aufladen.' },
        { status: 402 }
      );
    }
    return NextResponse.json(
      { error: 'Analyse fehlgeschlagen: ' + (err instanceof Error ? err.message : String(err)) },
      { status: 500 }
    );
  }
}

export async function GET() {
  const data = await loadLearnedRules();
  return NextResponse.json(data);
}
