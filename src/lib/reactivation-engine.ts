// ─────────────────────────────────────────────────────────────────────────────
// ROYA – Conversation-Based Lead Reactivation Engine
// Single source of truth used by both Production Flow and Test Agent Flow
// ─────────────────────────────────────────────────────────────────────────────

// ─── TYPES ───────────────────────────────────────────────────────────────────

export type Channel = "email" | "sms" | "whatsapp";
export type Segment = "hot" | "warm" | "cold" | "dormant" | "invalid";
export type ConversationState =
  | "initial"
  | "awaiting_response"
  | "interested"
  | "neutral"
  | "already_solved"
  | "not_interested"
  | "no_response"
  | "booking"
  | "booked"
  | "closed";
export type ResponseType =
  | "interested"
  | "neutral"
  | "already_solved"
  | "not_interested"
  | "no_response";

export interface BusinessContext {
  agentName: string;
  companyName: string;
  product: string;
  targetMarket: string;
  valueProp: string;
  painPoint: string;
  noConvertReason: string;
  ctaGoal: string;
  bookingLink: string;
  leadType?: "b2b" | "b2c";   // b2c = emotion/identity/convenience, shorter messages, shame-removal tone
  industry?: string;           // e.g. "Fitness", "Dental", "Coaching" — personalises B2C copy
}

export const DEFAULT_CONTEXT: BusinessContext = {
  agentName: "Sarah",
  companyName: "ROYA",
  product: "Revenue Reactivation System",
  targetMarket: "B2B KMU im DACH-Raum",
  valueProp:
    "3× mehr gebuchte Termine durch hyper-personalisierte, KI-gestützte Lead-Reaktivierung ohne manuellen Aufwand",
  painPoint: "manuelle Follow-ups und verlorene Pipeline-Leads",
  noConvertReason: "Timing, Budget oder interner Entscheidungsprozess",
  ctaGoal: "20-minütiges Demo-Gespräch buchen",
  bookingLink: "https://cal.com/roya/demo",
  leadType: "b2b",
};

export interface LeadProfile {
  id: number;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  company: string;
  jobTitle: string;
  industry: string;
  city: string;
  lastContact: string;
  daysSinceContact: number | null;
  dealValue: number;
  notes: string;
  // Inferred
  isDecisionMaker: boolean;
  pastInterest: string;
  dropOffReason: string;
  currentSituation: string;
  confidence: "high" | "medium" | "low";
  segment: Segment;
  score: number;
  signals: string[];
  hypothesis: string;
}

export interface MessageVariation {
  id: string;
  label: string;
  subject?: string;
  body: string;
  tone: string;
  score: number;
  reasoning: string;
}

export interface AgentThinkingStep {
  phase: string;
  content: string;
  highlight?: boolean;
}

// ─── METADATA ────────────────────────────────────────────────────────────────

export const SEGMENT_META = {
  hot:     { label: "Hot",     color: "text-red-600",    bg: "bg-red-50",    border: "border-red-200",    dot: "bg-red-500",    desc: "Hohe Kaufabsicht" },
  warm:    { label: "Warm",    color: "text-orange-600", bg: "bg-orange-50", border: "border-orange-200", dot: "bg-orange-500", desc: "Reaktivierbar" },
  cold:    { label: "Cold",    color: "text-blue-600",   bg: "bg-blue-50",   border: "border-blue-200",   dot: "bg-blue-500",   desc: "Kaum Signale" },
  dormant: { label: "Dormant", color: "text-slate-500",  bg: "bg-slate-50",  border: "border-slate-200",  dot: "bg-slate-400",  desc: "Lange inaktiv" },
  invalid: { label: "Invalid", color: "text-red-400",    bg: "bg-red-50",    border: "border-red-100",    dot: "bg-red-300",    desc: "Datenproblem" },
} as const;

