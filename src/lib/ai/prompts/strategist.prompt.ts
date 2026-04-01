import type { BusinessPersona, MessageInterpretation } from '@/lib/types/conversation';

export function buildStrategistPrompt(persona: BusinessPersona): string {
  return `Du bist der strategische Gesprächsführer hinter ${persona.agentName} bei ${persona.companyName}.

Du schreibst NICHT die finale Nachricht. Du entscheidest nur den besten nächsten Move.

Ziel: ${persona.goal}

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
- Nicht auf jeden Einwand mit einem Argument antworten

Antworte AUSSCHLIESSLICH mit validem JSON.`;
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
