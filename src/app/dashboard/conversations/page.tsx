"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import type { Conversation, ConvMessage, IntentResult } from "@/lib/conversation-store";

// ── Shared helpers ─────────────────────────────────────────────────────────────

const CHANNEL_ICON: Record<string, string> = { email: "✉", sms: "▣", whatsapp: "◊" };

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "gerade eben";
  if (diff < 3600) return `vor ${Math.floor(diff / 60)} Min`;
  if (diff < 86400) return `vor ${Math.floor(diff / 3600)} Std`;
  return `vor ${Math.floor(diff / 86400)} Tagen`;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const isToday =
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear();
  return isToday ? "Heute" : d.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit" });
}

function displayContact(contact: string) {
  return contact.replace(/^\+41/, "0").replace(/(\d{3})(\d{3})(\d{2})(\d{2})/, "$1 $2 $3 $4");
}

// ── Verlauf (V1 store) types/constants ────────────────────────────────────────

const INTENT_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  hot:            { label: "HOT",            color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
  warm:           { label: "Interessiert",   color: "text-amber-700",   bg: "bg-amber-50 border-amber-200" },
  cold:           { label: "Kein Interesse", color: "text-red-600",     bg: "bg-red-50 border-red-200" },
  question:       { label: "Frage",          color: "text-blue-700",    bg: "bg-blue-50 border-blue-200" },
  timing:         { label: "Zu früh",        color: "text-violet-700",  bg: "bg-violet-50 border-violet-200" },
  wrong_person:   { label: "Falsch",         color: "text-slate-600",   bg: "bg-slate-100 border-slate-200" },
  already_solved: { label: "Gelöst",         color: "text-slate-600",   bg: "bg-slate-100 border-slate-200" },
  unclear:        { label: "Unklar",         color: "text-slate-500",   bg: "bg-slate-50 border-slate-200" },
};

const STATE_DOT: Record<string, string> = {
  active: "bg-amber-400", replied: "bg-blue-400",
  booked: "bg-emerald-500", closed: "bg-slate-300", human_needed: "bg-red-500",
};

const STATE_LABEL: Record<string, string> = {
  active: "Aktiv", replied: "Antwort erhalten",
  booked: "Termin gebucht", closed: "Geschlossen", human_needed: "Human needed",
};

const NODE_LABEL: Record<string, string> = {
  opener: "Opener", followup_1: "Follow-up 1", followup_2: "Follow-up 2",
  breakup: "Break-up", booking: "Booking", closed: "Abgeschlossen",
};

// ── Live SMS types ─────────────────────────────────────────────────────────────

interface ContactEntry {
  contact: string;
  lastMessage: string;
  lastAt: string;
  direction: string;
}

interface TwilioMessage {
  sid: string;
  direction: "inbound" | "outbound";
  body: string;
  dateSent: string;
  status: string;
}

// ── Tab: Live SMS ──────────────────────────────────────────────────────────────

