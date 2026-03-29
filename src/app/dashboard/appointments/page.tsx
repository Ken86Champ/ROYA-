export default function AppointmentsPage() {
  return (
    <div className="p-8 max-w-[1400px]">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Termine & Revenue</h1>
        <p className="text-slate-400 text-sm mt-1">Gebuchte Termine, Deal-Werte und Provisionen</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {[
          { label: "Termine gesamt", value: "0", accent: "from-cyan-500 to-blue-500", iconBg: "bg-cyan-50", icon: "◇", iconColor: "text-cyan-600" },
          { label: "Revenue reaktiviert", value: "CHF 0", accent: "from-emerald-500 to-green-500", iconBg: "bg-emerald-50", icon: "◈", iconColor: "text-emerald-600" },
          { label: "Provisionen offen", value: "CHF 0", accent: "from-amber-500 to-orange-500", iconBg: "bg-amber-50", icon: "◉", iconColor: "text-amber-600" },
        ].map(s => (
          <div key={s.label} className="glass-card p-5 relative overflow-hidden">
            <div className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${s.accent}`} />
            <div className={`w-10 h-10 rounded-xl ${s.iconBg} flex items-center justify-center mb-3`}><span className={`${s.iconColor} text-lg`}>{s.icon}</span></div>
            <p className="text-3xl font-bold text-slate-900 mb-1">{s.value}</p>
            <p className="text-slate-400 text-sm">{s.label}</p>
          </div>
        ))}
      </div>
      <div className="glass-card p-16 flex flex-col items-center justify-center text-center">
        <div className="w-20 h-20 rounded-3xl bg-emerald-50 border border-emerald-100 flex items-center justify-center mb-6"><span className="text-4xl text-emerald-300">◇</span></div>
        <h3 className="text-xl font-semibold text-slate-800 mb-2">Keine Termine</h3>
        <p className="text-slate-400 text-sm max-w-md leading-relaxed">Termine werden automatisch gebucht sobald der Booking Agent erfolgreiche Gespraeche abschliesst.</p>
      </div>
    </div>
  );
}