export const STATE_META: Record<ConversationState, { label: string; color: string; bg: string; border: string; icon: string }> = {
  initial:           { label: "Analyse",             color: "text-violet-600",  bg: "bg-violet-50",  border: "border-violet-200",  icon: "◎" },
  awaiting_response: { label: "Warte auf Antwort",   color: "text-amber-600",   bg: "bg-amber-50",   border: "border-amber-200",   icon: "◌" },
  interested:        { label: "Interessiert",         color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200", icon: "✓" },
  neutral:           { label: "Neutral / Unsicher",   color: "text-slate-600",   bg: "bg-slate-100",  border: "border-slate-200",   icon: "◐" },
  already_solved:    { label: "Bereits gelöst",       color: "text-cyan-600",    bg: "bg-cyan-50",    border: "border-cyan-200",    icon: "◈" },
  not_interested:    { label: "Kein Interesse",       color: "text-red-600",     bg: "bg-red-50",     border: "border-red-200",     icon: "✗" },
  no_response:       { label: "Keine Antwort",        color: "text-slate-400",   bg: "bg-slate-50",   border: "border-slate-200",   icon: "○" },
  booking:           { label: "Terminbuchung",        color: "text-violet-600",  bg: "bg-violet-50",  border: "border-violet-200",  icon: "◇" },
  booked:            { label: "Termin gebucht",       color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-300", icon: "★" },
  closed:            { label: "Abgeschlossen",        color: "text-slate-500",   bg: "bg-slate-100",  border: "border-slate-200",   icon: "◉" },
};

export const RESPONSE_LABELS: Record<ResponseType, { label: string; color: string; bg: string; border: string; example: string }> = {
  interested:     { label: "Interessiert",     color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", example: "Ja, das ist noch relevant. Was bieten Sie genau an?" },
  neutral:        { label: "Neutral / Unsicher", color: "text-amber-700",   bg: "bg-amber-50",   border: "border-amber-200",   example: "Hm, schwer zu sagen – was genau meinen Sie?" },
  already_solved: { label: "Bereits gelöst",   color: "text-cyan-700",    bg: "bg-cyan-50",    border: "border-cyan-200",    example: "Wir haben inzwischen eine andere Lösung gefunden." },
  not_interested: { label: "Kein Interesse",   color: "text-red-700",     bg: "bg-red-50",     border: "border-red-200",     example: "Nein danke, das passt aktuell nicht zu uns." },
  no_response:    { label: "Keine Antwort",    color: "text-slate-500",   bg: "bg-slate-100",  border: "border-slate-200",   example: "(Keine Rückmeldung nach 3 Tagen)" },
};

// ─── DEMO LEADS ──────────────────────────────────────────────────────────────

export const DEMO_LEADS_NORMALIZED: Record<string, string>[] = [
  {
    firstName: "Thomas", lastName: "Meier", email: "t.meier@finanz-gruppe.ch",
    phone: "+41 79 111 22 33", company: "Finanz Gruppe AG", jobTitle: "CEO",
    industry: "Finance", lastContact: "2024-06-15", dealValue: "18500", city: "Zürich",
    notes: "War sehr interessiert an der Demo, wollte aber die Jahresplanung Q1 abwarten. Gespräch sehr positiv verlaufen.",
  },
  {
    firstName: "Sandra", lastName: "Huber", email: "s.huber@immo-partners.ch",
    phone: "+41 76 444 55 66", company: "ImmoPartners GmbH", jobTitle: "CFO",
    industry: "Real Estate", lastContact: "2024-09-03", dealValue: "9200", city: "Basel",
    notes: "Hatte technische Bedenken wegen CRM-Integration. Konkurrenzprodukt erwähnt. Interesse grundsätzlich vorhanden.",
  },
  {
    firstName: "Marco", lastName: "Rossi", email: "m.rossi@tech-solutions.ch",
    phone: "+41 78 777 88 99", company: "Tech Solutions SA", jobTitle: "Head of Sales",
    industry: "Technology", lastContact: "2024-11-20", dealValue: "4500", city: "Lugano",
    notes: "Budget noch nicht freigegeben. Follow-up für Q1 2025 vereinbart. Entscheidung liegt beim CEO.",
  },
  {
    firstName: "Anna", lastName: "Schmidt", email: "a.schmidt@consulting.ch",
    phone: "+41 79 222 33 44", company: "Schmidt Consulting AG", jobTitle: "Managing Director",
    industry: "Consulting", lastContact: "2024-04-10", dealValue: "25000", city: "Bern",
    notes: "Grosses Interesse, ausführliche Demo. Interne Genehmigung noch ausstehend. Sehr gute Gespräche.",
  },
];

// ─── HELPER ───────────────────────────────────────────────────────────────────

function timeSince(days: number | null): string {
  if (days === null) return "einiger Zeit";
  if (days < 14) return "kürzlich";
  if (days < 60) return `${Math.round(days / 7)} Wochen`;
  if (days < 365) return `${Math.round(days / 30)} Monaten`;
  return `über ${Math.round(days / 365)} Jahr${days > 730 ? "en" : ""}`;
}

// ─── PROFILE BUILDER ─────────────────────────────────────────────────────────

export function buildLeadProfile(
  normalized: Record<string, string>,
  id: number,
  context: BusinessContext
): LeadProfile {
  const firstName = normalized.firstName || normalized.fullName?.split(" ")[0] || "";
  const lastName  = normalized.lastName  || normalized.fullName?.split(" ").slice(1).join(" ") || "";
  const fullName  = normalized.fullName  || `${firstName} ${lastName}`.trim() || "Unbekannt";
  const company   = normalized.company   || "";
  const jobTitle  = normalized.jobTitle  || "";
  const email     = normalized.email     || "";
  const phone     = normalized.phone     || "";
  const industry  = normalized.industry  || "";
  const city      = normalized.city      || "";
  const lastContact = normalized.lastContact || "";
  const dealValue = parseFloat((normalized.dealValue || "0").replace(/[^0-9.]/g, "")) || 0;
  const notes     = normalized.notes     || "";

  let daysSinceContact: number | null = null;
  if (lastContact) {
    const d = new Date(lastContact);
    if (!isNaN(d.getTime())) daysSinceContact = Math.floor((Date.now() - d.getTime()) / 86400000);
  }

  const titleLower = jobTitle.toLowerCase();
  const isDecisionMaker = /ceo|cfo|cto|coo|vp |head |director|owner|gründer|inhaber|managing|geschäfts/.test(titleLower);

  const signals: string[] = [];
  let score = 38;

  if (!email && !phone) {
    return {
      id, firstName, lastName, fullName, email, phone, company, jobTitle,
      industry, city, lastContact, daysSinceContact, dealValue, notes,
      isDecisionMaker: false, pastInterest: "", dropOffReason: "Keine Kontaktdaten",
      currentSituation: "Unbekannt", confidence: "low", segment: "invalid",
      score: 0, signals: ["Keine Kontaktdaten"],
      hypothesis: "Lead ohne Kontaktweg — nicht reaktivierbar.",
    };
  }

  if (isDecisionMaker)           { score += 22; signals.push("Entscheidungsträger"); }
  if (company)                   { score +=  5; signals.push("Unternehmensangabe vorhanden"); }
  if (dealValue >= 20000)        { score += 25; signals.push(`Hoher Deal-Wert: CHF ${dealValue.toLocaleString()}`); }
  else if (dealValue >= 5000)    { score += 15; signals.push(`Deal-Wert: CHF ${dealValue.toLocaleString()}`); }
  else if (dealValue > 0)        { score +=  5; signals.push(`Deal-Wert: CHF ${dealValue.toLocaleString()}`); }

  const notesLower = notes.toLowerCase();
  if (/interessiert|demo|anfrage|termin|callback|gespräch/.test(notesLower)) {
    score += 15; signals.push("Explizites Interesse vermerkt");
  }
  if (/budget|freigabe|genehmigung/.test(notesLower))    { score -=  5; signals.push("Budget-Einschränkung"); }
  if (/konkurrenz|wettbewerb|alternative/.test(notesLower)) { score -= 10; signals.push("Konkurrenzprodukt erwähnt"); }
  if (/positiv|begeistert|sehr gut/.test(notesLower))    { score += 10; signals.push("Positive Gesprächsnotiz"); }

  if (daysSinceContact !== null) {
    if (daysSinceContact < 30)        { score += 15; signals.push("Kürzlich kontaktiert (< 30 Tage)"); }
    else if (daysSinceContact < 90)   { score +=  8; signals.push(`Kontakt vor ${Math.round(daysSinceContact / 7)} Wochen`); }
    else if (daysSinceContact < 180)  { score +=  2; signals.push(`Kontakt vor ${Math.round(daysSinceContact / 30)} Monaten`); }
    else if (daysSinceContact < 365)  { score -=  5; signals.push(`Kontakt vor ${Math.round(daysSinceContact / 30)} Monaten`); }
    else                              { score -= 15; signals.push(`Über ${Math.floor(daysSinceContact / 30)} Monate kein Kontakt`); }
  }

  score = Math.max(0, Math.min(100, score));

  const segment: Segment =
    score >= 72 ? "hot" :
    score >= 52 ? "warm" :
    score >= 35 ? "cold" : "dormant";

  const pastInterest =
    /demo/.test(notesLower)    ? `Demo von ${context.product}` :
    /termin/.test(notesLower)  ? "Terminvereinbarung" :
    /anfrage/.test(notesLower) ? `Anfrage zu ${context.product}` :
    context.product;

  const dropOffReason =
    /jahresplan|budget|freigabe|genehmigung/.test(notesLower) ? "Budget oder Timing-Frage" :
    /konkurrenz|alternative/.test(notesLower)                 ? "Konkurrenzprodukt evaluiert" :
    /integration|technisch/.test(notesLower)                  ? "Technische Bedenken" :
    !notes                                                     ? "Kein Follow-up durchgeführt" :
    daysSinceContact && daysSinceContact > 180                 ? "Gespräch eingeschlafen" :
    "Intern nicht entschieden";

  const currentSituation =
    daysSinceContact === null     ? "Situation unbekannt" :
    daysSinceContact < 60         ? "Könnte noch aktiv evaluieren" :
    daysSinceContact < 180        ? "Möglicherweise bereits entschieden" :
    "Situation hat sich wahrscheinlich verändert";

  const confidence: "high" | "medium" | "low" =
    notes && daysSinceContact !== null && isDecisionMaker ? "high" :
    notes || daysSinceContact !== null ? "medium" : "low";

  const hypothesis =
    dropOffReason === "Budget oder Timing-Frage"
      ? `${firstName} war grundsätzlich interessiert, aber der Zeitpunkt hat nicht gepasst. Mit neuer Jahres- oder Quartalsplanung könnte das Budget jetzt verfügbar sein.`
    : dropOffReason === "Konkurrenzprodukt evaluiert"
      ? `${firstName} hat Alternativen evaluiert. Spannend zu erfahren, ob die gewählte Lösung die Erwartungen erfüllt — oder ob Frustrationspunkte entstanden sind.`
    : dropOffReason === "Technische Bedenken"
      ? `Technische Einwände haben den Abschluss verhindert. Falls diese Punkte inzwischen adressiert wurden, könnte eine neue Perspektive den Weg freimachen.`
    : segment === "hot"
      ? `${firstName} hat starke Kaufsignale gezeigt. Höchstwahrscheinlich war der Zeitpunkt das einzige Hindernis.`
    : segment === "warm"
      ? `Grundinteresse war vorhanden. Ein konkreter, auf die aktuelle Situation zugeschnittener Mehrwert kann die Konversation reaktivieren.`
    : `Lead ist seit ${timeSince(daysSinceContact)} inaktiv. Braucht einen persönlichen Re-Engagement-Ansatz mit neuem, konkretem Nutzenversprechen.`;

  return {
    id, firstName, lastName, fullName, email, phone, company, jobTitle,
    industry, city, lastContact, daysSinceContact, dealValue, notes,
    isDecisionMaker, pastInterest, dropOffReason, currentSituation, confidence,
    segment, score, signals, hypothesis,
  };
}

// ─── INITIAL MESSAGE GENERATOR ───────────────────────────────────────────────

export function generateInitialMessages(
  p: LeadProfile,
  channel: Channel,
  ctx: BusinessContext
): MessageVariation[] {
  const since = timeSince(p.daysSinceContact);
  const co = p.company ? ` bei ${p.company}` : "";
  const role = p.jobTitle ? ` als ${p.jobTitle}` : "";
  const isB2C = ctx.leadType === "b2c";
  const industryCtx = ctx.industry ? ` (${ctx.industry})` : "";

  // ── B2C VARIANTS ─────────────────────────────────────────────────────────────
  // B2C = shorter, emotional, shame-removal tone, no company/title references
  if (isB2C) {
    if (channel === "email") {
      return [
        {
          id: "v1",
          label: "Persönlich & warmherzig",
          subject: `${p.firstName}, kurze Frage – bist du noch dabei?`,
          body: `Hallo ${p.firstName},\n\nmein Name ist ${ctx.agentName} von ${ctx.companyName}.\n\nIch melde mich, weil du dich vor ${since} für ${ctx.product}${industryCtx} interessiert hast – und ich ehrlich gesagt neugierig bin, wie es dir seither gegangen ist.\n\nHast du das Thema inzwischen in Angriff genommen – oder ist es irgendwie liegen geblieben?\n\nGanz ohne Druck – ich frage nur, weil ich weiss, wie leicht so etwas im Alltag untergeht.\n\nViele Grüsse,\n${ctx.agentName}`,
          tone: "warm, empathisch, schuldfreiend",
          score: p.segment === "hot" ? 90 : p.segment === "warm" ? 84 : 72,
          reasoning: "B2C: Kein Unternehmenskontext. Persönliche Ansprache mit Shame-Removal-Ton ('leicht liegen geblieben'). Niedrige Schwelle.",
        },
        {
          id: "v2",
          label: "Neugierig & offen",
          subject: `Hey ${p.firstName} – noch offen?`,
          body: `Hey ${p.firstName},\n\n${ctx.agentName} hier von ${ctx.companyName}.\n\nDu hattest dich vor ${since} gemeldet – ich wollte kurz nachfragen, ob das Thema noch aktuell ist. Manchmal passt der Moment einfach nicht.\n\nFalls ja: Ich bin da. Falls nein: Völlig okay, kurze Rückmeldung reicht.\n\nHerzliche Grüsse,\n${ctx.agentName}`,
          tone: "locker, respektvoll, druckfrei",
          score: p.segment === "hot" ? 83 : p.segment === "warm" ? 80 : 70,
          reasoning: "B2C: Kurz, persönlich, gibt expliziten Exit. 'Manchmal passt der Moment nicht' — nimmt Scham weg.",
        },
        {
          id: "v3",
          label: "Ergebnis-fokussiert",
          subject: `Was sich für dich verändert haben könnte, ${p.firstName}`,
          body: `Hallo ${p.firstName},\n\n${ctx.agentName} von ${ctx.companyName}.\n\nVor ${since} hattest du dich für ${ctx.product} interessiert. Seitdem haben wir vielen Menschen${industryCtx} geholfen – und ich dachte, das könnte auch für dich relevant sein.\n\nWäre ein kurzes Gespräch sinnvoll – 15 Minuten, komplett unverbindlich?\n\nFreue mich auf deine Rückmeldung,\n${ctx.agentName}`,
          tone: "ergebnisorientiert, einladend",
          score: p.segment === "hot" ? 77 : p.segment === "warm" ? 74 : 78,
          reasoning: "B2C: Social Proof durch 'vielen Menschen geholfen'. Kurzer, klarer CTA.",
        },
      ];
    }
    if (channel === "whatsapp") {
      return [
        {
          id: "v1",
          label: "Herzlich & persönlich",
          body: `Hey ${p.firstName} 👋 Hier ist ${ctx.agentName} von ${ctx.companyName}.\n\nDu hattest dich vor ${since} gemeldet – ich wollte kurz fragen, ob das Thema noch aktuell ist.\n\nKein Druck – nur kurze Rückmeldung wenn du magst 😊`,
          tone: "locker, warm, emoji sparsam",
          score: 86,
          reasoning: "B2C WhatsApp: Du-Form, emoji natürlich eingesetzt, sehr kurz, echte Frage ohne Agenda.",
        },
        {
          id: "v2",
          label: "Direkt & freundlich",
          body: `Hallo ${p.firstName}! ${ctx.agentName} hier.\n\nKurze Frage: Ist ${ctx.product}${industryCtx} für dich noch ein Thema? Manchmal geht sowas im Alltag unter – ich verstehe das 🙏\n\nEinfach kurz Ja oder Nein reicht!`,
          tone: "direkt, verständnisvoll",
          score: 80,
          reasoning: "B2C: 'Geht im Alltag unter' = Shame-Removal. Einfache binäre Frage senkt Schwelle.",
        },
      ];
    }
    // B2C SMS
    return [
      {
        id: "v1",
        label: "Kurz & persönlich",
        body: `Hallo ${p.firstName}, ${ctx.agentName} von ${ctx.companyName}. Du hattest dich vor ${since} gemeldet – ist das Thema noch aktuell? Kurze Antwort reicht 🙏`,
        tone: "kurz, persönlich, druckfrei",
        score: 78,
        reasoning: "B2C SMS: Du-Form, max. 160 Zeichen, klar und direkt.",
      },
    ];
  }

  // ── B2B VARIANTS (default) ────────────────────────────────────────────────────
  if (channel === "email") {
    return [
      {
        id: "v1",
        label: "Direkt & persönlich",
        subject: `Kurze Frage, ${p.firstName} – ist ${ctx.product} noch relevant?`,
        body: `Guten Tag ${p.firstName},\n\nmein Name ist ${ctx.agentName} – ich melde mich von ${ctx.companyName}.\n\nIch bin gerade durch unsere alten Anfragen gegangen und dabei auf Ihren Kontakt gestossen. Sie hatten sich vor ${since}${co} für ${p.pastInterest} interessiert.\n\nDarf ich direkt fragen: Haben Sie in der Zwischenzeit eine Lösung für ${ctx.painPoint} gefunden – oder ist das noch ein offenes Thema bei Ihnen?\n\nKein Pitch, keine Agenda – nur eine ehrliche Frage.\n\nHerzliche Grüsse,\n${ctx.agentName}\n${ctx.companyName}`,
        tone: "direkt, persönlich, keine Agenda",
        score: p.segment === "hot" ? 88 : p.segment === "warm" ? 81 : 70,
        reasoning: `Direkte Ansprache mit persönlicher Referenz auf den alten Kontakt. Niedrige Schwelle durch offene Frage ohne Verkaufsdruck. Funktioniert besonders gut bei ${SEGMENT_META[p.segment].label}-Leads.`,
      },
      {
        id: "v2",
        label: "Kontextuell & empathisch",
        subject: `${p.firstName}, kurze Folgefrage – hat sich die Situation verändert?`,
        body: `Hallo ${p.firstName},\n\nhier ist ${ctx.agentName} von ${ctx.companyName}.\n\nIch melde mich, weil ich an einer ähnlichen Situation wie Ihrer${co} gearbeitet habe – und dabei an unsere Unterhaltung von vor ${since} gedacht habe.\n\nDamals war ${p.dropOffReason} der Grund, warum wir nicht weitergemacht haben. Das verstehe ich völlig.\n\nIch frage mich nur: Hat sich die Lage inzwischen verändert? Wäre es sinnvoll, kurz anzuknüpfen?\n\nEine kurze Rückmeldung – auch «nicht relevant» – wäre super.\n\nViele Grüsse,\n${ctx.agentName}`,
        tone: "empathisch, verständnisvoll, keine Erwartung",
        score: p.segment === "hot" ? 82 : p.segment === "warm" ? 85 : 73,
        reasoning: `Referenziert den konkreten Drop-off-Grund (${p.dropOffReason}). Zeigt Verständnis und respektiert die damalige Entscheidung. Erzeugt weniger Abwehr als ein klassischer Follow-up.`,
      },
      {
        id: "v3",
        label: "Wertorientiert & konkret",
        subject: `Was sich für ${p.industry || "Ihr Segment"}-Unternehmen verändert hat`,
        body: `Guten Tag ${p.firstName},\n\nich weiss, Sie bekommen viele Nachrichten – deshalb direkt zum Punkt:\n\n${ctx.valueProp}\n\nWir haben das in den letzten Monaten mit mehreren ${p.industry || ""} Unternehmen${p.company ? ` wie ${p.company}` : ""} umgesetzt – mit messbaren Ergebnissen.\n\nSie hatten sich vor ${since} für ${p.pastInterest} interessiert. Ich glaube, die aktuelle Entwicklung könnte für Sie relevant sein.\n\nHätten Sie Interesse an einem 20-minütigen Gespräch – ohne Verpflichtung?\n\nBeste Grüsse,\n${ctx.agentName}\n${ctx.companyName}`,
        tone: "wertorientiert, konkret, social proof",
        score: p.segment === "hot" ? 79 : p.segment === "warm" ? 77 : 82,
        reasoning: `Führt mit dem Nutzenversprechen statt mit dem alten Kontakt. Gut für Leads, die weniger persönlich ansprechen und mehr Business-Relevanz brauchen.`,
      },
    ];
  }

  if (channel === "whatsapp") {
    return [
      {
        id: "v1",
        label: "Persönlich & direkt",
        body: `Guten Tag ${p.firstName} 👋\n\nHier ist ${ctx.agentName} von ${ctx.companyName}.\n\nIch bin gerade über unsere alte Anfrage gestolpert – Sie hatten sich vor ${since}${co} für ${p.pastInterest} interessiert.\n\nKurze Frage: Ist das Thema für Sie noch relevant, oder haben Sie inzwischen eine Lösung gefunden?\n\nFreue mich über eine kurze Rückmeldung 🙏`,
        tone: "persönlich, informell, niedrige Schwelle",
        score: 84,
        reasoning: "WhatsApp erlaubt persönlichen Ton. Emoji sparsam. Direkte, offene Frage ohne Verkaufsdruck.",
      },
      {
        id: "v2",
        label: "Neugierig & offen",
        body: `Hallo ${p.firstName}!\n\n${ctx.agentName} von ${ctx.companyName} hier. Wir hatten uns vor ${since} über ${p.pastInterest} unterhalten.\n\nIch wollte kurz nachfragen – hat sich bei Ihnen${co} etwas verändert, oder ist ${ctx.painPoint} noch ein Thema?\n\nKein Druck – einfach nur neugierig 😊`,
        tone: "locker, neugierig, menschlich",
        score: 78,
        reasoning: "Etwas informeller Ton, der auf WhatsApp gut funktioniert. Zeigt echtes Interesse ohne Agenda.",
      },
      {
        id: "v3",
        label: "Kurz & prägnant",
        body: `Guten Tag ${p.firstName}, ${ctx.agentName} von ${ctx.companyName}.\n\nKurze Frage: Ist ${p.pastInterest} für Sie${co} noch ein Thema? Einfache Antwort reicht 🙏`,
        tone: "kurz, respektvoll, klar",
        score: 72,
        reasoning: "Maximale Kürze. Funktioniert gut wenn der Lead viel zu tun hat und wenig Zeit für lange Nachrichten.",
      },
    ];
  }

  // SMS
  return [
    {
      id: "v1",
      label: "Standard",
      body: `Guten Tag ${p.firstName}, hier ${ctx.agentName} von ${ctx.companyName}. Kurze Frage zu unserem alten Kontakt zu ${p.pastInterest}: Ist das noch relevant für Sie${co}? Kurze Antwort reicht.`,
      tone: "kurz, direkt, respektvoll",
      score: 75,
      reasoning: "SMS: max. 160 Zeichen, klar und direkt. Kein Verkaufsdruck.",
    },
    {
      id: "v2",
      label: "Mit Kontext",
      body: `Hallo ${p.firstName}, ${ctx.agentName} (${ctx.companyName}). Wir hatten uns vor ${since} über ${ctx.product} unterhalten. Hat sich da etwas verändert? Freue mich über kurze Rückmeldung.`,
      tone: "menschlich, kurz",
      score: 71,
      reasoning: "Mehr Kontext als V1, noch immer innerhalb SMS-Limit.",
    },
  ];
}

// ─── SIMULATED LEAD RESPONSES ────────────────────────────────────────────────

export function getSimulatedLeadResponse(
  type: ResponseType,
  p: LeadProfile
): string {
  const responses: Record<ResponseType, string[]> = {
    interested: [
      `Ja, das Thema ist tatsächlich noch offen. Wir haben das intern besprochen, aber noch keine Lösung umgesetzt. Was genau bieten Sie an?`,
      `Stimmt, ich erinnere mich. Das Thema ist bei uns noch nicht abgeschlossen – erzählen Sie mir mehr.`,
      `Ja! Ich freue mich ehrlich gesagt, dass Sie sich melden. Was hat sich bei Ihnen in der Zwischenzeit getan?`,
    ],
    neutral: [
      `Hm, schwer zu sagen. Das steht noch auf der Agenda, hat aber aktuell keine hohe Priorität. Was genau meinen Sie damit?`,
      `Ich bin mir nicht sicher. Was bieten Sie eigentlich genau an? Können Sie das kurz erklären?`,
      `Vielleicht. Es kommt darauf an, was konkret dahintersteckt. Was würde das für uns bedeuten?`,
    ],
    already_solved: [
      `Wir haben uns inzwischen für eine andere Lösung entschieden und sind damit eigentlich ganz zufrieden.`,
      `Ja, wir haben das intern mittlerweile anders gelöst. Danke für die Nachfrage.`,
      `Wir arbeiten seit einem halben Jahr mit einem anderen Anbieter zusammen. Das Thema ist bei uns abgeschlossen.`,
    ],
    not_interested: [
      `Nein danke, das ist bei uns aktuell kein Thema mehr. Wir haben andere Prioritäten.`,
      `Das passt gerade wirklich nicht für uns. Vielleicht ein anderes Mal.`,
      `Ehrlich gesagt, nein. Wir haben uns entschieden, das intern zu handhaben.`,
    ],
    no_response: [
      ``,
    ],
  };
  const list = responses[type];
  return list[p.id % list.length] || list[0];
}

// ─── STATE RESPONSE GENERATOR ────────────────────────────────────────────────

export function generateStateResponse(
  state: ResponseType,
  p: LeadProfile,
  channel: Channel,
  ctx: BusinessContext
): MessageVariation[] {
  const since = timeSince(p.daysSinceContact);
  const co = p.company ? ` bei ${p.company}` : "";

  if (state === "interested") {
    if (channel === "email") {
      return [
        {
          id: "r-int-1",
          label: "Problem verstehen",
          body: `Das freut mich zu hören, ${p.firstName}!\n\nDann würde ich gerne besser verstehen, womit Sie aktuell kämpfen – damit ich konkret sagen kann, ob und wie wir helfen können.\n\nEine Frage direkt: Was ist im Moment die grösste Herausforderung bei ${ctx.painPoint}${co}? Wo liegt der eigentliche Engpass?\n\nIch frage, weil jedes Unternehmen das etwas anders erlebt – und ich möchte nichts vorschlagen, das nicht wirklich zu Ihrer Situation passt.\n\nViele Grüsse,\n${ctx.agentName}`,
          tone: "neugierig, empathisch, lösungsorientiert",
          score: 91,
          reasoning: "Ziel: Problem verstehen, bevor Lösung angeboten wird. Baut Vertrauen auf. Verhindert voreiligen Pitch.",
        },
        {
          id: "r-int-2",
          label: "Direkt zur Lösung",
          body: `Super, ${p.firstName}!\n\nKurz erklärt, was ${ctx.companyName} konkret macht:\n\n${ctx.valueProp}\n\nWas mich interessiert: Wie sieht Ihr aktueller Prozess bei ${ctx.painPoint} aus? Dann kann ich direkt sagen, ob unsere Lösung passen würde – oder nicht.\n\nHerzliche Grüsse,\n${ctx.agentName}`,
          tone: "klar, lösungsorientiert, transparent",
          score: 85,
          reasoning: "Führt früher mit dem Value-Prop, kombiniert mit einer qualifizierenden Frage. Gut für leads mit wenig Zeit.",
        },
      ];
    }
    if (channel === "whatsapp") {
      return [
        {
          id: "r-int-1",
          label: "Problem verstehen",
          body: `Das freut mich ${p.firstName}! 😊\n\nKurze Frage: Was ist aktuell der grösste Schmerzpunkt bei ${ctx.painPoint}${co}?\n\nWill nichts vorschlagen, bevor ich verstehe, was bei Ihnen konkret der Fall ist.`,
          tone: "kurz, empathisch, neugierig",
          score: 88,
          reasoning: "Qualifizierende Frage auf WhatsApp – kurz, direkt, empathisch.",
        },
      ];
    }
    return [
      {
        id: "r-int-sms",
        label: "Interesse bestätigen",
        body: `Super ${p.firstName}! Was ist aktuell der grösste Schmerzpunkt bei ${ctx.painPoint}? Dann kann ich gezielt antworten.`,
        tone: "kurz, direkt",
        score: 80,
        reasoning: "SMS: maximale Kürze. Qualifizierende Frage.",
      },
    ];
  }

  if (state === "neutral") {
    if (channel === "email") {
      return [
        {
          id: "r-neu-1",
          label: "Kontext geben",
          body: `Das verstehe ich, ${p.firstName}.\n\nVielleicht macht es Sinn, dass ich kurz erkläre, was ${ctx.companyName} konkret macht – dann können Sie selbst einschätzen, ob das für Ihre Situation relevant ist.\n\nIn einem Satz: ${ctx.valueProp}\n\nWas ich konkret biete, ist ${ctx.ctaGoal} – 20 Minuten, keine Verpflichtung, kein Verkaufsgespräch. Nur eine Einschätzung, ob das für Sie Sinn macht.\n\nKlingt das grundsätzlich nach einem Thema?\n\nViele Grüsse,\n${ctx.agentName}`,
          tone: "transparent, informativ, respektvoll",
          score: 78,
          reasoning: "Gibt dem Lead den nötigen Kontext ohne Druck. Offene Frage lässt die Tür offen.",
        },
        {
          id: "r-neu-2",
          label: "Relevanz prüfen",
          body: `Kein Problem, ${p.firstName} – ich will keine Zeit verschwenden.\n\nEine direkte Frage: Ist ${ctx.painPoint} aktuell überhaupt ein Thema${co}, das Sie beschäftigt? Oder hat das für Sie keine Priorität?\n\nFalls nicht – völlig in Ordnung. Ich melde mich dann zu einem späteren Zeitpunkt wieder.\n\nHerzliche Grüsse,\n${ctx.agentName}`,
          tone: "respektvoll, ehrlich, druckfrei",
          score: 74,
          reasoning: "Gibt dem Lead einen Ausweg – was paradoxerweise Vertrauen aufbaut. Gut wenn Desinteresse wahrscheinlich.",
        },
      ];
    }
    return [
      {
        id: "r-neu-1",
        label: "Kontext geben",
        body: `Kein Problem ${p.firstName}! Kurze Erklärung: ${ctx.valueProp}. Ist ${ctx.painPoint} bei Ihnen${co} aktuell ein Thema?`,
        tone: "kurz, informativ, offen",
        score: 75,
        reasoning: "Komprimiert den Value-Prop in eine klare Frage.",
      },
    ];
  }

  if (state === "already_solved") {
    if (channel === "email") {
      return [
        {
          id: "r-sol-1",
          label: "Tür offenhalten",
          body: `Das ist schön zu hören, ${p.firstName}!\n\nDarf ich kurz nachfragen – was haben Sie umgesetzt? Ich frage nicht, um Ihnen etwas zu verkaufen, sondern weil ich verstehen möchte, welche Lösungen aktuell gut funktionieren.\n\nUnd falls Sie nach einer Weile merken, dass es Bereiche gibt, in denen Ihre aktuelle Lösung nicht ganz das leistet, was Sie sich erhofft haben – dann wäre ich gerne als Rückfalloption da.\n\nBeste Grüsse und weiterhin viel Erfolg,\n${ctx.agentName}`,
          tone: "wertschätzend, offen, kein Druck",
          score: 72,
          reasoning: "Keine Überzeugung. Stattdessen: Wissen sammeln, Türe offenlassen, in Erinnerung bleiben.",
        },
        {
          id: "r-sol-2",
          label: "Vergleich anbieten",
          body: `Das versteht sich, ${p.firstName}.\n\nErfahrungsgemäss vergleichen viele Unternehmen nach 6–12 Monaten nochmals, ob ihre Lösung wirklich das hält, was versprochen wurde.\n\nFalls Sie das irgendwann möchten, stehe ich gerne zur Verfügung – als neutrale zweite Meinung.\n\nBis dahin: Ich melde mich in ein paar Monaten kurz – falls das in Ordnung ist?\n\nViele Grüsse,\n${ctx.agentName}`,
          tone: "strategisch, geduldig, vorausschauend",
          score: 68,
          reasoning: "Sät den Samen für eine spätere Reaktivierung. Legt den Grundstein für einen Follow-up in 3–6 Monaten.",
        },
      ];
    }
    return [
      {
        id: "r-sol-1",
        label: "Tür offenlassen",
        body: `Gut zu hören ${p.firstName}! Darf ich kurz fragen, was Sie umgesetzt haben? Und falls die Lösung mal nicht das leistet, was Sie brauchen – ich bin gerne als Option da.`,
        tone: "freundlich, offen, kein Druck",
        score: 68,
        reasoning: "Freundlicher Abschluss mit offener Tür.",
      },
    ];
  }

  if (state === "not_interested") {
    if (channel === "email") {
      return [
        {
          id: "r-noi-1",
          label: "Einwand verstehen",
          body: `Das respektiere ich vollständig, ${p.firstName}.\n\nNur eine kurze Frage – falls Sie nichts dagegen haben: Liegt das eher am Timing, am Thema selbst, oder hat sich Ihre Situation grundsätzlich verändert?\n\nKein Druck. Ich frage nur, um zu verstehen, ob es sinnvoll wäre, mich in einigen Monaten nochmals zu melden – oder nicht.\n\nHerzliche Grüsse,\n${ctx.agentName}`,
          tone: "respektvoll, ehrlich, nicht aufdringlich",
          score: 65,
          reasoning: "Versucht den Einwand zu verstehen ohne Gegendruck. Ermöglicht spätere Reaktivierung bei Timing-Problem.",
        },
        {
          id: "r-noi-2",
          label: "Sauber schliessen",
          body: `Verstanden, ${p.firstName} – kein Problem.\n\nIch trage Sie aus meiner Follow-up-Liste aus. Falls sich in Zukunft etwas ändert, können Sie jederzeit auf uns zukommen.\n\nAlles Gute weiterhin,\n${ctx.agentName}\n${ctx.companyName}`,
          tone: "respektvoll, sauber, professionell",
          score: 60,
          reasoning: "Professioneller Abschluss. Zeigt Respekt und hinterlässt einen guten letzten Eindruck – wichtig für mögliche spätere Reaktivierung.",
        },
      ];
    }
    return [
      {
        id: "r-noi-1",
        label: "Respektvoll schliessen",
        body: `Alles klar ${p.firstName}, das respektiere ich. Darf ich fragen – liegt das am Timing oder ist das Thema grundsätzlich kein Thema mehr? Dann weiss ich, ob sich ein erneuter Kontakt lohnt.`,
        tone: "respektvoll, kurz",
        score: 62,
        reasoning: "Kurze Qualifizierungsfrage – öffnet evtl. die Tür für späteren Re-Engagement.",
      },
    ];
  }

  // no_response
  if (channel === "email") {
    return [
      {
        id: "r-nor-1",
        label: "Sanftes Follow-up",
        subject: `Nochmals kurz, ${p.firstName} – falls meine letzte Nachricht untergegangen ist`,
        body: `Guten Tag ${p.firstName},\n\nich melde mich kurz nochmals – nicht um zu nerven, sondern weil ich unsere letzte Nachricht vielleicht schlecht getimed habe.\n\nIst ${ctx.painPoint} für Sie${co} noch ein Thema – oder hat sich die Situation verändert?\n\nEine kurze Antwort – auch nur «nicht relevant» – würde mir sehr helfen.\n\nHerzliche Grüsse,\n${ctx.agentName}`,
        tone: "verständnisvoll, nicht aufdringlich",
        score: 70,
        reasoning: "Sanftes Follow-up das anerkennt, dass keine Antwort kommen kann. Gibt dem Lead eine einfache Exit-Option.",
      },
    ];
  }
  return [
    {
      id: "r-nor-sms",
      label: "Kurzes Follow-up",
      body: `Hallo ${p.firstName}, ${ctx.agentName} nochmals. Kurze Folgefrage zu meiner letzten Nachricht: Ist ${ctx.painPoint} noch ein Thema? Kurze Antwort reicht.`,
      tone: "kurz, respektvoll",
      score: 66,
      reasoning: "Einfaches, nicht aufdringliches Follow-up.",
    },
  ];
}

// ─── BOOKING MESSAGE GENERATOR ───────────────────────────────────────────────

export function generateBookingMessages(
  p: LeadProfile,
  channel: Channel,
  ctx: BusinessContext
): MessageVariation[] {
  if (channel === "email") {
    return [
      {
        id: "b-1",
        label: "Terminpräferenz erfragen",
        subject: `${p.firstName}, wann passt es Ihnen am besten?`,
        body: `Das freut mich, ${p.firstName}!\n\nDann würde ich vorschlagen, dass wir kurz sprechen – 20 Minuten reichen, um Ihnen konkret zu zeigen, wie ${ctx.companyName} Ihnen${p.company ? ` bei ${p.company}` : ""} helfen kann.\n\nEine kurze Frage zur Planung: Passt es Ihnen grundsätzlich besser Vormittags oder Nachmittags? Und eher diese oder nächste Woche?\n\nDann schlage ich Ihnen direkt zwei konkrete Zeiten vor.\n\nHerzliche Grüsse,\n${ctx.agentName}`,
        tone: "persönlich, flexibel, unkompliziert",
        score: 94,
        reasoning: "Statt direkt Slots anzubieten: erst Präferenz erfragen (Vm/Nm + diese/nächste Woche). Reduziert Hin-und-Her, zeigt Rücksicht auf den Kalender des Leads.",
      },
      {
        id: "b-2",
        label: "Zwei konkrete Slots",
        subject: `2 freie Zeiten für Sie, ${p.firstName}`,
        body: `Wunderbar, ${p.firstName}!\n\nIch habe folgende zwei Zeiten für Sie reserviert:\n\n• Dienstag, ${new Date(Date.now() + 8*86400000).toLocaleDateString("de-CH", {day:"2-digit",month:"2-digit"})}, 09:30–09:50 Uhr\n• Donnerstag, ${new Date(Date.now() + 10*86400000).toLocaleDateString("de-CH", {day:"2-digit",month:"2-digit"})}, 14:00–14:20 Uhr\n\nWelche Option passt Ihnen besser?\n\nNach Ihrer Bestätigung erhalten Sie direkt eine Kalendereinladung.\n\n*(Oder selbst buchen: ${ctx.bookingLink})*\n\nFreue mich auf das Gespräch,\n${ctx.agentName}`,
        tone: "konkret, persönlich, einfach",
        score: 91,
        reasoning: "Direkt 2 konkrete Slots. Eingeschränkte Auswahl reduziert Entscheidungsaufwand. Booking-Link als Fallback.",
      },
      {
        id: "b-3",
        label: "Booking Link",
        subject: `Direkt Termin buchen – ${p.firstName}`,
        body: `Super, ${p.firstName}!\n\nAm einfachsten: Buchen Sie sich direkt einen passenden Termin:\n\n${ctx.bookingLink}\n\n20 Minuten, kein Verkaufsgespräch – nur eine ehrliche Einschätzung, ob und wie wir helfen können.\n\nFreue mich auf unser Gespräch!\n\nBeste Grüsse,\n${ctx.agentName}`,
        tone: "direkt, unkompliziert",
        score: 87,
        reasoning: "Booking Link gibt dem Lead volle Kontrolle. Gut für selbstständige Entscheider die keine Rückfragen wollen.",
      },
    ];
  }
  if (channel === "whatsapp") {
    return [
      {
        id: "b-wapp-1",
        label: "Terminpräferenz",
        body: `Perfekt ${p.firstName}! 🎉\n\nDann lass uns kurz sprechen – 20 Minuten reichen.\n\nKurze Frage: Passt Dir besser Vormittag oder Nachmittag? Und eher diese oder nächste Woche?\n\nIch schlage Dir dann direkt 2 Zeiten vor 📅`,
        tone: "freundlich, persönlich",
        score: 91,
        reasoning: "WhatsApp: persönlicher Ton. Präferenz erfragen bevor Slots vorgeschlagen werden — weniger Hin-und-Her.",
      },
      {
        id: "b-wapp-2",
        label: "Direkt buchen",
        body: `Super ${p.firstName}! Direkt einen Termin sichern:\n\n${ctx.bookingLink}\n\n20 Min, kein Druck – ich zeige Dir konkret was das bringt 😊`,
        tone: "kurz, direkt",
        score: 85,
        reasoning: "Booking Link als schnelle Option für Mobile-affine Leads.",
      },
    ];
  }
  return [
    {
      id: "b-sms-1",
      label: "Terminpräferenz",
      body: `Super ${p.firstName}! Kurze Frage: Passt Vormittag oder Nachmittag besser? Diese oder nächste Woche? Dann schlage ich 2 konkrete Zeiten vor.`,
      tone: "kurz, direkt",
      score: 88,
      reasoning: "SMS: Präferenz erfragen in 2 Dimensionen (Vm/Nm + diese/nächste Woche). Danach 2 konkrete Slots.",
    },
    {
      id: "b-sms-2",
      label: "Booking Link",
      body: `Super ${p.firstName}! Direkt buchen: ${ctx.bookingLink} — 20 Min Demo, kein Druck.`,
      tone: "minimal",
      score: 80,
      reasoning: "SMS Fallback mit Booking Link.",
    },
  ];
}

// ─── AGENT THINKING GENERATOR ────────────────────────────────────────────────

export function getAgentThinking(
  stage: "profile" | "initial" | ResponseType | "booking",
  p: LeadProfile,
  ctx: BusinessContext
): AgentThinkingStep[] {
  if (stage === "profile") {
    return [
      { phase: "Datenparsing", content: `${Object.values(p).filter(Boolean).length} Felder normalisiert. Kontaktweg: ${p.email ? "E-Mail" : ""}${p.phone ? " + Telefon" : ""}.` },
      { phase: "Profiling", content: `${p.fullName}${p.company ? ` (${p.company})` : ""}${p.jobTitle ? ` – ${p.jobTitle}` : ""}. Entscheidungsträger: ${p.isDecisionMaker ? "Ja ✓" : "Wahrscheinlich nicht"}.` },
      { phase: "Zeitanalyse", content: p.daysSinceContact !== null ? `Letzter Kontakt: vor ${timeSince(p.daysSinceContact)}. Situation: ${p.currentSituation}.` : "Kein Kontaktdatum vorhanden — Zeitanalyse nicht möglich." },
      { phase: "Signalanalyse", content: `${p.signals.length} Signale erkannt: ${p.signals.join(" · ")}.` },
      { phase: "Drop-off-Hypothese", content: `Vermuteter Grund: "${p.dropOffReason}". Konfidenz: ${p.confidence === "high" ? "Hoch" : p.confidence === "medium" ? "Mittel" : "Niedrig"}.`, highlight: true },
      { phase: "Segmentierung", content: `Score: ${p.score}/100 → Segment: ${SEGMENT_META[p.segment].label}. ${SEGMENT_META[p.segment].desc}.`, highlight: true },
      { phase: "Strategie", content: `Ansatz: ${p.segment === "hot" || p.segment === "warm" ? "Direkter, persönlicher Re-Engagement mit Referenz auf alten Kontakt." : "Softer Re-Engagement mit neuem Nutzenversprechen."}` },
    ];
  }
  if (stage === "initial") {
    return [
      { phase: "Kanal-Entscheidung", content: "Initiale Nachricht generiert. 3 Variationen mit unterschiedlichem Ansatz." },
      { phase: "Personalisierung", content: `Referenziert: Name (${p.firstName}), Unternehmen (${p.company || "—"}), vergangenes Interesse (${p.pastInterest}), Drop-off-Grund (${p.dropOffReason}).` },
      { phase: "Ton", content: p.isDecisionMaker ? "C-Level Ansprache: professionell, direkt, respektvoll." : "Standard B2B Ton: freundlich, klar, keine Agenda." },
    ];
  }
  if (stage === "interested") {
    return [
      { phase: "Response-Klassifikation", content: "Lead-Antwort klassifiziert als: INTERESSIERT ✓", highlight: true },
      { phase: "Strategie-Update", content: "Ziel wechselt von Re-Engagement zu: Problem verstehen → Relevanz aufbauen → Call vereinbaren." },
      { phase: "Nächster Schritt", content: "Qualifizierende Frage zum aktuellen Schmerzpunkt. Kein Pitch vor Problemverständnis." },
    ];
  }
  if (stage === "neutral") {
    return [
      { phase: "Response-Klassifikation", content: "Lead-Antwort klassifiziert als: NEUTRAL / UNSICHER", highlight: true },
      { phase: "Strategie-Update", content: "Situation unklar. Ziel: Kontext geben, Relevanz prüfen, keinen Druck machen." },
      { phase: "Nächster Schritt", content: "Value-Prop in einem Satz + offene Frage zur Priorität." },
    ];
  }
  if (stage === "already_solved") {
    return [
      { phase: "Response-Klassifikation", content: "Lead-Antwort klassifiziert als: BEREITS GELÖST", highlight: true },
      { phase: "Strategie-Update", content: "Direkte Konversion nicht möglich. Ziel: Wissen sammeln, Tür offenlassen, in Erinnerung bleiben." },
      { phase: "Nächster Schritt", content: "Fragen nach der gewählten Lösung. Follow-up in 3–6 Monaten planen." },
    ];
  }
  if (stage === "not_interested") {
    return [
      { phase: "Response-Klassifikation", content: "Lead-Antwort klassifiziert als: KEIN INTERESSE", highlight: true },
      { phase: "Strategie-Update", content: "Respektiere Entscheidung. Versuch: Einwand-Typ verstehen (Timing vs. grundsätzlich)." },
      { phase: "Nächster Schritt", content: "Kurze Qualifizierungsfrage. Bei Timing: Tür offenlassen. Bei grundsätzlich: professionell abschliessen." },
    ];
  }
  if (stage === "no_response") {
    return [
      { phase: "Response-Klassifikation", content: "Keine Antwort nach 3 Tagen → Follow-up-Modus", highlight: true },
      { phase: "Strategie-Update", content: "Sanftes Nachfassen. Anerkennung des Schweigens. Einfache Exit-Option anbieten." },
      { phase: "Nächster Schritt", content: "Maximal 1 Follow-up. Danach: Automatisch auf 'Dormant' setzen." },
    ];
  }
  if (stage === "booking") {
    return [
      { phase: "Booking-Trigger", content: "Interesse bestätigt. Wechsel in Booking-Modus.", highlight: true },
      { phase: "CTA-Strategie", content: `Ziel: ${ctx.ctaGoal}. 3 Variationen: Terminoptionen / Booking Link / Persönliche Zeiten.` },
      { phase: "Friction-Reduktion", content: "Eingeschränkte Auswahl (2 Optionen) oder direkter Booking Link. Weniger Entscheidungsaufwand = höhere Konversionsrate." },
    ];
  }
  return [];
}

// ─── MULTI-TURN CONTINUATION ─────────────────────────────────────────────────
// After the agent replies to a state, the lead can respond again.
// This drives the conversation forward through 2–4 turns until booking/close.

export type ContinuationType =
  // After "interested" agent reply — discovery phase
  | "describes_problem"
  | "asks_for_details"
  | "hesitant_but_open"
  // After neutral → interested pivot
  | "now_interested"
  | "still_unsure"
  | "not_relevant_after_all"
  // After already_solved
  | "open_to_compare"
  | "satisfied_stays"
  // After not_interested
  | "timing_was_the_issue"
  | "fundamental_no"
  // After no_response follow-up
  | "responds_late"
  | "still_no_response"
  // Discovery round 2 — lead elaborates
  | "elaborates_challenge"
  | "mentions_multiple_problems"
  | "wants_next_step_now"
  // Scheduling preference (after booking trigger)
  | "scheduling_morning"
  | "scheduling_afternoon"
  // Round 3+ (deeper interested)
  | "ready_to_talk"
  | "needs_one_more_nudge"
  // Objection handling — can appear at any stage
  | "objects_price"
  | "objects_time"
  | "objects_trust"
  | "objects_competitor";

export interface ContinuationOption {
  type: ContinuationType;
  label: string;
  example: string;
  color: string;
  bg: string;
  border: string;
}

export function getContinuationOptions(
  state: ResponseType | "booking",
  round: number
): ContinuationOption[] {
  if (state === "interested" && round === 1) {
    return [
      { type: "describes_problem",      label: "Beschreibt Problem",      example: `"Wir kämpfen konkret damit, dass wir..."`,           color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" },
      { type: "asks_for_details",       label: "Fragt nach Details",      example: `"Interessant – wie genau funktioniert das?"`,         color: "text-blue-700",    bg: "bg-blue-50",    border: "border-blue-200" },
      { type: "hesitant_but_open",      label: "Zögert noch",             example: `"Klingt gut, aber ich bin noch nicht sicher..."`,     color: "text-amber-700",  bg: "bg-amber-50",   border: "border-amber-200" },
    ];
  }
  // Discovery round 2 — after agent asked about problem
  if (state === "interested" && round === 2) {
    return [
      { type: "elaborates_challenge",       label: "Schildert Herausforderung",  example: `"Das Hauptproblem ist, dass wir zu wenig Zeit haben für..."`,               color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" },
      { type: "mentions_multiple_problems", label: "Mehrere Probleme",           example: `"Eigentlich haben wir da mehrere Baustellen..."`,                           color: "text-violet-700",  bg: "bg-violet-50",  border: "border-violet-200" },
      { type: "wants_next_step_now",        label: "Bereit für nächsten Schritt", example: `"Das klingt genau richtig. Was wäre jetzt konkret der nächste Schritt?"`, color: "text-blue-700",    bg: "bg-blue-50",    border: "border-blue-200" },
      { type: "objects_price",              label: "Preiseinwand",               example: `"Das klingt interessant, aber wir haben Budget-Einschränkungen."`,           color: "text-amber-700",   bg: "bg-amber-50",   border: "border-amber-200" },
      { type: "objects_trust",              label: "Vertrauenseinwand",          example: `"Woher weiss ich, dass das wirklich funktioniert?"`,                        color: "text-orange-700",  bg: "bg-orange-50",  border: "border-orange-200" },
    ];
  }
  // Scheduling preference — after booking is triggered
  if (state === "booking") {
    return [
      { type: "scheduling_morning",    label: "Lieber Vormittags",  example: `"Mir passt es besser vormittags, eher nächste Woche."`,  color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" },
      { type: "scheduling_afternoon",  label: "Lieber Nachmittags", example: `"Nachmittags wäre mir lieber, diese Woche wenn möglich."`, color: "text-blue-700",    bg: "bg-blue-50",    border: "border-blue-200" },
    ];
  }
  if (state === "interested" && round >= 3) {
    return [
      { type: "ready_to_talk",        label: "Bereit für Gespräch",      example: `"Ja, ein kurzes Gespräch würde ich mir vorstellen."`,      color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" },
      { type: "needs_one_more_nudge", label: "Braucht noch Überzeugung", example: `"Ich überlege noch... was genau würden wir besprechen?"`,  color: "text-amber-700",   bg: "bg-amber-50",   border: "border-amber-200" },
      { type: "objects_time",         label: "Zeiteinwand",              example: `"Im Moment haben wir gerade zu viel auf dem Tisch."`,       color: "text-slate-600",   bg: "bg-slate-50",   border: "border-slate-200" },
      { type: "objects_competitor",   label: "Konkurrenzvergleich",      example: `"Wir schauen uns gerade auch noch andere Anbieter an."`,   color: "text-purple-700",  bg: "bg-purple-50",  border: "border-purple-200" },
    ];
  }
  if (state === "neutral") {
    return [
      { type: "now_interested",         label: "Jetzt interessiert",   example: `"Ah, das klingt tatsächlich relevant für uns."`,  color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" },
      { type: "still_unsure",           label: "Weiterhin unsicher",   example: `"Hmm, ich weiss noch nicht... vielleicht."`,      color: "text-amber-700",  bg: "bg-amber-50",   border: "border-amber-200" },
      { type: "objects_price",          label: "Preiseinwand",         example: `"Das klingt interessant, aber zu teuer für uns."`, color: "text-orange-700", bg: "bg-orange-50",  border: "border-orange-200" },
      { type: "not_relevant_after_all", label: "Doch kein Interesse",  example: `"Nein, das ist bei uns wirklich kein Thema."`,    color: "text-red-700",    bg: "bg-red-50",     border: "border-red-200" },
    ];
  }
  if (state === "already_solved") {
    return [
      { type: "open_to_compare", label: "Offen für Vergleich", example: `"Eigentlich... mal hören was Sie konkret anbieten."`, color: "text-cyan-700",  bg: "bg-cyan-50",  border: "border-cyan-200" },
      { type: "satisfied_stays", label: "Zufrieden, bleibt dabei", example: `"Nein, wir sind wirklich sehr zufrieden."`,        color: "text-slate-600", bg: "bg-slate-50", border: "border-slate-200" },
    ];
  }
  if (state === "not_interested") {
    return [
      { type: "timing_was_the_issue", label: "War nur Timing", example: `"Eigentlich ist es mehr eine Timing-Frage gewesen."`, color: "text-amber-700", bg: "bg-amber-50",  border: "border-amber-200" },
      { type: "fundamental_no",       label: "Grundsätzlich nein", example: `"Nein, das ist wirklich kein Thema für uns."`,    color: "text-red-700",   bg: "bg-red-50",    border: "border-red-200" },
    ];
  }
  if (state === "no_response") {
    return [
      { type: "responds_late",     label: "Antwortet jetzt doch", example: `"Sorry für die späte Rückmeldung – ja, gerne."`, color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" },
      { type: "still_no_response", label: "Immer noch keine Antwort", example: `(Keine Antwort nach weiteren 5 Tagen)`,      color: "text-slate-500",   bg: "bg-slate-50",   border: "border-slate-200" },
    ];
  }
  return [];
}

export interface ContinuationResult {
  leadText: string;
  agentMsg: string;
  agentSubject?: string;
  agentLabel: string;
  agentThinking: AgentThinkingStep[];
  nextState: ConversationState;
  triggerBooking: boolean;
  closeConversation: boolean;
}

export function generateContinuationExchange(
  type: ContinuationType,
  p: LeadProfile,
  channel: Channel,
  ctx: BusinessContext
): ContinuationResult {
  const co = p.company ? ` bei ${p.company}` : "";
  const short = channel !== "email";

  switch (type) {
    case "describes_problem":
      return {
        leadText: `Konkret gesagt: Wir verlieren aktuell viele Leads, weil nach der ersten Kontaktaufnahme kein systematisches Follow-up stattfindet. Das kostet uns jeden Monat einige potenzielle Kunden.`,
        agentMsg: short
          ? `Das kenne ich – das ist bei vielen ${p.industry || "B2B"}-Firmen das Problem. Darf ich fragen: Wie viele Leads verlieren Sie so schätzungsweise pro Monat? Und gibt es noch andere Herausforderungen in dem Bereich?`
          : `Das kenne ich gut, ${p.firstName} – und ich höre das oft.\n\nDarf ich kurz nachfragen, um das besser einschätzen zu können:\n\n• Wie viele Leads gehen Ihnen schätzungsweise pro Monat verloren, weil das Follow-up nicht stattgefunden hat?\n• Und liegt das eher an Kapazität, an fehlenden Prozessen – oder an beidem?\n\nIch frage, weil die Lösung je nach Situation sehr unterschiedlich aussieht, und ich möchte nichts empfehlen, das nicht genau auf Ihre Situation passt.`,
        agentLabel: "Tiefer ins Problem",
        agentThinking: [
          { phase: "Problem erkannt", content: `Lead beschreibt verlorene Leads / kein Follow-up-System. Direkte Verbindung zu unserer Lösung — aber erst vollständig qualifizieren.`, highlight: true },
          { phase: "Strategie", content: "Empathie zeigen → mit Tiefenfragen Kontext sammeln (Volumen, Ursache) → danach erst Lösung und CTA." },
          { phase: "Nächster Schritt", content: "2 gezielte Qualifizierungsfragen. Ziel: Kontext für massgeschneiderte Lösung." },
        ],
        nextState: "interested",
        triggerBooking: false,
        closeConversation: false,
      };

    case "asks_for_details":
      return {
        leadText: `Können Sie mir kurz erklären, wie das genau funktioniert? Ich verstehe noch nicht ganz, was Sie konkret machen.`,
        agentMsg: short
          ? `Klar ${p.firstName}! ${ctx.valueProp}\n\nBevor ich das genauer erkläre – kurze Frage: Wo ist bei Ihnen${co} aktuell der grösste Engpass beim Thema ${ctx.painPoint}?`
          : `Sehr gerne, ${p.firstName}!\n\nIn einem Satz: ${ctx.valueProp}\n\nBevor ich das aber zu abstrakt erkläre, möchte ich das lieber auf Ihre konkrete Situation zuschneiden.\n\nEine kurze Frage: Wo ist bei ${p.company || "Ihnen"} aktuell der grösste Engpass – ist es eher die Zeit für manuelles Nachfassen, die fehlende Systematik, oder habt ihr schlicht zu viele Leads, die ihr nicht verwalten könnt?\n\nDann kann ich Ihnen zeigen, was davon wir konkret lösen – und was nicht.`,
        agentLabel: "Kontext vor Erklärung",
        agentThinking: [
          { phase: "Lead will Infos", content: "Lead fragt nach Details — gutes Zeichen. Aber: erst Kontext sammeln, bevor wir pitchen. Maßgeschneiderte Antwort wirkt besser.", highlight: true },
          { phase: "Strategie", content: "Value-Prop kurz andeuten → sofort Qualifizierungsfrage → Antwort dann personalisiert auf Problem zuschneiden." },
        ],
        nextState: "interested",
        triggerBooking: false,
        closeConversation: false,
      };

    case "hesitant_but_open":
      return {
        leadText: `Klingt interessant, aber ich bin noch nicht ganz überzeugt. Was würde ein Gespräch konkret bringen?`,
        agentMsg: short
          ? `Gute Frage ${p.firstName}. In 20 Min zeige ich Ihnen an einem echten Beispiel, was das bringt – ohne Verpflichtung. Würde das passen?`
          : `Das ist eine faire Frage, ${p.firstName}.\n\nIn unserem Gespräch würden wir drei Dinge durchgehen:\n\n1. Wo liegen Ihre grössten Verlustpunkte aktuell?\n2. Wie würde unser System konkret bei ${p.company || "Ihnen"} funktionieren?\n3. Ob – und wenn ja wie – das einen Unterschied machen würde.\n\nKein Pitch, kein Verkaufsdruck. Einfach eine ehrliche Einschätzung.\n\nWäre Anfang nächster Woche möglich?`,
        agentLabel: "Konkrete Agenda + Einladung",
        agentThinking: [
          { phase: "Skepsis behandeln", content: "Lead zögert — zeigt aber Offenheit. Konkrete Agenda nimmt das Risiko raus.", highlight: true },
          { phase: "Nächster Schritt", content: "3-Punkte-Agenda formulieren → Terminvorschlag." },
        ],
        nextState: "interested",
        triggerBooking: true,
        closeConversation: false,
      };

    case "now_interested":
      return {
        leadText: `Ah, das klingt tatsächlich interessanter als ich dachte. Was genau wäre der nächste Schritt?`,
        agentMsg: short
          ? `Das freut mich ${p.firstName}! Kurze Frage bevor ich etwas vorschlage: Was ist aktuell der grösste Schmerzpunkt bei ${ctx.painPoint}${co}? Hat sich da seit unserem letzten Gespräch etwas verändert?`
          : `Das freut mich wirklich, ${p.firstName}!\n\nBevor ich Ihnen einen nächsten Schritt vorschlage – ich möchte sicherstellen, dass das, was ich zeige, auch wirklich zu Ihrer aktuellen Situation passt.\n\nZwei kurze Fragen:\n\n1. Was ist heute die grösste Herausforderung bei ${ctx.painPoint}${co}?\n2. Hat sich seit unserem letzten Gespräch vor ${p.daysSinceContact ? Math.round(p.daysSinceContact / 30) + " Monaten" : "einer Weile"} etwas verändert – z.B. in der Teamgrösse, den Zielen, oder im Budget?\n\nMit diesen Infos kann ich Ihnen viel gezielter helfen.`,
        agentLabel: "Discovery vor CTA",
        agentThinking: [
          { phase: "Pivot erfolgreich", content: "Neutral → Interessiert ✓. Lead fragt nach nächstem Schritt — aber: erst Situation qualifizieren, dann CTA. So wirkt die Empfehlung massgeschneidert statt generisch.", highlight: true },
          { phase: "Strategie", content: "2 gezielte Discovery-Fragen: (1) aktuelles Problem, (2) was hat sich seit letztem Gespräch verändert. Danach maßgeschneiderter CTA." },
        ],
        nextState: "interested",
        triggerBooking: false,
        closeConversation: false,
      };

    case "still_unsure":
      return {
        leadText: `Ich weiss noch nicht... es klingt interessant, aber ich habe gerade so viel auf dem Tisch. Vielleicht später?`,
        agentMsg: short
          ? `Verstehe ${p.firstName}. Darf ich mich in 4 Wochen nochmals melden? Einfach kurz bestätigen.`
          : `Das verstehe ich vollständig, ${p.firstName}.\n\nKein Druck von meiner Seite. Darf ich mich in etwa 4 Wochen kurz nochmals melden – wenn sich der Staub etwas gelegt hat?\n\nFalls sich in der Zwischenzeit etwas ändert, können Sie jederzeit direkt auf mich zukommen:\n\n${ctx.bookingLink}\n\nAlles Gute bis dahin,\n${ctx.agentName}`,
        agentLabel: "Timing respektieren",
        agentThinking: [
          { phase: "Timing-Problem", content: "Lead hat Interesse, aber zu beschäftigt. Kein Druck — Follow-up in 4 Wochen vereinbaren.", highlight: true },
        ],
        nextState: "closed",
        triggerBooking: false,
        closeConversation: true,
      };

    case "not_relevant_after_all":
      return {
        leadText: `Nein, ich habe mir das überlegt – das passt wirklich nicht für uns.`,
        agentMsg: short
          ? `Alles klar ${p.firstName}, kein Problem. Falls sich etwas ändert – ich bin erreichbar.`
          : `Alles klar, ${p.firstName} – das respektiere ich.\n\nIch trage Sie aus meiner Follow-up-Liste aus. Falls sich die Situation ändert, wissen Sie wo Sie mich finden.\n\nAlles Gute,\n${ctx.agentName}`,
        agentLabel: "Respektvoller Abschluss",
        agentThinking: [
          { phase: "Abschluss", content: "Lead hat klar Nein gesagt. Professionell schliessen, guten Eindruck hinterlassen.", highlight: true },
        ],
        nextState: "closed",
        triggerBooking: false,
        closeConversation: true,
      };

    case "open_to_compare":
      return {
        leadText: `Eigentlich – jetzt wo Sie fragen... mal schauen was Sie konkret anbieten. Was wäre der nächste Schritt?`,
        agentMsg: short
          ? `Super ${p.firstName}! 20-Min-Call um das konkret zu vergleichen? Anfang oder Mitte der Woche?`
          : `Das freut mich, ${p.firstName}.\n\nIch verspreche: kein Verkaufsgespräch. Einfach ein ehrlicher Vergleich, was unsere Lösung anders macht – und ob das für Ihre aktuelle Situation relevant wäre.\n\n20 Minuten reichen dafür. Passt Ihnen Anfang oder Mitte der Woche?`,
        agentLabel: "Tür-Öffnung nutzen",
        agentThinking: [
          { phase: "Unerwartete Chance", content: "Already Solved → Offen für Vergleich. Lead ist wechselbereit. Direkt zum Termin.", highlight: true },
        ],
        nextState: "interested",
        triggerBooking: true,
        closeConversation: false,
      };

    case "satisfied_stays":
      return {
        leadText: `Nein, wirklich – wir sind sehr zufrieden mit unserer aktuellen Lösung. Danke trotzdem.`,
        agentMsg: short
          ? `Verständlich ${p.firstName}, das freut mich. Ich melde mich in 6 Monaten kurz.`
          : `Das freut mich zu hören, ${p.firstName}!\n\nDann werde ich Sie nicht weiter damit beschäftigen. Ich melde mich in ca. 6 Monaten kurz – manchmal ändern sich Anforderungen.\n\nFalls Sie vorher etwas brauchen: ${ctx.bookingLink}\n\nAlles Gute!\n${ctx.agentName}`,
        agentLabel: "Freundlicher Abschluss",
        agentThinking: [
          { phase: "Abschluss", content: "Lead ist zufrieden mit bestehender Lösung. Follow-up in 6 Monaten einplanen.", highlight: true },
        ],
        nextState: "closed",
        triggerBooking: false,
        closeConversation: true,
      };

    case "timing_was_the_issue":
      return {
        leadText: `Eigentlich, jetzt wo ich darüber nachdenke – es war damals wirklich nur ein Timing-Problem. Was genau bieten Sie an?`,
        agentMsg: short
          ? `Das dachte ich mir ${p.firstName}! Bevor ich erkläre: Hat sich bei ${ctx.painPoint}${co} seither etwas verändert, oder ist das noch gleich wie damals?`
          : `Das dachte ich mir, ${p.firstName} – Timing ist der häufigste Grund, warum gute Gespräche einschlafen.\n\nBevor ich Ihnen erkläre, was sich bei uns getan hat: Ich möchte verstehen, ob sich die Situation bei ${p.company || "Ihnen"} seither verändert hat.\n\nIst ${ctx.painPoint} noch das gleiche Thema wie damals – oder gibt es neue Baustellen, die hinzugekommen sind?\n\nDas hilft mir, das Gespräch wirklich auf Ihre aktuelle Situation zuzuschneiden, nicht auf das, was wir vor ${p.daysSinceContact ? Math.round(p.daysSinceContact / 30) + " Monaten" : "einer Weile"} besprochen haben.`,
        agentLabel: "Situation neu einschätzen",
        agentThinking: [
          { phase: "Timing-Einwand aufgelöst", content: "Lead erkennt: es war nur Timing. Jetzt: nicht sofort pitchen — erst aktuelle Situation neu qualifizieren. Viel hängt davon ab, was sich verändert hat.", highlight: true },
          { phase: "Strategie", content: "Situationscheck bevor CTA: Was hat sich geändert? So kann der folgende Pitch genau auf die heutige Situation abgestimmt werden." },
        ],
        nextState: "interested",
        triggerBooking: false,
        closeConversation: false,
      };

    case "fundamental_no":
      return {
        leadText: `Nein, wirklich nicht. Das ist grundsätzlich kein Thema für uns.`,
        agentMsg: short
          ? `Verstanden ${p.firstName}, danke für die Ehrlichkeit. Ich melde mich nicht mehr.`
          : `Danke für die klare Rückmeldung, ${p.firstName}.\n\nIch respektiere das und werde mich nicht mehr melden.\n\nAlles Gute weiterhin,\n${ctx.agentName}`,
        agentLabel: "Sauberer Abschluss",
        agentThinking: [
          { phase: "Definitives Nein", content: "Lead hat klares, grundsätzliches Nein gegeben. Nicht mehr kontaktieren.", highlight: true },
        ],
        nextState: "closed",
        triggerBooking: false,
        closeConversation: true,
      };

    case "responds_late":
      return {
        leadText: `Sorry für die späte Rückmeldung! Ja, das Thema ist tatsächlich noch offen. Was haben Sie konkret im Angebot?`,
        agentMsg: short
          ? `Kein Problem ${p.firstName}! Bevor ich erkläre: Was ist bei Ihnen${co} aktuell konkret das grösste Problem mit ${ctx.painPoint}?`
          : `Kein Problem, ${p.firstName} – ich freue mich wirklich, dass Sie sich melden!\n\nBevor ich Ihnen erkläre, was ${ctx.companyName} konkret macht, möchte ich verstehen, wo bei ${p.company || "Ihnen"} aktuell der Schuh drückt:\n\nWas ist im Moment die grösste Herausforderung bei ${ctx.painPoint}? Und hat sich in der letzten Zeit etwas verändert, das das Thema jetzt wieder aktuell macht?\n\nIch frage, weil ich sicherstellen möchte, dass das, was ich Ihnen zeige, auch wirklich relevant ist – und nicht einfach eine generische Demo.`,
        agentLabel: "Spätantwort – Discovery first",
        agentThinking: [
          { phase: "Spätantwort erhalten", content: "No Response → Lead antwortet doch. Kaufsignal vorhanden. Aber: erst verstehen was sich geändert hat, dann CTA.", highlight: true },
          { phase: "Strategie", content: "Lead fragt direkt nach Angebot — Reflex wäre Pitch. Besser: kurze Discovery-Frage zuerst. Macht die folgende Antwort viel relevanter." },
        ],
        nextState: "interested",
        triggerBooking: false,
        closeConversation: false,
      };

    case "still_no_response":
      return {
        leadText: ``,
        agentMsg: short
          ? `Hallo ${p.firstName}, letzter Versuch. Falls kein Interesse – kurze Rückmeldung reicht. Sonst nehme ich Sie von der Liste.`
          : `Guten Tag ${p.firstName},\n\nIch melde mich ein letztes Mal.\n\nFalls kein Interesse besteht – eine kurze Rückmeldung würde mir sehr helfen, damit ich Sie von meiner Liste nehmen kann.\n\nFalls doch Interesse besteht: ${ctx.bookingLink}\n\nDanke und alles Gute,\n${ctx.agentName}`,
        agentLabel: "Letzter Versuch",
        agentThinking: [
          { phase: "Letzter Follow-up", content: "Zweites Mal keine Antwort. Letzter Versuch mit klarem Exit-Angebot. Danach: Dormant setzen.", highlight: true },
        ],
        nextState: "closed",
        triggerBooking: false,
        closeConversation: true,
      };

    case "ready_to_talk":
      return {
        leadText: `Ja, ein kurzes Gespräch kann ich mir gut vorstellen. Was würde das konkret bringen?`,
        agentMsg: short
          ? `Super ${p.firstName}! 20 Min, ich zeige konkret wie das${co} funktioniert. Anfang oder Mitte Woche?`
          : `Ausgezeichnet, ${p.firstName}!\n\nIn 20 Minuten zeige ich Ihnen live, wie ${ctx.companyName} konkret${co} helfen kann – mit echten Zahlen und einem Setup, das zu Ihrer Situation passt.\n\nPasst Ihnen besser Anfang oder Mitte der Woche?`,
        agentLabel: "Direkt zum Termin",
        agentThinking: [
          { phase: "Bereit für Call", content: "Lead signalisiert Bereitschaft. Direkt Terminoptionen anbieten.", highlight: true },
        ],
        nextState: "interested",
        triggerBooking: true,
        closeConversation: false,
      };

    case "needs_one_more_nudge":
      return {
        leadText: `Was würden wir in dem Gespräch konkret besprechen? Ich will nicht meine Zeit verschwenden.`,
        agentMsg: short
          ? `Verständlich ${p.firstName}. Wir besprechen: 1) Ihre aktuelle Situation, 2) ob wir konkret helfen können, 3) nächste Schritte. 20 Min – keine Verschwendung. Passen Sie?`
          : `Das verstehe ich vollständig, ${p.firstName} – Ihre Zeit ist wertvoll.\n\nIn 20 Minuten würden wir konkret drei Dinge klären:\n\n1. Wo verlieren Sie aktuell die meisten Leads?\n2. Wie würde ${ctx.companyName} das für ${p.company || "Ihr Team"} konkret lösen?\n3. Macht das wirtschaftlich Sinn – oder nicht?\n\nWenn nach 20 Minuten kein Fit besteht, sage ich das direkt.\n\nPasst Ihnen Anfang oder Mitte der Woche?`,
        agentLabel: "Agenda zeigen",
        agentThinking: [
          { phase: "Zeit-Einwand", content: "Lead will Agenda sehen. Konkrete 3-Punkte-Agenda + Ehrlichkeitsversprechen reduziert Risiko.", highlight: true },
        ],
        nextState: "interested",
        triggerBooking: true,
        closeConversation: false,
      };

    case "elaborates_challenge":
      return {
        leadText: `Das Hauptproblem ist, dass wir zu wenig Kapazität haben für manuelles Nachfassen. Wir haben zwar Leads, aber die Konvertierungsrate ist zu tief, weil wir viele einfach liegen lassen.`,
        agentMsg: short
          ? `Das kenne ich genau ${p.firstName}. Gute Nachricht: genau das ist unser Kernprodukt. Ich würde Ihnen das gerne in 20 Min zeigen – passt Ihnen eher Vormittag oder Nachmittag?`
          : `Das kenne ich sehr gut, ${p.firstName} – und es ist ehrlich gesagt das Problem, für das ${ctx.companyName} gebaut wurde.\n\n${ctx.valueProp}\n\nIch kann Ihnen in 20 Minuten konkret zeigen, wie das für ${p.company || "Ihr Team"} aussehen würde – mit realistischen Zahlen, ohne Hochglanzdemo.\n\nEine Frage zur Planung: Passt es Ihnen grundsätzlich besser Vormittags oder Nachmittags? Und eher diese oder nächste Woche?`,
        agentLabel: "Lösung verknüpfen + Terminpräferenz",
        agentThinking: [
          { phase: "Problem validiert", content: "Lead beschreibt Kernproblem: Kapazität für Follow-up fehlt, Konversionsrate leidet. Direkte Verbindung zu unserer Lösung.", highlight: true },
          { phase: "Strategie", content: "Problem explizit widerspiegeln → unsere Lösung als direkte Antwort positionieren → Terminpräferenz erfragen (Vm/Nm + diese/nächste Woche)." },
          { phase: "Buchungsfluss", content: "Statt direkt Slots anzubieten: erst Präferenz (Vm/Nm, diese/nächste Woche) → dann 2 konkrete Slots." },
        ],
        nextState: "booking",
        triggerBooking: true,
        closeConversation: false,
      };

    case "mentions_multiple_problems":
      return {
        leadText: `Eigentlich haben wir da mehrere Baustellen: Das Follow-up klappt nicht, aber auch die initiale Ansprache ist oft zu generisch, und wir wissen nicht wirklich, welche Leads Priorität haben.`,
        agentMsg: short
          ? `Das sind drei verschiedene Themen ${p.firstName} – wir können bei allen helfen. Welches brennt aktuell am meisten? Dann zeige ich das zuerst.`
          : `Das sind drei echte Probleme, ${p.firstName} – und ich schätze die Ehrlichkeit.\n\nKurz eingeordnet:\n\n• **Kein systematisches Follow-up** → das ist unser Kernbereich\n• **Zu generische Ansprache** → lösen wir mit KI-basierter Hyper-Personalisierung\n• **Lead-Priorisierung unklar** → unser Scoring-System zeigt sofort, welche Leads reaktivierbar sind\n\nWelches dieser drei Themen brennt bei ${p.company || "Ihnen"} aktuell am meisten? Das würde ich Ihnen als erstes zeigen.\n\nUnd: passt es Ihnen für ein 20-Min-Gespräch eher Vormittags oder Nachmittags?`,
        agentLabel: "Probleme strukturieren + Fokus",
        agentThinking: [
          { phase: "Mehrere Probleme erkannt", content: "Lead nennt 3 Probleme: Follow-up, Personalisierung, Lead-Scoring. Alle drei liegen in unserem Bereich.", highlight: true },
          { phase: "Strategie", content: "Probleme strukturiert wiedergeben (zeigt Zuhören) → auf alle drei eingehen → Frage: welches brennt am meisten? → Fokus für Demo setzen → Terminpräferenz erfragen." },
        ],
        nextState: "booking",
        triggerBooking: true,
        closeConversation: false,
      };

    case "wants_next_step_now":
      return {
        leadText: `Das klingt genau richtig für uns. Was wäre jetzt konkret der nächste Schritt?`,
        agentMsg: short
          ? `Super ${p.firstName}! Der nächste Schritt: ein 20-Min-Gespräch, in dem ich das konkret für ${p.company || "Euch"} zeige. Passt Vormittag oder Nachmittag besser?`
          : `Wunderbar, ${p.firstName} – das freut mich zu hören!\n\nDer konkrete nächste Schritt: ein 20-minütiges Gespräch, in dem ich Ihnen live zeige, wie ${ctx.companyName} das für ${p.company || "Ihr Team"} konkret umsetzen würde – mit echten Zahlen, nicht mit generischen Versprechen.\n\nUm einen passenden Termin zu finden: Passt es Ihnen grundsätzlich besser Vormittags oder Nachmittags? Und eher diese oder nächste Woche?\n\nDann schlage ich Ihnen direkt zwei konkrete Zeiten vor.`,
        agentLabel: "Nächster Schritt + Terminpräferenz",
        agentThinking: [
          { phase: "Lead bereit", content: "Lead signalisiert klare Kaufbereitschaft und fragt aktiv nach nächstem Schritt. Jetzt Terminbuchung einleiten.", highlight: true },
          { phase: "Buchungsfluss", content: "Erst Präferenz erfragen (Vm/Nm + diese/nächste Woche) → dann 2 konkrete Slots mit Kalender-Abgleich. Weniger Friction als sofortiger Link." },
        ],
        nextState: "booking",
        triggerBooking: true,
        closeConversation: false,
      };

    case "scheduling_morning":
      return {
        leadText: `Mir passt Vormittags besser, am liebsten nächste Woche wenn möglich.`,
        agentMsg: short
          ? `Perfekt ${p.firstName}! Zwei Optionen nächste Woche Vormittag:\n• Dienstag, 09:30–09:50\n• Donnerstag, 10:00–10:20\n\nWelche passt Ihnen?`
          : `Perfekt, ${p.firstName} – ich habe nächste Woche Vormittag noch zwei freie Slots für Sie:\n\n• **Dienstag, ${new Date(Date.now() + 8*86400000).toLocaleDateString("de-CH", {day:"2-digit",month:"2-digit"})}, 09:30–09:50 Uhr**\n• **Donnerstag, ${new Date(Date.now() + 10*86400000).toLocaleDateString("de-CH", {day:"2-digit",month:"2-digit"})}, 10:00–10:20 Uhr**\n\nWelcher Termin passt Ihnen besser? Nach Ihrer Bestätigung erhalten Sie direkt eine Kalendereinladung.\n\n*(Alternativ: direkt selbst buchen unter ${ctx.bookingLink})*`,
        agentLabel: "Zwei Termine Vormittag",
        agentThinking: [
          { phase: "Präferenz erhalten", content: "Lead: Vormittags, nächste Woche. Kalender-Abgleich → 2 freie Slots Dienstag 09:30 und Donnerstag 10:00.", highlight: true },
          { phase: "Buchungsfluss", content: "2 konkrete Optionen präsentieren. Nach Wahl: Kalendereinladung versenden. Booking-Link als Fallback." },
        ],
        nextState: "booked",
        triggerBooking: false,
        closeConversation: false,
      };

    case "scheduling_afternoon":
      return {
        leadText: `Nachmittags wäre mir lieber, diese Woche wenn noch etwas frei ist.`,
        agentMsg: short
          ? `Perfekt ${p.firstName}! Zwei Optionen diese Woche Nachmittag:\n• Mittwoch, 14:00–14:20\n• Freitag, 15:30–15:50\n\nWelche passt Ihnen?`
          : `Gut, ${p.firstName} – ich habe diese Woche Nachmittag noch zwei freie Slots:\n\n• **Mittwoch, ${new Date(Date.now() + 2*86400000).toLocaleDateString("de-CH", {day:"2-digit",month:"2-digit"})}, 14:00–14:20 Uhr**\n• **Freitag, ${new Date(Date.now() + 4*86400000).toLocaleDateString("de-CH", {day:"2-digit",month:"2-digit"})}, 15:30–15:50 Uhr**\n\nWelcher Termin passt Ihnen besser? Nach Ihrer Bestätigung bekommen Sie sofort eine Kalendereinladung.\n\n*(Alternativ: direkt selbst buchen unter ${ctx.bookingLink})*`,
        agentLabel: "Zwei Termine Nachmittag",
        agentThinking: [
          { phase: "Präferenz erhalten", content: "Lead: Nachmittags, diese Woche. Kalender-Abgleich → 2 freie Slots Mittwoch 14:00 und Freitag 15:30.", highlight: true },
          { phase: "Buchungsfluss", content: "2 konkrete Optionen präsentieren. Nach Wahl: Kalendereinladung versenden. Booking-Link als Fallback." },
        ],
        nextState: "booked",
        triggerBooking: false,
        closeConversation: false,
      };

    // ── OBJECTION HANDLING ─────────────────────────────────────────────────────

    case "objects_price":
      return {
        leadText: `Das klingt alles gut, aber ehrlich gesagt – das Budget ist bei uns gerade ein Thema. Ich glaube, das ist für uns zu teuer.`,
        agentMsg: short
          ? `Das verstehe ich ${p.firstName}. Kurze Frage: Was wäre ein Ergebnis, das den Preis rechtfertigen würde? Dann kann ich zeigen ob das realistisch ist.`
          : `Das ist eine faire Frage, ${p.firstName} – und ich schätze die Direktheit.\n\nBevor ich Ihnen Zahlen nenne: Es hängt sehr davon ab, was das konkret für ${p.company || "Ihr Team"} einbringen würde.\n\nEine Frage: Wie viele reaktivierbare Leads haben Sie aktuell ungefähr in der Pipeline, die keine Antwort bekommen haben?\n\nDer Grund: Wenn jeder dieser Leads nur 10% Wahrscheinlichkeit hat, doch noch zu konvertieren – wird die Rechnung sehr schnell positiv. Ich möchte das nicht abstrakt behaupten, sondern Ihnen anhand Ihrer Zahlen zeigen.\n\nWäre das ein sinnvoller Ansatz?`,
        agentLabel: "ROI-Argumentation statt Preisvertheidigung",
        agentThinking: [
          { phase: "Preiseinwand erkannt", content: "Lead bringt Budget-Einwand. Klassische Reaktion wäre: Preis erklären oder Rabatt anbieten. Besser: ROI-Konversation eröffnen.", highlight: true },
          { phase: "Strategie", content: "Nicht verteidigen, nicht nachgeben. Stattdessen: Gegenfrage zum erwarteten Ergebnis → dann ROI-Rechnung mit eigenen Zahlen des Leads aufstellen. Preiseinwand wird zu Wert-Gespräch." },
          { phase: "Nächster Schritt", content: "Lead soll seine Zahlen nennen (Anzahl Leads). Danach: konkrete ROI-Hochrechnung. Termin = Ort um das gemeinsam durchzurechnen." },
        ],
        nextState: "interested",
        triggerBooking: false,
        closeConversation: false,
      };

    case "objects_time":
      return {
        leadText: `Grundsätzlich interessant – aber im Moment haben wir gerade zu viel auf dem Tisch. Das ist jetzt nicht der richtige Zeitpunkt.`,
        agentMsg: short
          ? `Das verstehe ich ${p.firstName}. Darf ich fragen: Wann wäre ein besserer Zeitpunkt? Ich melde mich dann nochmals.`
          : `Das kenne ich – und ich respektiere das vollständig, ${p.firstName}.\n\nNur eine kurze Gegenfrage: Was müsste sich ändern, damit der Zeitpunkt passt? Ist es ein Projekt, das abgeschlossen wird? Ein Quartal, das sich beruhigt?\n\nIch frage nicht, um Druck zu machen – sondern weil ich gerne genau dann wieder melde, wenn es Sinn macht. Nicht vorher.\n\nFalls Sie mir einen ungefähren Zeitraum nennen können – 4 Wochen, 2 Monate, nach dem Sommer? Dann setze ich das in meinen Kalender und melde mich erst dann wieder.`,
        agentLabel: "Timing-Einwand qualifizieren",
        agentThinking: [
          { phase: "Timing-Einwand erkannt", content: "Lead hat Interesse, aber falsches Timing. Wichtig: unterscheiden zwischen 'echtem Timing-Problem' und 'höflichem Nein'.", highlight: true },
          { phase: "Strategie", content: "Frage nach dem konkreten Auslöser: Was ändert sich wann? So bekommt man einen echten Nachfasstermin — kein leeres 'melde ich mich später'." },
          { phase: "Nächster Schritt", content: "Konkrete Zeitangabe einholen (z.B. +6 Wochen). Dann: snoozen und zum vereinbarten Datum erneut kontaktieren." },
        ],
        nextState: "closed",
        triggerBooking: false,
        closeConversation: true,
      };

    case "objects_trust":
      return {
        leadText: `Klingt gut auf dem Papier – aber woher weiss ich, dass das wirklich funktioniert? Das haben wir schon mit anderen Tools versucht.`,
        agentMsg: short
          ? `Das ist eine völlig berechtigte Frage ${p.firstName}. Darf ich fragen, was bei den anderen Tools nicht funktioniert hat? Dann kann ich sagen ob wir das anders lösen – oder nicht.`
          : `Das ist eine völlig berechtigte Frage – und ich nehme sie ernst, ${p.firstName}.\n\n«Das haben wir schon versucht» bedeutet meistens: Das Tool hat versprochen, was Sie brauchten, aber in der Praxis nicht geliefert. Stimmt das?\n\nIch möchte keine Versprechen machen, die ich nicht halten kann. Deshalb direkt: Was genau hat bei den früheren Lösungen nicht funktioniert? War es die Personalisierung, die Delivery, der Aufwand bei der Einrichtung – oder etwas anderes?\n\nJe nachdem, was Sie mir sagen, werde ich Ihnen entweder zeigen, wie wir das konkret anders lösen – oder ich sage Ihnen ehrlich, wenn ich nicht glaube, dass wir das besser können.`,
        agentLabel: "Vertrauen aufbauen durch Ehrlichkeit",
        agentThinking: [
          { phase: "Vertrauenseinwand erkannt", content: "Lead hat negative Erfahrungen mit ähnlichen Lösungen. Kein Gegenargument bringt hier etwas — Glaubwürdigkeit muss verdient werden.", highlight: true },
          { phase: "Strategie", content: "Einwand ernst nehmen, nicht wegdiskutieren. Nachfragen was konkret nicht funktioniert hat → dann ehrlich bewerten ob wir das besser können oder nicht. Ehrlichkeit > Verkaufsrhetorik." },
          { phase: "Nächster Schritt", content: "Lead nennt konkreten Failure Point → wir können zeigen wie wir das spezifisch anders lösen (oder zugeben wenn nicht). Schafft echtes Vertrauen." },
        ],
        nextState: "interested",
        triggerBooking: false,
        closeConversation: false,
      };

    case "objects_competitor":
      return {
        leadText: `Wir schauen uns gerade auch noch andere Anbieter an. Ich will das erst vergleichen bevor ich eine Entscheidung treffe.`,
        agentMsg: short
          ? `Das ist sinnvoll ${p.firstName}! Was sind Ihre wichtigsten Kriterien beim Vergleich? Dann kann ich sagen wo wir uns unterscheiden – ohne Überzeugungsrhetorik.`
          : `Das ist absolut verständlich, ${p.firstName} – und ich würde dasselbe tun.\n\nEine Frage, die den Vergleich einfacher macht: Was sind Ihre zwei oder drei wichtigsten Kriterien? Also was muss eine Lösung unbedingt leisten, damit Sie sie ernsthaft in Betracht ziehen?\n\nDer Grund: Wir sind bewusst nicht für jeden geeignet. Bei manchen Anforderungen sind andere Anbieter besser. Bei anderen – vor allem wenn es um hyper-personalisierte, multi-turn Reaktivierung geht – ist unser Ansatz schwer zu schlagen.\n\nWenn ich weiss, was Ihnen wichtig ist, kann ich Ihnen einen ehrlichen Vergleich geben – ohne Marketing-Sprache.`,
        agentLabel: "Kriterien-geleiteter Vergleich",
        agentThinking: [
          { phase: "Konkurrenz-Situation erkannt", content: "Lead evaluiert mehrere Anbieter. Falsche Reaktion: eigene Vorteile auflisten. Richtige Reaktion: Entscheidungskriterien des Leads herausfinden.", highlight: true },
          { phase: "Strategie", content: "Nicht gegen Konkurrenz argumentieren — das wirkt defensiv. Stattdessen: Kriterien des Leads erfragen → dann selektiv auf unsere Stärken eingehen → Schwächen ehrlich zugeben. Positionierung durch Klarheit statt Versprechen." },
          { phase: "Nächster Schritt", content: "Lead nennt Kriterien → wir können zeigen wo wir stark sind und ehrlich sein wo nicht. Schafft Vertrauen im Vergleich." },
        ],
        nextState: "interested",
        triggerBooking: false,
        closeConversation: false,
      };

    default:
      return {
        leadText: "Interessant, erzählen Sie mir mehr.",
        agentMsg: `Gerne! Darf ich kurz fragen: Was ist aktuell die grösste Herausforderung bei ${ctx.painPoint}${co}?`,
        agentLabel: "Weiterführen",
        agentThinking: [],
        nextState: "interested",
        triggerBooking: false,
        closeConversation: false,
      };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MULTI-AGENT PIPELINE
// 6 specialized agents that run sequentially for each lead
// ─────────────────────────────────────────────────────────────────────────────

export type ConvSegment =
  | "interested_stalled"
  | "timing_issue"
  | "price_issue"
  | "no_response"
  | "low_intent"
  | "unknown";

export const CONV_SEGMENT_META: Record<ConvSegment, { label: string; desc: string; strategy: string; color: string; bg: string; border: string }> = {
  interested_stalled: { label: "Interessiert & gestoppt", desc: "Hatte Interesse, aber der Prozess ist eingeschlafen", strategy: "Direkter Re-Engagement mit Referenz auf altes Gespräch", color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" },
  timing_issue:       { label: "Timing-Problem",          desc: "Zeitpunkt war falsch, nicht das Angebot",            strategy: "Neues Timing antasten, Budget-/Planungszyklus prüfen",  color: "text-blue-700",    bg: "bg-blue-50",    border: "border-blue-200" },
  price_issue:        { label: "Preis-Einwand",            desc: "Budgetfrage oder wahrgenommener ROI unklar",         strategy: "ROI-Argumentation, konkreter Case Study-Ansatz",        color: "text-amber-700",   bg: "bg-amber-50",   border: "border-amber-200" },
  no_response:        { label: "Keine Rückmeldung",        desc: "Nie oder kaum geantwortet",                          strategy: "Sanfter Kontakt, niedrige Schwelle, einfache Frage",    color: "text-slate-600",   bg: "bg-slate-100",  border: "border-slate-200" },
  low_intent:         { label: "Geringes Interesse",       desc: "War nie wirklich interessiert",                      strategy: "Neues Nutzenversprechen, Situationsveränderung prüfen", color: "text-purple-700",  bg: "bg-purple-50",  border: "border-purple-200" },
  unknown:            { label: "Unklar",                   desc: "Zu wenig Daten für Einschätzung",                    strategy: "Offene, neugierige Ansprache ohne Annahmen",            color: "text-slate-500",   bg: "bg-slate-50",   border: "border-slate-200" },
};

export interface DataInterpreterResult {
  fieldsFound: number;
  totalPossible: number;
  dataQuality: "high" | "medium" | "low";
  qualityScore: number;
  missingFields: string[];
  enrichedFields: string[];
  contactability: "email+phone" | "email" | "phone" | "none";
}

export interface ContextReconstructionResult {
  story: string;
  interactionSummary: string;
  funnelStage: string;
  dropOffHypothesis: string;
  confidence: number;
  confidenceReason: string;
  timingNote: string;
}

export interface SegmentationResult {
  segment: ConvSegment;
  segmentLabel: string;
  reasoning: string;
  score: number;
  alternativeSegment?: ConvSegment;
}

export interface PersonalizationResult {
  approach: string;
  tone: string;
  messagingAngle: string;
  keyHooks: string[];
  avoid: string[];
}

export interface QualityControlResult {
  humanScore: number;
  personalizationScore: number;
  relevanceScore: number;
  naturalScore: number;
  overallScore: number;
  flags: string[];
  approved: boolean;
  recommendation: string;
}

export interface FullPipelineResult {
  profile: LeadProfile;
  dataInterpreter: DataInterpreterResult;
  contextReconstruction: ContextReconstructionResult;
  segmentation: SegmentationResult;
  personalization: PersonalizationResult;
  conversationEngine: { initialMessages: MessageVariation[]; stateCount: number };
  qualityControl: QualityControlResult;
}

// Agent helpers

function inferConvSegment(p: LeadProfile): SegmentationResult {
  const notes = p.notes.toLowerCase();
  const days = p.daysSinceContact;

  if (!p.email && !p.phone) {
    return { segment: "unknown", segmentLabel: CONV_SEGMENT_META.unknown.label, reasoning: "Keine Kontaktdaten vorhanden — Segment nicht bestimmbar.", score: p.score };
  }

  // Price issue signals
  if (/preis|kosten|teuer|budget|günstig|rabatt/.test(notes)) {
    return {
      segment: "price_issue", segmentLabel: CONV_SEGMENT_META.price_issue.label,
      reasoning: "Notizen enthalten Budget- oder Preissignale. Lead ist möglicherweise am ROI-Argument gescheitert.",
      score: p.score, alternativeSegment: "timing_issue",
    };
  }

  // Timing signals
  if (/timing|später|nächstes|quartal|jahresplan|noch nicht|warten/.test(notes)) {
    return {
      segment: "timing_issue", segmentLabel: CONV_SEGMENT_META.timing_issue.label,
      reasoning: "Timing-Signale erkannt. Lead war interessiert, aber der Zeitpunkt hat nicht gepasst.",
      score: p.score, alternativeSegment: "interested_stalled",
    };
  }

  // Strong interest signals
  if (/interessiert|demo|gespräch|positiv|begeistert|termin|follow.up/.test(notes) && p.score >= 55) {
    return {
      segment: "interested_stalled", segmentLabel: CONV_SEGMENT_META.interested_stalled.label,
      reasoning: "Klares Interesse in Notizen erkannt, aber Prozess eingeschlafen. Hohe Reaktivierungswahrscheinlichkeit.",
      score: p.score,
    };
  }

  // No response history
  if (days !== null && days > 180 && !notes) {
    return {
      segment: "no_response", segmentLabel: CONV_SEGMENT_META.no_response.label,
      reasoning: `Über ${Math.round((days ?? 0) / 30)} Monate kein Kontakt, keine Notizen. Wahrscheinlich nie wirklich engaged.`,
      score: p.score,
    };
  }

  // Low intent
  if (p.score < 40) {
    return {
      segment: "low_intent", segmentLabel: CONV_SEGMENT_META.low_intent.label,
      reasoning: "Niedrige Signaldichte. Lead hat möglicherweise nie ernsthaftes Interesse gezeigt.",
      score: p.score, alternativeSegment: "unknown",
    };
  }

  return {
    segment: "interested_stalled", segmentLabel: CONV_SEGMENT_META.interested_stalled.label,
    reasoning: "Kein spezifisches Segment eindeutig erkennbar — stärkste Hypothese ist gestoppter Interessent.",
    score: p.score,
  };
}

function buildLeadStory(p: LeadProfile, ctx: BusinessContext): string {
  const since = p.daysSinceContact !== null
    ? `vor ca. ${Math.round(p.daysSinceContact / 30)} Monaten`
    : "vor unbekannter Zeit";
  const role = p.jobTitle ? ` als ${p.jobTitle}` : "";
  const co = p.company ? ` bei ${p.company}` : "";
  const interest = p.pastInterest || ctx.product;
  return `${p.fullName}${role}${co} hat sich ${since} für ${interest} interessiert. ` +
    `Drop-off-Grund: ${p.dropOffReason}. Aktuelle Situation: ${p.currentSituation}.`;
}

function inferFunnelStage(p: LeadProfile): string {
  if (p.score >= 72) return "Evaluation / Fast-Entscheidung";
  if (p.score >= 52) return "Awareness / Erstes Interesse";
  if (p.score >= 35) return "Frühe Recherche";
  return "Unbekannte Funnel-Phase";
}

function buildPersonalizationStrategy(
  p: LeadProfile,
  seg: SegmentationResult,
  ctx: BusinessContext
): PersonalizationResult {
  const isDecision = p.isDecisionMaker;
  const segMeta = CONV_SEGMENT_META[seg.segment];

  const toneMap: Record<ConvSegment, string> = {
    interested_stalled: "persönlich, warm, direkt",
    timing_issue: "verständnisvoll, geduldig, offen",
    price_issue: "wertorientiert, sachlich, konkret",
    no_response: "niedrige Schwelle, kurz, freundlich",
    low_intent: "neugierig, nicht aufdringlich",
    unknown: "offen, neutral, keine Annahmen",
  };

  const hooksMap: Record<ConvSegment, string[]> = {
    interested_stalled: [`Referenz auf altes Gespräch`, `Zeitdruck oder neue Entwicklung`, p.company ? `Spezifisch zu ${p.company}` : "Branchenreferenz"],
    timing_issue: ["Neuer Planungszyklus", "Was hat sich verändert?", "Niedrige Einstiegsschwelle"],
    price_issue: ["ROI konkret", "Case Study ähnliche Unternehmen", "Flexibles Angebot / Pilotprojekt"],
    no_response: ["Sehr kurze Nachricht", "Keine Erwartungshaltung", "Einfacher Exit für Lead"],
    low_intent: ["Neues Nutzenversprechen", "Veränderte Situation?", "Keine Agenda"],
    unknown: ["Offene Frage", "Neugier wecken", "Kein Pitch"],
  };

  return {
    approach: segMeta.strategy,
    tone: toneMap[seg.segment],
    messagingAngle: isDecision
      ? "C-Level Ansprache: Business Impact und Effizienz betonen"
      : "Fachebene: konkreter Nutzen und Arbeitsersparnis",
    keyHooks: hooksMap[seg.segment] || [],
    avoid: ["Corporate Sprache", "Lange Texte", "Mehrere Fragen gleichzeitig", "Zu viel Erklärung"],
  };
}

function runQualityControl(
  messages: MessageVariation[],
  p: LeadProfile,
  ctx: BusinessContext
): QualityControlResult {
  const hasName = messages.some(m => m.body.includes(p.firstName));
  const hasCompany = messages.some(m => m.body.includes(p.company));
  const hasPastRef = messages.some(m => /damals|früher|mal|Anfrage|gesprochen|gestolpert/.test(m.body));
  const hasQuestion = messages.some(m => m.body.includes("?"));
  const avgLength = messages.reduce((s, m) => s + m.body.length, 0) / Math.max(messages.length, 1);
  const isShort = avgLength < 600;

  const humanScore         = hasName ? 85 : 60;
  const personalizationScore = (hasName ? 35 : 0) + (hasCompany ? 30 : 0) + (hasPastRef ? 35 : 0);
  const relevanceScore     = hasPastRef ? 88 : 65;
  const naturalScore       = (hasQuestion ? 25 : 0) + (isShort ? 40 : 20) + 25;

  const overallScore = Math.round((humanScore + personalizationScore + relevanceScore + naturalScore) / 4);

  const flags: string[] = [];
  if (!hasName) flags.push("Name nicht verwendet — niedrige Personalisierung");
  if (!hasCompany) flags.push("Unternehmen fehlt in Nachricht");
  if (!hasPastRef) flags.push("Kein Bezug auf vergangene Interaktion");
  if (!hasQuestion) flags.push("Keine Frage — Lead kann nicht reagieren");
  if (avgLength > 800) flags.push("Nachricht zu lang — kürzen empfohlen");

  const approved = overallScore >= 70 && flags.length <= 1;
  const recommendation = approved
    ? "Nachrichten sind bereit. Qualität gut."
    : `${flags.length} Punkt${flags.length > 1 ? "e" : ""} zur Verbesserung erkannt. Manuell prüfen.`;

  return { humanScore, personalizationScore, relevanceScore, naturalScore, overallScore, flags, approved, recommendation };
}

// ─── MAIN PIPELINE RUNNER ────────────────────────────────────────────────────

export function runAgentPipeline(
  normalized: Record<string, string>,
  id: number,
  channel: Channel,
  ctx: BusinessContext
): FullPipelineResult {
  // Build profile
  const profile = buildLeadProfile(normalized, id, ctx);

  // Agent 1: Data Interpreter
  const fieldsFound = Object.values(normalized).filter(v => v && v.trim()).length;
  const totalPossible = 13;
  const missingFields: string[] = [];
  if (!normalized.email && !normalized.phone) missingFields.push("Kontaktdaten");
  if (!normalized.company) missingFields.push("Unternehmen");
  if (!normalized.jobTitle) missingFields.push("Position");
  if (!normalized.lastContact) missingFields.push("Letzter Kontakt");
  if (!normalized.notes) missingFields.push("Notizen / Kontext");
  const qualityScore = Math.round((fieldsFound / totalPossible) * 100);
  const dataQuality: "high" | "medium" | "low" = qualityScore >= 70 ? "high" : qualityScore >= 40 ? "medium" : "low";
  const contactability =
    profile.email && profile.phone ? "email+phone" :
    profile.email ? "email" :
    profile.phone ? "phone" : "none";

  const dataInterpreter: DataInterpreterResult = {
    fieldsFound, totalPossible, dataQuality, qualityScore, missingFields,
    enrichedFields: ["Score", "Segment", "Tage seit Kontakt", "Entscheidungsrolle", "Hypothese"],
    contactability,
  };

  // Agent 2: Context Reconstruction
  const story = buildLeadStory(profile, ctx);
  const funnelStage = inferFunnelStage(profile);
  const timingNote = profile.daysSinceContact !== null
    ? `${profile.daysSinceContact} Tage seit letztem Kontakt (${profile.currentSituation.toLowerCase()})`
    : "Kein Kontaktdatum — Zeitfenster unbekannt";
  const confidenceReason =
    profile.confidence === "high" ? "Notizen + Datum + Entscheidungsrolle vorhanden" :
    profile.confidence === "medium" ? "Teildaten vorhanden — Hypothese mit mittlerer Sicherheit" :
    "Wenig Daten — Hypothese spekulativ";

  const contextReconstruction: ContextReconstructionResult = {
    story, interactionSummary: profile.notes || "Keine Notizen vorhanden",
    funnelStage, dropOffHypothesis: profile.dropOffReason,
    confidence: Math.round(profile.score * 0.8),
    confidenceReason, timingNote,
  };

  // Agent 3: Segmentation
  const segmentation = inferConvSegment(profile);

  // Agent 4: Personalization
  const personalization = buildPersonalizationStrategy(profile, segmentation, ctx);

  // Agent 5: Conversation Engine
  const initialMessages = generateInitialMessages(profile, channel, ctx);

  // Agent 6: Quality Control
  const qualityControl = runQualityControl(initialMessages, profile, ctx);

  return {
    profile, dataInterpreter, contextReconstruction, segmentation,
    personalization,
    conversationEngine: { initialMessages, stateCount: 5 },
    qualityControl,
  };
}
