import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-violet-400 flex items-center justify-center text-white font-bold text-sm shadow-md shadow-violet-200">R</div>
          <span className="text-slate-900 font-semibold text-lg">ROYA</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-slate-500 hover:text-slate-800 text-sm font-medium transition-colors px-4 py-2">Dashboard</Link>
          <Link href="/dashboard/campaigns/new" className="btn-primary text-sm">Kostenlos starten</Link>
        </div>
      </nav>

      {/* Hero */}
      <div className="flex flex-col items-center justify-center px-4 pt-24 pb-16 text-center max-w-4xl mx-auto">
        {/* Badge */}
        <div className="mb-8 inline-flex items-center gap-2 bg-violet-50 border border-violet-200 rounded-full px-4 py-2">
          <span className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
          <span className="text-violet-600 text-sm font-medium">7 Autonome KI-Agents</span>
        </div>

        <h1 className="text-7xl font-bold mb-6 leading-tight">
          <span className="gradient-text">ROYA</span>
        </h1>
        <h2 className="text-3xl font-semibold text-slate-800 mb-4">Revenue Reactivation — Vollautomatisch</h2>
        <p className="text-lg text-slate-500 mb-4 max-w-2xl leading-relaxed">
          7 autonome KI-Agents reaktivieren Ihre inaktiven CRM-Kontakte, fuehren personalisierte Gespraeche und buchen qualifizierte Termine.
        </p>
        <p className="text-slate-400 mb-10 max-w-xl">Kein manueller Aufwand. Kein SDR-Team. Nur autonome KI, die Revenue generiert.</p>

        {/* CTAs */}
        <div className="flex gap-4 justify-center mb-20">
          <Link href="/dashboard" className="bg-violet-600 hover:bg-violet-700 text-white px-8 py-3.5 rounded-xl font-semibold transition-all duration-200 shadow-lg shadow-violet-200 text-base">
            Dashboard oeffnen
          </Link>
          <Link href="/dashboard/campaigns/new" className="bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-slate-300 text-slate-700 px-8 py-3.5 rounded-xl font-semibold transition-all duration-200 text-base">
            Kostenlos starten
          </Link>
        </div>

        {/* Stats */}
        <div className="flex items-center justify-center gap-8 mb-20">
          {[{ value: "700K+", label: "CH-Firmen" }, { value: "7", label: "KI-Agents" }, { value: "100%", label: "Vollautomatisch" }].map((stat, i) => (
            <div key={stat.label} className="flex items-center gap-8">
              <div className="text-center">
                <div className="text-2xl font-bold gradient-text">{stat.value}</div>
                <div className="text-slate-400 text-sm mt-1">{stat.label}</div>
              </div>
              {i < 2 && <div className="w-px h-8 bg-slate-200" />}
            </div>
          ))}
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-20 w-full">
          {[
            { icon: "◈", iconBg: "bg-violet-50", iconColor: "text-violet-600", border: "border-violet-100", title: "KI-Segmentierung", desc: "Analysiert und bewertet jeden Kontakt automatisch. Priorisiert die vielversprechendsten Leads." },
            { icon: "✎", iconBg: "bg-cyan-50", iconColor: "text-cyan-600", border: "border-cyan-100", title: "Personalisierte Outreach", desc: "Individuelle Nachrichten per E-Mail, SMS und WhatsApp — massgeschneidert fuer jeden Kontakt." },
            { icon: "◉", iconBg: "bg-emerald-50", iconColor: "text-emerald-600", border: "border-emerald-100", title: "Autonome Gespraeche", desc: "Sleeping Beauty Agent fuehrt natuerliche Gespraeche und bucht qualifizierte Termine." },
          ].map(f => (
            <div key={f.title} className="glass-card p-7 text-left hover:shadow-md transition-all duration-300 group">
              <div className={`w-12 h-12 rounded-xl ${f.iconBg} border ${f.border} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-200`}>
                <span className={`${f.iconColor} text-xl`}>{f.icon}</span>
              </div>
              <h3 className="font-semibold text-slate-800 text-lg mb-2">{f.title}</h3>
              <p className="text-slate-500 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* Workflow */}
        <div className="mb-16">
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-8">So funktioniert ROYA</h3>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            {[{ step: "01", label: "Import" }, { step: "02", label: "Segmentierung" }, { step: "03", label: "Outreach" }, { step: "04", label: "Gespraech" }, { step: "05", label: "Termin" }].map((s, i) => (
              <div key={s.step} className="flex items-center gap-3">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center">
                    <span className="text-violet-600 font-bold text-xs">{s.step}</span>
                  </div>
                  <span className="text-slate-500 text-xs font-medium">{s.label}</span>
                </div>
                {i < 4 && <div className="text-slate-300 text-lg mb-5">→</div>}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="bg-gradient-to-r from-violet-50 to-cyan-50 border border-violet-100 rounded-2xl p-10 text-center w-full">
          <h3 className="text-2xl font-semibold text-slate-800 mb-3">Bereit, Revenue zu reaktivieren?</h3>
          <p className="text-slate-500 mb-6">Starten Sie in 5 Minuten. Keine Kreditkarte erforderlich.</p>
          <Link href="/dashboard/campaigns/new" className="inline-flex bg-violet-600 hover:bg-violet-700 text-white px-8 py-3.5 rounded-xl font-semibold transition-all duration-200 shadow-lg shadow-violet-200">
            Jetzt starten
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-100 py-8 px-8 text-center">
        <p className="text-slate-400 text-sm">ROYA — Autonomous Revenue Reactivation Platform</p>
      </footer>
    </div>
  );
}
