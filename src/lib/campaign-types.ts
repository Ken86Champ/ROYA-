// ─── Campaign Types & Constants (client-safe, no server imports) ──────────────

export type Channel = "sms" | "whatsapp" | "email";

export type CampaignStatus = "draft" | "active" | "paused" | "completed";
export type StepType = "opener" | "followup" | "breakup" | "booking" | "condition" | "exit";

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
  { id: "gpt-4o-mini",               label: "GPT-4o mini",        badge: "Bald",       provider: "openai",    available: false, desc: "OpenAI · günstig · agentische Abläufe" },
  { id: "gpt-4o",                    label: "GPT-4o",             badge: "Bald",       provider: "openai",    available: false, desc: "OpenAI · Frontier · komplexe Workflows" },
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
}

export const DEFAULT_AI_FRAMEWORK: AIFramework = {
  agentName: "Lena",
  agentRole: "KI-Reaktivierungsagentin",
  tone: "Warm, direkt und menschlich — wie eine Freundin die im Bereich arbeitet",
  language: "de",
  standardModel: "claude-sonnet-4-6",
  premiumModel: "claude-opus-4-6",
  escalation: { afterTurns: 4, onIntents: ["objecting", "asking_price"] },
  systemPrompt: "",
  rules: ["max_2_sentences", "end_with_question", "no_price_in_opener", "use_first_name"],
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
  status: "pending" | "contacted" | "replied" | "interested" | "booked" | "closed" | "opted_out";
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