function LiveSMSTab() {
  const [contacts, setContacts] = useState<ContactEntry[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<TwilioMessage[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchContacts = useCallback(async () => {
    const res = await fetch("/api/live-chat").catch(() => null);
    if (!res?.ok) return;
    const data = await res.json();
    setContacts(data.contacts || []);
    setLoadingContacts(false);
  }, []);

  const fetchMessages = useCallback(async (contact: string) => {
    setLoadingMessages(true);
    const res = await fetch(`/api/live-chat?contact=${encodeURIComponent(contact)}`).catch(() => null);
    if (!res?.ok) { setLoadingMessages(false); return; }
    const data = await res.json();
    setMessages(data.messages || []);
    setLoadingMessages(false);
  }, []);

  useEffect(() => {
    fetchContacts();
    const t = setInterval(fetchContacts, 5000);
    return () => clearInterval(t);
  }, [fetchContacts]);

  useEffect(() => {
    if (!selected) return;
    fetchMessages(selected);
    const t = setInterval(() => fetchMessages(selected), 3000);
    return () => clearInterval(t);
  }, [selected, fetchMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Contact list */}
      <div className="w-72 border-r border-slate-200 flex flex-col bg-white shrink-0">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Kontakte</p>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="text-[10px] text-slate-400">Live · 5s</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loadingContacts ? (
            <div className="flex justify-center py-8">
              <div className="flex gap-1">
                {["bg-violet-400","bg-cyan-400","bg-emerald-400"].map((c,i) => (
                  <span key={i} className={`w-2 h-2 rounded-full ${c} animate-bounce`} style={{ animationDelay: `${i*0.15}s` }} />
                ))}
              </div>
            </div>
          ) : contacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-center px-4">
              <span className="text-slate-300 text-2xl mb-2">◊</span>
              <p className="text-xs text-slate-400">Noch keine SMS-Konversationen</p>
            </div>
          ) : contacts.map(c => (
            <button key={c.contact} onClick={() => setSelected(c.contact)}
              className={`w-full px-4 py-3.5 border-b border-slate-100 text-left hover:bg-slate-50 transition-colors ${
                selected === c.contact ? "bg-violet-50 border-l-2 border-l-violet-500" : ""
              }`}>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-violet-100 flex items-center justify-center text-violet-700 font-bold text-xs shrink-0">
                  {c.contact.slice(-2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-sm font-semibold text-slate-800">{displayContact(c.contact)}</span>
                    <span className="text-[10px] text-slate-400 shrink-0 ml-1">{formatDate(c.lastAt)}</span>
                  </div>
                  <div className="flex items-center gap-1 mb-0.5">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${
                      c.direction === "inbound"
                        ? "bg-blue-50 text-blue-600 border border-blue-200"
                        : "bg-slate-100 text-slate-500 border border-slate-200"
                    }`}>
                      {c.direction === "inbound" ? "← Eingehend" : "→ Ausgehend"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 truncate">{c.lastMessage}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Message thread */}
      {selected ? (
        <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
          <div className="px-6 py-3 bg-white border-b border-slate-200 flex items-center justify-between shrink-0">
            <div>
              <p className="font-bold text-slate-900">{displayContact(selected)}</p>
              <p className="text-xs text-slate-400">Twilio SMS · {selected}</p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>Aktualisiert alle 3s</span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
            {loadingMessages ? (
              <div className="flex justify-center py-8">
                <div className="flex gap-1">
                  {["bg-violet-400","bg-cyan-400","bg-emerald-400"].map((c,i) => (
                    <span key={i} className={`w-2 h-2 rounded-full ${c} animate-bounce`} style={{ animationDelay: `${i*0.15}s` }} />
                  ))}
                </div>
              </div>
            ) : messages.map(msg => (
              <div key={msg.sid} className={`flex ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                {msg.direction === "inbound" && (
                  <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 font-bold text-xs mr-2 shrink-0 mt-0.5">
                    {selected.slice(-1)}
                  </div>
                )}
                <div className={`max-w-[70%] ${msg.direction === "outbound" ? "items-end" : "items-start"} flex flex-col`}>
                  <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                    msg.direction === "outbound"
                      ? "bg-violet-600 text-white rounded-br-sm"
                      : "bg-white border border-slate-200 text-slate-800 shadow-sm rounded-bl-sm"
                  }`}>
                    {msg.body}
                  </div>
                  <div className={`flex items-center gap-1.5 mt-1 ${msg.direction === "outbound" ? "flex-row-reverse" : ""}`}>
                    <span className="text-[10px] text-slate-400">{formatTime(msg.dateSent)}</span>
                    {msg.direction === "outbound" && (
                      <span className={`text-[10px] font-semibold ${msg.status === "delivered" ? "text-emerald-500" : "text-slate-400"}`}>
                        {msg.status === "delivered" ? "✓✓" : msg.status === "sent" ? "✓" : msg.status}
                      </span>
                    )}
                  </div>
                </div>
                {msg.direction === "outbound" && (
                  <div className="w-7 h-7 rounded-full bg-violet-600 flex items-center justify-center text-white font-bold text-xs ml-2 shrink-0 mt-0.5">
                    R
                  </div>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
          <div className="w-16 h-16 rounded-2xl bg-violet-50 border border-violet-100 flex items-center justify-center mb-4">
            <span className="text-2xl text-violet-300">◊</span>
          </div>
          <h3 className="font-semibold text-slate-800 mb-1">Kontakt auswählen</h3>
          <p className="text-sm text-slate-400 max-w-xs">Wählen Sie einen Kontakt aus der Liste um den SMS-Verlauf zu sehen.</p>
        </div>
      )}
    </div>
  );
}

// ── Tab: Verlauf (V1 store) ────────────────────────────────────────────────────

function VerlaufTab() {
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [replyDraft, setReplyDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/conversations");
        if (!res.ok) return;
        const data: Conversation[] = await res.json();
        if (cancelled) return;
        setConvs(data);
        setLoading(false);
        if (selected) {
          const updated = data.find(c => c.id === selected.id);
          if (updated) setSelected(updated);
        }
      } catch {}
    };
    load();
    const t = setInterval(load, 4000);
    return () => { cancelled = true; clearInterval(t); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selected?.messages.length]);

  const filtered = convs.filter(c => filter === "all" || c.state === filter);

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
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: replyDraft }),
      });
      setReplyDraft("");
    } finally { setSending(false); }
  };

  const classifyLast = async () => {
    if (!selected) return;
    const lastLead = [...selected.messages].reverse().find(m => m.role === "lead");
    if (!lastLead) return;
    setClassifying(true);
    try {
      const res = await fetch(`/api/conversations/${selected.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "classify", leadMessage: lastLead.body }),
      });
      const result = await res.json();
      setSelected(prev => prev ? { ...prev, lastIntent: result } : prev);
    } finally { setClassifying(false); }
  };

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Conversation list */}
      <div className="w-80 border-r border-slate-200 flex flex-col shrink-0 bg-white">
        <div className="px-5 pt-4 pb-3 border-b border-slate-100">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Gespräche</p>
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${loading ? "bg-slate-300" : "bg-emerald-400"}`} />
              <span className="text-[10px] text-slate-400">{loading ? "Laden…" : "Live · 4s"}</span>
            </div>
          </div>
          <div className="flex gap-1 flex-wrap">
            {[
              { key: "all", label: "Alle" }, { key: "replied", label: "Neu" },
              { key: "active", label: "Aktiv" }, { key: "booked", label: "Gebucht" },
              { key: "human_needed", label: "Eskaliert" },
            ].map(f => (
              <button key={f.key} onClick={() => setFilter(f.key)}
                className={`px-2 py-1 rounded-lg text-[11px] font-semibold border transition-all ${
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
                    {last && <p className="text-xs text-slate-500 truncate">{last.role === "agent" ? "↗ " : "← "}{last.body}</p>}
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

      {/* Detail panel */}
      {selected ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
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
              <button onClick={classifyLast}
                disabled={classifying || !selected.messages.some(m => m.role === "lead")}
                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium transition-colors disabled:opacity-40">
                {classifying ? "Analysiere…" : "◎ Intent analysieren"}
              </button>
            </div>
          </div>

          {selected.lastIntent && (
            <div className="mx-6 mt-4 rounded-xl border overflow-hidden shrink-0">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-700">Intent-Analyse</span>
                  {(() => {
                    const m = INTENT_LABEL[selected.lastIntent!.intent];
                    return m ? <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${m.bg} ${m.color}`}>{m.label}</span> : null;
                  })()}
                  <span className="text-[10px] text-slate-400">Konfidenz: {selected.lastIntent.confidence}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-medium ${
                    selected.lastIntent.sentiment === "positive" ? "text-emerald-600" :
                    selected.lastIntent.sentiment === "negative" ? "text-red-500" : "text-slate-500"
                  }`}>
                    {selected.lastIntent.sentiment === "positive" ? "↑ Positiv" :
                     selected.lastIntent.sentiment === "negative" ? "↓ Negativ" : "→ Neutral"}
                  </span>
                  <span className="text-[10px] text-slate-400">{selected.lastIntent.nextAction}</span>
                </div>
              </div>
              <div className="px-4 py-3 bg-white">
                <p className="text-[10px] text-slate-500 mb-2">{selected.lastIntent.reasoning}</p>
                <div className="p-3 rounded-lg bg-violet-50 border border-violet-100">
                  <p className="text-[10px] font-semibold text-violet-500 mb-1">Vorgeschlagene Antwort</p>
                  <p className="text-xs text-violet-800 leading-relaxed">{selected.lastIntent.suggestedResponse}</p>
                  <button onClick={() => setReplyDraft(selected.lastIntent!.suggestedResponse)}
                    className="mt-2 text-[10px] text-violet-600 hover:text-violet-700 font-semibold">
                    In Antwortfeld übernehmen →
                  </button>
                </div>
              </div>
            </div>
          )}

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

          <div className="px-6 py-4 border-t border-slate-200 bg-white shrink-0">
            <div className="flex gap-3">
              <textarea
                value={replyDraft}
                onChange={e => setReplyDraft(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendReply(); }}
                placeholder={`Manuell antworten via ${selected.channel}… (Cmd+Enter)`}
                rows={2}
                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-violet-400 transition-colors resize-none"
              />
              <button onClick={sendReply} disabled={sending || !replyDraft.trim()}
                className="px-5 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-sm font-semibold transition-all shrink-0">
                {sending ? "…" : "Senden"}
              </button>
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5">
              {CHANNEL_ICON[selected.channel]} Direkt via {selected.channel} · Cmd+Enter
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center mb-4">
            <span className="text-2xl text-indigo-300">◎</span>
          </div>
          <h3 className="font-semibold text-slate-800 mb-2">Gespräch auswählen</h3>
          <p className="text-slate-400 text-sm max-w-xs leading-relaxed">
            {convs.length === 0
              ? "Noch keine Gespräche. Leads erscheinen hier sobald sie auf Outreach antworten."
              : "Wählen Sie ein Gespräch aus der Liste."}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function ConversationsPage() {
  const [tab, setTab] = useState<"live" | "verlauf">("live");

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 56px)" }}>
      {/* Tab bar */}
      <div className="bg-white border-b border-slate-200 px-6 flex items-center gap-1 shrink-0 pt-3">
        {[
          { key: "live",    label: "Live SMS",  desc: "Eingehende & ausgehende Twilio-Nachrichten" },
          { key: "verlauf", label: "Verlauf",   desc: "Konversationsstatus, Intent & manuelle Antworten" },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as "live" | "verlauf")}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all -mb-px ${
              tab === t.key
                ? "border-violet-500 text-violet-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}>
            {t.label}
            <span className="ml-1.5 text-[10px] font-normal text-slate-400 hidden sm:inline">{t.desc}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "live" ? <LiveSMSTab /> : <VerlaufTab />}
    </div>
  );
}
