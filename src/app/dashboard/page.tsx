"use client";

const stats = [
  { label: "Aktive Kontakte", value: "0", trend: "+0%", trendUp: true, icon: "◉", accent: "from-violet-500 to-purple-500", iconBg: "bg-violet-50", iconColor: "text-violet-600" },
  { label: "Laufende Kampagnen", value: "0", trend: "0 aktiv", trendUp: false, icon: "◎", accent: "from-cyan-500 to-blue-500", iconBg: "bg-cyan-50", iconColor: "text-cyan-600" },
  { label: "Gebuchte Termine", value: "0", trend: "dieser Monat", trendUp: true, icon: "◇", accent: "from-emerald-500 to-green-500", iconBg: "bg-emerald-50", iconColor: "text-emerald-600" },
  { label: "Revenue Reaktiviert", value: "CHF 0", trend: "+0%", trendUp: true, icon: "◈", accent: "from-amber-500 to-orange-500", iconBg: "bg-amber-50", iconColor: "text-amber-600" },
];

const agentStatus = [
  { name: "Orchestrator", model: "opus-4-6", icon: "◎", bg: "bg-violet-50", border: "border-violet-100", text: "text-violet-600" },
  { name: "Segmentierung", model: "haiku-4-5", icon: "◈", bg: "bg-cyan-50", border: "border-cyan-100", text: "text-cyan-600" },
  { name: "Writer", model: "sonnet-4-6", icon: "✎", bg: "bg-pink-50", border: "border-pink-100", text: "text-pink-600" },
  { name: "Sleeping Beauty", model: "opus-4-6", icon: "◉", bg: "bg-indigo-50", border: "border-indigo-100", text: "text-indigo-600" },
  { name: "Booking", model: "haiku-4-5", icon: "◇", bg: "bg-emerald-50", border: "border-emerald-100", text: "text-emerald-600" },
  { name: "Channel Router", model: "haiku-4-5", icon: "◊", bg: "bg-amber-50", border: "border-amber-100", text: "text-amber-600" },
  { name: "Analytics", model: "sonnet-4-6", icon: "▣", bg: "bg-teal-50", border: "border-teal-100", text: "text-teal-600" },
];

export default function DashboardPage() {
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Guten Morgen" : hour < 18 ? "Guten Tag" : "Guten Abend";
  const dateStr = now.toLocaleDateString("de-CH", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="p-8 max-w-[1400px]">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-slate-900">{greeting} 👋</h1>
        </div>
        <p className="text-slate-400 text-sm">{dateStr}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => (
          <div key={stat.label} className="glass-card p-5 relative overflow-hidden group hover:shadow-md transition-all duration-300">
            <div className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${stat.accent}`} />
            <div className="flex items-start justify-between mb-3">
              <div className={`w-10 h-10 rounded-xl ${stat.iconBg} flex items-center justify-center`}>
                <span className={`${stat.iconColor} text-lg`}>{stat.icon}</span>
              </div>
              <span className={`badge ${stat.trendUp ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"}`}>
                {stat.trendUp && "↑"}{stat.trend}
              </span>
            </div>
            <p className="text-3xl font-bold text-slate-900 mb-1">{stat.value}</p>
            <p className="text-slate-400 text-sm">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="glass-card p-6 mb-8">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Agent Status</h2>
            <p className="text-xs text-slate-400 mt-0.5">7 von 7 Agents bereit</p>
          </div>
          <span className="badge bg-emerald-50 text-emerald-600 border border-emerald-100">
            <span className="status-dot-green" /> Alle Systeme operativ
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {agentStatus.map((agent) => (
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 glass-card p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-semibold text-slate-900">Letzte Aktivitaeten</h2>
            <a href="/dashboard/conversations" className="text-xs text-slate-400 hover:text-slate-700 transition-colors">Alle anzeigen</a>
          </div>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center mb-4">
              <span className="text-slate-300 text-2xl">○</span>
            </div>
            <p className="text-slate-500 text-sm font-medium mb-1">Keine Aktivitaeten</p>
            <p className="text-slate-400 text-xs max-w-xs">Starten Sie Ihre erste Kampagne um hier Aktivitaeten zu sehen.</p>
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-base font-semibold text-slate-900 mb-4">Schnellaktionen</h2>
          {[
            { href: "/dashboard/simulation", icon: "▶", title: "Test Agent Flow", desc: "Live-Simulation: Agents bei der Arbeit zusehen", iconBg: "bg-violet-600", iconColor: "text-white", border: "border-violet-700", highlight: true },
            { href: "/dashboard/leads/new", icon: "⟳", title: "Lead Reaktivierung", desc: "CSV hochladen → KI-Segmentierung → Outreach", iconBg: "bg-cyan-50", iconColor: "text-cyan-600", border: "border-cyan-100" },
            { href: "/dashboard/campaigns/new", icon: "◎", title: "Neue Kampagne", desc: "CRM importieren & Kampagne starten", iconBg: "bg-violet-50", iconColor: "text-violet-600", border: "border-violet-100" },
            { href: "/dashboard/clients/new", icon: "◈", title: "Endkunde hinzufuegen", desc: "Neuen Kunden onboarden", iconBg: "bg-cyan-50", iconColor: "text-cyan-600", border: "border-cyan-100" },
            { href: "/dashboard/conversations", icon: "◊", title: "Gespraeche ansehen", desc: "Agent-Konversationen ueberwachen", iconBg: "bg-emerald-50", iconColor: "text-emerald-600", border: "border-emerald-100" },
          ].map((action) => (
            <a key={action.title} href={action.href}
              className={`p-4 flex items-center gap-4 group rounded-2xl border transition-all duration-200 ${
                (action as any).highlight
                  ? "bg-violet-600 border-violet-700 hover:bg-violet-700 shadow-lg shadow-violet-200"
                  : "glass-card-hover"
              }`}>
              <div className={`w-11 h-11 rounded-xl ${action.iconBg} border ${action.border} flex items-center justify-center shrink-0`}>
                <span className={`${action.iconColor} text-lg`}>{action.icon}</span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className={`font-semibold text-sm transition-colors ${(action as any).highlight ? "text-white" : "text-slate-800 group-hover:text-violet-600"}`}>{action.title}</h3>
                <p className={`text-xs mt-0.5 ${(action as any).highlight ? "text-violet-200" : "text-slate-400"}`}>{action.desc}</p>
              </div>
              <span className={`transition-colors ${(action as any).highlight ? "text-violet-300" : "text-slate-300 group-hover:text-slate-500"}`}>→</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
