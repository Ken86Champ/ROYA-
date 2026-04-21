"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { DashboardKPIs } from "@/lib/types/analytics";

const RechartsLine = dynamic(() => import("recharts").then(m => {
  const { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } = m;
  return function TrendChart({ data }: { data: { date: string; sent: number; replied: number; booked: number }[] }) {
    return (
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={(v: string) => v.slice(5)} />
          <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} />
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 12, border: "1px solid #e2e8f0" }} />
          <Line type="monotone" dataKey="sent" name="Gesendet" stroke="#8b5cf6" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="replied" name="Geantwortet" stroke="#06b6d4" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="booked" name="Gebucht" stroke="#10b981" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    );
  };
}), { ssr: false });

const RechartsBar = dynamic(() => import("recharts").then(m => {
  const { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } = m;
  return function ChannelChart({ data }: { data: { channel: string; sent: number; replied: number; booked: number }[] }) {
    return (
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="channel" tick={{ fontSize: 11, fill: "#64748b" }} />
          <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} />
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 12, border: "1px solid #e2e8f0" }} />
          <Bar dataKey="sent" name="Gesendet" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
          <Bar dataKey="replied" name="Geantwortet" fill="#06b6d4" radius={[4, 4, 0, 0]} />
          <Bar dataKey="booked" name="Gebucht" fill="#10b981" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  };
}), { ssr: false });

const RechartsFunnel = dynamic(() => import("recharts").then(m => {
  const { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } = m;
  return function FunnelChart({ data }: { data: { step: string; value: number; color: string }[] }) {
    return (
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} layout="vertical" margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
          <XAxis type="number" tick={{ fontSize: 10, fill: "#94a3b8" }} />
          <YAxis type="category" dataKey="step" tick={{ fontSize: 11, fill: "#64748b" }} width={90} />
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 12, border: "1px solid #e2e8f0" }} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  };
}), { ssr: false });

interface Stats {
  campaigns: {
    totalCampaigns: number;
    activeCampaigns: number;
    totalContacts: number;
    totalBooked: number;
    totalReplied: number;
    avgReplyRate: number;
  };
  conversations: {
    total: number; active: number; replied: number;
    booked: number; humanNeeded: number;
  };
  recentActivity: {
    id: string; leadName: string; channel: string; state: string;
    lastActivity: string; lastMessage: string; lastRole: string;
    intent?: string; intentConf?: number;
  }[];
}

interface FrameworkAnalytics {
  versions: {
    version: number;
    totalTurns: number;
    uniqueConversations: number;
    avgConfidence: number;
    intentDistribution: Record<string, number>;
    actionDistribution: Record<string, number>;
    firstSeen: string;
    lastSeen: string;
    outcomes: Record<string, number>;
    bookingRate: number;
  }[];
  currentFramework: {
    version: number;
    evolvedAt: string;
    learningsUsed: number;
    rulesCount: number;
    forbiddenCount: number;
    examplesCount: number;
    temperature: number;
    evolutionLog: string[];
  } | null;
  totalLearnings: number;
  totalEvents: number;
  outcomes: {
    total: number;
    booked: number;
    rejected: number;
    ghosted: number;
    handedOff: number;
  };
  feedbackLoop: {
    totalAutoInsights: number;
    unappliedInsights: number;
    appliedInsights: number;
    readyForEvolution: boolean;
  };
}

const CHANNEL_ICON: Record<string, string> = { email: "✉", sms: "▣", whatsapp: "◊" };

interface ExecLogEntry {
  id: string;
  campaignId: string;
  contactId?: string;
  contactName?: string;
  event: string;
  channel?: string;
  stepIndex?: number;
  details: Record<string, unknown>;
  createdAt: string;
}

const EXEC_EVENT_ICON: Record<string, string> = {
  send: "↗", queued: "◈", skip: "—", error: "✗",
  channel_switch: "↻", handoff_pause: "⚠", step_advance: "→", closed: "✓",
};
const EXEC_EVENT_COLOR: Record<string, string> = {
  send: "text-emerald-600", queued: "text-blue-500", skip: "text-slate-400",
  error: "text-red-500", channel_switch: "text-amber-500",
  handoff_pause: "text-orange-500", step_advance: "text-violet-500", closed: "text-slate-500",
};
const STATE_DOT: Record<string, string> = {
  active: "bg-amber-400", replied: "bg-blue-400",
  booked: "bg-emerald-500", closed: "bg-slate-300", human_needed: "bg-red-500",
};
const STATE_LABEL: Record<string, string> = {
  active: "Aktiv", replied: "Neu", booked: "Gebucht",
  closed: "Geschlossen", human_needed: "Eskaliert",
};
const INTENT_COLOR: Record<string, string> = {
  hot: "text-emerald-600", warm: "text-amber-600", cold: "text-red-500",
  question: "text-blue-600", timing: "text-violet-600",
};

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "gerade";
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

