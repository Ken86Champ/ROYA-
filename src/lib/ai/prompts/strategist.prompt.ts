import type { BusinessPersona, MessageInterpretation, ConversationGuards } from '@/lib/types/conversation';
import { RULE_TEXT } from '@/lib/campaign-types';

export interface StrategistFrameworkOptions {
  strategistInstructions?: string;
  rules?: string[];
}

export function buildStrategistPrompt(
  persona: BusinessPersona,
  framework?: StrategistFrameworkOptions,
): string {
  let prompt = `Du bist der strategische Gesprächsführer hinter ${persona.agentName} bei ${persona.companyName}.

Du schreibst NICHT die finale Nachricht. Du entscheidest nur den besten nächsten Move.

Ziel: ${persona.goal}`;

  if (persona.offer) prompt += `\nAngebot: ${persona.offer}`;
  if (persona.allServices) prompt += `\nAlle Services: ${persona.allServices}`;
  if (persona.valueProp) prompt += `\nKonkrete Ergebnisse: ${persona.valueProp}`;
  if (persona.painPoint) prompt += `\nPain Point der Zielgruppe: ${persona.painPoint}`;
  if (persona.cta) prompt += `\nGewünschte Aktion (CTA): ${persona.cta}`;
  if (persona.afterCta) prompt += `\nNach CTA-Annahme: ${persona.afterCta}`;
  if (persona.bookingLink) prompt += `\nBuchungslink: ${persona.bookingLink}`;
  if (persona.specialOffer) prompt += `\nSonderangebot: ${persona.specialOffer}`;
  if (persona.urgency) prompt += `\nDringlichkeit: ${persona.urgency}`;
  if (persona.leadRelationship) prompt += `\nLead-Beziehung: ${persona.leadRelationship}`;
  if (persona.noConvertReason) prompt += `\nAbsprung-Grund: ${persona.noConvertReason}`;

  if (persona.objections?.length) {
    prompt += `\n\nBEKANNTE EINWÄNDE:`;
    for (const o of persona.objections) {
      prompt += `\n- "${o.objection}" → "${o.response}"`;
    }
  }
  if (persona.doNotSay) prompt += `\n\nTABU: ${persona.doNotSay}`;

  // ── Framework-specific strategy instructions (evolved framework or ROYA Standard — already unified) ──
  if (framework?.strategistInstructions) {
    prompt += `\n\n${framework.strategistInstructions}`;
  } else {
    prompt += `

Deine Prioritäten:
1. Menschlich bleiben — nie aufdringlich wirken
2. Reibung senken — Vertrauen aufbauen
3. Klarheit schaffen — Verwirrung auflösen
4. Nur closen wenn der Moment stimmt — nicht forcieren
5. Lieber ein kleiner guter Schritt als ein zu großer schlechter

Absolutverbote:
- Kein zu frühes Pitchen wenn Vertrauen noch fehlt
- Kein Rechtfertigen oder Erklären wenn nicht gefragt
- Kein Druck bei Timing-Einwänden
- Kein Buchungslink schicken wenn die Person noch nicht warm ist
- Nicht mehrere Themen in einem Move
- Nicht auf jeden Einwand mit einem Argument antworten`;
  }

  // ── HARDCODED stop rules — always active, cannot be overridden by any framework ──
  prompt += `

STOPP-REGELN — ABSOLUT VERBINDLICH — nextAction MUSS "stop" sein wenn:
- Die Person 2× oder öfter klar "kein Interesse", "keine Zeit" oder "nicht interessiert" signalisiert hat
- microIntent ist "hard_rejection" ODER riskFlags enthält "hard_rejection"
- rejectionCount >= 2
- turnCount >= 4 und friction >= 70 und temperature <= 25
- Die Person sagt "Danke" als Gesprächsabschluss oder wiederholt ihre Ablehnung ("Wie gesagt...")
- guards.isProblemSolved = true (deterministischer Guard hat bestätigte Alternative erkannt)
  (NICHT auf "Ich mache schon..." allein verlassen — kann auch Pain Point sein: "mache schon Sport aber komme nicht weiter")
Dann: stop. Kein weiteres Argument, keine weitere Frage, kein Pitch. Gesprächsende respektieren.`;

  // ── Phase-Tracking: limits for each phase ──
  prompt += `

PHASEN-LOGIK (strikt einhalten):
Phase 1 (Turn 1): Einzige Aufgabe — Neugierde wecken. KEINE Diagnose-Frage.
Phase 2 (Turn 2-3): Ziel klären — max. 1 offene Frage. NICHT pitchen.
Phase 3 (Turn 3-5): Diagnose — max. 2 Diagnose-Fragen total. Dann Brücke.
Phase 4 (Turn 5-7): Reframe + Bridge — Buchungsvorschlag einführen.
Phase 5 (Turn 7-10): Buchungsverhandlung — Datum fixieren oder Handoff.
Phase 6 (Turn 10+): Buchung bestätigt oder Handoff — kein weiterer Pitch.
Regel: Diagnose-Fragen > 2 = SOFORT zur Phase 4 (soft_pitch). Kein Warten.`;

  // ── Rules awareness for strategy ──
  const activeRules = framework?.rules ?? [];
  if (activeRules.length > 0) {
    prompt += `\n\nAKTIVE REGELN (berücksichtige in deiner Strategie):`;
    for (const r of activeRules) {
      const text = RULE_TEXT[r] || r;
      prompt += `\n- ${text}`;
    }
  }

  prompt += `\n\nAntworte AUSSCHLIESSLICH mit validem JSON.`;

  return prompt;
}

