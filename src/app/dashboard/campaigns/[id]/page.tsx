"use client";
import { useState, useEffect, use } from "react";
import Link from "next/link";
import type { Campaign, CampaignContact } from "@/lib/campaign-types";

// ─── Styles ────────────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, { dot: string; label: string; badge: string }> = {
  draft:     { dot: "bg-slate-300",   label: "Entwurf",       badge: "bg-slate-100 text-slate-600 border-slate-200" },
  active:    { dot: "bg-emerald-500", label: "Aktiv",         badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  paused:    { dot: "bg-amber-400",   label: "Pausiert",      badge: "bg-amber-50 text-amber-700 border-amber-200" },
  completed: { dot: "bg-slate-300",   label: "Abgeschlossen", badge: "bg-slate-100 text-slate-500 border-slate-200" },
};

const CONTACT_STATUS: Record<string, { label: string; color: string }> = {
  pending:    { label: "Ausstehend",   color: "bg-slate-100 text-slate-600 border-slate-200" },
  sent:       { label: "Gesendet",     color: "bg-blue-50 text-blue-700 border-blue-200" },
  replied:    { label: "Geantwortet",  color: "bg-violet-50 text-violet-700 border-violet-200" },
  interested: { label: "Interessiert", color: "bg-amber-50 text-amber-700 border-amber-200" },
  booked:     { label: "Gebucht",      color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  opted_out:  { label: "Opt-Out",      color: "bg-red-50 text-red-600 border-red-200" },
  no_reply:   { label: "Keine Antwort",color: "bg-slate-100 text-slate-500 border-slate-200" },
};

const CHANNEL_ICON: Record<string, string> = { email: "✉", sms: "▣", whatsapp: "◊" };

function timeAgo(iso?: string) {
  if (!iso) return "—";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "gerade eben";
  if (diff < 3600) return `vor ${Math.floor(diff / 60)} Min`;
  if (diff < 86400) return `vor ${Math.floor(diff / 3600)} Std`;
  return `vor ${Math.floor(diff / 86400)} Tagen`;
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [insights, setInsights] = useState<string | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "status" | "lastContacted">("name");

  useEffect(() => {
    fetch(`/api/campaigns/${id}`)
      .then(r => r.json())
      .then(data => { setCampaign(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id]);

  const loadInsights = async () => {
    setInsightsLoading(true);
    try {
      const res = await fetch(`/api/campaigns/${id}/insights`);
      const data = await res.json();
      setInsights(data.insights || data.error || "Keine Insights verfügbar.");
    } catch {
      setInsights("Fehler beim Laden der Insights.");
    } finally {
      setInsightsLoading(false);
    }
  };

  const exportCSV = () => {
    if (!campaign) return;
    const headers = ["Name", "Kontakt", "Kanal", "Status", "Step", "Letzter Kontakt"];
    const rows = campaign.contacts.map(c => [
      c.name, c.contact, c.channel,
      CONTACT_STATUS[c.status]?.label || c.status,
      `Step ${c.currentStep}`,
      c.lastContactedAt ? new Date(c.lastContactedAt).toLocaleDateString("de-CH") : "—",
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kampagne-${campaign.name.replace(/\s+/g, "-")}-kontakte.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex gap-1.5">
          {["bg-violet-500", "bg-cyan-500", "bg-emerald-500"].map((c, i) => (
            <span key={i} className={`w-2.5 h-2.5 rounded-full ${c} animate-bounce`} style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="p-8 text-center">
        <p className="text-slate-500">Kampagne nicht gefunden.</p>
        <Link href="/dashboard/campaigns" className="text-violet-600 hover:underline text-sm mt-2 inline-block">← Zurück</Link>
      </div>
    );
  }

  const st = STATUS_STYLE[campaign.status] || STATUS_STYLE.draft;

  // Filter + sort contacts
  const filtered = campaign.contacts
    .filter(c => statusFilter === "all" || c.status === statusFilter)
    .filter(c => !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.contact.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === "status") return a.status.localeCompare(b.status);
      if (sortBy === "lastContacted") return (b.lastContactedAt || "").localeCompare(a.lastContactedAt || "");
      return a.name.localeCompare(b.name);
    });

  const statusCounts = campaign.contacts.reduce((acc, c) => {
    acc[c.status] = (acc[c.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="p-8 max-w-[1200px] overflow-auto h-full">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-400 mb-6">
        <Link href="/dashboard/campaigns" className="hover:text-violet-600 transition-colors">Kampagnen</Link>
        <span>›</span>
        <span className="text-slate-700 font-medium truncate max-w-[300px]">{campaign.name}</span>
      </div>

      {/* Header */}
      <div className="glass-card p-6 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-xl bg-violet-50 border border-violet-100 flex items-center justify-center">
                <span className="text-violet-600 text-xl">◎</span>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">{campaign.name}</h1>
                <div className="flex items-center gap-2 mt-0.5">
                  {campaign.channels.map(ch => (
                    <span key={ch} className="text-xs text-slate-400">{CHANNEL_ICON[ch]} {ch}</span>
                  ))}
                  <span className="text-slate-300">·</span>
                  <span className="text-xs text-slate-400">
                    Erstellt: {new Date(campaign.createdAt).toLocaleDateString("de-CH")}
                  </span>
                  {campaign.startedAt && (
                    <>
                      <span className="text-slate-300">·</span>
                      <span className="text-xs text-slate-400">
                        Gestartet: {new Date(campaign.startedAt).toLocaleDateString("de-CH")}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${st.badge}`}>
              <span className={`w-2 h-2 rounded-full ${st.dot}`} />{st.label}
            </span>
            <Link href={`/dashboard/campaigns/${id}/edit`}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all">
              ✎ Bearbeiten
            </Link>
            <Link href={`/dashboard/campaigns/${id}/simulate`}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 transition-all">
              ▷ Simulieren
            </Link>
          </div>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
        {[
          { label: "Gesamt",      val: campaign.stats.total,      icon: "◎", color: "text-slate-700",   bg: "bg-slate-50 border-slate-200" },
          { label: "Kontaktiert", val: campaign.stats.contacted,  icon: "→", color: "text-violet-600",  bg: "bg-violet-50 border-violet-200" },
          { label: "Geantwortet", val: campaign.stats.replied,    icon: "◬", color: "text-blue-600",    bg: "bg-blue-50 border-blue-200" },
          { label: "Interessiert",val: campaign.stats.interested, icon: "★", color: "text-amber-600",   bg: "bg-amber-50 border-amber-200" },
          { label: "Gebucht",     val: campaign.stats.booked,     icon: "◇", color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200" },
          { label: "Opt-Out",     val: campaign.stats.optedOut,   icon: "✕", color: "text-red-500",     bg: "bg-red-50 border-red-200" },
        ].map(s => (
          <div key={s.label} className={`rounded-2xl border p-4 text-center ${s.bg}`}>
            <span className={`text-lg ${s.color}`}>{s.icon}</span>
            <p className={`text-2xl font-bold ${s.color} mt-1`}>{s.val}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Rates */}
      <div className="glass-card p-5 mb-6">
        <div className="grid grid-cols-2 gap-6">
          <div>
            <div className="flex items-center justify-between text-sm text-slate-600 mb-2">
              <span>Reply-Rate</span>
              <span className="font-bold text-violet-600">{campaign.stats.replyRate}%</span>
            </div>
            <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-blue-400 to-violet-500 rounded-full transition-all"
                style={{ width: `${campaign.stats.replyRate}%` }} />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between text-sm text-slate-600 mb-2">
              <span>Booking-Rate</span>
              <span className="font-bold text-emerald-600">{campaign.stats.bookingRate}%</span>
            </div>
            <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-emerald-400 to-cyan-500 rounded-full transition-all"
                style={{ width: `${campaign.stats.bookingRate}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Flow Preview */}
      <div className="glass-card p-5 mb-6">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Flow</h3>
        <div className="flex items-center gap-2 flex-wrap">
          {campaign.flow.map((step, i) => (
            <div key={step.id} className="flex items-center gap-1">
              <span className={`px-3 py-1 rounded-full text-xs font-medium border ${
                step.type === "opener"    ? "bg-violet-50 border-violet-200 text-violet-600" :
                step.type === "breakup"   ? "bg-red-50 border-red-200 text-red-500" :
                step.type === "booking"   ? "bg-emerald-50 border-emerald-200 text-emerald-600" :
                step.type === "condition" ? "bg-amber-50 border-amber-200 text-amber-600" :
                step.type === "exit"      ? "bg-slate-100 border-slate-300 text-slate-500" :
                "bg-blue-50 border-blue-200 text-blue-600"
              }`}>
                {step.label}
                {step.delayDays > 0 && step.type !== "condition" && step.type !== "exit" && (
                  <span className="text-slate-400 ml-1">+{step.delayDays}d</span>
                )}
              </span>
              {i < campaign.flow.length - 1 && <span className="text-slate-300">→</span>}
            </div>
          ))}
        </div>
      </div>

      {/* AI Insights */}
      <div className="glass-card p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-700">AI Insights</h3>
          <button onClick={loadInsights} disabled={insightsLoading}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-violet-600 to-cyan-600 text-white hover:from-violet-700 hover:to-cyan-700 transition-all disabled:opacity-40">
            {insightsLoading ? "Analysiere…" : insights ? "↻ Neu analysieren" : "🤖 Insights generieren"}
          </button>
        </div>
        {insights && (
          <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
            {insights}
          </div>
        )}
      </div>

      {/* Contacts Table */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-700">
            Kontakte <span className="text-slate-400 font-normal">({filtered.length})</span>
          </h3>
          <div className="flex items-center gap-2">
            <button onClick={exportCSV}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all">
              ↓ CSV Export
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <input
            type="text"
            placeholder="Suche nach Name / Kontakt…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-sm text-slate-700 placeholder-slate-300 focus:outline-none focus:border-violet-400 w-56"
          />
          <div className="flex items-center gap-1">
            {[
              { key: "all", label: "Alle", count: campaign.contacts.length },
              ...Object.entries(statusCounts).map(([key, count]) => ({
                key, label: CONTACT_STATUS[key]?.label || key, count,
              })),
            ].map(f => (
              <button key={f.key} onClick={() => setStatusFilter(f.key)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
                  statusFilter === f.key
                    ? "bg-violet-600 text-white border-violet-600"
                    : "bg-white text-slate-500 border-slate-200 hover:border-violet-300"
                }`}>
                {f.label} ({f.count})
              </button>
            ))}
          </div>
          <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-600 ml-auto">
            <option value="name">Name</option>
            <option value="status">Status</option>
            <option value="lastContacted">Letzter Kontakt</option>
          </select>
        </div>

        {/* Table */}
        {filtered.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">Keine Kontakte gefunden.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-slate-400 uppercase tracking-wider border-b border-slate-100">
                  <th className="pb-2 pr-3">Name</th>
                  <th className="pb-2 pr-3">Kontakt</th>
                  <th className="pb-2 pr-3">Kanal</th>
                  <th className="pb-2 pr-3">Status</th>
                  <th className="pb-2 pr-3">Step</th>
                  <th className="pb-2">Letzter Kontakt</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => {
                  const cs = CONTACT_STATUS[c.status] || CONTACT_STATUS.pending;
                  return (
                    <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                      <td className="py-2.5 pr-3 font-medium text-slate-800">{c.name}</td>
                      <td className="py-2.5 pr-3 text-slate-500 font-mono text-xs">{c.contact}</td>
                      <td className="py-2.5 pr-3">
                        <span className="text-xs text-slate-500">{CHANNEL_ICON[c.channel]} {c.channel}</span>
                      </td>
                      <td className="py-2.5 pr-3">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${cs.color}`}>
                          {cs.label}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 text-slate-500 text-xs">
                        {campaign.flow[c.currentStep]?.label || `Step ${c.currentStep}`}
                      </td>
                      <td className="py-2.5 text-slate-400 text-xs">{timeAgo(c.lastContactedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
