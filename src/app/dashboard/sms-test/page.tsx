"use client";
import { useState, useRef, useEffect, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: "lead" | "agent";
  body: string;
  timestamp: Date;
  meta?: {
    intent: string;
    sentiment: string;
    confidence: number;
    nextAction: string;
    reasoning: string;
  };
}

interface Scenario {
  id: string;
  label: string;
  description: string;
  leadName: string;
  opener: string;
  color: string;
}

// ── Scenarios ─────────────────────────────────────────────────────────────────

const SCENARIOS: Scenario[] = [
  {
    id: "identity",
    label: "Wer bist du?",
    description: "Kunde fragt nach der Identität des Senders",
    leadName: "Marco",
    opener: "wer bist du und was wollt ihr von mir?",
    color: "bg-blue-50 border-blue-200 text-blue-700",
  },
  {
    id: "interested",
    label: "Direkt interessiert",
    description: "Kunde zeigt sofort Interesse",
    leadName: "Sarah",
    opener: "ja bin ich interessiert, was bietet ihr an?",
    color: "bg-green-50 border-green-200 text-green-700",
  },
  {
    id: "no_time",
    label: "Keine Zeit",
    description: "Klassischer Einwand: keine Zeit",
    leadName: "Thomas",
    opener: "keine Zeit grad, zu viel um die Ohren",
    color: "bg-orange-50 border-orange-200 text-orange-700",
  },
  {
    id: "price",
    label: "Zu teuer",
    description: "Preiseinwand",
    leadName: "Lisa",
    opener: "das ist sicher wieder viel zu teuer bei euch",
    color: "bg-yellow-50 border-yellow-200 text-yellow-700",
  },
  {
    id: "not_relevant",
    label: "Nicht relevant",
    description: "Thema ist für Kunde nicht mehr relevant",
    leadName: "Peter",
    opener: "das ist für mich nicht mehr relevant",
    color: "bg-slate-50 border-slate-200 text-slate-600",
  },
  {
    id: "angry",
    label: "Genervt / Stopp",
    description: "Kunde ist genervt von der Kontaktaufnahme",
    leadName: "Karin",
    opener: "hört auf mir zu schreiben, ich hab das nicht bestellt",
    color: "bg-red-50 border-red-200 text-red-700",
  },
  {
    id: "ex_client",
    label: "Ex-Kunde",
    description: "War früher Kunde, hat aufgehört",
    leadName: "David",
    opener: "ich war mal bei euch, aber dann habe ich aufgehört wegen Verletzung",
    color: "bg-violet-50 border-violet-200 text-violet-700",
  },
  {
    id: "custom",
    label: "Eigene Nachricht",
    description: "Teste eine eigene Situation",
    leadName: "Test",
    opener: "",
    color: "bg-gray-50 border-gray-200 text-gray-600",
  },
];

// ── Business Config ───────────────────────────────────────────────────────────

interface BusinessConfig {
  agentName: string;
  companyName: string;
  offer: string;
  goal: string;
  tone: string;
}