const agentStatus = [
  { name: "Orchestrator",   model: "opus-4-6",   icon: "◎", bg: "bg-violet-50",  border: "border-violet-100",  text: "text-violet-600" },
  { name: "Segmentierung",  model: "haiku-4-5",  icon: "◈", bg: "bg-cyan-50",    border: "border-cyan-100",    text: "text-cyan-600" },
  { name: "Writer",         model: "sonnet-4-6", icon: "✎", bg: "bg-pink-50",    border: "border-pink-100",    text: "text-pink-600" },
  { name: "Sleeping Beauty",model: "opus-4-6",   icon: "◉", bg: "bg-indigo-50",  border: "border-indigo-100",  text: "text-indigo-600" },
  { name: "Booking",        model: "haiku-4-5",  icon: "◇", bg: "bg-emerald-50", border: "border-emerald-100", text: "text-emerald-600" },
  { name: "Channel Router", model: "haiku-4-5",  icon: "◊", bg: "bg-amber-50",   border: "border-amber-100",   text: "text-amber-600" },
  { name: "Analytics",      model: "sonnet-4-6", icon: "▣", bg: "bg-teal-50",    border: "border-teal-100",    text: "text-teal-600" },
];

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [perfKpis, setPerfKpis] = useState<DashboardKPIs | null>(null);
  const [fwAnalytics, setFwAnalytics] = useState<FrameworkAnalytics | null>(null);
  const [autoLearnBusy, setAutoLearnBusy] = useState(false);
  const [autoLearnResult, setAutoLearnResult] = useState<string | null>(null);
  const [execLogEntries, setExecLogEntries] = useState<ExecLogEntry[]>([]);
  const [trendDays, setTrendDays] = useState(14);
  const [trends, setTrends] = useState<{
    daily: { date: string; sent: number; replied: number; positive: number; booked: number; escalated: number }[];
    channels: Record<string, { sent: number; replied: number; booked: number }>;
    campaigns: { id: string; sent: number; replied: number; booked: number }[];
  } | null>(null);

  useEffect(() => {
    const load = () => {
      fetch("/api/stats").then(r => r.json()).then(setStats).catch(() => {});
      fetch("/api/dashboard/kpis").then(r => r.json()).then(setPerfKpis).catch(() => {});
      fetch("/api/framework-analytics").then(r => r.json()).then(setFwAnalytics).catch(() => {});
      fetch("/api/execution-log?limit=20").then(r => r.json()).then(d => setExecLogEntries(d.entries ?? [])).catch(() => {});
      fetch(`/api/dashboard/trends?days=${trendDays}`).then(r => r.json()).then(setTrends).catch(() => {});
    };
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [trendDays]);

  const triggerAutoLearn = async (action: "analyze" | "evolve") => {
    setAutoLearnBusy(true);
    setAutoLearnResult(null);
    try {
      const res = await fetch("/api/auto-learn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      setAutoLearnResult(data.message || "Fertig.");
    } catch {
      setAutoLearnResult("Fehler beim Auto-Learning.");
    } finally {
      setAutoLearnBusy(false);
    }
  };

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Guten Morgen" : hour < 18 ? "Guten Tag" : "Guten Abend";
  const dateStr = now.toLocaleDateString("de-CH", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  const kpis = [
    {
      label: "Aktive Kampagnen",
      value: stats?.campaigns.activeCampaigns ?? 0,
      sub: `${stats?.campaigns.totalCampaigns ?? 0} total`,
      icon: "◎", accent: "from-violet-500 to-purple-500",
      iconBg: "bg-violet-50", iconColor: "text-violet-600",
      href: "/dashboard/campaigns",
    },
    {
      label: "Kontaktiert",
      value: stats?.campaigns.totalContacts ?? 0,
      sub: `${stats?.campaigns.avgReplyRate ?? 0}% Reply-Rate`,
      icon: "◉", accent: "from-cyan-500 to-blue-500",
      iconBg: "bg-cyan-50", iconColor: "text-cyan-600",
      href: "/dashboard/campaigns",
    },
    {
      label: "Offene Gespräche",
      value: (stats?.conversations.active ?? 0) + (stats?.conversations.replied ?? 0),
      sub: `${stats?.conversations.humanNeeded ?? 0} eskaliert`,
      icon: "◊", accent: "from-indigo-500 to-violet-500",
      iconBg: "bg-indigo-50", iconColor: "text-indigo-600",
      href: "/dashboard/campaigns",
    },
    {
      label: "Termine gebucht",
      value: stats?.campaigns.totalBooked ?? 0,
      sub: `${stats?.conversations.booked ?? 0} via Agent`,
      icon: "◇", accent: "from-emerald-500 to-green-500",
      iconBg: "bg-emerald-50", iconColor: "text-emerald-600",
      href: "/dashboard/appointments",
    },
  ];

  return (
    <div className="p-8 max-w-[1400px] overflow-auto h-full">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">{greeting}</h1>
        <p className="text-slate-400 text-sm mt-1">{dateStr}</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {kpis.map(kpi => (
          <Link key={kpi.label} href={kpi.href}
            className="glass-card p-5 relative overflow-hidden hover:shadow-md transition-all group">
            <div className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${kpi.accent}`} />
            <div className="flex items-start justify-between mb-3">
              <div className={`w-10 h-10 rounded-xl ${kpi.iconBg} flex items-center justify-center`}>
                <span className={`${kpi.iconColor} text-lg`}>{kpi.icon}</span>
              </div>
              <span className="text-[10px] text-slate-400 group-hover:text-slate-600 transition-colors">→</span>
            </div>
            <p className="text-3xl font-bold text-slate-900 mb-0.5">{kpi.value}</p>
            <p className="text-slate-500 text-sm font-medium">{kpi.label}</p>
            <p className="text-slate-400 text-xs mt-0.5">{kpi.sub}</p>
          </Link>
        ))}
      </div>

      {/* Performance Rate Strip — sourced from experiment_events */}
      <div className="glass-card px-6 py-4 mb-6 flex items-center gap-8 flex-wrap">
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider shrink-0">Performance</span>
        {[
          { label: "Reply-Rate",          val: perfKpis?.avgReplyRate         ?? 0, color: "text-blue-600" },
          { label: "Positive Reply-Rate", val: perfKpis?.avgPositiveReplyRate ?? 0, color: "text-violet-600" },
          { label: "Booking-Rate",        val: perfKpis?.avgBookingRate       ?? 0, color: "text-emerald-600" },
          { label: "Handoff-Rate",        val: perfKpis?.avgHandoffRate       ?? 0, color: "text-amber-600" },
          { label: "Reaktivierung",       val: perfKpis?.reactivationRate     ?? 0, color: "text-cyan-600" },
        ].map(r => (
          <div key={r.label} className="flex items-center gap-2 min-w-0">
            <span className={`text-lg font-bold ${r.color}`}>{r.val}%</span>
            <span className="text-xs text-slate-400">{r.label}</span>
          </div>
        ))}
        <div className="ml-auto flex items-center gap-4 text-xs text-slate-400">
          <span><span className="font-semibold text-slate-700">{perfKpis?.totalSent ?? 0}</span> versendet</span>
          <span><span className="font-semibold text-slate-700">{perfKpis?.totalReplies ?? 0}</span> geantwortet</span>
          <span><span className="font-semibold text-slate-700">{perfKpis?.totalBookings ?? 0}</span> Termine</span>
        </div>
      </div>

      {/* ── Trend Charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
        {/* Line chart — daily activity */}
        <div className="lg:col-span-2 glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Aktivität</h2>
              <p className="text-xs text-slate-400 mt-0.5">Tägliche Sends, Antworten & Buchungen</p>
            </div>
            <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
              {[7, 14, 30].map(d => (
                <button key={d} onClick={() => setTrendDays(d)}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all ${
                    trendDays === d ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}>{d}d</button>
              ))}
            </div>
          </div>
          {trends?.daily && trends.daily.length > 0 ? (
            <RechartsLine data={trends.daily} />
          ) : (
            <div className="h-[220px] flex items-center justify-center text-xs text-slate-400">Noch keine Trend-Daten</div>
          )}
        </div>

        {/* Channel comparison + funnel */}
        <div className="space-y-5">
          {/* Channel bars */}
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Kanal-Vergleich</h3>
            {trends?.channels ? (
              <RechartsBar data={Object.entries(trends.channels).map(([channel, v]) => ({
                channel: channel === "email" ? "E-Mail" : channel === "sms" ? "SMS" : "WhatsApp",
                ...v,
              }))} />
            ) : (
              <div className="h-[180px] flex items-center justify-center text-xs text-slate-400">—</div>
            )}
          </div>

          {/* Conversion funnel (horizontal bars) */}
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Conversion Funnel</h3>
            {perfKpis ? (
              <RechartsFunnel data={[
                { step: "Gesendet",    value: perfKpis.totalSent ?? 0,     color: "#8b5cf6" },
                { step: "Geantwortet", value: perfKpis.totalReplies ?? 0,  color: "#06b6d4" },
                { step: "Qualifiziert",value: perfKpis.totalBookings ?? 0, color: "#f59e0b" },
                { step: "Gebucht",     value: perfKpis.totalBookings ?? 0, color: "#10b981" },
              ]} />
            ) : (
              <div className="h-[180px] flex items-center justify-center text-xs text-slate-400">—</div>
            )}
          </div>
        </div>
      </div>

      {/* Framework Intelligence */}
      {fwAnalytics && (fwAnalytics.currentFramework || fwAnalytics.totalEvents > 0) && (
        <div className="glass-card px-6 py-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Framework Intelligence</h2>
              <p className="text-xs text-slate-400 mt-0.5">Selbstlernendes Framework — Performance je Version</p>
            </div>
            {fwAnalytics.currentFramework && (
              <span className="badge bg-violet-50 text-violet-600 border border-violet-100 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-500" /> v{fwAnalytics.currentFramework.version} aktiv
              </span>
            )}
          </div>

          {/* Current Framework Stats */}
          {fwAnalytics.currentFramework && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
              {[
                { label: "Learnings", value: fwAnalytics.currentFramework.learningsUsed, icon: "🧠", color: "text-violet-600" },
                { label: "Regeln", value: fwAnalytics.currentFramework.rulesCount, icon: "◎", color: "text-blue-600" },
                { label: "Verboten", value: fwAnalytics.currentFramework.forbiddenCount, icon: "✕", color: "text-red-500" },
                { label: "Beispiele", value: fwAnalytics.currentFramework.examplesCount, icon: "★", color: "text-amber-600" },
                { label: "Temperatur", value: fwAnalytics.currentFramework.temperature, icon: "◇", color: "text-cyan-600" },
              ].map(s => (
                <div key={s.label} className="bg-slate-50 rounded-xl px-3 py-2.5 flex items-center gap-2.5">
                  <span className={`text-sm ${s.color}`}>{s.icon}</span>
                  <div>
                    <p className="text-lg font-bold text-slate-900">{s.value}</p>
                    <p className="text-[10px] text-slate-400">{s.label}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Version Performance Comparison */}
          {fwAnalytics.versions.length > 0 && (
            <div className="border-t border-slate-100 pt-4">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Performance je Version</p>
              <div className="space-y-2">
                {fwAnalytics.versions.slice(0, 5).map(v => {
                  const maxTurns = Math.max(...fwAnalytics.versions.map(x => x.totalTurns), 1);
                  return (
                    <div key={v.version} className="flex items-center gap-3">
                      <span className="text-xs font-bold text-slate-700 w-8 shrink-0">v{v.version}</span>
                      <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-violet-400 to-violet-600 rounded-full transition-all"
                          style={{ width: `${Math.min(100, Math.round((v.totalTurns / maxTurns) * 100))}%` }} />
                      </div>
                      <div className="flex items-center gap-3 text-[11px] shrink-0">
                        <span className="text-slate-500">{v.totalTurns} Turns</span>
                        <span className="text-slate-500">{v.uniqueConversations} Chats</span>
                        <span className="font-semibold text-violet-600">{v.avgConfidence}% Conf</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Evolution Log */}
          {fwAnalytics.currentFramework?.evolutionLog && fwAnalytics.currentFramework.evolutionLog.length > 0 && (
            <div className="border-t border-slate-100 pt-3 mt-3">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Evolution Log</p>
              <div className="space-y-1">
                {fwAnalytics.currentFramework.evolutionLog.slice(-3).reverse().map((entry, i) => (
                  <p key={i} className="text-[11px] text-slate-500 truncate">
                    <span className="text-violet-500 font-medium">{entry.split(':')[0]}:</span>
                    {entry.split(':').slice(1).join(':')}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Feedback Loop — Outcomes + Auto-Learning */}
      {fwAnalytics && (
        <div className="glass-card px-6 py-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Feedback Loop</h2>
              <p className="text-xs text-slate-400 mt-0.5">Gespräche → Ergebnisse → Auto-Learnings → Framework-Evolution</p>
            </div>
            <div className="flex items-center gap-2">
              {fwAnalytics.feedbackLoop?.readyForEvolution && (
                <span className="badge bg-amber-50 text-amber-600 border border-amber-100 flex items-center gap-1.5 animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Evolution bereit
                </span>
              )}
              <button
                onClick={() => triggerAutoLearn("analyze")}
                disabled={autoLearnBusy}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-violet-50 text-violet-600 hover:bg-violet-100 disabled:opacity-50 transition-all"
              >
                {autoLearnBusy ? "Analysiert..." : "Auto-Analyse"}
              </button>
              {fwAnalytics.feedbackLoop?.unappliedInsights > 0 && (
                <button
                  onClick={() => triggerAutoLearn("evolve")}
                  disabled={autoLearnBusy}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 disabled:opacity-50 transition-all"
                >
                  Evolve
                </button>
              )}
            </div>
          </div>

          {autoLearnResult && (
            <div className="bg-slate-50 rounded-xl px-4 py-2.5 mb-4 text-xs text-slate-600">
              {autoLearnResult}
            </div>
          )}

          {/* Outcome Funnel */}
          {fwAnalytics.outcomes && fwAnalytics.outcomes.total > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
              {[
                { label: "Gespräche", value: fwAnalytics.outcomes.total, icon: "◉", color: "text-slate-600", bg: "bg-slate-50" },
                { label: "Gebucht", value: fwAnalytics.outcomes.booked, icon: "◇", color: "text-emerald-600", bg: "bg-emerald-50" },
                { label: "Abgelehnt", value: fwAnalytics.outcomes.rejected, icon: "✕", color: "text-red-500", bg: "bg-red-50" },
                { label: "Ghosted", value: fwAnalytics.outcomes.ghosted, icon: "○", color: "text-slate-400", bg: "bg-slate-50" },
                { label: "Eskaliert", value: fwAnalytics.outcomes.handedOff, icon: "▲", color: "text-amber-600", bg: "bg-amber-50" },
              ].map(s => (
                <div key={s.label} className={`${s.bg} rounded-xl px-3 py-2.5 flex items-center gap-2.5`}>
                  <span className={`text-sm ${s.color}`}>{s.icon}</span>
                  <div>
                    <p className="text-lg font-bold text-slate-900">{s.value}</p>
                    <p className="text-[10px] text-slate-400">{s.label}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Booking Rate per Framework Version */}
          {fwAnalytics.versions.length > 0 && fwAnalytics.versions.some(v => Object.keys(v.outcomes || {}).length > 0) && (
            <div className="border-t border-slate-100 pt-4 mb-4">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Booking-Rate je Version</p>
              <div className="space-y-2">
                {fwAnalytics.versions.filter(v => Object.keys(v.outcomes || {}).length > 0).map(v => {
                  const total = Object.values(v.outcomes).reduce((s, n) => s + n, 0);
                  return (
                    <div key={v.version} className="flex items-center gap-3">
                      <span className="text-xs font-bold text-slate-700 w-8 shrink-0">v{v.version}</span>
                      <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full transition-all"
                          style={{ width: `${v.bookingRate}%` }} />
                      </div>
                      <div className="flex items-center gap-3 text-[11px] shrink-0">
                        <span className="font-semibold text-emerald-600">{v.bookingRate}%</span>
                        <span className="text-slate-400">{v.outcomes['booked'] ?? 0}/{total} Bookings</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Auto-Learning Pipeline Status */}
          {fwAnalytics.feedbackLoop && (
            <div className="border-t border-slate-100 pt-4">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Auto-Learning Pipeline</p>
              <div className="flex items-center gap-3 overflow-x-auto">
                {[
                  {
                    step: "Gespräche",
                    value: fwAnalytics.outcomes?.total ?? 0,
                    color: "bg-slate-200",
                    active: true,
                  },
                  {
                    step: "Insights",
                    value: fwAnalytics.feedbackLoop.totalAutoInsights,
                    color: "bg-blue-200",
                    active: fwAnalytics.feedbackLoop.totalAutoInsights > 0,
                  },
                  {
                    step: "Wartend",
                    value: fwAnalytics.feedbackLoop.unappliedInsights,
                    color: "bg-amber-200",
                    active: fwAnalytics.feedbackLoop.unappliedInsights > 0,
                  },
                  {
                    step: "Applied",
                    value: fwAnalytics.feedbackLoop.appliedInsights,
                    color: "bg-emerald-200",
                    active: fwAnalytics.feedbackLoop.appliedInsights > 0,
                  },
                ].map((s, i, arr) => (
                  <div key={s.step} className="flex items-center gap-3">
                    <div className={`rounded-xl px-4 py-2.5 text-center min-w-[80px] ${s.active ? s.color : "bg-slate-100"}`}>
                      <p className={`text-lg font-bold ${s.active ? "text-slate-900" : "text-slate-300"}`}>{s.value}</p>
                      <p className="text-[10px] text-slate-500">{s.step}</p>
                    </div>
                    {i < arr.length - 1 && (
                      <span className="text-slate-300 text-sm">→</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">

        {/* Recent Activity */}
        <div className="lg:col-span-2 glass-card p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Letzte Aktivitäten</h2>
              <p className="text-xs text-slate-400 mt-0.5">Echtzeit · aktualisiert alle 8s</p>
            </div>
            <Link href="/dashboard/campaigns" className="text-xs text-violet-500 hover:text-violet-700 font-medium transition-colors">
              Alle ansehen →
            </Link>
          </div>

          {stats && stats.recentActivity.length > 0 ? (
            <div className="space-y-2">
              {stats.recentActivity.map(a => (
                <Link key={a.id} href={`/dashboard/campaigns`}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors group">
                  <div className="w-8 h-8 rounded-xl bg-violet-100 flex items-center justify-center font-bold text-violet-700 text-sm shrink-0">
                    {a.leadName.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-semibold text-slate-800">{a.leadName}</span>
                      <span className="text-xs text-slate-400">{CHANNEL_ICON[a.channel]}</span>
                      <span className={`w-1.5 h-1.5 rounded-full ${STATE_DOT[a.state]}`} />
                      <span className="text-[11px] text-slate-400">{STATE_LABEL[a.state]}</span>
                      {a.intent && (
                        <span className={`text-[11px] font-bold ${INTENT_COLOR[a.intent] || "text-slate-400"}`}>
                          · {a.intent}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 truncate">
                      {a.lastRole === "agent" ? "↗ " : "← "}
                      {a.lastMessage}
                    </p>
                  </div>
                  <span className="text-[10px] text-slate-400 shrink-0">{timeAgo(a.lastActivity)}</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center mb-3">
                <span className="text-slate-300 text-xl">○</span>
              </div>
              <p className="text-slate-500 text-sm font-medium mb-1">Keine Aktivitäten</p>
              <p className="text-slate-400 text-xs max-w-xs">Starten Sie Ihre erste Kampagne um hier Aktivitäten zu sehen.</p>
            </div>
          )}

          {/* Funnel bar */}
          {stats && stats.campaigns.totalContacts > 0 && (
            <div className="mt-5 pt-5 border-t border-slate-100">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Gesamt-Funnel</p>
              <div className="space-y-2">
                {[
                  { label: "Kontaktiert", val: stats.campaigns.totalContacts, color: "bg-violet-400", max: stats.campaigns.totalContacts },
                  { label: "Geantwortet", val: stats.campaigns.totalReplied,  color: "bg-blue-400",   max: stats.campaigns.totalContacts },
                  { label: "Termin",      val: stats.campaigns.totalBooked,   color: "bg-emerald-500",max: stats.campaigns.totalContacts },
                ].map(row => (
                  <div key={row.label} className="flex items-center gap-3">
                    <span className="text-[11px] text-slate-500 w-24 shrink-0">{row.label}</span>
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full ${row.color} rounded-full transition-all`}
                        style={{ width: `${Math.min(100, Math.round((row.val / row.max) * 100))}%` }} />
                    </div>
                    <span className="text-[11px] font-bold text-slate-700 w-8 text-right">{row.val}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-slate-900 mb-4">Schnellaktionen</h2>
          {[
            { href: "/dashboard/campaigns/new", icon: "◎", title: "Kampagne erstellen", desc: "CSV → Felder → Flow → Simulation → Start", highlight: true },
            { href: "/dashboard/escalations",   icon: "⚠", title: "Eskalationen",      desc: `${(stats as Stats & { escalations?: { open: number } })?.escalations?.open ?? 0} offene Eskalationen` },
            { href: "/dashboard/simulation",    icon: "▶", title: "Simulation",         desc: "Live-Simulation der KI-Agent Pipeline" },
          ].map(a => (
            <Link key={a.title} href={a.href}
              className={`p-4 flex items-center gap-4 group rounded-2xl border transition-all ${
                a.highlight
                  ? "bg-violet-600 border-violet-700 hover:bg-violet-700 shadow-lg shadow-violet-200"
                  : "glass-card-hover"
              }`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                a.highlight ? "bg-white/10 text-white" : "bg-violet-50 text-violet-600"
              }`}>
                <span className="text-lg">{a.icon}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className={`font-semibold text-sm ${a.highlight ? "text-white" : "text-slate-800 group-hover:text-violet-600"} transition-colors`}>
                  {a.title}
                </p>
                <p className={`text-xs mt-0.5 ${a.highlight ? "text-violet-200" : "text-slate-400"}`}>{a.desc}</p>
              </div>
              <span className={`text-sm ${a.highlight ? "text-violet-300" : "text-slate-300 group-hover:text-slate-500"}`}>→</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Campaign Execution Log */}
      {execLogEntries.length > 0 && (
        <div className="glass-card p-6 mb-8">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Execution Log</h2>
              <p className="text-xs text-slate-400 mt-0.5">Letzte Scheduler- &amp; Worker-Aktionen</p>
            </div>
            <span className="badge bg-slate-50 text-slate-500 border border-slate-200 text-[10px]">
              {execLogEntries.length} Einträge
            </span>
          </div>
          <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
            {execLogEntries.map(e => (
              <div key={e.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors text-xs">
                <span className={`text-base font-bold ${EXEC_EVENT_COLOR[e.event] ?? "text-slate-400"}`}>
                  {EXEC_EVENT_ICON[e.event] ?? "·"}
                </span>
                <span className="font-semibold text-slate-700 w-20 truncate">{e.contactName || "—"}</span>
                <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-mono text-[10px]">{e.event}</span>
                {e.channel && <span className="text-slate-400">{CHANNEL_ICON[e.channel] ?? e.channel}</span>}
                {e.stepIndex != null && <span className="text-slate-400">Step {e.stepIndex}</span>}
                <span className="flex-1 text-slate-400 truncate text-[10px]">
                  {e.details?.reason ? String(e.details.reason) : e.details?.error ? String(e.details.error) : ""}
                </span>
                <span className="text-[10px] text-slate-400 shrink-0">{timeAgo(e.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Agent Grid */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Agent Status</h2>
            <p className="text-xs text-slate-400 mt-0.5">7 von 7 Agents bereit</p>
          </div>
          <span className="badge bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center gap-1.5">
            <span className="status-dot-green" /> Alle Systeme operativ
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {agentStatus.map(agent => (
            <div key={agent.name} className={`${agent.bg} border ${agent.border} rounded-2xl p-4 text-center hover:scale-[1.03] transition-all duration-200`}>
              <div className={`text-2xl mb-2.5 ${agent.text}`}>{agent.icon}</div>
              <p className="text-slate-800 text-xs font-semibold mb-0.5 truncate">{agent.name}</p>
              <p className="text-slate-400 text-[10px] font-mono mb-2.5">{agent.model}</p>
              <div className="flex items-center justify-center gap-1.5">
                <span className="status-dot-green" />
                <span className="text-emerald-600 text-[10px] font-medium">bereit</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
