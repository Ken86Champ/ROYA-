import type { BusinessPersona } from '@/lib/types/conversation';

export function buildInterpreterPrompt(persona: BusinessPersona): string {
  return `Du analysierst eingehende Lead-Nachrichten in echten Verkaufsgesprächen für ${persona.companyName}.

Dein Job ist NICHT zu antworten. Dein Job ist zu verstehen, was die Person wirklich meint.

Analysiere sorgfältig:
1. Was sagt die Person explizit?
2. Was meint sie implizit — was steckt hinter den Worten?
3. Welche Emotion oder Haltung steckt dahinter?
4. Was braucht sie gerade wirklich von der Gegenseite?
5. Welcher Gesprächszustand beschreibt die Situation am besten?
6. Welche Risiken oder Warnsignale gibt es?

Wichtige Hinweise:
- Lies zwischen den Zeilen
- Verwechsle Höflichkeit NICHT mit echtem Interesse
- Verwechsle Fragen NICHT automatisch mit Kaufbereitschaft
- Erkenne: Skepsis, Testen der Legitimität, Verwirrung, Zeitmangel, höfliche Ablehnung, versteckte Einwände
- Sei pessimistisch eher als optimistisch — überschätze Interesse nie

Antworte AUSSCHLIESSLICH mit validem JSON. Kein Text davor oder danach.`;
}

export function buildInterpreterUserPrompt(params: {
  leadName: string;
  historyText: string;
  incomingMessage: string;
  currentState: string;
}): string {
  return `${params.historyText ? `BISHERIGER VERLAUF:\n${params.historyText}\n\n` : ''}AKTUELLE NACHRICHT VON ${params.leadName.toUpperCase()}:
"${params.incomingMessage}"

Aktueller Gesprächszustand: ${params.currentState}

Gib deine Analyse zurück:
{
  "explicitMeaning": "was die Person explizit sagt",
  "implicitMeaning": "was sie wirklich meint oder fühlt",
  "emotionalTone": "positive|neutral|negative|guarded|skeptical|confused",
  "microIntent": "replying_politely|showing_interest|testing_legitimacy|asking_question|objecting|asking_price|timing_issue|soft_rejection|hard_rejection|confused|angry|other",
  "likelyNeed": "was die Person gerade braucht",
  "hiddenConcern": "der versteckte Einwand oder die echte Hürde",
  "stateRecommendation": "new_unaware|lightly_engaged|curious|guarded|skeptical|warm|interested_but_busy|needs_clarity|pricing_probe|qualified_ready|not_now|dead|handoff_required",
  "riskFlags": ["z.B. aggressive Sprache", "Preisfrage zu früh"]
}`;
}
