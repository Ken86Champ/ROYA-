"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewClientPage() {
  const router = useRouter();
  const [form, setForm] = useState({ company: "", contact: "", email: "", phone: "", industry: "", notes: "" });
  const [saved, setSaved] = useState(false);
  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); setSaved(true); setTimeout(() => router.push("/dashboard/clients"), 1200); };
  const inp = "w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-800 text-sm placeholder-slate-300 focus:outline-none focus:border-violet-400 transition-colors";

  return (
    <div className="p-8 max-w-xl">
      <div className="mb-8">
        <button onClick={() => router.push("/dashboard/clients")} className="text-slate-400 hover:text-slate-700 text-sm flex items-center gap-2 mb-4 transition-colors">← Zurueck</button>
        <h1 className="text-2xl font-bold text-slate-900">Neuer Endkunde</h1>
        <p className="text-slate-400 text-sm mt-1">Kundenprofil anlegen</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="glass-card p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Unternehmen</h2>
          <div><label className="text-xs text-slate-500 block mb-1.5">Firmenname *</label><input type="text" value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} placeholder="z.B. Muster AG" className={inp} required /></div>
          <div><label className="text-xs text-slate-500 block mb-1.5">Branche</label>
            <select value={form.industry} onChange={e => setForm(f => ({ ...f, industry: e.target.value }))} className={inp}>
              <option value="">Branche waehlen...</option>
              <option value="finance">Finanzdienstleistungen</option>
              <option value="insurance">Versicherung</option>
              <option value="real_estate">Immobilien</option>
              <option value="consulting">Beratung</option>
              <option value="tech">Technologie</option>
              <option value="retail">Handel</option>
              <option value="other">Sonstiges</option>
            </select>
          </div>
        </div>
        <div className="glass-card p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Ansprechpartner</h2>
          <div><label className="text-xs text-slate-500 block mb-1.5">Name</label><input type="text" value={form.contact} onChange={e => setForm(f => ({ ...f, contact: e.target.value }))} placeholder="Vor- und Nachname" className={inp} /></div>
          <div><label className="text-xs text-slate-500 block mb-1.5">E-Mail *</label><input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="kontakt@firma.ch" className={inp} required /></div>
          <div><label className="text-xs text-slate-500 block mb-1.5">Telefon</label><input type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+41 79 000 00 00" className={inp} /></div>
        </div>
        <div className="glass-card p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Notizen</h2>
          <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Interne Notizen..." rows={3} className={`${inp} resize-none`} />
        </div>
        <button type="submit" disabled={!form.company || !form.email || saved}
          className={`w-full py-3 rounded-xl text-sm font-medium transition-all text-white ${saved ? "bg-emerald-500" : "bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed"}`}>
          {saved ? "✓ Gespeichert — Weiterleitung..." : "Endkunde erstellen"}
        </button>
      </form>
    </div>
  );
}