const DEFAULT_CONFIG: BusinessConfig = {
  agentName: "Tanja",
  companyName: "10X Personaltraining",
  offer: "Persönliches Training, Ernährungscoaching und individuelle Fitness-Programme für nachhaltige Ergebnisse",
  goal: "Ein kostenloses 15-minütiges Beratungsgespräch vereinbaren",
  tone: "Warm, direkt, menschlich — wie eine Freundin, die zufällig im Fitness-Bereich arbeitet. Nie salesig.",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(d: Date) {
  return d.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function intentColor(intent: string) {
  const map: Record<string, string> = {
    hot: "text-green-600 bg-green-50",
    warm: "text-blue-600 bg-blue-50",
    cold: "text-slate-500 bg-slate-50",
    question: "text-violet-600 bg-violet-50",
    timing: "text-orange-500 bg-orange-50",
    wrong_person: "text-red-500 bg-red-50",
    already_solved: "text-red-400 bg-red-50",
    unclear: "text-gray-500 bg-gray-50",
  };
  return map[intent] || "text-gray-500 bg-gray-50";
}

function confidenceColor(c: number) {
  if (c >= 80) return "text-green-600";
  if (c >= 60) return "text-orange-500";
  return "text-red-500";
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SmsTestPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null);
  const [leadName, setLeadName] = useState("Test Lead");
  const [showConfig, setShowConfig] = useState(false);
  const [config, setConfig] = useState<BusinessConfig>(DEFAULT_CONFIG);
  const [selectedMsg, setSelectedMsg] = useState<Message | null>(null);
  const [sendLive, setSendLive] = useState(false);
  const [liveNumber, setLiveNumber] = useState("");
  const [polling, setPolling] = useState(false);
  const [lastPollTime, setLastPollTime] = useState<string | null>(null);
  const [processedSids, setProcessedSids] = useState<Set<string>>(new Set());
  const pollingRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Twilio Polling for live SMS replies ──────────────────────────────────
  useEffect(() => {
    if (!sendLive || !liveNumber) {
      pollingRef.current = false;
      setPolling(false);
      return;
    }

    pollingRef.current = true;
    setPolling(true);

    const normalizePhone = (num: string) => {
      const digits = num.replace(/\s/g, "");
      if (digits.startsWith("+")) return digits;
      if (digits.startsWith("00")) return "+" + digits.slice(2);
      if (digits.startsWith("0")) return "+41" + digits.slice(1);
      return digits;
    };

    const interval = setInterval(async () => {
      if (!pollingRef.current || loading) return;
      const contact = normalizePhone(liveNumber);

      try {
        const params = new URLSearchParams({ contact });
        if (lastPollTime) params.set("since", lastPollTime);

        const res = await fetch(`/api/twilio-poll?${params}`);
        if (!res.ok) return;
        const data = await res.json();

        const newMessages = (data.messages || []).filter(
          (m: { sid: string }) => !processedSids.has(m.sid)
        );

        for (const msg of newMessages) {
          // Mark as processed
          setProcessedSids(prev => new Set([...prev, msg.sid]));
          setLastPollTime(msg.dateSent);

          // Add lead message to chat
          const leadMsg: Message = {
            id: crypto.randomUUID(),
            role: "lead",
            body: msg.body,
            timestamp: new Date(msg.dateSent),
          };
          setMessages(prev => [...prev, leadMsg]);
          setLoading(true);

          // Process through AI and send reply
          try {
            const history = [...messages, leadMsg].map(m => ({ role: m.role, body: m.body }));
            const aiRes = await fetch("/api/twilio-poll", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contact,
                message: msg.body,
                leadName,
                history,
                business: config,
              }),
            });
            const aiData = await aiRes.json();

            if (aiData.reply) {
              const agentMsg: Message = {
                id: crypto.randomUUID(),
                role: "agent",
                body: aiData.reply,
                timestamp: new Date(),
                meta: {
                  intent: aiData.intent,
                  sentiment: aiData.sentiment,
                  confidence: aiData.confidence,
                  nextAction: aiData.nextAction,
                  reasoning: aiData.reasoning,
                },
              };
              setMessages(prev => [...prev, agentMsg]);
              setSelectedMsg(agentMsg);
            }
          } catch (err) {
            console.error("[ROYA] Poll reply error:", err);
          } finally {
            setLoading(false);
          }
        }
      } catch (err) {
        console.error("[ROYA] Poll error:", err);
      }
    }, 3000);

    return () => {
      pollingRef.current = false;
      setPolling(false);
      clearInterval(interval);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendLive, liveNumber]);

  const resetChat = useCallback(() => {
    setMessages([]);
    setSelectedMsg(null);
    setProcessedSids(new Set());
    setLastPollTime(null);
  }, []);

  const startScenario = useCallback((scenario: Scenario) => {
    setSelectedScenario(scenario);
    setLeadName(scenario.leadName);
    resetChat();
    if (scenario.opener) {
      setInput(scenario.opener);
      inputRef.current?.focus();
    } else {
      setInput("");
      inputRef.current?.focus();
    }
  }, [resetChat]);

  const sendMessage = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    setInput("");

    const leadMsg: Message = {
      id: crypto.randomUUID(),
      role: "lead",
      body: msg,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, leadMsg]);
    setLoading(true);

    try {
      const history = messages.map(m => ({ role: m.role, body: m.body }));

      const res = await fetch("/api/converse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact: liveNumber || "+41000000000",
          leadName,
          message: msg,
          history,
          business: config,
        }),
      });

      const data = await res.json();

      if (data.error) throw new Error(data.error);

      const agentMsg: Message = {
        id: crypto.randomUUID(),
        role: "agent",
        body: data.reply,
        timestamp: new Date(),
        meta: {
          intent: data.intent,
          sentiment: data.sentiment,
          confidence: data.confidence,
          nextAction: data.nextAction,
          reasoning: data.reasoning,
        },
      };
      setMessages(prev => [...prev, agentMsg]);
      setSelectedMsg(agentMsg);

      // Optionally send live SMS
      if (sendLive && liveNumber) {
        // Set poll timestamp to now so we only pick up replies after this message
        setLastPollTime(new Date().toISOString());
        await fetch("/api/test-send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: liveNumber,
            body: data.reply,
          }),
        }).catch(() => {});
      }
    } catch (err) {
      const errMsg: Message = {
        id: crypto.randomUUID(),
        role: "agent",
        body: `[Fehler: ${String(err)}]`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [input, loading, messages, leadName, config, sendLive, liveNumber]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex h-full bg-slate-50">
      {/* LEFT: Scenario Panel */}
      <div className="w-64 border-r border-slate-200 bg-white flex flex-col shrink-0 overflow-y-auto">
        <div className="px-4 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800">Szenarien</h3>
          <p className="text-xs text-slate-400 mt-0.5">Klick = Sofort testen</p>
        </div>

        <div className="p-3 space-y-1.5">
          {SCENARIOS.map(s => (
            <button
              key={s.id}
              onClick={() => startScenario(s)}
              className={`w-full text-left p-3 rounded-xl border text-xs transition-all hover:opacity-90 ${
                selectedScenario?.id === s.id
                  ? s.color + " ring-2 ring-violet-400"
                  : s.color
              }`}
            >
              <div className="font-semibold mb-0.5">{s.label}</div>
              <div className="opacity-70 leading-tight">{s.description}</div>
              {s.opener && (
                <div className="mt-1.5 font-mono opacity-60 text-[10px] truncate">
                  "{s.opener}"
                </div>
              )}
            </button>
          ))}
        </div>

        {/* Config toggle */}
        <div className="mt-auto border-t border-slate-100 p-3">
          <button
            onClick={() => setShowConfig(v => !v)}
            className="w-full text-xs text-slate-500 hover:text-violet-600 flex items-center gap-1.5 transition-colors"
          >
            <span>⚙</span>
            <span>Agent konfigurieren</span>
            <span className="ml-auto">{showConfig ? "▲" : "▼"}</span>
          </button>
        </div>
      </div>

      {/* CENTER: Chat */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="px-6 py-3.5 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center text-white text-xs font-bold">
              {leadName.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <input
                value={leadName}
                onChange={e => setLeadName(e.target.value)}
                className="text-sm font-semibold text-slate-800 bg-transparent border-none outline-none w-40"
                placeholder="Lead-Name"
              />
              <p className="text-xs text-slate-400">
                {config.agentName} von {config.companyName}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <button
                onClick={resetChat}
                className="text-xs text-slate-400 hover:text-red-500 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-50"
              >
                Chat leeren
              </button>
            )}
            <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
              polling
                ? "text-green-700 bg-green-50 border border-green-200"
                : "text-violet-700 bg-violet-50 border border-violet-200"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${polling ? "bg-green-500 animate-pulse" : "bg-violet-500"}`} />
              {polling ? "Live SMS aktiv" : "Simulator"}
            </span>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <div className="w-16 h-16 rounded-2xl bg-violet-100 flex items-center justify-center text-3xl mb-4">
                ◈
              </div>
              <h3 className="text-base font-semibold text-slate-700">
                Wähle ein Szenario
              </h3>
              <p className="text-sm text-slate-400 mt-1 max-w-xs">
                Klicke links auf ein Szenario oder tippe direkt unten eine Nachricht
              </p>
            </div>
          )}

          {messages.map(msg => {
            const isLead = msg.role === "lead";
            const isSelected = selectedMsg?.id === msg.id;
            return (
              <div key={msg.id} className={`flex ${isLead ? "justify-end" : "justify-start"}`}>
                {!isLead && (
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center text-white text-[10px] font-bold mr-2 mt-auto shrink-0">
                    {config.agentName.slice(0, 1)}
                  </div>
                )}
                <div className="max-w-[60%]">
                  <div
                    onClick={() => msg.meta && setSelectedMsg(isSelected ? null : msg)}
                    className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed cursor-pointer transition-all ${
                      isLead
                        ? "bg-[#1B8CF3] text-white rounded-br-sm"
                        : `bg-white border text-slate-800 rounded-bl-sm shadow-sm ${
                            isSelected
                              ? "border-violet-400 shadow-violet-100"
                              : "border-slate-200 hover:border-slate-300"
                          }`
                    }`}
                  >
                    {msg.body}
                  </div>
                  <div className={`text-[10px] text-slate-400 mt-1 ${isLead ? "text-right" : "ml-1"}`}>
                    {formatTime(msg.timestamp)}
                    {!isLead && msg.meta && (
                      <span className="ml-2 text-violet-400">Klick = Details</span>
                    )}
                  </div>
                </div>
                {isLead && (
                  <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 text-[10px] font-bold ml-2 mt-auto shrink-0">
                    {leadName.slice(0, 2).toUpperCase()}
                  </div>
                )}
              </div>
            );
          })}

          {loading && (
            <div className="flex justify-start">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center text-white text-[10px] font-bold mr-2">
                {config.agentName.slice(0, 1)}
              </div>
              <div className="bg-white border border-slate-200 px-4 py-3 rounded-2xl rounded-bl-sm shadow-sm flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-6 py-4 border-t border-slate-200 bg-white shrink-0">
          {/* Live SMS toggle */}
          <div className="flex items-center gap-3 mb-3">
            <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer select-none">
              <div
                onClick={() => setSendLive(v => !v)}
                className={`relative w-8 h-4 rounded-full transition-colors cursor-pointer ${sendLive ? "bg-green-500" : "bg-slate-200"}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${sendLive ? "translate-x-4" : ""}`} />
              </div>
              Live SMS (senden + automatisch antworten)
            </label>
            {sendLive && (
              <>
                <input
                  value={liveNumber}
                  onChange={e => setLiveNumber(e.target.value)}
                  placeholder="+41786215258"
                  className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 w-36 outline-none focus:border-green-400"
                />
                {polling && (
                  <span className="text-[10px] text-green-600 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    Wartet auf Antwort...
                  </span>
                )}
              </>
            )}
          </div>

          <div className="flex gap-3">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Schreibe als Lead... (Enter = Senden)"
              rows={2}
              className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm resize-none outline-none focus:border-violet-400 transition-colors"
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading}
              className="px-5 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-medium disabled:opacity-40 hover:bg-violet-700 transition-colors shrink-0"
            >
              Senden
            </button>
          </div>
          <p className="text-[10px] text-slate-300 mt-1.5">
            Shift+Enter = Zeilenumbruch · Enter = Senden
          </p>
        </div>
      </div>

      {/* RIGHT: Analysis Panel */}
      <div className="w-72 border-l border-slate-200 bg-white flex flex-col shrink-0 overflow-y-auto">
        <div className="px-4 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800">KI-Analyse</h3>
          <p className="text-xs text-slate-400 mt-0.5">Klicke auf eine Agenten-Nachricht</p>
        </div>

        {selectedMsg?.meta ? (
          <div className="p-4 space-y-4">
            {/* Intent */}
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Intent</p>
              <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${intentColor(selectedMsg.meta.intent)}`}>
                {selectedMsg.meta.intent}
              </span>
            </div>

            {/* Confidence */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Konfidenz</p>
                <span className={`text-xs font-bold ${confidenceColor(selectedMsg.meta.confidence)}`}>
                  {selectedMsg.meta.confidence}%
                </span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    selectedMsg.meta.confidence >= 80 ? "bg-green-500" :
                    selectedMsg.meta.confidence >= 60 ? "bg-orange-400" : "bg-red-400"
                  }`}
                  style={{ width: `${selectedMsg.meta.confidence}%` }}
                />
              </div>
            </div>

            {/* Sentiment */}
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Sentiment</p>
              <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${
                selectedMsg.meta.sentiment === "positive" ? "text-green-600 bg-green-50" :
                selectedMsg.meta.sentiment === "negative" ? "text-red-600 bg-red-50" :
                "text-slate-600 bg-slate-50"
              }`}>
                {selectedMsg.meta.sentiment === "positive" ? "Positiv" :
                 selectedMsg.meta.sentiment === "negative" ? "Negativ" : "Neutral"}
              </span>
            </div>

            {/* Next action */}
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Nächste Aktion</p>
              <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${
                selectedMsg.meta.nextAction === "book" ? "text-green-600 bg-green-50" :
                selectedMsg.meta.nextAction === "human_handoff" ? "text-red-600 bg-red-50" :
                selectedMsg.meta.nextAction === "close" ? "text-slate-500 bg-slate-50" :
                "text-blue-600 bg-blue-50"
              }`}>
                {selectedMsg.meta.nextAction === "book" ? "Termin buchen" :
                 selectedMsg.meta.nextAction === "human_handoff" ? "Mensch übernehmen" :
                 selectedMsg.meta.nextAction === "close" ? "Gespräch beenden" : "Weiterantworten"}
              </span>
            </div>

            {/* Reasoning */}
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Begründung KI</p>
              <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 rounded-xl p-3">
                {selectedMsg.meta.reasoning}
              </p>
            </div>

            {/* Response */}
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Agent-Antwort</p>
              <p className="text-xs text-slate-700 leading-relaxed bg-violet-50 border border-violet-100 rounded-xl p-3 font-medium">
                {selectedMsg.body}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-8">
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 text-lg mb-3">
              ◉
            </div>
            <p className="text-sm text-slate-400">
              Klicke auf eine graue Agenten-Nachricht um die KI-Analyse zu sehen
            </p>
          </div>
        )}

        {/* Config panel */}
        {showConfig && (
          <div className="border-t border-slate-100 p-4 space-y-3">
            <p className="text-xs font-semibold text-slate-600">Agent konfigurieren</p>
            {([
              { key: "agentName", label: "Name des Agents" },
              { key: "companyName", label: "Firmenname" },
              { key: "offer", label: "Angebot (kurz)", multiline: true },
              { key: "goal", label: "Gesprächsziel", multiline: true },
              { key: "tone", label: "Ton / Stil", multiline: true },
            ] as { key: keyof BusinessConfig; label: string; multiline?: boolean }[]).map(field => (
              <div key={field.key}>
                <label className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">{field.label}</label>
                {field.multiline ? (
                  <textarea
                    value={config[field.key]}
                    onChange={e => setConfig(c => ({ ...c, [field.key]: e.target.value }))}
                    rows={2}
                    className="mt-1 w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 resize-none outline-none focus:border-violet-400"
                  />
                ) : (
                  <input
                    value={config[field.key]}
                    onChange={e => setConfig(c => ({ ...c, [field.key]: e.target.value }))}
                    className="mt-1 w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-violet-400"
                  />
                )}
              </div>
            ))}
            <button
              onClick={() => setConfig(DEFAULT_CONFIG)}
              className="text-[10px] text-slate-400 hover:text-red-500 transition-colors"
            >
              Zurücksetzen
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
