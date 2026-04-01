"use client";
import { useState, useEffect, useRef } from "react";
import type { Conversation, ConvMessage, IntentResult } from "@/lib/conversation-store";

// ── Helpers ───────────────────────────────────────────────────────────────────

const CHANNEL_ICON: Record<string, string> = {
  email: "✉", sms: "▣", whatsapp: "◊",
};

const INTENT_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  hot:           { label: "HOT",            color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
  warm:          { label: "Interessiert",   color: "text-amber-700",   bg: "bg-amber-50 border-amber-200" },
  cold:          { label: "Kein Interesse", color: "text-red-600",     bg: "bg-red-50 border-red-200" },
  question:      { label: "Frage",          color: "text-blue-700",    bg: "bg-blue-50 border-blue-200" },
  timing:        { label: "Zu früh",        color: "text-violet-700",  bg: "bg-violet-50 border-violet-200" },
  wrong_person:  { label: "Falsch",         color: "text-slate-600",   bg: "bg-slate-100 border-slate-200" },
  already_solved:{ label: "Gelöst",         color: "text-slate-600",   bg: "bg-slate-100 border-slate-200" },
  unclear:       { label: "Unklar",         color: "text-slate-500",   bg: "bg-slate-50 border-slate-200" },
};

const STATE_DOT: Record<string, string> = {
  active:       "bg-amber-400",
  replied:      "bg-blue-400",
  booked:       "bg-emerald-500",
  closed:       "bg-slate-300",
  human_needed: "bg-red-500",
};

const STATE_LABEL: Record<string, string> = {
  active:       "Aktiv",
  replied:      "Antwort erhalten",
  booked:       "Termin gebucht",
  closed:       "Geschlossen",
  human_needed: "Human needed",
};

