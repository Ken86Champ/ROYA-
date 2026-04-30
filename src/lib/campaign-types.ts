// ─── Campaign Types & Constants (client-safe, no server imports) ──────────────

export type Channel = "sms" | "whatsapp" | "email";

export type CampaignStatus = "draft" | "active" | "paused" | "completed";
export type StepType = "opener" | "followup" | "breakup" | "booking" | "condition" | "exit";

// ─── Prompt Framework (Template Library) ───────────────────────────────────────

export interface ExampleMessage {
  context: string;   // e.g. "Lead fragt nach Preis"
  message: string;   // e.g. "Fair enough — welches Budget hast du dir vorgestellt?"
}

export interface PromptFramework {
  id: string;
  agencyId?: string;         // null = system-wide default
  name: string;
  description: string;
  isSystem: boolean;          // true = can't delete, only duplicate
  writerInstructions: string;
  strategistInstructions: string;
  interpreterInstructions: string;
  rules: string[];
  forbiddenPhrases: string[];
  temperature: number;        // 0.1–1.0 (writer creativity)
  exampleMessages: ExampleMessage[];
  createdAt?: string;
  updatedAt?: string;
}

export const RULE_TEXT: Record<string, string> = {
  max_2_sentences:    "Antworte mit maximal 2 kurzen Sätzen.",
  end_with_question:  "Beende jede Antwort mit einer Frage.",
  no_price_in_opener: "Erwähne niemals Preise im ersten Kontakt.",
  use_first_name:     "Sprich den Lead MAXIMAL EINMAL mit Vornamen an — nur wenn es natürlich wirkt. Wiederhole den Namen NICHT in jeder Nachricht.",
  no_emoji:           "Verwende keine Emojis.",
  no_dashes:          "Keine Bindestriche/Gedankenstriche in Nachrichten.",
  swiss_german_ok:    "Schweizerdeutsche Ausdrücke sind erlaubt.",
};

export const AVAILABLE_RULES = Object.keys(RULE_TEXT);

// ─── AI Framework ──────────────────────────────────────────────────────────────

export type AIModelId =
  | "claude-haiku-4-5-20251001"
  | "claude-sonnet-4-6"
  | "claude-opus-4-6"
  | "gpt-4o-mini"
  | "gpt-4o"
  | "gemini-2.5-flash";

export const AI_MODELS: { id: AIModelId; label: string; badge: string; provider: "anthropic" | "openai" | "google"; available: boolean; desc: string }[] = [
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5",   badge: "Schnell",    provider: "anthropic", available: true,  desc: "Günstig · schnell · Routing & Klassifizierung" },
  { id: "claude-sonnet-4-6",         label: "Claude Sonnet 4.6",  badge: "Standard",   provider: "anthropic", available: true,  desc: "Beste Balance · empfohlen für Reply-Handling" },
  { id: "claude-opus-4-6",           label: "Claude Opus 4.6",    badge: "Premium",    provider: "anthropic", available: true,  desc: "Stärkstes Modell · schwierige Einwände & High-Value" },
  { id: "gpt-4o-mini",               label: "GPT-4o mini",        badge: "OpenAI",     provider: "openai",    available: true,  desc: "OpenAI · günstig · schnell · empfohlen für Setup & Agenten" },
  { id: "gpt-4o",                    label: "GPT-4o",             badge: "OpenAI",     provider: "openai",    available: true,  desc: "OpenAI · Frontier · komplexe Workflows" },
  { id: "gemini-2.5-flash",          label: "Gemini 2.5 Flash",   badge: "Bald",       provider: "google",    available: false, desc: "Google · günstig · Volumen-Workloads" },
];

export interface AIEscalation {
  afterTurns: number;
  onIntents: string[];
}

export interface AIFramework {
  agentName: string;
  agentRole: string;
  tone: string;
  language: string;
  standardModel: AIModelId;
  premiumModel: AIModelId;
  escalation: AIEscalation;
  systemPrompt: string;
  rules: string[];
  frameworkId?: string;       // references prompt_frameworks.id
  referenceDoc?: string;      // uploaded style guide / chat template
}

