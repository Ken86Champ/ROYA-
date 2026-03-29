"use client";
import Link from "next/link";

const stats = [
  { label: "Leads hochgeladen", value: "0", accent: "from-violet-500 to-purple-500", iconBg: "bg-violet-50", icon: "⟳", iconColor: "text-violet-600" },
  { label: "Segmentiert", value: "0", accent: "from-cyan-500 to-blue-500", iconBg: "bg-cyan-50", icon: "◈", iconColor: "text-cyan-600" },
  { label: "Outreach generiert", value: "0", accent: "from-emerald-500 to-green-500", iconBg: "bg-emerald-50", icon: "✎", iconColor: "text-emerald-600" },
  { label: "Termine gebucht", value: "0", accent: "from-amber-500 to-orange-500", iconBg: "bg-amber-50", icon: "◇", iconColor: "text-amber-600" },
];

const segments = [
  { id: "hot", label: "Hot", desc: "Hohe Kaufabsicht, kürzlich aktiv", color: "bg-red-50 border-red-100 text-red-600", dot: "bg-red-500", count: 0 },
  { id: "warm", label: "Warm", desc: "Interesse vorhanden, etwas inaktiv", color: "bg-orange-50 border-orange-100 text-orange-600", dot: "bg-orange-500", count: 0 },
  { id: "cold", label: "Cold", desc: "Kaum Signale, länger kein Kontakt", color: "bg-blue-50 border-blue-100 text-blue-600", dot: "bg-blue-500", count: 0 },
  { id: "dormant", label: "Dormant", desc: "Sehr lange inaktiv, reaktivierbar", color: "bg-slate-50 border-slate-200 text-slate-500", dot: "bg-slate-400", count: 0 },
  { id: "invalid", label: "Invalid", desc: "Unvollständige / falsche Daten", color: "bg-red-50 border-red-100 text-red-400", dot: "bg-red-300", count: 0 },
];

export default function LeadsPage() {
  return (
    <div className="p-8 max-w-[1400px]">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Lead Reaktivierung</h1>
          <p className="text-slate-400 text-sm mt-1">CSV hochladen → KI-Segmentierung → personalisierten Outreach generieren</p>
        </div>
        <Link href="/dashboard/leads/new"
          className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-xl transition-all shadow-md shadow-violet-200">
          <span className="text-base">⟳</span>
          Neue Reaktivierung starten
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => (
          <div key={stat.label} className="glass-card p-5 relative overflow-hidden">
            <div className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${stat.accent}`} />
            <div className={`w-10 h-10 rounded-xl ${stat.iconBg} flex items-center justify-center mb-3`}>
              <span className={`${stat.iconColor} text-lg`}>{stat.icon}</span>
            </div>
            <p className="text-3xl font-bold text-slate-900 mb-1">{stat.value}</p>
            <p className="text-slate-400 text-sm">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2 glass-card p-6">
          <h2 className="text-base font-semibold text-slate-900 mb-5">Segmentierung</h2>
          <div className="space-y-3">
            {segments.map((seg) => (
              <div key={seg.id} className={`flex items-center justify-between p-3.5 rounded-xl border ${seg.color}`}>
                <div className="flex items-center gap-3">
                  <span className={`w-2.5 h-2.5 rounded-full ${seg.dot}`} />
                  <div>
                    <p className="text-sm font-semibold">{seg.label}</p>
                    <p className="text-xs opacity-70">{seg.desc}</p>
                  </div>
                </div>
                <span className="text-2xl font-bold opacity-60">{seg.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card p-6 flex flex-col items-center justify-center text-center">
          <div className="w-20 h-20 rounded-3xl bg-violet-50 border border-violet-100 flex items-center justify-center mb-5">
            <span className="text-4xl text-violet-300">⟳</span>
          </div>
          <h3 className="text-lg font-semibold text-slate-800 mb-2">Erste Reaktivierung starten</h3>
          <p className="text-slate-400 text-sm max-w-xs leading-relaxed mb-5">
            Laden Sie eine CSV-Datei mit Ihren bestehenden Leads hoch. Die KI analysiert, segmentiert und generiert personalisierten Outreach.
          </p>
          <Link href="/dashboard/leads/new"
            className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-xl transition-all">
            Jetzt starten →
          </Link>
        </div>
      </div>
    </div>
  );
}
