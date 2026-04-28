"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Msg {
  id: string;
  role: "agent" | "lead";
  text: string;
  time: string;
}

interface Setup {
  leadName: string;
  agentName: string;
  companyName: string;
  offer: string;
  goal: string;
  tone: string;
  channel: "sms" | "whatsapp";
}

interface Example { original: string; edited: string; }

function nowTime() {
  return new Date().toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SimulationPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<"setup" | "chat">("setup");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [agentTyping, setAgentTyping] = useState(false);
  const [history, setHistory] = useState<{ role: "lead" | "agent"; body: string }[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [examples, setExamples] = useState<Example[]>([]);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [setup, setSetup] = useState<Setup>({
    leadName: "Thomas Meier",
    agentName: "Sarah",
    companyName: "10X Personaltraining",
    offer: "Persönliches Fitness-Coaching und Ernährungsplan",
    goal: "Kostenloses 15-Minuten Erstgespräch buchen",
    tone: "Warm, direkt und menschlich — wie eine Freundin die im Fitness-Bereich arbeitet",
    channel: "sms",
  });

  // Load saved examples from localStorage
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("roya_sim_examples") || "[]");
      setExamples(saved);
    } catch {}
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, agentTyping]);

  function addMsg(role: "agent" | "lead", text: string): Msg {
    const m: Msg = { id: crypto.randomUUID(), role, text, time: nowTime() };
    setMessages(prev => [...prev, m]);
    return m;
  }

  // ── Start simulation ───────────────────────────────────────────────────────

  async function startSimulation() {
    setPhase("chat");
    setAgentTyping(true);

    try {
      const res = await fetch("/api/simulate/opener", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadName: setup.leadName,
          agentName: setup.agentName,
          companyName: setup.companyName,
          offer: setup.offer,
          goal: setup.goal,
        }),
      });
      const data = await res.json();
      const cleanOffer = setup.offer && setup.offer.length < 60 && !setup.offer.toLowerCase().includes('reaktivierung') && !setup.offer.includes('—') && !setup.offer.includes('–') && !setup.offer.match(/\d{4}/) ? setup.offer : null;
      const opener: string = data.opener || `Hallo ${setup.leadName}, hier ${setup.agentName} von ${setup.companyName}. ${cleanOffer ? `Wir hatten vor einer Weile mal Kontakt bezüglich dem ${cleanOffer}.` : 'Wir hatten vor einer Weile schon mal Kontakt.'} Ist das Thema aktuell noch relevant bei dir?`;
      setAgentTyping(false);
      addMsg("agent", opener);
      setHistory([{ role: "agent", body: opener }]);
    } catch {
      setAgentTyping(false);
      const cleanOffer2 = setup.offer && setup.offer.length < 60 && !setup.offer.toLowerCase().includes('reaktivierung') && !setup.offer.includes('—') && !setup.offer.includes('–') && !setup.offer.match(/\d{4}/) ? setup.offer : null;
      const fallback = `Hallo ${setup.leadName}, hier ${setup.agentName} von ${setup.companyName}. ${cleanOffer2 ? `Wir hatten vor einer Weile mal Kontakt bezüglich dem ${cleanOffer2}.` : 'Wir hatten vor einer Weile schon mal Kontakt.'} Ist das Thema aktuell noch relevant bei dir?`;
      addMsg("agent", fallback);
      setHistory([{ role: "agent", body: fallback }]);
    }

    setTimeout(() => inputRef.current?.focus(), 200);
  }

  // ── Send lead message & get agent response ─────────────────────────────────

  async function sendMessage() {
    const text = input.trim();
    if (!text || agentTyping) return;
    setInput("");
    setEditingId(null);

    addMsg("lead", text);
    const newHistory = [...history, { role: "lead" as const, body: text }];
    setHistory(newHistory);
    setAgentTyping(true);

    try {
      const res = await fetch("/api/simulate/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadName: setup.leadName,
          message: text,
          history: newHistory,
          business: {
            agentName: setup.agentName,
            companyName: setup.companyName,
            offer: setup.offer,
            goal: setup.goal,
            tone: setup.tone,
          },
          examples,
        }),
      });
      const data = await res.json();
      setAgentTyping(false);

      const reply = data.reply || `Danke für die Antwort, ${setup.leadName}. Wann wäre ein kurzes Gespräch für dich möglich?`;
      addMsg("agent", reply);
      setHistory(h => [...h, { role: "agent", body: reply }]);
    } catch {
      setAgentTyping(false);
      const fallback = `Danke für die Antwort, ${setup.leadName}. Wann passt ein kurzes Gespräch?`;
      addMsg("agent", fallback);
      setHistory(h => [...h, { role: "agent", body: fallback }]);
    }
  }

  // ── Edit agent message ─────────────────────────────────────────────────────

  function startEdit(msg: Msg) {
    setEditingId(msg.id);
    setEditText(msg.text);
    setSavedNote(null);
  }

  function saveEdit() {
    if (!editingId || !editText.trim()) return;
    const original = messages.find(m => m.id === editingId)?.text || "";

    // Update message in chat
    setMessages(prev => prev.map(m => m.id === editingId ? { ...m, text: editText.trim() } : m));
    // Update history
    setHistory(h => h.map(m => m.body === original ? { ...m, body: editText.trim() } : m));

    // Save as example for future AI calls
    if (original !== editText.trim()) {
      const newExamples = [...examples, { original, edited: editText.trim() }].slice(-20); // keep last 20
      setExamples(newExamples);
      try { localStorage.setItem("roya_sim_examples", JSON.stringify(newExamples)); } catch {}
    }

    setSavedNote("Gespeichert ✓ — KI lernt diesen Stil für alle Gespräche");
    setEditingId(null);
    setTimeout(() => setSavedNote(null), 3000);
  }

  function reset() {
    setPhase("setup");
    setMessages([]);
    setHistory([]);
    setInput("");
    setAgentTyping(false);
    setEditingId(null);
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full">

      {/* ── Left panel ──────────────────────────────────────────────────── */}
      <div className="w-72 shrink-0 bg-white border-r border-slate-200 flex flex-col">

        {/* Back button */}
        <div className="px-4 pt-4 pb-2 border-b border-slate-100">
          <button onClick={() => router.push("/dashboard")}
            className="flex items-center gap-2 text-xs text-slate-400 hover:text-violet-600 transition-colors font-medium">
            ← Dashboard
          </button>
        </div>

        {phase === "setup" ? (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-800 mb-0.5">Outreach Simulation</h2>
              <p className="text-xs text-slate-400">Simuliere ein vollständiges Verkaufsgespräch als Lead</p>
            </div>

            <div className="space-y-3">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Lead</p>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Name des Leads</label>
                <input value={setup.leadName} onChange={e => setSetup(s => ({ ...s, leadName: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-violet-400"
                  placeholder="Thomas Meier" />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Kanal</label>
                <div className="flex gap-2">
                  {(["sms", "whatsapp"] as const).map(ch => (
                    <button key={ch} onClick={() => setSetup(s => ({ ...s, channel: ch }))}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-all ${
                        setup.channel === ch ? "bg-violet-600 border-violet-600 text-white" : "border-slate-200 text-slate-500 bg-slate-50 hover:border-violet-300"
                      }`}>
                      {ch === "sms" ? "💬 SMS" : "💚 WhatsApp"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-3 border-t border-slate-100">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Agent</p>
              {[
                { key: "agentName",   label: "Agent-Name",        placeholder: "Sarah" },
                { key: "companyName", label: "Unternehmen",       placeholder: "10X Personaltraining" },
                { key: "goal",        label: "Gesprächsziel",     placeholder: "15-Min Erstgespräch buchen" },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-xs text-slate-500 block mb-1">{f.label}</label>
                  <input value={(setup as unknown as Record<string,string>)[f.key]}
                    onChange={e => setSetup(s => ({ ...s, [f.key]: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-violet-400"
                    placeholder={f.placeholder} />
                </div>
              ))}
              <div>
                <label className="text-xs text-slate-500 block mb-1">Produkt / Angebot</label>
                <textarea value={setup.offer} onChange={e => setSetup(s => ({ ...s, offer: e.target.value }))}
                  rows={2}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-violet-400 resize-none"
                  placeholder="Persönliches Coaching..." />
              </div>
            </div>

            {examples.length > 0 && (
              <div className="pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Gespeicherte Stile</p>
                  <button onClick={() => { setExamples([]); localStorage.removeItem("roya_sim_examples"); }}
                    className="text-[10px] text-red-400 hover:text-red-600">Löschen</button>
                </div>
                <p className="text-[11px] text-slate-400">{examples.length} Beispiel{examples.length > 1 ? "e" : ""} gespeichert — KI orientiert sich daran</p>
              </div>
            )}

            <button onClick={startSimulation} disabled={!setup.leadName || !setup.companyName || !setup.offer}
              className="w-full py-3 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-40 transition-all shadow-md shadow-violet-200 mt-2">
              ▶ Simulation starten
            </button>
          </div>

        ) : (
          <div className="flex-1 flex flex-col p-5 gap-4 overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-700">{setup.leadName}</p>
                <p className="text-[11px] text-slate-400">{setup.companyName} · {setup.channel.toUpperCase()}</p>
              </div>
              <button onClick={reset} className="text-xs text-slate-400 hover:text-slate-700 px-2 py-1 rounded-lg hover:bg-slate-100 transition-colors">
                ↺ Reset
              </button>
            </div>

            <div className="pt-3 border-t border-slate-100 space-y-1.5">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Gesprächsverlauf</p>
              <p className="text-xs text-slate-500">{messages.length} Nachrichten</p>
              <p className="text-xs text-slate-500">{messages.filter(m => m.role === "agent").length} Agent · {messages.filter(m => m.role === "lead").length} Lead</p>
            </div>

            <div className="pt-3 border-t border-slate-100">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Anleitung</p>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Du bist <strong className="text-slate-600">{setup.leadName}</strong>.<br />
                Reagiere natürlich auf die Nachrichten des Agents.<br /><br />
                <span className="text-violet-500 font-medium">Tipp:</span> Klicke auf eine weisse Nachricht des Agents um sie zu bearbeiten. Die Änderung wird für alle künftigen Gespräche gespeichert.
              </p>
            </div>

            {savedNote && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                <p className="text-[11px] text-emerald-700">{savedNote}</p>
              </div>
            )}

            {examples.length > 0 && (
              <div className="pt-3 border-t border-slate-100">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">KI-Stil ({examples.length} Beispiele)</p>
                <p className="text-[11px] text-slate-400">Gespeichert · wird bei nächster Antwort verwendet</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Phone area ──────────────────────────────────────────────────── */}
      <div className="flex-1 flex items-start justify-center bg-slate-100 p-8 overflow-y-auto">

        {phase === "setup" ? (
          <div className="text-center mt-20">
            <div className="w-20 h-20 rounded-2xl bg-white border border-slate-200 flex items-center justify-center mx-auto mb-4 shadow-sm">
              <span className="text-3xl">📱</span>
            </div>
            <p className="text-slate-500 text-sm font-medium">Konfiguriere die Simulation</p>
            <p className="text-slate-400 text-xs mt-1">und klicke auf „Simulation starten"</p>
          </div>

        ) : (
          <div className="flex flex-col items-center gap-4 w-full max-w-[420px]">
            {/* Phone mockup */}
            <div className="w-[375px] bg-white rounded-[44px] shadow-2xl shadow-slate-400/30 border border-slate-300 flex flex-col overflow-hidden" style={{ minHeight: 600 }}>

              {/* Status bar */}
              <div className="flex items-center justify-between px-6 pt-3 pb-1 bg-white shrink-0">
                <span className="text-[12px] font-semibold text-slate-900">
                  {new Date().toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" })}
                </span>
                <div className="flex items-center gap-1 text-slate-900">
                  <span className="text-[10px]">▮▮▮</span>
                  <span className="text-[10px]">WiFi</span>
                  <span className="text-[10px]">🔋</span>
                </div>
              </div>

              {/* Header */}
              <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-100 shrink-0">
                <button className="text-blue-500 text-sm font-medium"><span>‹</span></button>
                <div className="flex flex-col items-center flex-1">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-400 to-violet-600 flex items-center justify-center text-white text-sm font-bold shadow-sm">
                    {setup.agentName[0]}
                  </div>
                  <span className="text-[12px] font-semibold text-slate-900 mt-0.5">{setup.agentName}</span>
                  <span className="text-[10px] text-slate-400">{setup.companyName}</span>
                </div>
                <div className="w-8" />
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2 bg-[#F2F2F7]" style={{ minHeight: 400 }}>
                {messages.map((msg, i) => {
                  const isAgent = msg.role === "agent";
                  const prevSame = i > 0 && messages[i - 1].role === msg.role;
                  const isEditing = editingId === msg.id;

                  return (
                    <div key={msg.id}>
                      {!prevSame && (
                        <div className={`text-[10px] text-slate-400 mb-1 ${isAgent ? "text-left pl-1" : "text-right pr-1"}`}>
                          {msg.time}
                        </div>
                      )}
                      <div className={`flex ${isAgent ? "justify-start" : "justify-end"}`}>
                        {isAgent ? (
                          <button
                            onClick={() => isEditing ? setEditingId(null) : startEdit(msg)}
                            title="Klicken zum Bearbeiten"
                            className="group relative text-left max-w-[75%]">
                            <div className={`px-3.5 py-2.5 rounded-2xl rounded-bl-sm text-sm leading-relaxed shadow-sm transition-all ${
                              isEditing ? "bg-violet-50 border-2 border-violet-400 text-slate-800" : "bg-white text-slate-800 hover:bg-violet-50 hover:border hover:border-violet-200"
                            }`}>
                              {msg.text}
                            </div>
                            <p className="text-[9px] text-violet-400 mt-0.5 pl-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              ✎ zum Bearbeiten klicken
                            </p>
                          </button>
                        ) : (
                          <div className="max-w-[75%] px-3.5 py-2.5 rounded-2xl rounded-br-sm bg-[#007AFF] text-white text-sm leading-relaxed">
                            {msg.text}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {agentTyping && (
                  <div className="flex justify-start">
                    <div className="bg-white rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
                      <div className="flex gap-1 items-center">
                        <div className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                        <div className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                        <div className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              {/* Input bar */}
              <div className="flex items-center gap-2 px-3 py-3 bg-white border-t border-slate-100 shrink-0">
                <div className="flex-1 flex items-center bg-[#F2F2F7] rounded-full px-4 py-2.5">
                  <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
                    disabled={agentTyping}
                    placeholder={agentTyping ? "Agent schreibt…" : "Antworten als Lead…"}
                    className="flex-1 bg-transparent text-sm text-slate-800 placeholder-slate-400 focus:outline-none disabled:opacity-50" />
                </div>
                <button onClick={sendMessage} disabled={!input.trim() || agentTyping}
                  className="w-9 h-9 rounded-full bg-[#007AFF] flex items-center justify-center text-white disabled:opacity-30 transition-opacity shrink-0">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Edit panel — shows below phone when editing */}
            {editingId && (
              <div className="w-[375px] bg-white rounded-2xl border border-violet-200 shadow-lg p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-800">Antwort bearbeiten</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Gespeichert → KI lernt diesen Stil für alle Gespräche</p>
                  </div>
                  <button onClick={() => setEditingId(null)} className="text-slate-300 hover:text-slate-600 text-lg leading-none">✕</button>
                </div>
                <textarea
                  value={editText}
                  onChange={e => setEditText(e.target.value)}
                  rows={4}
                  autoFocus
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:border-violet-400 resize-none"
                />
                <div className="flex gap-2">
                  <button onClick={() => setEditingId(null)}
                    className="flex-1 py-2 text-sm text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50">
                    Abbrechen
                  </button>
                  <button onClick={saveEdit} disabled={!editText.trim()}
                    className="flex-1 py-2 text-sm font-semibold text-white bg-violet-600 rounded-xl hover:bg-violet-500 disabled:opacity-40 transition-all">
                    Für alle Gespräche speichern →
                  </button>
                </div>
              </div>
            )}

            {/* Quick replies */}
            {!editingId && messages.length > 0 && !agentTyping && (
              <div className="flex flex-wrap gap-2 justify-center w-[375px]">
                {["Ja, interessiert", "Was kostet das?", "Kein Interesse", "Ruf mich an", "Zu teuer"].map(q => (
                  <button key={q} onClick={() => setInput(q)}
                    className="px-3 py-1.5 bg-white border border-slate-200 rounded-full text-xs text-slate-600 hover:border-violet-300 hover:text-violet-600 transition-colors shadow-sm">
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
