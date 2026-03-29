"use client";
import { useState } from "react";

export default function SettingsPage() {
  const [saved, setSaved] = useState(false);
  const handleSave = () => { setSaved(true); setTimeout(() => setSaved(false), 2500); };
  const inp = "w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-800 text-sm placeholder-slate-300 focus:outline-none focus:border-violet-400 transition-colors";

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Einstellungen</h1>
        <p className="text-slate-400 text-sm mt-1">API-Verbindungen und Agent-Konfiguration</p>
      </div>
      <div className="space-y-4">
        {[
          { icon: "◎", bg: "bg-violet-50", border: "border-violet-100", color: "text-violet-600", title: "Anthropic Claude API", sub: "KI-Agent Engine", connected: true,
            fields: [{ label: "API Key", type: "password", placeholder: "sk-ant-..." }] },
          { icon: "◉", bg: "bg-emerald-50", border: "border-emerald-100", color: "text-emerald-600", title: "Supabase Datenbank", sub: "Datenspeicher & Auth", connected: false,
            fields: [{ label: "Supabase URL", type: "text", placeholder: "https://xxx.supabase.co" }, { label: "Anon Key", type: "password", placeholder: "eyJ..." }] },
          { icon: "◊", bg: "bg-cyan-50", border: "border-cyan-100", color: "text-cyan-600", title: "Twilio (SMS / WhatsApp)", sub: "Messaging-Kanaele", connected: false,
            fields: [{ label: "Account SID", type: "text", placeholder: "AC..." }, { label: "Auth Token", type: "password", placeholder: "..." }] },
          { icon: "✎", bg: "bg-amber-50", border: "border-amber-100", color: "text-amber-600", title: "Mailgun (E-Mail)", sub: "E-Mail-Versand", connected: false,
            fields: [{ label: "API Key", type: "password", placeholder: "key-..." }, { label: "Domain", type: "text", placeholder: "mg.yourdomain.com" }] },
        ].map(card => (
          <div key={card.title} className="glass-card p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-10 h-10 rounded-xl ${card.bg} border ${card.border} flex items-center justify-center`}>
                <span className={`${card.color} text-lg`}>{card.icon}</span>
              </div>
              <div>
                <h2 className="font-semibold text-slate-800 text-sm">{card.title}</h2>
                <p className="text-slate-400 text-xs">{card.sub}</p>
              </div>
              {card.connected && (
                <div className="ml-auto flex items-center gap-2">
                  <span className="status-dot-green" />
                  <span className="text-emerald-600 text-xs font-medium">Verbunden</span>
                </div>
              )}
            </div>
            <div className="space-y-3">
              {card.fields.map(f => (
                <div key={f.label}>
                  <label className="text-xs text-slate-500 block mb-1.5">{f.label}</label>
                  <input type={f.type} placeholder={f.placeholder} defaultValue={f.label === "API Key" && card.connected ? "sk-ant-..." : ""} className={inp} />
                </div>
              ))}
            </div>
          </div>
        ))}

        <button onClick={handleSave} className={`w-full py-3 rounded-xl font-medium text-sm transition-all text-white ${saved ? "bg-emerald-500" : "bg-violet-600 hover:bg-violet-700"}`}>
          {saved ? "✓ Gespeichert" : "Einstellungen speichern"}
        </button>
      </div>
    </div>
  );
}
