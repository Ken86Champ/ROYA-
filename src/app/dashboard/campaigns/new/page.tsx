"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

export default function NewCampaignPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(1);
  const [launching, setLaunching] = useState(false);
  const [form, setForm] = useState({ name: "", clientId: "", channels: [] as string[], file: null as File | null });

  const toggleChannel = (ch: string) =>
    setForm(f => ({ ...f, channels: f.channels.includes(ch) ? f.channels.filter(c => c !== ch) : [...f.channels, ch] }));
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, file: e.target.files?.[0] ?? null }));
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0] ?? null;
    if (file?.name.endsWith(".csv")) setForm(f => ({ ...f, file }));
  };
  const handleLaunch = () => { setLaunching(true); setTimeout(() => router.push("/dashboard/campaigns"), 1800); };

  const steps = ["Einrichten", "Import", "Starten"];
  const inp = "w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-800 text-sm placeholder-slate-300 focus:outline-none focus:border-violet-400 transition-colors";

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <button onClick={() => router.push("/dashboard/campaigns")} className="text-slate-400 hover:text-slate-700 text-sm flex items-center gap-2 mb-4 transition-colors">← Zurueck</button>
        <h1 className="text-2xl font-bold text-slate-900">Neue Kampagne</h1>
        <p className="text-slate-400 text-sm mt-1">Autonome Reaktivierungskampagne einrichten</p>
      </div>

      <div className="flex items-center mb-8">
        {steps.map((label, i) => {
          const s = i + 1; const done = s < step; const active = s === step;
          return (
            <div key={label} className="flex items-center flex-1 last:flex-none">
              <div className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${done ? "bg-emerald-500 text-white" : active ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-400"}`}>
                  {done ? "✓" : s}
                </div>
                <span className={`text-xs font-medium whitespace-nowrap ${active ? "text-slate-800" : done ? "text-slate-500" : "text-slate-300"}`}>{label}</span>
              </div>
              {i < steps.length - 1 && <div className={`flex-1 h-px mx-3 ${s < step ? "bg-emerald-300" : "bg-slate-200"}`} />}
            </div>
          );
        })}
      </div>

      {step === 1 && (
        <div className="glass-card p-6 space-y-5">
          <h2 className="text-base font-semibold text-slate-800">Kampagne einrichten</h2>
          <div>
            <label className="text-xs text-slate-500 block mb-1.5">Kampagnen-Name *</label>
            <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="z.B. Q2 2026 Reaktivierung" className={inp} />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1.5">Endkunde</label>
            <select value={form.clientId} onChange={e => setForm(f => ({ ...f, clientId: e.target.value }))} className={inp}>
              <option value="">Endkunden waehlen (optional)</option>
              <option value="demo">Demo AG</option>
            </select>
          </div>
          <button onClick={() => setStep(2)} disabled={!form.name} className="w-full btn-primary py-3 text-sm disabled:opacity-40 disabled:cursor-not-allowed">Weiter</button>
        </div>
      )}

      {step === 2 && (
        <div className="glass-card p-6 space-y-5">
          <h2 className="text-base font-semibold text-slate-800">CRM-Kontakte importieren</h2>
          <div onClick={() => fileRef.current?.click()} onDrop={handleDrop} onDragOver={e => e.preventDefault()}
            className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${form.file ? "border-emerald-300 bg-emerald-50" : "border-slate-200 hover:border-violet-300 hover:bg-violet-50"}`}>
            <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} className="hidden" />
            {form.file ? (
              <>
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 border border-emerald-200 flex items-center justify-center mx-auto mb-3"><span className="text-emerald-600 text-xl">✓</span></div>
                <p className="text-slate-800 font-medium text-sm">{form.file.name}</p>
                <p className="text-slate-400 text-xs mt-1">{(form.file.size / 1024).toFixed(0)} KB — Klicken zum Ersetzen</p>
              </>
            ) : (
              <>
                <div className="w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center mx-auto mb-3"><span className="text-slate-400 text-xl">↑</span></div>
                <p className="text-slate-700 font-medium text-sm">CSV hochladen</p>
                <p className="text-slate-400 text-xs mt-1">Klicken oder Datei hierher ziehen</p>
              </>
            )}
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-2">Kanaele *</label>
            <div className="flex gap-3">
              {[{ id: "email", label: "E-Mail" }, { id: "sms", label: "SMS" }, { id: "whatsapp", label: "WhatsApp" }].map(ch => (
                <button key={ch.id} onClick={() => toggleChannel(ch.id)}
                  className={`flex-1 py-2.5 rounded-xl border text-xs font-medium transition-all ${form.channels.includes(ch.id) ? "bg-violet-600 border-violet-600 text-white" : "border-slate-200 text-slate-500 bg-slate-50 hover:border-violet-300"}`}>
                  {ch.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep(1)} className="flex-1 btn-secondary py-2.5 text-sm">Zurueck</button>
            <button onClick={() => setStep(3)} disabled={form.channels.length === 0} className="flex-1 btn-primary py-2.5 text-sm disabled:opacity-40 disabled:cursor-not-allowed">Weiter</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="glass-card p-6 space-y-5">
          <h2 className="text-base font-semibold text-slate-800">Kampagne starten</h2>
          <div className="bg-slate-50 border border-slate-200 rounded-xl divide-y divide-slate-100">
            {[
              { label: "Kampagne", value: form.name },
              { label: "Kanaele", value: form.channels.map(c => c.toUpperCase()).join(", ") || "—" },
              { label: "Datei", value: form.file?.name ?? "Keine Datei" },
              { label: "Agents", value: null },
            ].map(row => (
              <div key={row.label} className="flex justify-between items-center px-4 py-3 text-sm">
                <span className="text-slate-500">{row.label}</span>
                {row.value !== null ? <span className="text-slate-800 font-medium">{row.value}</span> : (
                  <span className="text-emerald-600 font-medium flex items-center gap-1.5"><span className="status-dot-green" />7 bereit</span>
                )}
              </div>
            ))}
          </div>
          <div className="bg-violet-50 border border-violet-100 rounded-xl p-4">
            <p className="text-violet-600 text-xs leading-relaxed">Die 7 KI-Agents starten sofort: Segmentierung → Outreach → Gespraeche → Terminbuchung.</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep(2)} disabled={launching} className="flex-1 btn-secondary py-2.5 text-sm disabled:opacity-40">Zurueck</button>
            <button onClick={handleLaunch} disabled={launching}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all text-white ${launching ? "bg-emerald-500" : "bg-emerald-600 hover:bg-emerald-500"}`}>
              {launching ? "Wird gestartet..." : "Kampagne starten"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
