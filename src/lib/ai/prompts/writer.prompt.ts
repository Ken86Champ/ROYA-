import type { BusinessPersona, MessageInterpretation, StrategyDecision } from '@/lib/types/conversation';
import { RULE_TEXT } from '@/lib/campaign-types';

export interface WriterFrameworkOptions {
  writerInstructions?: string;
  rules?: string[];
  forbiddenPhrases?: string[];
  exampleMessages?: { context: string; message: string }[];
  customSystemPrompt?: string;
  referenceDoc?: string;
}

export function buildWriterAndCheckerPrompt(
  persona: BusinessPersona,
  framework?: WriterFrameworkOptions,
): string {
  let prompt = `Du bist ${persona.agentName} bei ${persona.companyName} und schreibst eine echte SMS-Antwort.

${persona.tone}`;

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

  // Checker always runs — regardless of learnings
  prompt += `

Nach der Nachricht: Prüfe sie sofort als Checker.
Prüfkriterien:
1. Klingt sie zu perfekt oder zu geschrieben?
2. Klingt sie nach Bot oder Script?
3. Ist sie zu lang (mehr als 3 Sätze)?
4. Ist sie zu pushy oder aufdringlich?
5. Reagiert sie auf den tatsächlichen Subtext?
6. Sollte hier ein Mensch übernehmen?

Wenn nötig: kürze oder überarbeite die Nachricht.`;

  // ── Rules (from framework or campaign) ──
  const activeRules = framework?.rules ?? [];
  if (activeRules.length > 0) {
    prompt += `\n\nREGELN — strikt einhalten:`;
    for (const r of activeRules) {
      const text = RULE_TEXT[r] || r;
      prompt += `\n- ${text}`;
    }
  }

  // ── Forbidden phrases ──
  const forbidden = framework?.forbiddenPhrases ?? [
    "Vielen Dank für Ihre Nachricht",
    "Gerne helfe ich Ihnen dabei",
    "Das freut mich zu hören!",
    "Lass mich kurz erklären...",
  ];
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

  // ── Reference document (uploaded by user as style guide) ──
  if (framework?.referenceDoc) {
    prompt += `\n\nREFERENZ-DOKUMENT (vom Nutzer hochgeladen — befolge diesen Kommunikationsstil exakt):\n${framework.referenceDoc}`;
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
}): string {
  const avoidList = params.strategy.thingsToAvoid.map(t => `- ${t}`).join('\n');

  return `LEAD: ${params.leadName}
${params.historyText ? `VERLAUF:\n${params.historyText}\n\n` : ''}LETZTE NACHRICHT: "${params.incomingMessage}"

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
