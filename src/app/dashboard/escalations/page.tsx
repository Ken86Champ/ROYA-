"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────────────────────────

interface HandoffMessage {
  role: string;
  content: string;
  channel?: string;
  createdAt?: string;
}

interface Handoff {
  id: string;
  conversationId: string;
  leadName: string;
  leadContact: string;
  channel: string;
  priority: string;
  reason: string;
  status: string;
  assignedTo: string | null;
  claimedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  incomingMessage: string;
  suggestedReply: string;
  interpretation: Record<string, unknown> | null;
  conversationState: string | null;
  messageCount: number;
  lastMessages: HandoffMessage[];
  waitingMinutes: number;
}

interface QueueStats {
  total: number;
  open: number;
  inProgress: number;
  urgent: number;
  high: number;
  avgWaitMinutes: number;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const PRIORITY_BADGE: Record<string, { bg: string; text: string; icon: string }> = {
  urgent: { bg: "bg-red-100", text: "text-red-700", icon: "🚨" },
  high:   { bg: "bg-orange-100", text: "text-orange-700", icon: "⚠️" },
  normal: { bg: "bg-blue-50", text: "text-blue-600", icon: "📋" },
  low:    { bg: "bg-slate-50", text: "text-slate-500", icon: "○" },
};

const STATUS_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  open:        { bg: "bg-amber-50", text: "text-amber-700", label: "Offen" },
  in_progress: { bg: "bg-blue-50", text: "text-blue-700", label: "In Bearbeitung" },
  resolved:    { bg: "bg-emerald-50", text: "text-emerald-700", label: "Erledigt" },
};

