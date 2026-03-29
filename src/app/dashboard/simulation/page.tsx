"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import {
  type Channel, type ConversationState, type ResponseType, type ContinuationType,
  type LeadProfile, type MessageVariation, type AgentThinkingStep,
  type BusinessContext, type FullPipelineResult,
  DEFAULT_CONTEXT, DEMO_LEADS_NORMALIZED, SEGMENT_META, STATE_META, RESPONSE_LABELS,
  CONV_SEGMENT_META,
  buildLeadProfile, generateInitialMessages, generateStateResponse,
  generateBookingMessages, getAgentThinking, getSimulatedLeadResponse,
  getContinuationOptions, generateContinuationExchange, runAgentPipeline,
} from "@/lib/reactivation-engine";

// ─── CSV PARSER ───────────────────────────────────────────────────────────────

function parseCSV(text: string) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return null;
  const split = (line: string) => {
    const res: string[] = [];
    let cur = "";
    let inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if ((ch === "," || ch === ";") && !inQ) { res.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    res.push(cur.trim());
    return res;
  };
  const headers = split(lines[0]);
  const rows = lines.slice(1).map(l => {
    const cols = split(l);
    const o: Record<string, string> = {};
    headers.forEach((h, i) => { o[h] = cols[i] ?? ""; });
    return o;
  });
  return { headers, rows };
}

function suggestMapping(h: string): string {
  const s = h.toLowerCase().replace(/[_\s-]/g, "");
  if (/email|mail/.test(s)) return "email";
  if (/phone|tel|mobil/.test(s)) return "phone";
  if (/firstname|vorname|fname/.test(s)) return "firstName";
  if (/lastname|nachname|lname/.test(s)) return "lastName";
  if (/name/.test(s)) return "fullName";
  if (/company|firma|unternehmen/.test(s)) return "company";
  if (/title|position|jobtitel|role/.test(s)) return "jobTitle";
  if (/industry|branche/.test(s)) return "industry";
  if (/city|stadt/.test(s)) return "city";
  if (/date|datum|lastcontact/.test(s)) return "lastContact";
  if (/deal|value|wert|betrag/.test(s)) return "dealValue";
  if (/note|notiz|comment/.test(s)) return "notes";
  return "ignore";
}

const STANDARD_FIELDS = [
  { id: "ignore", label: "— Ignorieren —" }, { id: "firstName", label: "Vorname" },
  { id: "lastName", label: "Nachname" }, { id: "fullName", label: "Vollst. Name" },
  { id: "email", label: "E-Mail" }, { id: "phone", label: "Telefon" },
  { id: "company", label: "Unternehmen" }, { id: "jobTitle", label: "Position" },
  { id: "industry", label: "Branche" }, { id: "city", label: "Stadt" },
  { id: "lastContact", label: "Letzter Kontakt" }, { id: "dealValue", label: "Deal-Wert" },
  { id: "notes", label: "Notizen" },
];

// ─── PIPELINE AGENTS CONFIG ───────────────────────────────────────────────────

const PIPELINE_AGENTS = [
  {
    key: "dataInterpreter",
    name: "Data Interpreter",
    model: "haiku-4-5",
    icon: "◈",
    desc: "Felder analysieren, Datenvollständigkeit prüfen",
    color: "text-cyan-600",
    bg: "bg-cyan-50",
    border: "border-cyan-200",
    dot: "bg-cyan-500",
  },
  {
    key: "contextReconstruction",
    name: "Context Reconstruction",
    model: "sonnet-4-6",
    icon: "◎",
    desc: "Lead-Geschichte rekonstruieren, Funnel-Stage bestimmen",
    color: "text-violet-600",
    bg: "bg-violet-50",
    border: "border-violet-200",
    dot: "bg-violet-500",
  },
  {
    key: "segmentation",
    name: "Segmentation",
    model: "haiku-4-5",
    icon: "◉",
    desc: "Segment klassifizieren, Drop-off-Hypothese erstellen",
    color: "text-blue-600",
    bg: "bg-blue-50",
    border: "border-blue-200",
    dot: "bg-blue-500",
  },
  {
    key: "personalization",
    name: "Personalization",
    model: "sonnet-4-6",
    icon: "✎",
    desc: "Ton, Hooks und Messaging-Winkel bestimmen",
    color: "text-pink-600",
    bg: "bg-pink-50",
    border: "border-pink-200",
    dot: "bg-pink-500",
  },
  {
    key: "conversationEngine",
    name: "Conversation Engine",
    model: "opus-4-6",
    icon: "◇",
    desc: "3 Nachrichtenvariationen + vollständiger Gesprächsflow",
    color: "text-indigo-600",
    bg: "bg-indigo-50",
    border: "border-indigo-200",
    dot: "bg-indigo-500",
  },
  {
    key: "qualityControl",
    name: "Quality Control",
    model: "sonnet-4-6",
    icon: "▣",
    desc: "Humanisierung, Personalisierung und Relevanz prüfen",
    color: "text-teal-600",
    bg: "bg-teal-50",
    border: "border-teal-200",
    dot: "bg-teal-500",
  },
] as const;

// ─── TYPES ────────────────────────────────────────────────────────────────────

type SetupMode = "demo" | "csv";
type SimPhase = "setup" | "pipeline" | "running";
type AgentStatus = "pending" | "running" | "done";

interface ChatMessage {
  id: string;
  role: "agent" | "lead" | "system";
  content: string;
  subject?: string;
  state: ConversationState;
  variationLabel?: string;
}

// ─── LEFT PANEL TABS ──────────────────────────────────────────────────────────

type LeftTab = "profile" | "context" | "segment" | "personalization" | "qc";

const LEFT_TABS: { id: LeftTab; label: string; icon: string }[] = [
  { id: "profile",        label: "Profil",    icon: "◉" },
  { id: "context",        label: "Kontext",   icon: "◎" },
  { id: "segment",        label: "Segment",   icon: "◈" },
  { id: "personalization", label: "Strategie", icon: "✎" },
  { id: "qc",             label: "QC",        icon: "▣" },
];

