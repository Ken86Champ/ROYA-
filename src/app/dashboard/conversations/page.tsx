export default function ConversationsPage() {
  return (
    <div className="p-8 max-w-[1400px]">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Gespraeche</h1>
          <p className="text-slate-400 text-sm mt-1">Sleeping Beauty Agent — Aktive Konversationen</p>
        </div>
        <span className="badge bg-slate-100 text-slate-500">0 aktive Gespraeche</span>
      </div>
      <div className="glass-card p-4 mb-8 flex items-center gap-6">
        {[{ count: 0, label: "Offen", dot: "bg-amber-400" }, { count: 0, label: "Antwort erhalten", dot: "bg-emerald-400" }, { count: 0, label: "Termin gebucht", dot: "bg-cyan-400" }].map((s, i) => (
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
        <div className="w-20 h-20 rounded-3xl bg-indigo-50 border border-indigo-100 flex items-center justify-center mb-6"><span className="text-4xl text-indigo-300">◎</span></div>
        <h3 className="text-xl font-semibold text-slate-800 mb-2">Sleeping Beauty wartet</h3>
        <p className="text-slate-400 text-sm max-w-md mb-8 leading-relaxed">Der Agent fuehrt autonome Gespraeche sobald Kontakte auf Outreach-Nachrichten antworten.</p>
        <a href="/dashboard/campaigns/new" className="btn-primary flex items-center gap-2"><span>+</span><span>Kampagne starten</span></a>
      </div>
    </div>
  );
}