const CHANNEL_ICON: Record<string, string> = { email: "✉", sms: "▣", whatsapp: "◊" };

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "gerade";
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function formatWait(minutes: number) {
  if (minutes < 60) return `${minutes}min`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ${minutes % 60}min`;
  return `${Math.floor(minutes / 1440)}d`;
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function EscalationsPage() {
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [selected, setSelected] = useState<Handoff | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState<"all" | "open" | "in_progress">("all");
  const [showResolved, setShowResolved] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadQueue = async () => {
    const statuses = showResolved ? "open,in_progress,resolved" : "open,in_progress";
    const res = await fetch(`/api/handoff-queue?status=${statuses}&limit=100`);
    if (res.ok) {
      const data = await res.json();
      setHandoffs(data.handoffs ?? []);
      setStats(data.stats ?? null);
    }
  };

  useEffect(() => {
    loadQueue();
    const t = setInterval(loadQueue, 5000);
    return () => clearInterval(t);
  }, [showResolved]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selected]);

  const doAction = async (action: string, handoffId: string, extra: Record<string, unknown> = {}) => {
    setSending(true);
    setActionFeedback(null);
    try {
      const res = await fetch("/api/handoff-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, handoffId, ...extra }),
      });
      const data = await res.json();
      if (res.ok) {
        setActionFeedback(`✓ ${action} erfolgreich`);
        await loadQueue();
        if (action === "resolve") setSelected(null);
      } else {
        setActionFeedback(`✗ ${data.error || "Fehler"}`);
      }
    } catch {
      setActionFeedback("✗ Netzwerk-Fehler");
    } finally {
      setSending(false);
      setTimeout(() => setActionFeedback(null), 3000);
    }
  };

  const handleReply = async () => {
    if (!selected || !replyText.trim()) return;
    await doAction("reply", selected.id, { message: replyText.trim() });
    setReplyText("");
    await loadQueue();
    // Refresh selected
    const updated = handoffs.find(h => h.id === selected.id);
    if (updated) setSelected(updated);
  };

  const filtered = handoffs.filter(h => {
    if (filter === "all") return true;
    return h.status === filter;
  });

  return (
    <div className="flex h-[calc(100vh-64px)] gap-0">
      {/* ── Left: Queue List ──────────────────────────────────────────── */}
      <div className="w-[380px] shrink-0 bg-white border-r border-slate-200 flex flex-col">
        {/* Stats bar */}
        {stats && (
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span className="text-slate-600">{stats.open} offen</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-400" />
                <span className="text-slate-600">{stats.inProgress} bearbeitet</span>
              </div>
              {stats.urgent > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-red-500">🚨</span>
                  <span className="text-red-600 font-semibold">{stats.urgent} dringend</span>
                </div>
              )}
              <span className="text-slate-400 ml-auto">⌀ {formatWait(stats.avgWaitMinutes)}</span>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="px-4 py-2 border-b border-slate-100 flex items-center gap-2">
          {(["all", "open", "in_progress"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                filter === f ? "bg-violet-100 text-violet-700" : "text-slate-500 hover:bg-slate-100"
              }`}>
              {f === "all" ? "Alle" : f === "open" ? "Offen" : "In Bearbeitung"}
            </button>
          ))}
          <label className="ml-auto flex items-center gap-1.5 text-[10px] text-slate-400 cursor-pointer">
            <input type="checkbox" checked={showResolved} onChange={e => setShowResolved(e.target.checked)}
              className="rounded border-slate-300 text-violet-600 focus:ring-violet-500 w-3 h-3" />
            Erledigt
          </label>
        </div>

        {/* Queue items */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center mb-3">
                <span className="text-emerald-400 text-xl">✓</span>
              </div>
              <p className="text-slate-500 text-sm font-medium">Keine Eskalationen</p>
              <p className="text-slate-400 text-xs mt-1">Alle Gespräche werden von der KI bearbeitet.</p>
            </div>
          ) : (
            filtered.map(h => {
              const pBadge = PRIORITY_BADGE[h.priority] || PRIORITY_BADGE.normal;
              const sBadge = STATUS_BADGE[h.status] || STATUS_BADGE.open;
              const isSelected = selected?.id === h.id;

              return (
                <button key={h.id} onClick={() => setSelected(h)}
                  className={`w-full text-left px-4 py-3 border-b border-slate-100 transition-colors ${
                    isSelected ? "bg-violet-50 border-l-2 border-l-violet-500" : "hover:bg-slate-50"
                  }`}>
                  <div className="flex items-start gap-3">
                    {/* Priority icon */}
                    <span className="text-sm mt-0.5">{pBadge.icon}</span>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-semibold text-slate-800 truncate">{h.leadName}</span>
                        <span className="text-xs text-slate-400">{CHANNEL_ICON[h.channel] || h.channel}</span>
                        <span className={`ml-auto px-1.5 py-0.5 rounded text-[10px] font-medium ${sBadge.bg} ${sBadge.text}`}>
                          {sBadge.label}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 truncate mb-1">{h.reason}</p>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400">
                        <span>{timeAgo(h.createdAt)}</span>
                        <span>·</span>
                        <span>{h.messageCount} Nachrichten</span>
                        {h.assignedTo && (
                          <>
                            <span>·</span>
                            <span className="text-blue-500">{h.assignedTo}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── Right: Detail Panel ───────────────────────────────────────── */}
      <div className="flex-1 flex flex-col bg-white">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center mx-auto mb-4">
                <span className="text-slate-300 text-2xl">←</span>
              </div>
              <p className="text-slate-500 font-medium">Eskalation auswählen</p>
              <p className="text-slate-400 text-xs mt-1">Wählen Sie links eine Eskalation aus, um Details zu sehen.</p>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-semibold text-slate-900">{selected.leadName}</h2>
                    <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${PRIORITY_BADGE[selected.priority]?.bg} ${PRIORITY_BADGE[selected.priority]?.text}`}>
                      {selected.priority}
                    </span>
                    <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${STATUS_BADGE[selected.status]?.bg} ${STATUS_BADGE[selected.status]?.text}`}>
                      {STATUS_BADGE[selected.status]?.label}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {selected.leadContact} · {CHANNEL_ICON[selected.channel]} {selected.channel} · Wartet seit {formatWait(selected.waitingMinutes)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {selected.status === "open" && (
                    <button onClick={() => doAction("claim", selected.id)} disabled={sending}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
                      Übernehmen
                    </button>
                  )}
                  {(selected.status === "open" || selected.status === "in_progress") && (
                    <button onClick={() => doAction("resolve", selected.id, { resumeCampaign: true })} disabled={sending}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                      Erledigt
                    </button>
                  )}
                  {selected.status === "resolved" && (
                    <button onClick={() => doAction("reopen", selected.id)} disabled={sending}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 transition-colors">
                      Wieder öffnen
                    </button>
                  )}
                </div>
              </div>
              {actionFeedback && (
                <p className={`text-xs mt-2 ${actionFeedback.startsWith("✓") ? "text-emerald-600" : "text-red-500"}`}>
                  {actionFeedback}
                </p>
              )}
            </div>

            {/* Reason + Context */}
            <div className="px-6 py-3 border-b border-slate-100 bg-amber-50/50">
              <p className="text-xs font-semibold text-amber-700 mb-1">Grund der Eskalation</p>
              <p className="text-sm text-slate-700">{selected.reason}</p>
              {selected.interpretation && (
                <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-500">
                  <span>Intent: <b>{String((selected.interpretation as Record<string, unknown>).microIntent || '—')}</b></span>
                  <span>Ton: <b>{String((selected.interpretation as Record<string, unknown>).emotionalTone || '—')}</b></span>
                  <span>State: <b>{selected.conversationState || '—'}</b></span>
                </div>
              )}
            </div>

            {/* Conversation */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {selected.lastMessages.length === 0 ? (
                <p className="text-slate-400 text-xs text-center py-8">Keine Nachrichten geladen</p>
              ) : (
                selected.lastMessages.map((msg, i) => {
                  const isAgent = msg.role === "agent";
                  return (
                    <div key={i} className={`flex ${isAgent ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm ${
                        isAgent
                          ? "bg-violet-600 text-white rounded-br-md"
                          : "bg-slate-100 text-slate-800 rounded-bl-md"
                      }`}>
                        <p>{msg.content}</p>
                        {msg.createdAt && (
                          <p className={`text-[10px] mt-1 ${isAgent ? "text-violet-200" : "text-slate-400"}`}>
                            {timeAgo(msg.createdAt)}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })
              )}

              {/* Last incoming message if not in history */}
              {selected.incomingMessage && (
                <div className="flex justify-start">
                  <div className="max-w-[75%] px-4 py-2.5 rounded-2xl rounded-bl-md bg-red-50 border border-red-100 text-sm text-slate-800">
                    <p className="text-[10px] text-red-500 font-semibold mb-0.5">Auslösende Nachricht</p>
                    <p>{selected.incomingMessage}</p>
                  </div>
                </div>
              )}

              {/* Suggested reply */}
              {selected.suggestedReply && (
                <div className="flex justify-end">
                  <div className="max-w-[75%] px-4 py-2.5 rounded-2xl rounded-br-md bg-violet-50 border border-violet-100 text-sm text-slate-700">
                    <p className="text-[10px] text-violet-500 font-semibold mb-0.5">KI-Vorschlag</p>
                    <p className="italic">{selected.suggestedReply}</p>
                    <button onClick={() => setReplyText(selected.suggestedReply)}
                      className="text-[10px] text-violet-600 font-medium mt-1 hover:text-violet-800 transition-colors">
                      → Übernehmen
                    </button>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Reply input */}
            {selected.status !== "resolved" && (
              <div className="px-6 py-4 border-t border-slate-200 bg-white">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleReply()}
                    placeholder={`Antwort via ${selected.channel} an ${selected.leadName}…`}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                    disabled={sending}
                  />
                  <button onClick={handleReply} disabled={sending || !replyText.trim()}
                    className="px-5 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-50 transition-colors">
                    {sending ? "…" : "Senden"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