export const DEFAULT_AI_FRAMEWORK: AIFramework = {
  agentName: "Lena",
  agentRole: "KI-Reaktivierungsagentin",
  tone: "Warm, direkt und menschlich — wie eine Freundin die im Bereich arbeitet",
  language: "de",
  standardModel: "gpt-4o-mini",
  premiumModel: "gpt-4o",
  escalation: { afterTurns: 4, onIntents: ["objecting", "asking_price"] },
  systemPrompt: "",
  rules: ["max_2_sentences", "end_with_question", "no_price_in_opener", "use_first_name"],
  frameworkId: "roya-standard",   // Always link to ROYA Standard — ensures core formula applies from day 1
};

export interface FlowBranch {
  intent: "hot" | "warm" | "cold" | "question" | "timing" | "no_reply" | "default";
  nextStepIndex: number;
}

export interface FlowStep {
  id: string;
  type: StepType;
  label: string;
  delayDays: number;
  messageTemplate: string;
  condition: "no_reply" | "any" | "interested";
  branches?: FlowBranch[];
}

export interface CampaignContact {
  id: string;
  name: string;
  contact: string;
  channel: Channel;
  status: "pending" | "contacted" | "replied" | "interested" | "booked" | "closed" | "opted_out" | "human_escalated";
  currentStep: number;
  lastContactedAt?: string;
  convId?: string;
  emailAttempts: number;
  smsAttempts: number;
  whatsappAttempts: number;
  altContact?: string;
  altChannel?: Channel;
}

export interface CampaignStats {
  total: number;
  contacted: number;
  replied: number;
  interested: number;
  booked: number;
  optedOut: number;
  replyRate: number;
  bookingRate: number;
}

// ─── Business Context (5-Block Structure) ──────────────────────────────────────

export interface ObjectionResponse {
  objection: string;
  response: string;
}

export interface BusinessContext {
  // Block 1: Unternehmen
  companyName: string;
  industry: string;
  companyDescription: string;
  location: string;
  usps: string;

  // Block 2: Kampagnen-Produkt
  allServices: string;
  offer: string;              // das Produkt das in dieser Kampagne gepitcht wird
  priceRange: string;
  valueProp: string;          // konkrete Ergebnisse / Benefits
  specialOffer: string;

  // Block 3: Zielgruppe & Lead-Beziehung
  leadType: string;
  targetAudience: string;
  leadRelationship: string;   // former_customer | trial | inquiry | cold
  noConvertReason: string;    // warum abgesprungen
  painPoint: string;

  // Block 4: Gesprächsziel
  cta: string;
  afterCta: string;           // was passiert nach dem CTA
  bookingLink: string;
  urgency: string;

  // Block 5: Agent-Wissen
  objections: ObjectionResponse[];
  doNotSay: string;
  insiderKnowledge: string;
  exampleConversation: string;
}

export const DEFAULT_BUSINESS_CONTEXT: BusinessContext = {
  // Block 1
  companyName: '',
  industry: '',
  companyDescription: '',
  location: '',
  usps: '',
  // Block 2
  allServices: '',
  offer: '',
  priceRange: '',
  valueProp: '',
  specialOffer: '',
  // Block 3
  leadType: 'b2c',
  targetAudience: '',
  leadRelationship: 'former_customer',
  noConvertReason: '',
  painPoint: '',
  // Block 4
  cta: '',
  afterCta: '',
  bookingLink: '',
  urgency: '',
  // Block 5
  objections: [],
  doNotSay: '',
  insiderKnowledge: '',
  exampleConversation: '',
};

export interface Campaign {
  id: string;
  name: string;
  clientId?: string;
  channels: Channel[];
  status: CampaignStatus;
  flow: FlowStep[];
  aiFramework: AIFramework;
  businessContext: BusinessContext;
  contacts: CampaignContact[];
  stats: CampaignStats;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}
