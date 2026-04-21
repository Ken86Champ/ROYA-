import type { BusinessPersona, MessageInterpretation } from '@/lib/types/conversation';
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
}): string {
  return `LEAD: ${params.leadName}
AKTUELLER ZUSTAND: ${params.currentState}
SCORES: Temperatur=${params.scores.temperature}/100 | Reibung=${params.scores.friction}/100 | Buchungsbereitschaft=${params.scores.bookingReadiness}/100 | Vertrauen=${params.scores.trust}/100

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
