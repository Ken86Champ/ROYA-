"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Msg {
  id: string;
  role: "assistant" | "user";
  text: string;
}

interface SetupData {
  agentName?: string;
  companyName?: string;
  industry?: string;
  offer?: string;
  cta?: string;
  tone?: string;
  writerInstructions?: string;
  strategistInstructions?: string;
  [key: string]: unknown;
}

const BLOCKS = [
  { id: 1, label: "Unternehmen",              questions: "1–7" },
  { id: 2, label: "Zielgruppe",               questions: "8–13" },
  { id: 3, label: "Termin-Ziel",              questions: "14–21" },
  { id: 4, label: "Tonalität",                questions: "22–29" },
  { id: 5, label: "Angebot & Details",        questions: "30–36" },
  { id: 6, label: "Fragen & Einwände",        questions: "37–44" },
  { id: 7, label: "Grenzen",                  questions: "45–47" },
  { id: 8, label: "Eskalation & Logik",       questions: "48–61" },
  { id: 9, label: "Failsafe",                 questions: "62" },
];

function detectCurrentBlock(history: { role: string; content: string }[]): number {
  const allText = history.map(h => h.content).join(" ").toLowerCase();
  if (allText.includes("block 9") || allText.includes("frage 62")) return 9;
  if (allText.includes("block 8") || allText.includes("frage 48")) return 8;
  if (allText.includes("block 7") || allText.includes("frage 45")) return 7;
  if (allText.includes("block 6") || allText.includes("frage 37")) return 6;
  if (allText.includes("block 5") || allText.includes("frage 30")) return 5;
  if (allText.includes("block 4") || allText.includes("frage 22")) return 4;
  if (allText.includes("block 3") || allText.includes("frage 14")) return 3;
  if (allText.includes("block 2") || allText.includes("frage 8")) return 2;
  return 1;
}

// ─── Inner component (uses useSearchParams) ───────────────────────────────────

function SetupPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const campaignId = searchParams.get("campaignId") || undefined;

  const [messages, setMessages] = useState<Msg[]>([]);
  const [history, setHistory] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [started, setStarted] = useState(false);
  const [currentBlock, setCurrentBlock] = useState(1);
  const [isComplete, setIsComplete] = useState(false);
  const [setupData, setSetupData] = useState<SetupData | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [existingSetup, setExistingSetup] = useState<{ companyName: string; agentName: string } | null>(null);
  const [checkingExisting, setCheckingExisting] = useState(true);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  // ── Check for existing setup in DB + restore from localStorage ────────────
  useEffect(() => {
    // 1. Restore in-progress chat from localStorage
    try {
      const saved = localStorage.getItem('roya_setup_session');
      if (saved) {
        const session = JSON.parse(saved);
        if (session.messages?.length > 0) {
          setMessages(session.messages);
          setHistory(session.history || []);
          setCurrentBlock(session.currentBlock || 1);
          setStarted(true);
          if (session.isComplete && session.setupData) {
            setIsComplete(true);
            setSetupData(session.setupData);
          }
          setCheckingExisting(false);
          return;
        }
      }
    } catch { /* ignore */ }

    // 2. Check if setup already saved in DB
    fetch('/api/settings/agent-config')
      .then(r => r.json())
      .then((cfg: Record<string, unknown>) => {
        const persona = cfg?.persona as Record<string, string> | undefined;
        const hasSetup = !!(cfg?.activeFrameworkId || persona?.companyName);
        if (hasSetup && persona?.companyName) {
          setExistingSetup({
            companyName: persona.companyName,
            agentName: persona.agentName || 'Roya',
          });
        }
        setCheckingExisting(false);
      })
      .catch(() => setCheckingExisting(false));
  }, []);

  // ── Persist chat session to localStorage ──────────────────────────────────
  useEffect(() => {
    if (!started || messages.length === 0) return;
    try {
      localStorage.setItem('roya_setup_session', JSON.stringify({
        messages, history, currentBlock, isComplete, setupData,
      }));
    } catch { /* ignore */ }
  }, [messages, history, currentBlock, isComplete, setupData, started]);

  function addMsg(role: "assistant" | "user", text: string) {
    setMessages(prev => [...prev, { id: crypto.randomUUID(), role, text }]);
  }

  // ── Start conversation ─────────────────────────────────────────────────────

  async function start() {
    setStarted(true);
    setThinking(true);
    try {
      const res = await fetch("/api/setup-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Bereit. Starte das Setup.", history: [] }),
      });
      const data = await res.json();
      setThinking(false);
      const reply = data.reply || "Perfekt — starten wir. Wie heißt dein Unternehmen?";
      addMsg("assistant", reply);
      setHistory([{ role: "assistant", content: reply }]);
    } catch {
      setThinking(false);
      const fallback = "Perfekt — starten wir. Wie heißt dein Unternehmen?";
      addMsg("assistant", fallback);
      setHistory([{ role: "assistant", content: fallback }]);
    }
  }

  // ── Send user message ──────────────────────────────────────────────────────

  async function send() {
    const text = input.trim();
    if (!text || thinking) return;
    setInput("");

    addMsg("user", text);
    const newHistory: { role: "user" | "assistant"; content: string }[] = [
      ...history,
      { role: "user", content: text },
    ];
    setHistory(newHistory);
    setThinking(true);

    try {
      const res = await fetch("/api/setup-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      });
      const data = await res.json();
      setThinking(false);

      const reply: string = data.reply || "Verstanden. Weiter.";

      // Strip SETUP_COMPLETE block from displayed text
      const displayReply = reply.replace(/SETUP_COMPLETE[\s\S]*$/, "").trim()
        || "Setup abgeschlossen! Dein Agent-Profil ist fertig.";

      addMsg("assistant", displayReply);
      const updatedHistory: { role: "user" | "assistant"; content: string }[] = [
        ...newHistory,
        { role: "assistant", content: reply },
      ];
      setHistory(updatedHistory);
      setCurrentBlock(detectCurrentBlock(updatedHistory));

      if (data.isComplete && data.setupData) {
        setIsComplete(true);
        setSetupData(data.setupData);
      }
    } catch {
      setThinking(false);
      addMsg("assistant", "Kurzer Fehler — bitte nochmal versuchen.");
    }
  }

  // ── Save setup ─────────────────────────────────────────────────────────────

  async function saveSetup() {
    if (!setupData) return;
    setSaving(true);
    setSaveError("");
    try {
      const frameworkName = `${setupData.companyName || "Unbekannt"} — Setup`;
      const res = await fetch("/api/setup-agent/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setupData, frameworkName, campaignId }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        const msg = json.error || `HTTP ${res.status}`;
        console.error("Save failed:", msg);
        setSaveError(msg);
        return;
      }
      setSaved(true);
      try { localStorage.removeItem('roya_setup_session'); } catch { /* ignore */ }
      // If started from a campaign, go back to that campaign's edit — otherwise create new
      const target = campaignId
        ? `/dashboard/campaigns/${campaignId}/edit`
        : "/dashboard/campaigns/new";
      setTimeout(() => router.push(target), 1200);
    } catch (err) {
      console.error("Save failed:", err);
      setSaveError(String(err));
    } finally {
      setSaving(false);
    }
  }

  function clearAndRestart() {
    try { localStorage.removeItem('roya_setup_session'); } catch { /* ignore */ }
    setMessages([]);
    setHistory([]);
    setCurrentBlock(1);
    setIsComplete(false);
    setSetupData(null);
    setSaved(false);
    setStarted(false);
    setExistingSetup(null);
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full bg-slate-50">

      {/* ── Left sidebar — block progress ───────────────────────────────── */}
      <div className="w-64 shrink-0 bg-white border-r border-slate-200 flex flex-col">

        <div className="px-5 pt-5 pb-4 border-b border-slate-100">
          <button onClick={() => router.push("/dashboard")}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-violet-600 transition-colors font-medium mb-4">
            ← Dashboard
          </button>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-violet-600 flex items-center justify-center shrink-0">
              <span className="text-white text-sm font-bold">R</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">RoyaGPT Setup</p>
              <p className="text-[11px] text-slate-400">Agent-Konfigurator</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Fortschritt</p>
          <div className="space-y-1">
            {BLOCKS.map(block => {
              const done = block.id < currentBlock;
              const active = block.id === currentBlock;
              return (
                <div key={block.id}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                    active ? "bg-violet-50 border border-violet-200" :
                    done   ? "opacity-70" : "opacity-40"
                  }`}>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${
                    done   ? "bg-emerald-500 text-white" :
                    active ? "bg-violet-600 text-white" : "bg-slate-200 text-slate-400"
                  }`}>
                    {done ? "✓" : block.id}
                  </div>
                  <div>
                    <p className={`text-xs font-medium ${active ? "text-violet-700" : done ? "text-emerald-700" : "text-slate-400"}`}>
                      {block.label}
                    </p>
                    <p className="text-[10px] text-slate-400">Fragen {block.questions}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {isComplete && (
            <div className="mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
              <p className="text-xs font-semibold text-emerald-700">Setup abgeschlossen</p>
              <p className="text-[11px] text-emerald-600 mt-0.5">Bereit zum Speichern</p>
            </div>
          )}
        </div>

        {campaignId && (
          <div className="px-4 pb-4">
            <div className="bg-violet-50 border border-violet-200 rounded-xl p-3">
              <p className="text-[10px] font-semibold text-violet-500 uppercase tracking-wide">Kampagne verknüpft</p>
              <p className="text-[11px] text-violet-700 mt-0.5 truncate">{campaignId}</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Main chat area ──────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {!started ? (
          /* Start screen */
          <div className="flex-1 flex flex-col items-center justify-center px-8">
            {checkingExisting ? (
              <div className="text-slate-400 text-sm">Laden…</div>
            ) : existingSetup ? (
              /* Existing setup detected */
              <div className="max-w-lg w-full text-center space-y-6">
                <div className="w-16 h-16 rounded-2xl bg-emerald-500 flex items-center justify-center mx-auto shadow-lg shadow-emerald-200">
                  <span className="text-white text-2xl">✓</span>
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">Setup aktiv</h1>
                  <p className="text-slate-500 mt-2 text-sm">
                    Agent <strong>{existingSetup.agentName}</strong> ist für <strong>{existingSetup.companyName}</strong> konfiguriert.
                  </p>
                </div>
                <div className="flex flex-col gap-3">
                  <button onClick={() => router.push("/dashboard/campaigns/new")}
                    className="w-full py-4 rounded-2xl bg-violet-600 text-white font-semibold text-sm hover:bg-violet-700 transition-all shadow-lg shadow-violet-200">
                    Neue Kampagne erstellen →
                  </button>
                  <button onClick={clearAndRestart}
                    className="w-full py-3 rounded-2xl border border-slate-200 text-slate-500 text-sm hover:bg-slate-50 transition-all">
                    Setup neu durchführen
                  </button>
                </div>
              </div>
            ) : (
              /* No existing setup — show intro */
              <div className="max-w-lg w-full text-center space-y-6">
                <div className="w-16 h-16 rounded-2xl bg-violet-600 flex items-center justify-center mx-auto shadow-lg shadow-violet-200">
                  <span className="text-white text-2xl font-bold">R</span>
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">RoyaGPT Setup</h1>
                  <p className="text-slate-500 mt-2 text-sm leading-relaxed">
                    Ich führe dich strukturiert durch alle relevanten Fragen und erstelle daraus
                    ein vollständiges, fehlerfreies Agent-Setup — 9 Blöcke, 62 Fragen.
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-3 text-left">
                  {[
                    { icon: "🏢", label: "Unternehmen & Angebot" },
                    { icon: "🎯", label: "Zielgruppe & Einwände" },
                    { icon: "⚡", label: "Regeln & Eskalation" },
                  ].map(item => (
                    <div key={item.label} className="bg-white border border-slate-200 rounded-xl p-3">
                      <span className="text-lg">{item.icon}</span>
                      <p className="text-xs font-medium text-slate-700 mt-1">{item.label}</p>
                    </div>
                  ))}
                </div>
                <button onClick={start}
                  className="w-full py-4 rounded-2xl bg-violet-600 text-white font-semibold text-sm hover:bg-violet-700 transition-all shadow-lg shadow-violet-200">
                  Setup starten →
                </button>
              </div>
            )}
          </div>

        ) : (
          <>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
              {messages.map(msg => (
                <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "assistant" && (
                    <div className="w-8 h-8 rounded-xl bg-violet-600 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-white text-xs font-bold">R</span>
                    </div>
                  )}
                  <div className={`max-w-[70%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === "assistant"
                      ? "bg-white border border-slate-200 text-slate-800 rounded-tl-sm shadow-sm"
                      : "bg-violet-600 text-white rounded-tr-sm"
                  }`}>
                    {msg.text}
                  </div>
                </div>
              ))}

              {thinking && (
                <div className="flex gap-3 justify-start">
                  <div className="w-8 h-8 rounded-xl bg-violet-600 flex items-center justify-center shrink-0">
                    <span className="text-white text-xs font-bold">R</span>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                    <div className="flex gap-1 items-center">
                      <div className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                      <div className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                      <div className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>

            {/* Completion banner */}
            {isComplete && setupData && (
              <div className="mx-6 mb-3 bg-emerald-50 border border-emerald-200 rounded-2xl p-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-emerald-800">Setup abgeschlossen ✓</p>
                    <p className="text-xs text-emerald-600 mt-0.5">
                      <strong>{setupData.agentName}</strong> · {setupData.companyName}
                    </p>
                  </div>
                  <div className="shrink-0">
                    {saved ? (
                      <div className="flex items-center gap-2 px-4 py-2 bg-emerald-600 rounded-xl">
                        <span className="text-white text-xs font-semibold">✓ Aktiviert — Weiterleitung…</span>
                      </div>
                    ) : (
                      <button onClick={saveSetup} disabled={saving}
                        className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold rounded-xl transition-all disabled:opacity-60 shadow-md shadow-violet-200 whitespace-nowrap">
                        {saving ? "Aktivieren…" : "Aktivieren →"}
                      </button>
                    )}
                  </div>
                </div>
                {saveError && (
                  <div className="mt-3 p-2.5 bg-red-50 border border-red-200 rounded-xl">
                    <p className="text-xs text-red-700 font-medium">Fehler beim Speichern: {saveError}</p>
                    <p className="text-[11px] text-red-500 mt-0.5">Versuche es nochmal oder kontaktiere den Support.</p>
                  </div>
                )}
              </div>
            )}

            {/* Input */}
            {!isComplete && (
              <div className="px-6 pb-6">
                <div className="flex gap-3 bg-white border border-slate-200 rounded-2xl p-2 shadow-sm focus-within:border-violet-300 transition-colors">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    }}
                    disabled={thinking}
                    placeholder={thinking ? "RoyaGPT denkt nach…" : "Deine Antwort…"}
                    rows={2}
                    className="flex-1 bg-transparent text-sm text-slate-800 placeholder-slate-400 focus:outline-none resize-none disabled:opacity-50 px-2 py-1"
                  />
                  <button onClick={send} disabled={!input.trim() || thinking}
                    className="self-end w-10 h-10 rounded-xl bg-violet-600 flex items-center justify-center text-white disabled:opacity-30 hover:bg-violet-700 transition-all shrink-0">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                    </svg>
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 mt-2 text-center">Enter zum Senden · Shift+Enter für neue Zeile</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Page wrapper (Suspense for useSearchParams) ──────────────────────────────

export default function SetupPage() {
  return (
    <Suspense fallback={
      <div className="flex h-full items-center justify-center">
        <div className="text-slate-400 text-sm">Laden…</div>
      </div>
    }>
      <SetupPageInner />
    </Suspense>
  );
}
