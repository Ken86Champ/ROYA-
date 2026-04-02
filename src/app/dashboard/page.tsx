"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import type { DashboardKPIs } from "@/lib/types/analytics";

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

const CHANNEL_ICON: Record<string, string> = { email: "✉", sms: "▣", whatsapp: "◊" };
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

  useEffect(() => {
    const load = () => {
      fetch("/api/stats").then(r => r.json()).then(setStats).catch(() => {});
      fetch("/api/dashboard/kpis").then(r => r.json()).then(setPerfKpis).catch(() => {});
    };
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, []);

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
      href: "/dashboard/conversations",
    },
    {
      label: "Termine gebucht",
      value: stats?.campaigns.totalBooked ?? 0,
      sub: `${stats?.conversations.booked ?? 0} via Agent`,
      icon: "◇", accent: "from-emerald-500 to-green-500",
      iconBg: "bg-emerald-50", iconColor: "text-emerald-600",
      href: "/dashboard/conversations",
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">

        {/* Recent Activity */}
        <div className="lg:col-span-2 glass-card p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Letzte Aktivitäten</h2>
              <p className="text-xs text-slate-400 mt-0.5">Echtzeit · aktualisiert alle 8s</p>
            </div>
            <Link href="/dashboard/conversations" className="text-xs text-violet-500 hover:text-violet-700 font-medium transition-colors">
              Alle ansehen →
            </Link>
          </div>

          {stats && stats.recentActivity.length > 0 ? (
            <div className="space-y-2">
              {stats.recentActivity.map(a => (
                <Link key={a.id} href={`/dashboard/conversations`}
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
            { href: "/dashboard/sms-test",      icon: "▶", title: "Agent testen",       desc: "V2-Orchestrator live testen",               highlight: true },
            { href: "/dashboard/campaigns/new", icon: "◎", title: "Neue Kampagne",      desc: "Leads hochladen → Kampagne starten" },
            { href: "/dashboard/conversations", icon: "◊", title: "Gespräche",          desc: `${(stats?.conversations.replied ?? 0)} neue Antworten warten` },
            { href: "/dashboard/clients",       icon: "◈", title: "Endkunden",          desc: "Kunden und deren Kampagnen verwalten" },
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
