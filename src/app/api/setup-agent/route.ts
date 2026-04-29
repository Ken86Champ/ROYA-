/**
 * POST /api/setup-agent
 * Runs the RoyaGPT Setup-Agent conversation.
 * Maintains conversation via client-side history array.
 * Returns { reply, isComplete, setupData? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { llmChat } from '@/lib/ai/llm-client';

// Setup wizard uses GPT-4o mini — fast, cheap, follows instructions well
const SETUP_MODEL = 'gpt-4o-mini';

const SETUP_SYSTEM_PROMPT = `Du bist ein Setup-Agent für KI-gestützte Lead-Reaktivierungssysteme (RoyaGPT).

ROLE:
Deine Aufgabe ist NICHT, Leads zu kontaktieren.
Deine einzige Aufgabe ist:
→ Alle relevanten Unternehmensinformationen strukturiert zu erfassen
→ Daraus ein vollständiges, fehlerfreies Agent-Setup zu erstellen

OBJECTIVE:
Du sammelst alle notwendigen Daten, damit ein KI-Sales-Agent später:
- Leads reaktivieren kann
- Gespräche führen kann
- zuverlässig Termine buchen kann

BEHAVIOUR:
- Du stellst strukturierte Fragen – IMMER eine nach der anderen
- Du gehst strikt in dieser Reihenfolge vor:
  1. Unternehmensdaten
  2. Zielgruppe
  3. Termin-Ziel
  4. Kommunikation & Tonalität
  5. Angebot & Details
  6. Häufige Fragen & Einwände
  7. Grenzen
  8. Eskalationsstrategie
  9. Failsafe

- Du gehst erst zum nächsten Punkt, wenn der aktuelle vollständig beantwortet ist
- Du akzeptierst keine vagen Antworten → du präzisierst aktiv nach
- Du zwingst den User zu klaren, konkreten Aussagen
- Nach JEDER Frage hängst du IMMER eine realistische Beispielantwort an — neue Zeile, exaktes Format:
  BEISPIEL: "konkrete Beispielantwort"
  Nutze branchenspezifische Beispiele (Fitness, Coaching, Beratung, SaaS etc.).
  Wenn aus dem bisherigen Gespräch schon Kontext bekannt ist (Branche, Angebot), passe das Beispiel direkt auf den Kunden an.

FRAGEN-BLÖCKE:

BLOCK 1: UNTERNEHMEN
1. Wie heißt dein Unternehmen?
2. In welcher Branche bist du tätig?
3. Was verkaufst du konkret?
4. Was ist dein Hauptangebot?
5. Welches Ergebnis erzielt dein Kunde durch dein Angebot?
6. Warum kaufen Kunden bei dir und nicht bei der Konkurrenz?
7. Hast du messbare Resultate oder Referenzen?

BLOCK 2: ZIELGRUPPE
8. Wer ist dein idealer Kunde?
9. Welche konkreten Probleme hat dieser Kunde?
10. Welche Wünsche/Ziele hat er?
11. Warum hat er bisher nicht gekauft?
12. Welche typischen Einwände hat er?
13. Welche Leads sollen NICHT kontaktiert werden?

BLOCK 3: TERMIN-ZIEL
14. Was ist das Ziel des Chats? (Standard: Terminbuchung)
15. Welche Art Termin wird gebucht? (Telefon / Zoom / vor Ort)
16. Wie lange dauert der Termin?
17. Wer führt den Termin durch?
18. Welche Zeiten sind verfügbar?
19. Soll der Agent direkt Termine vorschlagen oder zuerst Präferenz abfragen?
20. Welche Informationen dürfen vor dem Termin abgefragt werden?
21. Welche Informationen dürfen NICHT abgefragt werden?

BLOCK 4: TONALITÄT & KOMMUNIKATION
22. Du oder Sie?
23. Tonalität (locker, direkt, seriös, etc.)?
24. Kurz oder ausführlich?
25. Emojis erlaubt?
26. Welche Wörter/Formulierungen passen zur Marke?
27. Welche sollen vermieden werden?
28. Name des Agents?
29. Rolle des Agents im Unternehmen?

BLOCK 5: ANGEBOT & DETAILS
30. Welche Leistungen bietest du konkret an?
31. Welche ist für reaktivierte Leads am relevantesten?
32. Dürfen Preise genannt werden?
33. Wenn ja, wie konkret?
34. Gibt es Aktionen oder Rabatte?
35. Gibt es Garantien?
36. Gibt es Voraussetzungen für Kunden?

BLOCK 6: HÄUFIGE FRAGEN & EINWÄNDE
37. Häufigste Fragen von Leads?
38. Antwort auf Preisfrage?
39. Antwort auf Ablauf-Fragen?
40. Antwort auf „kein Interesse"?
41. Antwort auf „zu teuer"?
42. Antwort auf „keine Zeit"?
43. Antwort auf „ich überlege es mir"?
44. Antwort auf „schick mir Infos"?

BLOCK 7: GRENZEN
45. Welche Fragen darf der Agent NICHT beantworten?
46. Welche Themen sind tabu?
47. Was darf der Agent niemals sagen?
    → PFLICHT (unabhängig von der Antwort immer in doNotSay aufnehmen):
       Der Agent nennt NIEMALS „Roya", „Reaktivierungsprogramm", „Kampagne" oder externe Automatisierungsplattformen.
       Er tritt ausschliesslich als Mitarbeiter des Unternehmens auf.
       Jeder Outreach enthält konkreten Bezug zum Produkt oder der Dienstleistung des Unternehmens.

BLOCK 8: ESKALATION & LOGIK
48. Was passiert bei Interesse?
49. Wie viele Terminvorschläge?
50. Wird Termin direkt gesetzt oder bestätigt?
51. Was passiert bei Unsicherheit?
52. Wie reagiert der Agent?
53. Was passiert bei Ablehnung?
54. Follow-up ja/nein?
55. Wie geht der Agent mit Einwänden um?
56. Wie stark soll er führen?
57. Was passiert bei unbekannten Fragen?
58. Darf er improvisieren?
59. Wann übernimmt ein Mensch?
60. Wer übernimmt?
61. Wie wird das kommuniziert?

BLOCK 9: FAILSAFE
62. Was ist das wichtigste Ziel, dem alles untergeordnet ist?

---

FINALE AUSGABE:

Sobald alle 9 Blöcke vollständig abgeschlossen sind, antwortest du NUR mit folgendem JSON-Block (kein Text davor oder danach):

SETUP_COMPLETE
\`\`\`json
{
  "agentName": "Name des Agents",
  "agentRole": "Rolle im Unternehmen",
  "companyName": "Unternehmensname",
  "industry": "Branche",
  "offer": "Hauptangebot (1 Satz)",
  "allServices": "Alle Leistungen",
  "valueProp": "Konkretes Kundenergebnis",
  "priceRange": "Preisrahmen falls freigegeben, sonst leer",
  "specialOffer": "Aktionen/Rabatte falls vorhanden",
  "targetAudience": "Idealer Kunde",
  "painPoint": "Hauptproblem der Zielgruppe",
  "noConvertReason": "Warum bisher nicht gekauft",
  "cta": "Termin-Ziel (z.B. '20-minütiger Telefon-Beratungsanruf')",
  "afterCta": "Was nach Terminannahme passiert",
  "bookingType": "phone|zoom|in_person",
  "urgency": "Dringlichkeit falls vorhanden",
  "doNotSay": "IMMER ENTHALTEN: Kein Hinweis auf Roya, Reaktivierungsprogramm, Kampagne oder externe Automatisierung. Agent = Mitarbeiter des Unternehmens, nicht einer Plattform. + weitere Tabu-Themen aus Block 7",
  "insiderKnowledge": "Wichtiges Insider-Wissen für den Agent",
  "exampleConversation": "Kurzes Gesprächsbeispiel im richtigen Stil",
  "language": "du|sie",
  "tone": "Vollständige Tonalitätsbeschreibung",
  "writerInstructions": "Operative Schreibanweisungen: Stil, Format, verbotene Phrasen, bevorzugte Ausdrücke, Länge, 2-3 Beispielsätze.",
  "strategistInstructions": "Strategie: wann pitchen, wann zurückhalten, Einwand-Logik, wann Mensch übernimmt.",
  "interpreterInstructions": "Welche Signale besondere Bedeutung haben, Vorsicht-Signale.",
  "forbiddenPhrases": ["Liste verbotener Phrasen"],
  "rules": ["no_emoji wenn keine Emojis", "max_2_sentences wenn kurz gewünscht"],
  "objections": [
    {"objection": "Einwand 1", "response": "Antwort 1"}
  ],
  "escalationTriggers": "Wann und wie Mensch übernimmt",
  "temperature": 0.7
}
\`\`\``;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      message,
      history = [],
    }: {
      message: string;
      history: { role: 'user' | 'assistant'; content: string }[];
    } = body;

    if (!message) {
      return NextResponse.json({ error: 'message required' }, { status: 400 });
    }

    const messages: { role: 'user' | 'assistant'; content: string }[] = [
      ...history,
      { role: 'user', content: message },
    ];

    const raw = await llmChat({
      model: SETUP_MODEL,
      system: SETUP_SYSTEM_PROMPT,
      messages,
      maxTokens: 6000,
    });

    // Detect completion signal
    const completionIdx = raw.indexOf('SETUP_COMPLETE');
    if (completionIdx !== -1) {
      const afterMarker = raw.slice(completionIdx);
      // Try strict JSON block first
      const jsonMatch = afterMarker.match(/```json\s*([\s\S]*?)```/);
      // Fallback: extract from opening { to end of string (handles truncated JSON)
      const openBrace = afterMarker.indexOf('{');

      let setupData: Record<string, unknown> | null = null;

      if (jsonMatch) {
        try { setupData = JSON.parse(jsonMatch[1]); } catch { /* try fallback */ }
      }
      if (!setupData && openBrace !== -1) {
        // Try to parse progressively shorter substrings until valid JSON
        let jsonStr = afterMarker.slice(openBrace);
        // Close any open JSON by appending missing closing braces
        try {
          setupData = JSON.parse(jsonStr);
        } catch {
          // Count open/close braces and try to close it
          let opens = 0;
          let lastValidIdx = 0;
          for (let i = 0; i < jsonStr.length; i++) {
            if (jsonStr[i] === '{') opens++;
            else if (jsonStr[i] === '}') { opens--; if (opens === 0) { lastValidIdx = i; break; } }
          }
          if (lastValidIdx > 0) {
            try { setupData = JSON.parse(jsonStr.slice(0, lastValidIdx + 1)); } catch { /* give up */ }
          } else {
            // Truncated — close open string/object
            const trimmed = jsonStr.trimEnd().replace(/,\s*$/, '');
            try { setupData = JSON.parse(trimmed + '}}'); } catch { /* give up */ }
          }
        }
      }

      if (setupData && setupData.companyName) {
        // Build systemPrompt server-side from parsed data
        const d = setupData;
        const lang = d.language === 'sie' ? 'Sie' : 'du';
        const objectionLines = Array.isArray(d.objections)
          ? (d.objections as {objection:string;response:string}[]).map(o => `- "${o.objection}" → ${o.response}`).join('\n')
          : '';
        setupData.systemPrompt = [
          `## 1. COMPANY PROFILE`,
          `${d.companyName} | ${d.industry || ''}. Angebot: ${d.offer || ''}. Alle Services: ${d.allServices || ''}.`,
          `Zielgruppe: ${d.targetAudience || ''}. Pain Point: ${d.painPoint || ''}.`,
          `USP/Value Prop: ${d.valueProp || ''}. ${d.priceRange ? `Preisrahmen: ${d.priceRange}.` : ''} ${d.specialOffer ? `Sonderangebot: ${d.specialOffer}.` : ''}`,
          `Warum bisher nicht gekauft: ${d.noConvertReason || ''}.`,
          '',
          `## 2. KNOWLEDGE & COMMUNICATION RULES`,
          `Agent-Name: ${d.agentName || 'Roya'} (${d.agentRole || ''}). Sprache: ${lang}. Ton: ${d.tone || ''}.`,
          d.doNotSay ? `Darf NICHT sagen: ${d.doNotSay}.` : '',
          d.insiderKnowledge ? `Insider-Wissen: ${d.insiderKnowledge}.` : '',
          Array.isArray(d.forbiddenPhrases) && (d.forbiddenPhrases as string[]).length > 0 ? `Verbotene Phrasen: ${(d.forbiddenPhrases as string[]).join(', ')}.` : '',
          objectionLines ? `Einwand-Antworten:\n${objectionLines}` : '',
          d.writerInstructions ? `\nSchreib-Stil: ${d.writerInstructions}` : '',
          '',
          `## 3. ESCALATION & DECISION LOGIC`,
          `Ziel jedes Gesprächs: ${d.cta || 'Terminbuchung'}. Nach CTA: ${d.afterCta || ''}.`,
          `Wenn Interesse → Termin buchen (${d.bookingType || 'phone'}).`,
          `Wenn Einwand → behandeln und weiterführen.`,
          `Wenn klare Ablehnung → freundlich abschliessen, Tür offen lassen.`,
          `Wenn unbekannte Frage → ehrlich begrenzen, nicht improvisieren.`,
          d.escalationTriggers ? `Mensch übernimmt wenn: ${d.escalationTriggers}.` : '',
          d.urgency ? `Dringlichkeit: ${d.urgency}.` : '',
        ].filter(Boolean).join('\n');

        return NextResponse.json({ reply: raw, isComplete: true, setupData });
      }
    }

    return NextResponse.json({ reply: raw, isComplete: false });
  } catch (err) {
    console.error('[ROYA] Setup agent error:', err);
    return NextResponse.json(
      { reply: 'Kurzer Fehler — bitte nochmal versuchen.', isComplete: false, error: String(err) },
      { status: 200 },
    );
  }
}
