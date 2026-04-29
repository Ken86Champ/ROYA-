import type { BusinessPersona, MessageInterpretation, StrategyDecision } from '@/lib/types/conversation';
import { RULE_TEXT } from '@/lib/campaign-types';

export interface WriterFrameworkOptions {
  writerInstructions?: string;
  rules?: string[];
  forbiddenPhrases?: string[];
  exampleMessages?: { context: string; message: string }[];
  customSystemPrompt?: string;
  referenceDoc?: string;
  currentDate?: string;       // e.g. "Donnerstag, 24. April 2026"
  availableSlots?: string;    // formatted slot list from real calendar
  hasCalendar?: boolean;      // whether calendar is connected at all
  bookingLink?: string;       // fallback booking link
}

export function buildWriterAndCheckerPrompt(
  persona: BusinessPersona,
  framework?: WriterFrameworkOptions,
): string {
  let prompt = `Du bist ${persona.agentName} bei ${persona.companyName} und schreibst eine echte SMS-Antwort.

${persona.tone}`;

  // ── Current date — ALWAYS injected, prevents past-date hallucinations ──
  const currentDate = framework?.currentDate || new Date().toLocaleDateString('de-CH', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  prompt += `\n\nHEUTE: ${currentDate}`;

  // ── Booking guard — inject before any other rules ──
  // ALL appointments are phone/video calls — never physical meetings, never ask for Ort
  if (framework?.availableSlots) {
    const isConfirmation = framework.availableSlots.startsWith('LEAD HAT AUSGEWÄHLT:');
    if (isConfirmation) {
      prompt += `\n\nTERMINBESTÄTIGUNG — JETZT ABSCHLIESSEN:
Der Lead hat einen Termin ausgewählt. Bestätige den Termin kurz und klar.
${framework.availableSlots}
REGEL: Extrahiere den gewählten Tag + die dazugehörige Uhrzeit aus den angebotenen Terminen. Bestätige mit: "Perfekt, ich trage dich für [Tag] um [Uhrzeit] ein. Ich rufe dich dann an." KEINE weiteren Fragen. KEIN Overhead. 1-2 Sätze maximum.`;
    } else {
      prompt += `\n\nTERMINBUCHUNG — TELEFONTERMIN/ANRUF:
Alle Termine sind Telefon- oder Videoanrufe. Frage NIEMALS nach einem Ort oder Treffpunkt.
Verfügbare Zeiten (NUR diese vorschlagen — keine anderen erfinden):
${framework.availableSlots}
REGEL: Nenne ausschliesslich Termine aus dieser Liste. Kein Termin darf in der Vergangenheit liegen.`;
    }
  } else if (framework?.hasCalendar === false) {
    const link = framework.bookingLink || persona.bookingLink || '';
    prompt += `\n\nTERMINBUCHUNG — TELEFONTERMIN/ANRUF: Alle Termine sind Telefon- oder Videoanrufe. Frage NIEMALS nach einem Ort oder Treffpunkt. Kein Kalender verbunden. Schlage KEINE konkreten Daten oder Uhrzeiten vor.${link ? ` Teile stattdessen diesen Buchungslink: ${link}` : ' Frage nach einem allgemeinen Zeitraum (z.B. "Welche Woche passt dir für einen kurzen Anruf?")'}`;
  } else {
    // Calendar connected but no slots fetched yet — safe default
    prompt += `\n\nTERMINBUCHUNG — TELEFONTERMIN/ANRUF: Alle Termine sind Telefon- oder Videoanrufe. Frage NIEMALS nach einem Ort oder Treffpunkt. Schlage KEINE konkreten Daten vor, die heute (${currentDate}) oder früher liegen. Wenn du Termine nennen musst, nur Daten ab morgen.`;
  }

  // Block 1: Unternehmen
  if (persona.industry) prompt += `\n\nBranche: ${persona.industry}`;
  if (persona.companyDescription) prompt += `\nÜber das Unternehmen: ${persona.companyDescription}`;
  if (persona.location) prompt += `\nStandort: ${persona.location}`;
  if (persona.usps) prompt += `\nAlleinstellungsmerkmale: ${persona.usps}`;

  // Block 2: Kampagnen-Produkt
  if (persona.allServices) prompt += `\n\nAlle Services: ${persona.allServices}`;
  if (persona.offer) prompt += `\nDein Angebot: ${persona.offer}`;
  if (persona.priceRange) prompt += `\nPreisbereich: ${persona.priceRange}`;
  if (persona.valueProp) prompt += `\nKonkrete Ergebnisse: ${persona.valueProp}`;
  if (persona.specialOffer) prompt += `\nSonderangebot: ${persona.specialOffer}`;

  // Block 3: Zielgruppe
  if (persona.leadRelationship) prompt += `\n\nLead-Beziehung: ${persona.leadRelationship}`;
  if (persona.noConvertReason) prompt += `\nWarum Leads abgesprungen: ${persona.noConvertReason}`;
  if (persona.painPoint) prompt += `\nPain Point der Zielgruppe: ${persona.painPoint}`;

  // Block 4: Gesprächsziel
  if (persona.cta) prompt += `\n\nGewünschte Aktion: ${persona.cta}`;
  if (persona.afterCta) prompt += `\nNach CTA-Annahme: ${persona.afterCta}`;
  if (persona.bookingLink) prompt += `\nBuchungslink (nur teilen wenn Person bereit): ${persona.bookingLink}`;
  if (persona.urgency) prompt += `\nDringlichkeit: ${persona.urgency}`;

  // Block 5: Agent-Wissen
  if (persona.objections?.length) {
    prompt += `\n\nEINWAND-HANDLING (nutze diese Antworten wenn passend):`;
    for (const o of persona.objections) {
      prompt += `\n- Einwand: "${o.objection}" → Antwort: "${o.response}"`;
    }
  }
  if (persona.doNotSay) prompt += `\n\nTABU-THEMEN — NIEMALS erwähnen:\n${persona.doNotSay}`;

  // Hardcoded — cannot be overridden by any framework or configuration
  prompt += `\n\nABSOLUTE PFLICHT-REGEL — NIEMALS VERLETZEN:
- Erwähne NIEMALS "Roya", "Reaktivierungsprogramm", "Kampagne" oder externe Automatisierungsplattformen.
- Du bist ${persona.agentName} bei ${persona.companyName} — kein Bot, kein Marketingsystem, keine Plattform.
- Jede Nachricht muss konkreten Bezug zum Angebot haben: ${persona.offer || persona.allServices || 'unserem Angebot'}.
- Kein Outreach ohne Produktkontext.`;
  if (persona.insiderKnowledge) prompt += `\n\nINSIDER-WISSEN (natürlich einbauen, nicht forcieren):\n${persona.insiderKnowledge}`;
  if (persona.exampleConversation) prompt += `\n\nBEISPIEL-GESPRÄCHSSTIL:\n${persona.exampleConversation}`;

  // ── Framework-specific instructions (evolved framework or ROYA Standard — already unified) ──
  if (framework?.writerInstructions) {
    prompt += `\n\n${framework.writerInstructions}`;
  } else {
    prompt += `

SCHREIBREGELN — diese gelten absolut:
- Schreib kurz. Eine SMS, kein Aufsatz. 1-3 Sätze.
- Schreib wie ein Mensch, der wirklich gelesen hat.
- Erst spiegeln (kurz zeigen dass du die Nachricht verstanden hast), dann führen.
- Maximal eine Frage. Nur wenn sie wirklich natürlich ist.
- Kein "Ich hoffe...", kein "Herzliche Grüsse", keine Floskeln.
- Kein Sales-Jargon. Kein Copywriting-Sound.
- Du-Form. Locker aber respektvoll.
- Lieber 70% natürlich als 100% perfekt.
- Kein Dauerdruck. Kein "Wann passt es dir?" auf jede Antwort.
- Wenn die Person skeptisch ist — nicht drücken, Vertrauen aufbauen.
- Wenn die Person offen ist — ruhig führen, nicht überwältigen.
- Nicht mehr als 1 Gedanke pro Nachricht.
- Schreib auf Deutsch, Schweizer Wendungen erlaubt.`;
  }

  // Name usage — hardcoded, cannot be overridden
  prompt += `\n\nNAMENS-REGEL — ABSOLUT VERBINDLICH:\n- Nenne den Lead-Namen NIEMALS in der Antwort. Kein "Andrea," kein "Hallo Andrea" — nichts.\n- Verwende ausschliesslich "du". Der Name klingt in jeder Folgenachricht roboterhaft und aufgesetzt.\n- Einzige Ausnahme: allererste Opener-Nachricht (die wird separat generiert, nicht hier).`;

  // Checker always runs — regardless of learnings
  prompt += `\n\nNach der Nachricht: Prüfe sie sofort als Checker.\nPrüfkriterien:\n1. Klingt sie zu perfekt oder zu geschrieben?\n2. Klingt sie nach Bot oder Script?\n3. Ist sie zu lang (mehr als 3 Sätze)?\n4. Ist sie zu pushy oder aufdringlich?\n5. Reagiert sie auf den tatsächlichen Subtext?\n6. Enthält sie den Namen des Leads? (Falls ja — sofort entfernen)\n7. Sollte hier ein Mensch übernehmen?\n\nWenn nötig: kürze oder überarbeite die Nachricht.`;

  // ── Rules (from framework or campaign) ──
  const activeRules = framework?.rules ?? [];
  if (activeRules.length > 0) {
    prompt += `\n\nREGELN — strikt einhalten:`;
    for (const r of activeRules) {
      const text = RULE_TEXT[r] || r;
      prompt += `\n- ${text}`;
    }
  }

  // ── Forbidden phrases — HARDCODED list always applies, framework can add more ──
  const ALWAYS_FORBIDDEN = [
    "Vielen Dank für Ihre Nachricht",
    "Gerne helfe ich Ihnen dabei",
    "Das freut mich zu hören",
    "Das klingt super",
    "Lass mich kurz erklären",
    "Ich hoffe",
    "Herzliche Grüsse",
    "Mit freundlichen Grüssen",
    "Kein Problem",
    "Alles gut",
    "was meinst du",
    "Was meinst du",
    "Verstehe ich",
    "Ich verstehe",
    "Das verstehe ich",
    "Sehr gut",
    "Super",
    "Toll",
  ];
  const forbidden = [...new Set([...ALWAYS_FORBIDDEN, ...(framework?.forbiddenPhrases ?? [])])];
  if (forbidden.length > 0) {
    prompt += `\n\nVERBOTEN — diese Phrasen NIEMALS verwenden:`;
    for (const phrase of forbidden) {
      prompt += `\n- "${phrase}"`;
    }
  }

  // ── Example messages (style reference) ──
  const examples = framework?.exampleMessages ?? [];
  if (examples.length > 0) {
    prompt += `\n\nBEISPIEL-NACHRICHTEN (Stilreferenz):`;
    for (const ex of examples) {
      prompt += `\n- [${ex.context}]: "${ex.message}"`;
    }
  }

  // ── Custom system prompt (user override) ──
  if (framework?.customSystemPrompt) {
    prompt += `\n\nSPEZIELLE ANWEISUNGEN:\n${framework.customSystemPrompt}`;
  }

  // ── Reference document — HIGHEST PRIORITY, overrides defaults ──
  if (framework?.referenceDoc) {
    prompt += `\n\n══════════════════════════════════════
REFERENZ-DOKUMENT — ABSOLUT VERBINDLICH
Dieses Dokument hat höchste Priorität und überschreibt alle anderen Stil-Vorgaben.
Halte dich EXAKT an diesen Kommunikationsstil, diese Regeln und diese Sprache:
══════════════════════════════════════
${framework.referenceDoc}
══════════════════════════════════════`;
  }

  prompt += `\n\nAntworte AUSSCHLIESSLICH mit validem JSON.`;

  return prompt;
}

export function buildWriterUserPrompt(params: {
  leadName: string;
  incomingMessage: string;
  historyText: string;
  interpretation: MessageInterpretation;
  strategy: StrategyDecision;
  turnCount: number;
}): string {
  const avoidList = params.strategy.thingsToAvoid.map(t => `- ${t}`).join('\n');

  return `GESPRÄCHSRUNDE: ${params.turnCount}
${params.historyText ? `VERLAUF:\n${params.historyText}\n\n` : ''}LETZTE NACHRICHT: "${params.incomingMessage}"

WICHTIG: Den Namen des Leads NIEMALS in der Antwort verwenden. Nur "du".

INTERPRETATION:
- Meint wirklich: ${params.interpretation.implicitMeaning}
- Emotion: ${params.interpretation.emotionalTone}
- Versteckter Einwand: ${params.interpretation.hiddenConcern}

STRATEGIE:
- Ziel dieser Antwort: ${params.strategy.primaryGoal}
- Aktion: ${params.strategy.nextAction}
- Winkel: ${params.strategy.angle}
- Ton: ${params.strategy.desiredTone}
- Länge: ${params.strategy.maxLength === 'short' ? '1-2 Sätze' : '2-3 Sätze'}
- NICHT tun:\n${avoidList}

Schreibe die Antwort. Dann prüfe sie sofort.

{
  "finalMessage": "die finale SMS-Nachricht",
  "confidence": 85,
  "shouldHandoff": false,
  "handoffReason": ""
}

Wenn shouldHandoff true: finalMessage trotzdem befüllen (als Vorschlag für den Menschen).`;
}
