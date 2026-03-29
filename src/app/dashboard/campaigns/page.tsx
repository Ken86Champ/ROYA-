import Link from "next/link";

export default function CampaignsPage() {
  return (
    <div className="p-8 max-w-[1400px]">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Kampagnen</h1>
          <p className="text-slate-400 text-sm mt-1">Automatische Reaktivierungskampagnen verwalten</p>
        </div>
        <Link href="/dashboard/campaigns/new" className="btn-primary flex items-center gap-2 text-sm">
          <span>+</span><span>Neue Kampagne</span>
        </Link>
      </div>
      <div className="glass-card p-4 mb-8 flex items-center gap-6">
        {[{ count: 0, label: "Aktiv", dot: "bg-emerald-400" }, { count: 0, label: "Pausiert", dot: "bg-amber-400" }, { count: 0, label: "Abgeschlossen", dot: "bg-slate-300" }].map((s, i) => (
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
      <div className="glass-card p-16 flex flex-col items-center justify-center text-center">
        <div className="w-20 h-20 rounded-3xl bg-violet-50 border border-violet-100 flex items-center justify-center mb-6">
          <span className="text-4xl text-violet-300">◎</span>
        </div>
        <h3 className="text-xl font-semibold text-slate-800 mb-2">Noch keine Kampagnen</h3>
        <p className="text-slate-400 text-sm max-w-md mb-8 leading-relaxed">Erstellen Sie Ihre erste autonome Reaktivierungskampagne. Importieren Sie CRM-Daten und lassen Sie 7 KI-Agents die Arbeit uebernehmen.</p>
        <Link href="/dashboard/campaigns/new" className="btn-primary flex items-center gap-2"><span>+</span><span>Erste Kampagne erstellen</span></Link>
        <div className="mt-10 flex items-center gap-3 text-slate-300 text-xs">
          <span>Import</span><span>→</span><span>Segmentierung</span><span>→</span><span>Outreach</span><span>→</span><span>Gespraech</span><span>→</span><span>Termin</span>
        </div>
      </div>
    </div>
  );
}