// ─── SCORE BAR ────────────────────────────────────────────────────────────────

function ScoreBar({ value, max = 100, color = "bg-violet-500" }: { value: number; max?: number; color?: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-700`} style={{ width: `${(value / max) * 100}%` }} />
      </div>
      <span className="text-[10px] font-bold text-slate-600 w-7 text-right">{value}</span>
    </div>
  );
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────

export default function SimulationPage() {
  // Setup State
  const [phase, setPhase] = useState<SimPhase>("setup");
  const [setupMode, setSetupMode] = useState<SetupMode>("demo");
  const [csvParsed, setCsvParsed] = useState<ReturnType<typeof parseCSV>>(null);
  const [csvMappings, setCsvMappings] = useState<{ col: string; field: string }[]>([]);
  const [selectedLeadIdx, setSelectedLeadIdx] = useState<number>(0);
  const [channel, setChannel] = useState<Channel>("email");
  const [ctx, setCtx] = useState<BusinessContext>(DEFAULT_CONTEXT);
  const [showCtxForm, setShowCtxForm] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Pipeline State
  const [pipelineResult, setPipelineResult] = useState<FullPipelineResult | null>(null);
  const [agentStatuses, setAgentStatuses] = useState<AgentStatus[]>(PIPELINE_AGENTS.map(() => "pending"));
  const [pipelineComplete, setPipelineComplete] = useState(false);

  // Simulation State
  const [profile, setProfile] = useState<LeadProfile | null>(null);
  const [convState, setConvState] = useState<ConversationState>("initial");
  const [activeResponseType, setActiveResponseType] = useState<ResponseType | null>(null);
  const [continuationRound, setContinuationRound] = useState(0);
  const [showContinuationButtons, setShowContinuationButtons] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [thinking, setThinking] = useState<AgentThinkingStep[]>([]);
  const [variations, setVariations] = useState<MessageVariation[]>([]);
  const [showVariations, setShowVariations] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [leftTab, setLeftTab] = useState<LeftTab>("profile");
  const bottomRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isProcessing, showVariations]);

  const uid = () => Math.random().toString(36).slice(2, 8);
  const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

  const addMsg = useCallback((msg: Omit<ChatMessage, "id">) => {
    setMessages(prev => [...prev, { ...msg, id: uid() }]);
  }, []);

  const getAvailableLeads = (): Record<string, string>[] => {
    if (setupMode === "csv" && csvParsed) {
      return csvParsed.rows.slice(0, 5).map(row => {
        const norm: Record<string, string> = {};
        csvMappings.forEach(({ col, field }) => { if (field !== "ignore") norm[field] = row[col] || ""; });
        return norm;
      });
    }
    return DEMO_LEADS_NORMALIZED;
  };

  const handleFile = (f: File) => {
    const reader = new FileReader();
    reader.onload = e => {
      const result = parseCSV(e.target?.result as string);
      if (result) {
        setCsvParsed(result);
        setCsvMappings(result.headers.map(h => ({ col: h, field: suggestMapping(h) })));
        setSelectedLeadIdx(0);
      }
    };
    reader.readAsText(f, "UTF-8");
  };

  // ── PIPELINE RUNNER ────────────────────────────────────────────────────────

  const startSimulation = async () => {
    cancelRef.current = false;
    const leads = getAvailableLeads();
    const normalized = leads[selectedLeadIdx] || leads[0];

    // Compute pipeline result immediately (synchronous)
    const result = runAgentPipeline(normalized, selectedLeadIdx + 1, channel, ctx);
    setPipelineResult(result);
    setProfile(result.profile);

    // Reset state
    setAgentStatuses(PIPELINE_AGENTS.map(() => "pending"));
    setPipelineComplete(false);
    setConvState("initial");
    setMessages([]);
    setThinking([]);
    setVariations([]);
    setShowVariations(false);
    setIsProcessing(false);

    setPhase("pipeline");

    // Animate agents one by one
    for (let i = 0; i < PIPELINE_AGENTS.length; i++) {
      if (cancelRef.current) return;
      // Mark as running
      setAgentStatuses(prev => prev.map((s, idx) => idx === i ? "running" : s));
      await sleep(680);
      if (cancelRef.current) return;
      // Mark as done
      setAgentStatuses(prev => prev.map((s, idx) => idx === i ? "done" : s));
      await sleep(220);
    }

    setPipelineComplete(true);
  };

  const proceedToChat = () => {
    if (!pipelineResult) return;
    setPhase("running");
    const vars = pipelineResult.conversationEngine.initialMessages;
    setVariations(vars);
    setShowVariations(true);

    const profileThinking = getAgentThinking("profile", pipelineResult.profile, ctx);
    setThinking(profileThinking);
    addMsg({
      role: "system",
      content: `Pipeline abgeschlossen · ${pipelineResult.profile.fullName} analysiert · 3 Variationen bereit`,
      state: "initial",
    });
  };

  // ── CONVERSATION HANDLERS ──────────────────────────────────────────────────

  const sendInitialMessage = async (v: MessageVariation) => {
    setShowVariations(false);
    setConvState("awaiting_response");
    addMsg({ role: "agent", content: v.body, subject: v.subject, state: "awaiting_response", variationLabel: v.label });
    addMsg({ role: "system", content: "Nachricht gesendet · Warte auf Antwort des Leads…", state: "awaiting_response" });
  };

  const simulateResponse = async (type: ResponseType) => {
    if (!profile) return;
    cancelRef.current = false;
    setIsProcessing(true);
    setShowContinuationButtons(false);
    await sleep(900);
    if (cancelRef.current) return;

    const leadText = getSimulatedLeadResponse(type, profile);
    if (leadText) {
      addMsg({ role: "lead", content: leadText, state: convState });
    } else {
      addMsg({ role: "system", content: "(Keine Antwort nach 3 Tagen)", state: convState });
    }

    await sleep(600);
    if (cancelRef.current) return;

    const newThinking = getAgentThinking(type, profile, ctx);
    setThinking(prev => [...prev, ...newThinking]);
    await sleep(1100);
    if (cancelRef.current) return;

    const newState = type as ConversationState;
    setConvState(newState);
    setActiveResponseType(type);
    setContinuationRound(1);

    const responses = generateStateResponse(type, profile, channel, ctx);
    addMsg({ role: "agent", content: responses[0].body, subject: responses[0].subject, state: newState, variationLabel: responses[0].label });

    setShowContinuationButtons(true);
    addMsg({ role: "system", content: "Wie antwortet der Lead weiter?", state: newState });
    setIsProcessing(false);
  };

  const handleContinuation = async (type: ContinuationType) => {
    if (!profile || !activeResponseType) return;
    cancelRef.current = false;
    setIsProcessing(true);
    setShowContinuationButtons(false);
    await sleep(800);
    if (cancelRef.current) return;

    const result = generateContinuationExchange(type, profile, channel, ctx);

    if (result.leadText) {
      addMsg({ role: "lead", content: result.leadText, state: convState });
    } else {
      addMsg({ role: "system", content: "(Keine Antwort nach weiteren 5 Tagen)", state: convState });
    }

    await sleep(500);
    if (cancelRef.current) return;

    setThinking(prev => [...prev, ...result.agentThinking]);
    await sleep(1000);
    if (cancelRef.current) return;

    addMsg({ role: "agent", content: result.agentMsg, subject: result.agentSubject, state: result.nextState, variationLabel: result.agentLabel });
    setConvState(result.nextState);

    if (result.triggerBooking) {
      await sleep(600);
      if (cancelRef.current) return;
      setIsProcessing(false);
      await moveToBooking(true);
    } else if (result.closeConversation) {
      addMsg({ role: "system", content: "Konversation beendet", state: "closed" });
      setConvState("closed");
      setIsProcessing(false);
    } else {
      const nextRound = continuationRound + 1;
      setContinuationRound(nextRound);
      const moreOpts = getContinuationOptions(activeResponseType, nextRound);
      if (moreOpts.length > 0) {
        setShowContinuationButtons(true);
        addMsg({ role: "system", content: "Wie antwortet der Lead?", state: result.nextState });
      }
      setIsProcessing(false);
    }
  };

  const moveToBooking = async (alreadyProcessing = false) => {
    if (!profile) return;
    if (!alreadyProcessing) setIsProcessing(true);
    setShowContinuationButtons(false);
    setConvState("booking");
    const bookingThinking = getAgentThinking("booking", profile, ctx);
    setThinking(prev => [...prev, ...bookingThinking]);
    await sleep(900);
    const bMsgs = generateBookingMessages(profile, channel, ctx);
    addMsg({ role: "agent", content: bMsgs[0].body, subject: bMsgs[0].subject, state: "booking", variationLabel: bMsgs[0].label });
    addMsg({ role: "system", content: "Terminbuchung eingeleitet · Bestätigen oder ablehnen?", state: "booking" });
    setIsProcessing(false);
  };

  const confirmBooking = () => {
    if (!profile) return;
    setConvState("booked");
    addMsg({ role: "lead", content: "Ja, Donnerstag 14:00 Uhr passt mir gut. Freue mich auf das Gespräch!", state: "booking" });
    addMsg({ role: "system", content: `✓ Termin gebucht · ${profile.fullName}${profile.company ? ` (${profile.company})` : ""} · Demo-Gespräch bestätigt`, state: "booked" });
    setThinking(prev => [...prev, { phase: "Ergebnis", content: `Termin erfolgreich gebucht mit ${profile.fullName}.`, highlight: true }]);
  };

  const resetSimulation = () => {
    cancelRef.current = true;
    setPhase("setup");
    setProfile(null);
    setPipelineResult(null);
    setAgentStatuses(PIPELINE_AGENTS.map(() => "pending"));
    setPipelineComplete(false);
    setConvState("initial");
    setActiveResponseType(null);
    setContinuationRound(0);
    setShowContinuationButtons(false);
    setMessages([]);
    setThinking([]);
    setVariations([]);
    setShowVariations(false);
    setIsProcessing(false);
    setLeftTab("profile");
  };

  // ── SETUP PHASE ────────────────────────────────────────────────────────────

  if (phase === "setup") {
    const leads = getAvailableLeads();
    return (
      <div className="p-8 max-w-[920px]">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Test Agent Flow</h1>
          <p className="text-slate-400 text-sm mt-1">
            Testen Sie die Reaktivierungs-Engine live — dieselbe Engine wie in der Produktion.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 space-y-5">
            {/* Mode Toggle */}
            <div className="glass-card p-5">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Test-Modus</p>
              <div className="flex gap-2">
                {(["demo", "csv"] as const).map((m) => (
                  <button key={m} onClick={() => setSetupMode(m)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                      setupMode === m
                        ? "bg-violet-600 text-white border-violet-600 shadow-md shadow-violet-200"
                        : "bg-slate-50 text-slate-500 border-slate-200 hover:border-violet-200"
                    }`}>
                    {m === "demo" ? "◎ Demo-Leads" : "↑ CSV hochladen"}
                  </button>
                ))}
              </div>
            </div>

            {/* CSV Upload */}
            {setupMode === "csv" && (
              <div className="glass-card p-5">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">CSV hochladen</p>
                {!csvParsed ? (
                  <div onClick={() => fileRef.current?.click()}
                    className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center cursor-pointer hover:border-violet-300 hover:bg-slate-50 transition-all">
                    <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
                    <span className="text-3xl text-slate-300">↑</span>
                    <p className="text-slate-500 text-sm mt-2 font-medium">CSV hier klicken oder hineinziehen</p>
                    <p className="text-slate-400 text-xs mt-1">Max. 5 Leads im Test-Modus</p>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm text-emerald-600 font-semibold">✓ {csvParsed.rows.length} Leads geladen</span>
                      <button onClick={() => { setCsvParsed(null); setCsvMappings([]); }} className="text-xs text-slate-400 hover:text-red-500 transition-colors">Entfernen</button>
                    </div>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {csvMappings.map((m, i) => (
                        <div key={m.col} className="flex items-center gap-3">
                          <span className="text-xs text-slate-500 w-28 truncate">{m.col}</span>
                          <span className="text-slate-300 text-xs">→</span>
                          <select value={m.field}
                            onChange={e => { const u = [...csvMappings]; u[i] = { ...u[i], field: e.target.value }; setCsvMappings(u); }}
                            className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-700 focus:outline-none focus:border-violet-400">
                            {STANDARD_FIELDS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Lead Selection */}
            <div className="glass-card p-5">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Lead auswählen</p>
              <div className="space-y-2">
                {leads.map((l, i) => {
                  const p = buildLeadProfile(l, i + 1, ctx);
                  const m = SEGMENT_META[p.segment];
                  const name = p.fullName || p.email || `Lead ${i + 1}`;
                  return (
                    <button key={i} onClick={() => setSelectedLeadIdx(i)}
                      className={`w-full p-3.5 rounded-xl border text-left transition-all ${
                        selectedLeadIdx === i
                          ? "border-violet-400 bg-violet-50 shadow-sm"
                          : "border-slate-200 hover:border-violet-200 hover:bg-slate-50"
                      }`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-xl ${m.bg} border ${m.border} flex items-center justify-center shrink-0`}>
                          <span className={`text-sm ${m.color}`}>◉</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">{name}</p>
                          <p className="text-xs text-slate-400 truncate">{p.jobTitle}{p.company ? ` · ${p.company}` : ""}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${m.bg} ${m.border} ${m.color}`}>{m.label}</span>
                          <p className="text-[10px] text-slate-400 mt-0.5">Score: {p.score}</p>
                        </div>
                      </div>
                      {selectedLeadIdx === i && p.hypothesis && (
                        <p className="text-xs text-slate-500 mt-2 pl-12 italic leading-relaxed line-clamp-2">{p.hypothesis}</p>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-5">
            {/* Channel */}
            <div className="glass-card p-5">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Kanal</p>
              <div className="space-y-2">
                {([
                  { ch: "email" as Channel, icon: "✉", label: "E-Mail", desc: "Strukturiert, ausführlich" },
                  { ch: "whatsapp" as Channel, icon: "◊", label: "WhatsApp", desc: "Persönlich, gesprächig" },
                  { ch: "sms" as Channel, icon: "▣", label: "SMS", desc: "Kurz, direkt" },
                ]).map(({ ch, icon, label, desc }) => (
                  <button key={ch} onClick={() => setChannel(ch)}
                    className={`w-full p-3 rounded-xl border flex items-center gap-3 transition-all text-left ${
                      channel === ch ? "border-violet-400 bg-violet-50" : "border-slate-200 hover:border-violet-200 hover:bg-slate-50"
                    }`}>
                    <span className={`text-lg ${channel === ch ? "text-violet-600" : "text-slate-400"}`}>{icon}</span>
                    <div>
                      <p className={`text-sm font-semibold ${channel === ch ? "text-violet-700" : "text-slate-700"}`}>{label}</p>
                      <p className="text-xs text-slate-400">{desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Context */}
            <div className="glass-card p-5">
              <button onClick={() => setShowCtxForm(!showCtxForm)}
                className="w-full flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Business-Kontext</span>
                <span className={`text-slate-400 transition-transform text-xs ${showCtxForm ? "rotate-180" : ""}`}>▾</span>
              </button>
              {!showCtxForm && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-50 border border-violet-100 text-violet-600">{ctx.agentName}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-500">{ctx.companyName}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-500 truncate max-w-[130px]">{ctx.product}</span>
                </div>
              )}
              {showCtxForm && (
                <div className="mt-3 space-y-2.5">
                  {([
                    { key: "agentName" as const, label: "Agent-Name" },
                    { key: "companyName" as const, label: "Unternehmen" },
                    { key: "product" as const, label: "Produkt / Service" },
                    { key: "painPoint" as const, label: "Hauptschmerz" },
                    { key: "ctaGoal" as const, label: "CTA-Ziel" },
                    { key: "bookingLink" as const, label: "Booking-Link" },
                  ]).map(({ key, label }) => (
                    <div key={key}>
                      <label className="text-[10px] text-slate-400 mb-0.5 block">{label}</label>
                      <input type="text" value={ctx[key]}
                        onChange={e => setCtx({ ...ctx, [key]: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700 focus:outline-none focus:border-violet-400" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* CTA */}
            <button onClick={startSimulation}
              disabled={setupMode === "csv" && !csvParsed}
              className="w-full py-3.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white font-bold rounded-xl transition-all shadow-lg shadow-violet-200 flex items-center justify-center gap-2">
              <span className="text-lg">▶</span>
              Simulation starten
            </button>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <p className="text-[10px] text-slate-500 font-semibold mb-1.5">6-Agent Pipeline:</p>
              <div className="space-y-1">
                {PIPELINE_AGENTS.map(a => (
                  <div key={a.key} className="flex items-center gap-2">
                    <span className={`text-[10px] ${a.color}`}>{a.icon}</span>
                    <p className="text-[10px] text-slate-400">{a.name}</p>
                    <span className="text-[9px] text-slate-300 font-mono ml-auto">{a.model}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── PIPELINE PHASE ─────────────────────────────────────────────────────────

  if (phase === "pipeline") {
    const pr = pipelineResult;
    const doneCount = agentStatuses.filter(s => s === "done").length;

    return (
      <div className="flex h-[calc(100vh-56px)] overflow-hidden bg-slate-50">
        <div className="m-auto w-full max-w-[780px] px-6 py-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-50 border border-violet-100 text-violet-600 text-xs font-semibold mb-4">
              <span className={`w-2 h-2 rounded-full ${pipelineComplete ? "bg-emerald-500" : "bg-violet-500 animate-pulse"}`} />
              {pipelineComplete ? "Pipeline abgeschlossen" : "Pipeline läuft…"}
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-1">
              {pr ? pr.profile.fullName : "Lead wird analysiert…"}
            </h2>
            {pr && (
              <p className="text-sm text-slate-400">
                {pr.profile.jobTitle}{pr.profile.company ? ` · ${pr.profile.company}` : ""}
                {pr.profile.city ? ` · ${pr.profile.city}` : ""}
              </p>
            )}
          </div>

          {/* Progress bar */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-slate-400">Fortschritt</span>
              <span className="text-xs font-bold text-slate-600">{doneCount} / {PIPELINE_AGENTS.length}</span>
            </div>
            <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all duration-500"
                style={{ width: `${(doneCount / PIPELINE_AGENTS.length) * 100}%` }}
              />
            </div>
          </div>

          {/* Agent Cards */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            {PIPELINE_AGENTS.map((agent, i) => {
              const status = agentStatuses[i];
              return (
                <div key={agent.key}
                  className={`p-4 rounded-2xl border transition-all duration-300 ${
                    status === "done"
                      ? `${agent.bg} ${agent.border}`
                      : status === "running"
                      ? "bg-white border-violet-300 shadow-lg shadow-violet-100"
                      : "bg-white border-slate-200"
                  }`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all ${
                      status === "done" ? `${agent.bg} border ${agent.border}` :
                      status === "running" ? "bg-violet-100 border border-violet-200" :
                      "bg-slate-100 border border-slate-200"
                    }`}>
                      <span className={`text-sm ${status === "done" ? agent.color : status === "running" ? "text-violet-500" : "text-slate-300"}`}>
                        {status === "done" ? "✓" : agent.icon}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className={`text-xs font-bold truncate ${
                          status === "done" ? "text-slate-800" :
                          status === "running" ? "text-violet-700" :
                          "text-slate-400"
                        }`}>{agent.name}</p>
                        {status === "running" && (
                          <div className="flex gap-0.5 shrink-0">
                            {[0,1,2].map(j => (
                              <span key={j} className="w-1 h-1 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: `${j * 0.12}s` }} />
                            ))}
                          </div>
                        )}
                      </div>
                      <p className="text-[9px] font-mono text-slate-300 mb-1">{agent.model}</p>
                      <p className={`text-[10px] leading-snug ${status === "pending" ? "text-slate-300" : "text-slate-500"}`}>
                        {agent.desc}
                      </p>
                      {/* Quick output summary */}
                      {status === "done" && pr && (
                        <div className={`mt-2 pt-2 border-t ${agent.border}`}>
                          {agent.key === "dataInterpreter" && (
                            <p className={`text-[9px] font-semibold ${agent.color}`}>
                              {pr.dataInterpreter.fieldsFound}/{pr.dataInterpreter.totalPossible} Felder · {pr.dataInterpreter.dataQuality === "high" ? "Hohe" : pr.dataInterpreter.dataQuality === "medium" ? "Mittlere" : "Niedrige"} Qualität
                            </p>
                          )}
                          {agent.key === "contextReconstruction" && (
                            <p className={`text-[9px] font-semibold ${agent.color}`}>
                              {pr.contextReconstruction.funnelStage} · {pr.contextReconstruction.confidence}% Konfidenz
                            </p>
                          )}
                          {agent.key === "segmentation" && (
                            <p className={`text-[9px] font-semibold ${agent.color}`}>
                              {pr.segmentation.segmentLabel} · Score {pr.segmentation.score}
                            </p>
                          )}
                          {agent.key === "personalization" && (
                            <p className={`text-[9px] font-semibold ${agent.color} truncate`}>
                              {pr.personalization.tone}
                            </p>
                          )}
                          {agent.key === "conversationEngine" && (
                            <p className={`text-[9px] font-semibold ${agent.color}`}>
                              {pr.conversationEngine.initialMessages.length} Variationen · {pr.conversationEngine.stateCount} States
                            </p>
                          )}
                          {agent.key === "qualityControl" && (
                            <p className={`text-[9px] font-semibold ${pr.qualityControl.approved ? "text-emerald-600" : "text-amber-600"}`}>
                              Score {pr.qualityControl.overallScore} · {pr.qualityControl.approved ? "Freigegeben" : "Überprüfen"}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* CTA after completion */}
          {pipelineComplete && pr && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
                    <span className="text-emerald-600 text-lg">✓</span>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">Analyse abgeschlossen</p>
                    <p className="text-xs text-slate-400">
                      QC-Score {pr.qualityControl.overallScore} · {pr.segmentation.segmentLabel} · {pr.conversationEngine.initialMessages.length} Variationen bereit
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={resetSimulation}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium rounded-xl transition-colors">
                    ← Zurück
                  </button>
                  <button onClick={proceedToChat}
                    className="px-5 py-2 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-violet-200 flex items-center gap-1.5">
                    Chat starten →
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── RUNNING PHASE ──────────────────────────────────────────────────────────

  const currentMeta = STATE_META[convState];
  const pr = pipelineResult;

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden">
      {/* LEFT PANEL */}
      <div className="w-[280px] shrink-0 bg-white border-r border-slate-200 flex flex-col overflow-hidden">
        {/* Lead Card */}
        {profile && (() => {
          const m = SEGMENT_META[profile.segment];
          return (
            <div className="p-4 border-b border-slate-200 shrink-0">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-xl ${m.bg} border ${m.border} flex items-center justify-center shrink-0`}>
                  <span className={`text-base ${m.color}`}>◉</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate">{profile.fullName}</p>
                  <p className="text-[11px] text-slate-400 truncate">{profile.jobTitle}{profile.company ? ` · ${profile.company}` : ""}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${m.bg} border ${m.border} ${m.color}`}>{m.label}</span>
                <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-violet-500 to-violet-400 rounded-full transition-all" style={{ width: `${profile.score}%` }} />
                </div>
                <span className="text-[10px] font-bold text-slate-500">{profile.score}</span>
              </div>
              {/* Current state */}
              <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border ${currentMeta.border} ${currentMeta.bg} mt-2`}>
                <span className={`text-xs ${currentMeta.color}`}>{currentMeta.icon}</span>
                <span className={`text-[10px] font-bold ${currentMeta.color}`}>{currentMeta.label}</span>
              </div>
            </div>
          );
        })()}

        {/* Tab Bar */}
        <div className="flex border-b border-slate-200 shrink-0">
          {LEFT_TABS.map(t => (
            <button key={t.id} onClick={() => setLeftTab(t.id)}
              className={`flex-1 py-2 text-[9px] font-semibold transition-colors flex flex-col items-center gap-0.5 ${
                leftTab === t.id
                  ? "text-violet-600 border-b-2 border-violet-500 bg-violet-50"
                  : "text-slate-400 hover:text-slate-600"
              }`}>
              <span className="text-[11px]">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-3 min-h-0">
          {leftTab === "profile" && profile && (
            <div className="space-y-3">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Lead-Profil</p>
              {[
                { label: "E-Mail", val: profile.email || "—" },
                { label: "Telefon", val: profile.phone || "—" },
                { label: "Branche", val: profile.industry || "—" },
                { label: "Stadt", val: profile.city || "—" },
                { label: "Deal-Wert", val: profile.dealValue ? `CHF ${profile.dealValue.toLocaleString()}` : "—" },
                { label: "Letzter Kontakt", val: profile.lastContact || "—" },
                { label: "Tage inaktiv", val: profile.daysSinceContact !== null ? `${profile.daysSinceContact} Tage` : "—" },
                { label: "Entscheidungsträger", val: profile.isDecisionMaker ? "Ja" : "Nein" },
              ].map(({ label, val }) => (
                <div key={label}>
                  <p className="text-[9px] text-slate-400 mb-0.5">{label}</p>
                  <p className="text-[11px] font-semibold text-slate-700 truncate">{val}</p>
                </div>
              ))}
              {profile.signals.length > 0 && (
                <div>
                  <p className="text-[9px] text-slate-400 mb-1">Signale</p>
                  <div className="flex flex-wrap gap-1">
                    {profile.signals.slice(0, 4).map(s => (
                      <span key={s} className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet-50 border border-violet-100 text-violet-600">{s}</span>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <p className="text-[9px] text-slate-400 mb-1">Hypothese</p>
                <p className="text-[10px] text-slate-600 italic leading-relaxed">{profile.hypothesis}</p>
              </div>
            </div>
          )}

          {leftTab === "context" && pr && (
            <div className="space-y-3">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Kontext-Rekonstruktion</p>
              <div>
                <p className="text-[9px] text-slate-400 mb-1">Geschichte</p>
                <p className="text-[10px] text-slate-600 leading-relaxed">{pr.contextReconstruction.story}</p>
              </div>
              <div>
                <p className="text-[9px] text-slate-400 mb-1">Funnel-Phase</p>
                <p className="text-[11px] font-semibold text-slate-700">{pr.contextReconstruction.funnelStage}</p>
              </div>
              <div>
                <p className="text-[9px] text-slate-400 mb-1">Drop-off-Hypothese</p>
                <p className="text-[10px] text-slate-600">{pr.contextReconstruction.dropOffHypothesis}</p>
              </div>
              <div>
                <p className="text-[9px] text-slate-400 mb-1">Timing</p>
                <p className="text-[10px] text-slate-600">{pr.contextReconstruction.timingNote}</p>
              </div>
              <div>
                <p className="text-[9px] text-slate-400 mb-1">Konfidenz</p>
                <ScoreBar value={pr.contextReconstruction.confidence} color="bg-blue-500" />
                <p className="text-[9px] text-slate-400 mt-1 italic">{pr.contextReconstruction.confidenceReason}</p>
              </div>
              <div>
                <p className="text-[9px] text-slate-400 mb-1">Datenvollständigkeit</p>
                <ScoreBar value={pr.dataInterpreter.qualityScore} color="bg-cyan-500" />
                <p className="text-[9px] text-slate-400 mt-1">
                  {pr.dataInterpreter.fieldsFound}/{pr.dataInterpreter.totalPossible} Felder · {pr.dataInterpreter.contactability}
                </p>
              </div>
            </div>
          )}

          {leftTab === "segment" && pr && (() => {
            const sm = CONV_SEGMENT_META[pr.segmentation.segment];
            return (
              <div className="space-y-3">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Segmentierung</p>
                <div className={`p-3 rounded-xl border ${sm.bg} ${sm.border}`}>
                  <p className={`text-xs font-bold ${sm.color} mb-0.5`}>{sm.label}</p>
                  <p className={`text-[10px] ${sm.color} opacity-80`}>{sm.desc}</p>
                </div>
                <div>
                  <p className="text-[9px] text-slate-400 mb-1">Strategie</p>
                  <p className="text-[10px] text-slate-600 leading-relaxed">{sm.strategy}</p>
                </div>
                <div>
                  <p className="text-[9px] text-slate-400 mb-1">Begründung</p>
                  <p className="text-[10px] text-slate-600 italic leading-relaxed">{pr.segmentation.reasoning}</p>
                </div>
                <div>
                  <p className="text-[9px] text-slate-400 mb-1">Score</p>
                  <ScoreBar value={pr.segmentation.score} color="bg-violet-500" />
                </div>
                {pr.segmentation.alternativeSegment && (
                  <div>
                    <p className="text-[9px] text-slate-400 mb-1">Alternativer Segment</p>
                    <p className="text-[10px] text-slate-500">{CONV_SEGMENT_META[pr.segmentation.alternativeSegment].label}</p>
                  </div>
                )}
              </div>
            );
          })()}

          {leftTab === "personalization" && pr && (
            <div className="space-y-3">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Personalisierungs-Strategie</p>
              <div>
                <p className="text-[9px] text-slate-400 mb-1">Ansatz</p>
                <p className="text-[10px] text-slate-600 leading-relaxed">{pr.personalization.approach}</p>
              </div>
              <div>
                <p className="text-[9px] text-slate-400 mb-1">Ton</p>
                <p className="text-[10px] font-semibold text-slate-700">{pr.personalization.tone}</p>
              </div>
              <div>
                <p className="text-[9px] text-slate-400 mb-1">Messaging-Winkel</p>
                <p className="text-[10px] text-slate-600">{pr.personalization.messagingAngle}</p>
              </div>
              {pr.personalization.keyHooks.length > 0 && (
                <div>
                  <p className="text-[9px] text-slate-400 mb-1">Key Hooks</p>
                  <div className="space-y-1">
                    {pr.personalization.keyHooks.map(h => (
                      <div key={h} className="flex items-start gap-1.5">
                        <span className="text-emerald-500 text-[9px] mt-0.5">✓</span>
                        <p className="text-[10px] text-slate-600">{h}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {pr.personalization.avoid.length > 0 && (
                <div>
                  <p className="text-[9px] text-slate-400 mb-1">Vermeiden</p>
                  <div className="space-y-1">
                    {pr.personalization.avoid.map(a => (
                      <div key={a} className="flex items-start gap-1.5">
                        <span className="text-red-400 text-[9px] mt-0.5">✗</span>
                        <p className="text-[10px] text-slate-500">{a}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {leftTab === "qc" && pr && (
            <div className="space-y-3">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Quality Control</p>
              <div className={`p-3 rounded-xl border ${pr.qualityControl.approved ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
                <p className={`text-xs font-bold mb-0.5 ${pr.qualityControl.approved ? "text-emerald-700" : "text-amber-700"}`}>
                  {pr.qualityControl.approved ? "✓ Freigegeben" : "⚠ Überprüfen"}
                </p>
                <p className={`text-[10px] ${pr.qualityControl.approved ? "text-emerald-600" : "text-amber-600"}`}>
                  {pr.qualityControl.recommendation}
                </p>
              </div>
              <div className="space-y-2">
                {[
                  { label: "Human Score", val: pr.qualityControl.humanScore, color: "bg-violet-500" },
                  { label: "Personalisierung", val: pr.qualityControl.personalizationScore, color: "bg-cyan-500" },
                  { label: "Relevanz", val: pr.qualityControl.relevanceScore, color: "bg-blue-500" },
                  { label: "Natürlichkeit", val: pr.qualityControl.naturalScore, color: "bg-pink-500" },
                  { label: "Gesamt", val: pr.qualityControl.overallScore, color: "bg-emerald-500" },
                ].map(({ label, val, color }) => (
                  <div key={label}>
                    <p className="text-[9px] text-slate-400 mb-0.5">{label}</p>
                    <ScoreBar value={val} color={color} />
                  </div>
                ))}
              </div>
              {pr.qualityControl.flags.length > 0 && (
                <div>
                  <p className="text-[9px] text-slate-400 mb-1">Flags</p>
                  <div className="space-y-1">
                    {pr.qualityControl.flags.map(f => (
                      <div key={f} className="flex items-start gap-1.5">
                        <span className="text-amber-500 text-[9px] mt-0.5">!</span>
                        <p className="text-[10px] text-slate-600">{f}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom Actions */}
        <div className="p-3 border-t border-slate-200 space-y-2 shrink-0">
          <button onClick={resetSimulation}
            className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium rounded-xl transition-colors">
            ← Neue Simulation
          </button>
        </div>
      </div>

      {/* RIGHT PANEL: CHAT */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-50">
        {/* Header */}
        <div className="h-12 bg-white border-b border-slate-200 flex items-center justify-between px-5 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-slate-700">
              {channel === "email" ? "✉ E-Mail" : channel === "whatsapp" ? "◊ WhatsApp" : "▣ SMS"} · {profile?.fullName}
            </span>
            <div className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[10px] font-semibold ${currentMeta.bg} ${currentMeta.border} ${currentMeta.color}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              {currentMeta.label}
            </div>
          </div>
          <span className="text-[10px] text-slate-400 font-mono bg-slate-100 px-2 py-0.5 rounded">
            ROYA Engine · {channel.toUpperCase()}
          </span>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {messages.map((msg) => {
            if (msg.role === "system") {
              return (
                <div key={msg.id} className="flex justify-center">
                  <span className="text-[10px] text-slate-400 px-3 py-1 rounded-full bg-white border border-slate-200">
                    {msg.content}
                  </span>
                </div>
              );
            }
            if (msg.role === "lead") {
              return (
                <div key={msg.id} className="flex justify-end">
                  <div className="max-w-[68%]">
                    <p className="text-[10px] text-slate-400 text-right mb-1">{profile?.firstName} · Lead</p>
                    <div className="bg-slate-800 text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">
                      {msg.content}
                    </div>
                  </div>
                </div>
              );
            }
            return (
              <div key={msg.id} className="flex justify-start gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-violet-100 border border-violet-200 flex items-center justify-center shrink-0 mt-5">
                  <span className="text-xs text-violet-600 font-bold">{ctx.agentName[0]}</span>
                </div>
                <div className="max-w-[68%]">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-[10px] text-slate-400">{ctx.agentName} · {ctx.companyName}</p>
                    {msg.variationLabel && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet-50 border border-violet-100 text-violet-500">{msg.variationLabel}</span>
                    )}
                  </div>
                  {msg.subject && (
                    <div className="bg-violet-50 border border-violet-100 rounded-t-xl px-3 py-1.5">
                      <span className="text-[10px] text-violet-500 font-semibold">Betreff: </span>
                      <span className="text-[10px] text-violet-700 font-bold">{msg.subject}</span>
                    </div>
                  )}
                  <div className={`bg-white border border-slate-200 shadow-sm px-4 py-3 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap ${msg.subject ? "rounded-b-2xl rounded-br-sm border-t-0" : "rounded-2xl rounded-tl-sm"}`}>
                    {msg.content}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Typing Indicator */}
          {isProcessing && (
            <div className="flex justify-start gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-violet-100 border border-violet-200 flex items-center justify-center shrink-0">
                <span className="text-xs text-violet-600 font-bold">{ctx.agentName[0]}</span>
              </div>
              <div className="bg-white border border-slate-200 shadow-sm rounded-2xl rounded-tl-sm px-4 py-3">
                <div className="flex gap-1.5">
                  {[0, 1, 2].map(i => (
                    <span key={i} className="w-2 h-2 rounded-full bg-violet-300 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Variation Selector */}
          {showVariations && variations.length > 0 && (
            <div className="bg-white border border-violet-200 rounded-2xl p-4 shadow-lg shadow-violet-100">
              <p className="text-xs font-semibold text-slate-700 mb-3">
                {variations.length} Variationen generiert — wählen Sie eine:
              </p>
              <div className="space-y-2">
                {variations.map((v) => (
                  <button key={v.id} onClick={() => sendInitialMessage(v)}
                    className="w-full text-left p-3.5 rounded-xl border border-slate-200 hover:border-violet-400 hover:bg-violet-50 transition-all group">
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <span className="text-xs font-bold text-slate-700 group-hover:text-violet-700">{v.label}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full border border-emerald-100">
                          {v.score}
                        </span>
                        <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">{v.tone.split(",")[0]}</span>
                      </div>
                    </div>
                    {v.subject && (
                      <p className="text-[10px] text-violet-600 font-semibold mb-1.5">✉ {v.subject}</p>
                    )}
                    <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{v.body.split("\n")[0]}</p>
                    <p className="text-[10px] text-slate-400 mt-1.5 italic line-clamp-1">{v.reasoning}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Round 1: First Response Simulation */}
          {convState === "awaiting_response" && !isProcessing && (
            <div className="bg-white border border-amber-200 rounded-2xl p-4 shadow-md">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-5 h-5 rounded-full bg-amber-100 border border-amber-200 flex items-center justify-center text-[10px] font-bold text-amber-600">1</span>
                <p className="text-xs font-semibold text-slate-700">Erste Antwort von {profile?.firstName}:</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(Object.entries(RESPONSE_LABELS) as [ResponseType, typeof RESPONSE_LABELS[ResponseType]][]).map(([type, r]) => (
                  <button key={type} onClick={() => simulateResponse(type)}
                    className={`p-3 rounded-xl border text-left transition-all hover:opacity-90 hover:shadow-sm ${r.bg} ${r.border}`}
                    style={type === "no_response" ? { gridColumn: "1 / -1" } : {}}>
                    <p className={`text-xs font-bold ${r.color}`}>{r.label}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">{r.example}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Round 2+: Continuation Buttons */}
          {showContinuationButtons && !isProcessing && activeResponseType && (() => {
            const opts = getContinuationOptions(activeResponseType, continuationRound);
            if (opts.length === 0) return null;
            return (
              <div className="bg-white border border-violet-200 rounded-2xl p-4 shadow-md">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-5 h-5 rounded-full bg-violet-100 border border-violet-200 flex items-center justify-center text-[10px] font-bold text-violet-600">{continuationRound + 1}</span>
                  <p className="text-xs font-semibold text-slate-700">{profile?.firstName} antwortet weiter:</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {opts.map((opt) => (
                    <button key={opt.type} onClick={() => handleContinuation(opt.type)}
                      className={`p-3 rounded-xl border text-left transition-all hover:opacity-90 hover:shadow-sm ${opt.bg} ${opt.border}`}
                      style={opts.length === 1 ? { gridColumn: "1 / -1" } : {}}>
                      <p className={`text-xs font-bold ${opt.color}`}>{opt.label}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">{opt.example}</p>
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Booking Confirmation */}
          {convState === "booking" && !isProcessing && (
            <div className="bg-white border border-violet-200 rounded-2xl p-4 shadow-md">
              <p className="text-xs font-semibold text-slate-700 mb-3">
                {profile?.firstName} reagiert auf den Terminvorschlag:
              </p>
              <div className="flex gap-2">
                <button onClick={confirmBooking}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all">
                  ✓ Termin bestätigen
                </button>
                <button onClick={() => {
                  addMsg({ role: "lead", content: "Leider passt das gerade nicht. Vielleicht ein anderes Mal.", state: "booking" });
                  addMsg({ role: "system", content: "Termin abgelehnt · Konversation beendet", state: "closed" });
                  setConvState("closed");
                }}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium rounded-xl transition-all">
                  ✗ Ablehnen
                </button>
              </div>
            </div>
          )}

          {/* Success */}
          {convState === "booked" && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-center">
              <div className="text-3xl mb-2">🎉</div>
              <p className="font-bold text-emerald-700 text-base">Termin gebucht!</p>
              <p className="text-xs text-emerald-600 mt-1">
                {profile?.fullName}{profile?.company ? ` (${profile.company})` : ""} · Demo-Gespräch bestätigt
              </p>
              <div className="mt-3 pt-3 border-t border-emerald-200 flex items-center justify-center gap-4 text-xs text-emerald-600">
                <span>{messages.filter(m => m.role !== "system").length} Nachrichten</span>
                <span>·</span>
                <span>Segment: {profile ? SEGMENT_META[profile.segment].label : "—"}</span>
                <span>·</span>
                <span>Score: {profile?.score}</span>
                {pr && <><span>·</span><span>QC: {pr.qualityControl.overallScore}</span></>}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