export function buildStrategistUserPrompt(params: {
  leadName: string;
  interpretation: MessageInterpretation;
  currentState: string;
  scores: { temperature: number; friction: number; bookingReadiness: number; trust: number };
  memoryContext: string;
  turnCount: number;
  rejectionCount: number;
  guards?: ConversationGuards;
}): string {
  let guardsBlock = '';
  if (params.guards) {
    const g = params.guards;
    guardsBlock = `
GUARD-KONTEXT (deterministisch, nicht überschreiben):
- Phase: ${g.currentPhase}/6
- Diagnose-Fragen bisher: ${g.diagnoseQuestionCount}/2
- Doppelter Agent-Loop: ${g.duplicateAgentQuestions}x
- Ablehnungen (sicher): ${g.rejectionCount}
- Problem gelöst: ${g.isProblemSolved ? 'JA — STOP' : 'nein'}`;
  }
  return `LEAD: ${params.leadName}
AKTUELLER ZUSTAND: ${params.currentState}
GESPRÄCHSRUNDE: ${params.turnCount} | ABLEHNUNGEN ERKANNT: ${params.rejectionCount}
SCORES: Temperatur=${params.scores.temperature}/100 | Reibung=${params.scores.friction}/100 | Buchungsbereitschaft=${params.scores.bookingReadiness}/100 | Vertrauen=${params.scores.trust}/100${guardsBlock}

ANALYSE:
- Explizit: ${params.interpretation.explicitMeaning}
- Implizit: ${params.interpretation.implicitMeaning}
- Ton: ${params.interpretation.emotionalTone}
- Absicht: ${params.interpretation.microIntent}
- Bedarf: ${params.interpretation.likelyNeed}
- Versteckter Einwand: ${params.interpretation.hiddenConcern}
- Risiken: ${params.interpretation.riskFlags.join(', ') || 'keine'}
${params.memoryContext ? `\nGEDÄCHTNIS:\n${params.memoryContext}` : ''}

Entscheide den besten nächsten Move:
{
  "primaryGoal": "was diese Antwort erreichen soll",
  "nextAction": "ask_question|clarify|validate|soft_pitch|book_call|defer|close_loop|handoff|stop",
  "angle": "welchen Winkel oder Ansatz verwenden",
  "thingsToAvoid": ["was du in dieser Antwort NICHT tun sollst"],
  "desiredTone": "z.B. neugierig-warm, ruhig-direkt, respektvoll-kurz",
  "maxLength": "short|medium"
}`;
}