const NODE_LABEL: Record<string, string> = {
  opener:     "Opener",
  followup_1: "Follow-up 1",
  followup_2: "Follow-up 2",
  breakup:    "Break-up",
  booking:    "Booking",
  closed:     "Abgeschlossen",
};

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "gerade eben";
  if (diff < 3600) return `vor ${Math.floor(diff / 60)} Min`;
  if (diff < 86400) return `vor ${Math.floor(diff / 3600)} Std`;
  return `vor ${Math.floor(diff / 86400)} Tagen`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ConversationsPage() {
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [replyDraft, setReplyDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<string>("all");
  const [filter, setFilterState] = useState<string>("all");

  const setFilter = (f: string) => {
    filterRef.current = f;
    setFilterState(f);
  };

  // Poll every 4 seconds
  useEffect(() => {
    let cancelled = false;

    const fetch_ = async () => {
      try {
        const res = await fetch("/api/conversations");
        if (!res.ok) return;
        const data: Conversation[] = await res.json();
        if (!cancelled) {
          setConvs(data);
          setLoading(false);
          // Update selected if it's in the list
          if (selected) {
            const updated = data.find(c => c.id === selected.id);
            if (updated) setSelected(updated);
          }
        }
      } catch {}
    };

    fetch_();
    const interval = setInterval(fetch_, 4000);
    return () => { cancelled = true; clearInterval(interval); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selected?.messages.length]);

  const filtered = convs.filter(c => {
    if (filter === "all") return true;
    return c.state === filter;
  });

  const counts = {
    all:          convs.length,
    active:       convs.filter(c => c.state === "active").length,
    replied:      convs.filter(c => c.state === "replied").length,
    booked:       convs.filter(c => c.state === "booked").length,
    human_needed: convs.filter(c => c.state === "human_needed").length,
  };

  const sendReply = async () => {
    if (!selected || !replyDraft.trim()) return;
    setSending(true);
    try {
      await fetch(`/api/conversations/${selected.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: replyDraft }),
      });
      setReplyDraft("");
    } finally {
      setSending(false);
    }
  };

  const classifyLast = async () => {
    if (!selected) return;
    const lastLead = [...selected.messages].reverse().find(m => m.role === "lead");
    if (!lastLead) return;
    setClassifying(true);
    try {
      const res = await fetch(`/api/conversations/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "classify", leadMessage: lastLead.body }),
      });
      const result = await res.json();
      setSelected(prev => prev ? { ...prev, lastIntent: result } : prev);
    } finally {
      setClassifying(false);
    }
  };

  return (
    <div className="flex" style={{ height: "calc(100vh - 56px)" }}>

      {/* ── Left Panel: Conversation List ── */}
      <div className="w-80 border-r border-slate-200 flex flex-col shrink-0 bg-white">
        {/* Header */}
        <div className="px-5 pt-6 pb-4 border-b border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-base font-bold text-slate-900">Gespräche</h1>
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${loading ? "bg-slate-300" : "bg-emerald-400"}`} />
              <span className="text-[10px] text-slate-400">{loading ? "Laden…" : "Live"}</span>
            </div>
          </div>
          {/* Filter tabs */}
          <div className="flex gap-1 flex-wrap">
            {[
              { key: "all",          label: "Alle" },
              { key: "replied",      label: "Neu" },
              { key: "active",       label: "Aktiv" },
              { key: "booked",       label: "Gebucht" },
              { key: "human_needed", label: "Eskaliert" },
            ].map(f => (
              <button key={f.key} onClick={() => setFilter(f.key)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all ${
                  filter === f.key
                    ? "bg-violet-600 text-white border-violet-600"
                    : "bg-slate-50 text-slate-500 border-slate-200 hover:border-violet-200"
                }`}>
                {f.label}
                {counts[f.key as keyof typeof counts] > 0 && (
                  <span className={`ml-1 ${filter === f.key ? "text-violet-200" : "text-slate-400"}`}>
                    {counts[f.key as keyof typeof counts]}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center h-48 text-center px-6">
              <span className="text-3xl text-slate-200 mb-3">◎</span>
              <p className="text-xs text-slate-400">Keine Gespräche in dieser Kategorie.</p>
            </div>
          )}
          {filtered.map(conv => {
            const last = conv.messages[conv.messages.length - 1];
            const isSelected = selected?.id === conv.id;
            const intentMeta = conv.lastIntent ? INTENT_LABEL[conv.lastIntent.intent] : null;

            return (
              <button key={conv.id} onClick={() => setSelected(conv)}
                className={`w-full px-5 py-4 border-b border-slate-100 text-left transition-all hover:bg-slate-50 ${
                  isSelected ? "bg-violet-50 border-l-2 border-l-violet-500" : ""
                }`}>
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold
                    ${conv.state === "booked" ? "bg-emerald-100 text-emerald-700" :
                      conv.state === "human_needed" ? "bg-red-100 text-red-600" :
                      "bg-violet-100 text-violet-700"}`}>
                    {conv.leadName.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-sm font-semibold text-slate-800 truncate">{conv.leadName}</span>
                      <span className="text-[10px] text-slate-400 shrink-0 ml-1">{timeAgo(conv.lastActivity)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-xs text-slate-400">{CHANNEL_ICON[conv.channel]}</span>
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATE_DOT[conv.state]}`} />
                      <span className="text-[10px] text-slate-400">{STATE_LABEL[conv.state]}</span>
                    </div>
                    {last && (
                      <p className="text-xs text-slate-500 truncate">
                        {last.role === "agent" ? "↗ " : "← "}
                        {last.body}
                      </p>
                    )}
                    {intentMeta && (
                      <span className={`inline-block mt-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full border ${intentMeta.bg} ${intentMeta.color}`}>
                        {intentMeta.label} {conv.lastIntent?.confidence}%
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Right Panel: Conversation Detail ── */}
      {selected ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Conversation Header */}
          <div className="px-6 py-4 border-b border-slate-200 bg-white flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center font-bold text-violet-700">
                {selected.leadName.slice(0, 1).toUpperCase()}
              </div>
              <div>
                <p className="font-bold text-slate-900">{selected.leadName}</p>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span>{CHANNEL_ICON[selected.channel]} {selected.channel}</span>
                  <span>·</span>
                  <span>{selected.leadContact}</span>
                  <span>·</span>
                  <span className={`font-medium ${selected.state === "booked" ? "text-emerald-600" : selected.state === "human_needed" ? "text-red-500" : "text-slate-500"}`}>
                    {STATE_LABEL[selected.state]}
                  </span>
                  <span>·</span>
                  <span className="text-violet-500">{NODE_LABEL[selected.flowNode]}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {selected.state === "human_needed" && (
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs font-bold">
                  ⚠ Human Handoff
                </span>
              )}
              <button
                onClick={classifyLast}
                disabled={classifying || !selected.messages.some(m => m.role === "lead")}
                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium transition-colors disabled:opacity-40">
                {classifying ? "Analysiere…" : "◎ Intent analysieren"}
              </button>
            </div>
          </div>

          {/* Intent Panel (if result exists) */}
          {selected.lastIntent && (
            <div className="mx-6 mt-4 rounded-xl border overflow-hidden shrink-0">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-700">Intent-Analyse</span>
                  {(() => {
                    const m = INTENT_LABEL[selected.lastIntent!.intent];
                    return m ? (
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${m.bg} ${m.color}`}>
                        {m.label}
                      </span>
                    ) : null;
                  })()}
                  <span className="text-[10px] text-slate-400">Konfidenz: {selected.lastIntent.confidence}%</span>
                  <span className={`text-[10px] font-medium ${
                    selected.lastIntent.sentiment === "positive" ? "text-emerald-600" :
                    selected.lastIntent.sentiment === "negative" ? "text-red-500" : "text-slate-500"
                  }`}>
                    {selected.lastIntent.sentiment === "positive" ? "↑ Positiv" :
                     selected.lastIntent.sentiment === "negative" ? "↓ Negativ" : "→ Neutral"}
                  </span>
                </div>
                <span className="text-[10px] text-slate-400">{selected.lastIntent.nextAction}</span>
              </div>
              <div className="px-4 py-3 bg-white">
                <p className="text-[10px] text-slate-500 mb-2">{selected.lastIntent.reasoning}</p>
                <div className="p-3 rounded-lg bg-violet-50 border border-violet-100">
                  <p className="text-[10px] font-semibold text-violet-500 mb-1">Vorgeschlagene Antwort</p>
                  <p className="text-xs text-violet-800 leading-relaxed">{selected.lastIntent.suggestedResponse}</p>
                  <button
                    onClick={() => setReplyDraft(selected.lastIntent!.suggestedResponse)}
                    className="mt-2 text-[10px] text-violet-600 hover:text-violet-700 font-semibold">
                    In Antwortfeld übernehmen →
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
            {selected.messages.map((msg: ConvMessage) => (
              <div key={msg.id} className={`flex ${msg.role === "agent" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[70%] rounded-2xl px-4 py-3 ${
                  msg.role === "agent"
                    ? "bg-violet-600 text-white rounded-br-sm"
                    : "bg-white border border-slate-200 text-slate-800 rounded-bl-sm shadow-sm"
                }`}>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.body}</p>
                  <p className={`text-[10px] mt-1 ${msg.role === "agent" ? "text-violet-200" : "text-slate-400"}`}>
                    {msg.role === "agent" ? "Agent" : selected.leadName} · {timeAgo(msg.timestamp)}
                  </p>
                </div>
              </div>
            ))}
            {selected.messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-32 text-center">
                <p className="text-sm text-slate-400">Noch keine Nachrichten.</p>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Reply Input */}
          <div className="px-6 py-4 border-t border-slate-200 bg-white">
            <div className="flex gap-3">
              <textarea
                value={replyDraft}
                onChange={e => setReplyDraft(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendReply(); }}
                placeholder={`Manuell antworten via ${selected.channel}… (Cmd+Enter zum Senden)`}
                rows={2}
                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-violet-400 transition-colors resize-none"
              />
              <button
                onClick={sendReply}
                disabled={sending || !replyDraft.trim()}
                className="px-5 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-sm font-semibold transition-all shrink-0">
                {sending ? "…" : "Senden"}
              </button>
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5">
              {CHANNEL_ICON[selected.channel]} Wird direkt via {selected.channel} gesendet · Cmd+Enter
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
          <div className="w-20 h-20 rounded-3xl bg-indigo-50 border border-indigo-100 flex items-center justify-center mb-6">
            <span className="text-4xl text-indigo-300">◎</span>
          </div>
          <h3 className="text-lg font-semibold text-slate-800 mb-2">Gespräch auswählen</h3>
          <p className="text-slate-400 text-sm max-w-xs leading-relaxed">
            {convs.length === 0
              ? "Noch keine Gespräche. Leads werden hier erscheinen sobald sie auf Outreach antworten."
              : "Wählen Sie ein Gespräch aus der Liste um fortzufahren."}
          </p>
          {convs.length === 0 && (
            <div className="mt-6 p-4 rounded-xl bg-slate-50 border border-slate-200 max-w-sm text-left">
              <p className="text-xs font-semibold text-slate-600 mb-2">Setup Checklist</p>
              <div className="space-y-1.5">
                {[
                  "Twilio Webhook: /api/webhooks/twilio",
                  "Mailgun Webhook: /api/webhooks/mailgun",
                  "ANTHROPIC_API_KEY in .env.local",
                  "TWILIO_* Variablen in .env.local",
                ].map(item => (
                  <div key={item} className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded bg-slate-200 flex items-center justify-center text-[9px] text-slate-500">→</span>
                    <span className="text-[11px] text-slate-500 font-mono">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
