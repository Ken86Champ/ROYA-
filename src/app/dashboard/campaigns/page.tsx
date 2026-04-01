"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import type { Campaign } from "@/lib/campaign-store";
import type { VariationStats } from "@/lib/ab-store";

const STATUS_STYLE: Record<string, { dot: string; label: string; badge: string }> = {
  draft:     { dot: "bg-slate-300",    label: "Entwurf",      badge: "bg-slate-100 text-slate-600 border-slate-200" },
  active:    { dot: "bg-emerald-500",  label: "Aktiv",        badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  paused:    { dot: "bg-amber-400",    label: "Pausiert",     badge: "bg-amber-50 text-amber-700 border-amber-200" },
  completed: { dot: "bg-slate-300",    label: "Abgeschlossen",badge: "bg-slate-100 text-slate-500 border-slate-200" },
};

const CHANNEL_ICON: Record<string, string> = { email: "✉", sms: "▣", whatsapp: "◊" };

function MiniBar({ val, max, color }: { val: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((val / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] text-slate-500">{pct}%</span>
    </div>
  );
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<Record<string, { sent: number; skipped: number }>>({});
  const [abOpen, setAbOpen] = useState<string | null>(null);
  const [abStats, setAbStats] = useState<Record<string, VariationStats[]>>({});

  const load = () =>
    fetch("/api/campaigns").then(r => r.json()).then(data => {
      setCampaigns(data);
      setLoading(false);
    }).catch(() => setLoading(false));

  useEffect(() => {
    load();
    const t = setInterval(load, 6000);
    return () => clearInterval(t);
  }, []);

  const toggleAb = async (campId: string) => {
    if (abOpen === campId) { setAbOpen(null); return; }
    setAbOpen(campId);
    if (!abStats[campId]) {
      const res = await fetch(`/api/ab-stats?campaignId=${campId}`);
      const data = await res.json();
      setAbStats(prev => ({ ...prev, [campId]: data }));
    }
  };

  const sendNow = async (camp: Campaign) => {
    setSending(camp.id);
    try {
      const res = await fetch(`/api/campaigns/${camp.id}/send`, { method: "POST" });
      const data = await res.json();
      setSendResult(prev => ({ ...prev, [camp.id]: { sent: data.sent, skipped: data.skipped } }));
      await load();
    } finally {
      setSending(null);
    }
  };

  const toggleStatus = async (camp: Campaign) => {
    setActioning(camp.id);
    const action = camp.status === "active" ? "pause" : "start";
    await fetch(`/api/campaigns/${camp.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    await load();
    setActioning(null);
  };

  const totals = {
    active:    campaigns.filter(c => c.status === "active").length,
    paused:    campaigns.filter(c => c.status === "paused").length,
    completed: campaigns.filter(c => c.status === "completed").length,
  };

  return (
    <div className="p-8 max-w-[1200px] overflow-auto h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Kampagnen</h1>
          <p className="text-slate-400 text-sm mt-1">Autonome Reaktivierungskampagnen</p>
        </div>
        <Link href="/dashboard/campaigns/new" className="btn-primary flex items-center gap-2 text-sm px-4 py-2.5">
          <span>+</span><span>Neue Kampagne</span>
        </Link>
      </div>

      {/* Stats bar */}
      <div className="glass-card p-4 mb-8 flex items-center gap-6 flex-wrap">
        {[
          { count: totals.active,    label: "Aktiv",         dot: "bg-emerald-400" },
          { count: totals.paused,    label: "Pausiert",      dot: "bg-amber-400" },
          { count: totals.completed, label: "Abgeschlossen", dot: "bg-slate-300" },
        ].map((s, i) => (
          <div key={s.label} className="flex items-center gap-6">
            <div className="flex items-center gap-2.5">
              <span className={`w-2 h-2 rounded-full ${s.dot}`} />
              <span className="text-slate-900 font-semibold text-sm">{s.count}</span>
              <span className="text-slate-400 text-sm">{s.label}</span>
            </div>
            {i < 2 && <div className="w-px h-5 bg-slate-200" />}
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex gap-1.5">
            {["bg-violet-500","bg-cyan-500","bg-emerald-500"].map((c,i) => (
              <span key={i} className={`w-2.5 h-2.5 rounded-full ${c} animate-bounce`} style={{ animationDelay: `${i*0.15}s` }} />
            ))}
          </div>
        </div>
      ) : campaigns.length === 0 ? (
        <div className="glass-card p-16 flex flex-col items-center justify-center text-center">
          <div className="w-20 h-20 rounded-3xl bg-violet-50 border border-violet-100 flex items-center justify-center mb-6">
            <span className="text-4xl text-violet-300">◎</span>
          </div>
          <h3 className="text-xl font-semibold text-slate-800 mb-2">Noch keine Kampagnen</h3>
          <p className="text-slate-400 text-sm max-w-md mb-8 leading-relaxed">
            Erstellen Sie Ihre erste autonome Reaktivierungskampagne mit dem 4-Touchpoint-Flow.
          </p>
          <Link href="/dashboard/campaigns/new" className="btn-primary flex items-center gap-2">
            <span>+</span><span>Erste Kampagne erstellen</span>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {campaigns.map(camp => {
            const st = STATUS_STYLE[camp.status];
            return (
              <div key={camp.id} className="glass-card p-6">
                <div className="flex items-start justify-between gap-4 mb-5">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-violet-50 border border-violet-100 flex items-center justify-center shrink-0">
                      <span className="text-violet-600 text-lg">◎</span>
                    </div>
                    <div className="min-w-0">
                      <h2 className="font-semibold text-slate-900 truncate">{camp.name}</h2>
                      <div className="flex items-center gap-2 mt-0.5">
                        {camp.channels.map(ch => (
                          <span key={ch} className="text-xs text-slate-400">{CHANNEL_ICON[ch]} {ch}</span>
                        ))}
                        <span className="text-slate-300">·</span>
                        <span className="text-xs text-slate-400">
                          {new Date(camp.createdAt).toLocaleDateString("de-CH")}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${st.badge}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />{st.label}
                    </span>
                    {camp.status === "active" && (
                      <button
                        onClick={() => sendNow(camp)}
                        disabled={sending === camp.id}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-violet-600 hover:bg-violet-700 text-white transition-all disabled:opacity-40">
                        {sending === camp.id ? "…" : sendResult[camp.id]
                          ? `✓ ${sendResult[camp.id].sent} gesendet`
                          : "Jetzt senden →"}
                      </button>
                    )}
                    <button
                      onClick={() => toggleStatus(camp)}
                      disabled={actioning === camp.id || camp.status === "completed"}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all disabled:opacity-40 ${
                        camp.status === "active"
                          ? "bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100"
                          : camp.status === "draft"
                          ? "bg-emerald-600 text-white hover:bg-emerald-700"
                          : "bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                      }`}>
                      {actioning === camp.id ? "…" :
                       camp.status === "active" ? "Pausieren" :
                       camp.status === "draft"  ? "Starten"   : "Fortsetzen"}
                    </button>
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                  {[
                    { label: "Gesamt",     val: camp.stats.total,      color: "text-slate-700" },
                    { label: "Kontaktiert",val: camp.stats.contacted,   color: "text-violet-600" },
                    { label: "Geantwortet",val: camp.stats.replied,     color: "text-blue-600" },
                    { label: "Interessiert",val: camp.stats.interested, color: "text-amber-600" },
                    { label: "Termin",     val: camp.stats.booked,      color: "text-emerald-600" },
                  ].map(s => (
                    <div key={s.label} className="text-center">
                      <p className={`text-2xl font-bold ${s.color}`}>{s.val}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* Progress bars */}
                <div className="space-y-2 pt-3 border-t border-slate-100">
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>Reply-Rate</span>
                    <span className="font-semibold">{camp.stats.replyRate}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-blue-400 to-violet-500 rounded-full"
                      style={{ width: `${camp.stats.replyRate}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2">
                    <span>Booking-Rate</span>
                    <span className="font-semibold">{camp.stats.bookingRate}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-emerald-400 to-cyan-500 rounded-full"
                      style={{ width: `${camp.stats.bookingRate}%` }} />
                  </div>
                </div>

                {/* Flow preview */}
                <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mr-1">Flow:</span>
                  {camp.flow.map((step, i) => (
                    <div key={step.id} className="flex items-center gap-1">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                        step.type === "opener"    ? "bg-violet-50 border-violet-200 text-violet-600" :
                        step.type === "breakup"   ? "bg-red-50 border-red-200 text-red-500" :
                        step.type === "booking"   ? "bg-emerald-50 border-emerald-200 text-emerald-600" :
                        step.type === "condition" ? "bg-amber-50 border-amber-200 text-amber-600" :
                        step.type === "exit"      ? "bg-slate-100 border-slate-300 text-slate-500" :
                        "bg-blue-50 border-blue-200 text-blue-600"
                      }`}>
                        {step.type === "condition" ? "⊕ " : step.type === "exit" ? "◼ " : ""}{step.label}
                        {step.delayDays > 0 && step.type !== "condition" && step.type !== "exit" && (
                          <span className="text-slate-400 ml-1">+{step.delayDays}d</span>
                        )}
                        {step.type === "condition" && step.branches && (
                          <span className="text-amber-400 ml-1">{step.branches.length}×</span>
                        )}
                      </span>
                      {i < camp.flow.length - 1 && <span className="text-slate-300 text-xs">→</span>}
                    </div>
                  ))}
                  <button onClick={() => toggleAb(camp.id)}
                    className="ml-auto text-[10px] text-violet-500 hover:text-violet-700 font-semibold transition-colors">
                    {abOpen === camp.id ? "A/B ▲" : "A/B ▼"}
                  </button>
                </div>

                {/* A/B Results Panel */}
                {abOpen === camp.id && (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-3">A/B Testergebnisse</p>
                    {!abStats[camp.id] ? (
                      <p className="text-xs text-slate-400">Lade…</p>
                    ) : abStats[camp.id].length === 0 ? (
                      <p className="text-xs text-slate-400">Noch keine A/B-Daten — senden Sie zuerst Nachrichten.</p>
                    ) : (
                      <div className="space-y-2">
                        {abStats[camp.id].map(v => (
                          <div key={`${v.stepType}-${v.variationId}`}
                            className={`p-3 rounded-xl border text-xs ${v.isWinner ? "bg-emerald-50 border-emerald-200" : "bg-slate-50 border-slate-100"}`}>
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-semibold text-slate-500 uppercase">{v.stepType}</span>
                                <span className="text-slate-300">·</span>
                                <span className="text-slate-500">{v.variationId}</span>
                                {v.isWinner && <span className="text-[9px] bg-emerald-500 text-white px-1.5 py-0.5 rounded-full font-bold">WINNER</span>}
                              </div>
                              <span className={`font-bold ${v.isWinner ? "text-emerald-600" : "text-slate-700"}`}>
                                {v.replyRate}% Reply
                              </span>
                            </div>
                            <p className="text-slate-400 leading-relaxed line-clamp-2">{v.body}</p>
                            <div className="flex items-center gap-3 mt-1.5">
                              <span className="text-slate-400">{v.sent} gesendet</span>
                              <span className="text-slate-400">{v.replies} geantwortet</span>
                              <div className="flex-1 h-1 bg-slate-200 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${v.isWinner ? "bg-emerald-500" : "bg-violet-400"}`}
                                  style={{ width: `${v.replyRate}%` }} />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
