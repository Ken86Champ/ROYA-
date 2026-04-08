// ─── ROYA V2 — Conversation Types ────────────────────────────────────────────

export type ConversationState =
  | 'new_unaware'
  | 'lightly_engaged'
  | 'curious'
  | 'guarded'
  | 'skeptical'
  | 'warm'
  | 'interested_but_busy'
  | 'needs_clarity'
  | 'pricing_probe'
  | 'qualified_ready'
  | 'not_now'
  | 'dead'
  | 'handoff_required';

export type EmotionalTone =
  | 'positive'
  | 'neutral'
  | 'negative'
  | 'guarded'
  | 'skeptical'
  | 'confused';

export type MicroIntent =
  | 'replying_politely'
  | 'showing_interest'
  | 'testing_legitimacy'
  | 'asking_question'
  | 'objecting'
  | 'asking_price'
  | 'timing_issue'
  | 'soft_rejection'
  | 'hard_rejection'
  | 'confused'
  | 'angry'
  | 'other';

export type NextAction =
  | 'ask_question'
  | 'clarify'
  | 'validate'
  | 'soft_pitch'
  | 'book_call'
  | 'defer'
  | 'close_loop'
  | 'handoff'
  | 'stop';

export interface ConversationScores {
  temperature: number;       // 0-100  warmth / openness
  friction: number;          // 0-100  resistance / pushback
  bookingReadiness: number;  // 0-100  how close to booking
  trust: number;             // 0-100  legitimacy established
  risk: number;              // 0-100  handoff / churn risk
}

export interface MessageInterpretation {
  explicitMeaning: string;
  implicitMeaning: string;
  emotionalTone: EmotionalTone;
  microIntent: MicroIntent;
  likelyNeed: string;
  hiddenConcern: string;
  stateRecommendation: ConversationState;
  riskFlags: string[];
}

export interface StrategyDecision {
  primaryGoal: string;
  nextAction: NextAction;
  angle: string;
  thingsToAvoid: string[];
  desiredTone: string;
  maxLength: 'short' | 'medium';
}

export interface DraftReply {
  message: string;
}

export interface ReplyCheck {
  approved: boolean;
  confidence: number;       // 0-100
  reasons: string[];
  editedMessage?: string;
  shouldHandoff: boolean;
}

// Combined output from Interpret+Strategy call (Phase 1)
export interface Phase1Result {
  interpretation: MessageInterpretation;
  strategy: StrategyDecision;
}

// Combined output from Write+Check call (Phase 2)
export interface Phase2Result {
  finalMessage: string;
  confidence: number;
  shouldHandoff: boolean;
  handoffReason?: string;
}

export interface OrchestratorResult {
  action: 'reply' | 'handoff' | 'stop' | 'optout';
  reply: string | null;
  newState: ConversationState;
  scores: ConversationScores;
  interpretation: MessageInterpretation;
  strategy: StrategyDecision;
  confidence: number;
}

export interface ConversationContext {
  conversationId: string;
  leadId?: string;
  leadName: string;
  channel: 'sms' | 'whatsapp' | 'email';
  currentState: ConversationState;
  scores: ConversationScores;
  history: HistoryMessage[];
  memory: ConversationMemory;
  business: BusinessPersona;
}

export interface HistoryMessage {
  role: 'lead' | 'agent';
  content: string;
  timestamp: string;
}

export interface ConversationMemory {
  summary: string;
  keyFacts: string[];
  objectionsSeen: string[];
  interests: string[];
  constraints: string[];
  lastSuccessfulAngle: string;
  lastFailedAngle: string;
  bookingReadinessNotes: string;
}

export const EMPTY_MEMORY: ConversationMemory = {
  summary: '',
  keyFacts: [],
  objectionsSeen: [],
  interests: [],
  constraints: [],
  lastSuccessfulAngle: '',
  lastFailedAngle: '',
  bookingReadinessNotes: '',
};

export const DEFAULT_SCORES: ConversationScores = {
  temperature: 20,
  friction: 30,
  bookingReadiness: 0,
  trust: 10,
  risk: 20,
};

export interface BusinessPersona {
  agentName: string;
  companyName: string;
  offer: string;
  goal: string;
  tone: string;
  language: string;
  valueProp?: string;
  painPoint?: string;
  cta?: string;
  bookingLink?: string;
  // Extended context
  industry?: string;
  companyDescription?: string;
  location?: string;
  usps?: string;
  allServices?: string;
  priceRange?: string;
  specialOffer?: string;
  leadRelationship?: string;
  noConvertReason?: string;
  afterCta?: string;
  urgency?: string;
  objections?: { objection: string; response: string }[];
  doNotSay?: string;
  insiderKnowledge?: string;
  exampleConversation?: string;
}

export const DEFAULT_PERSONA: BusinessPersona = {
  agentName: 'Tanja',
  companyName: '10X Personaltraining',
  offer: 'Persönliches Training, Ernährungscoaching und individuelle Fitness-Programme für nachhaltige Ergebnisse',
  goal: 'Ein kostenloses 15-minütiges Beratungsgespräch vereinbaren',
  tone: 'Warm, direkt, menschlich — wie eine Freundin, die zufällig im Fitness-Bereich arbeitet',
  language: 'de',
};
