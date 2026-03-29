export default function ContactsPage() {
  return (
    <div className="p-8 max-w-[1400px]">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Kontakte</h1>
          <p className="text-slate-400 text-sm mt-1">Importierte CRM-Kontakte aller Kampagnen</p>
        </div>
        <input type="text" placeholder="Kontakt suchen..." className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm text-slate-700 placeholder-slate-300 focus:outline-none focus:border-violet-400 w-64 transition-colors" />
      </div>
      <div className="glass-card p-4 mb-8 flex items-center gap-6">
        {[{ count: 0, label: "Gesamt", dot: "bg-slate-300" }, { count: 0, label: "Aktiv", dot: "bg-emerald-400" }, { count: 0, label: "Kontaktiert", dot: "bg-violet-400" }, { count: 0, label: "Termin gebucht", dot: "bg-cyan-400" }].map((s, i) => (
          <div key={s.label} className="flex items-center gap-6">
            <div className="flex items-center gap-2.5">
              <span className={`w-2 h-2 rounded-full ${s.dot}`} />
              <span className="text-slate-900 font-semibold text-sm">{s.count}</span>
              <span className="text-slate-400 text-sm">{s.label}</span>
            </div>
            {i < 3 && <div className="w-px h-5 bg-slate-200" />}
          </div>
        ))}
      </div>
      <div className="glass-card p-16 flex flex-col items-center justify-center text-center">
        <div className="w-20 h-20 rounded-3xl bg-cyan-50 border border-cyan-100 flex items-center justify-center mb-6"><span className="text-4xl text-cyan-300">◉</span></div>
        <h3 className="text-xl font-semibold text-slate-800 mb-2">Noch keine Kontakte</h3>
        <p className="text-slate-400 text-sm max-w-md mb-8 leading-relaxed">Kontakte werden automatisch importiert wenn Sie eine Kampagne mit CSV-Datei starten.</p>
        <a href="/dashboard/campaigns/new" className="btn-primary flex items-center gap-2"><span>+</span><span>Erste Kampagne starten</span></a>
      </div>
    </div>
  );
}
