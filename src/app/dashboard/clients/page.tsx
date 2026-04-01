"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import type { Client } from "@/lib/client-store";

const INDUSTRY_LABEL: Record<string, string> = {
  finance: "Finanzen", insurance: "Versicherung", real_estate: "Immobilien",
  consulting: "Beratung", tech: "Technologie", retail: "Handel", other: "Sonstiges",
};

const INDUSTRY_COLOR: Record<string, string> = {
  finance:     "bg-blue-50 text-blue-700 border-blue-200",
  insurance:   "bg-cyan-50 text-cyan-700 border-cyan-200",
  real_estate: "bg-amber-50 text-amber-700 border-amber-200",
  consulting:  "bg-violet-50 text-violet-700 border-violet-200",
  tech:        "bg-indigo-50 text-indigo-700 border-indigo-200",
  retail:      "bg-emerald-50 text-emerald-700 border-emerald-200",
  other:       "bg-slate-100 text-slate-600 border-slate-200",
};

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/clients").then(r => r.json()).then(d => {
      setClients(d);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const totalCampaigns = clients.reduce((s, c) => s + c.stats.totalCampaigns, 0);
  const activeCampaigns = clients.reduce((s, c) => s + c.stats.activeCampaigns, 0);
  const totalBooked = clients.reduce((s, c) => s + c.stats.totalBooked, 0);

  return (
    <div className="p-8 max-w-[1200px] overflow-auto h-full">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Endkunden</h1>
          <p className="text-slate-400 text-sm mt-1">Agentur-Clients und deren Kampagnen</p>
        </div>
        <Link href="/dashboard/clients/new" className="btn-primary flex items-center gap-2 text-sm px-4 py-2.5">
          <span>+</span><span>Endkunde hinzufügen</span>
        </Link>
      </div>

      {/* Stats bar */}
      <div className="glass-card p-4 mb-8 flex items-center gap-6 flex-wrap">
        {[
          { count: clients.length,  label: "Endkunden gesamt",   dot: "bg-slate-300" },
          { count: activeCampaigns, label: "Aktive Kampagnen",   dot: "bg-emerald-400" },
          { count: totalCampaigns,  label: "Kampagnen total",    dot: "bg-violet-400" },
          { count: totalBooked,     label: "Termine gebucht",    dot: "bg-cyan-400" },
        ].map((s, i) => (
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

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex gap-1.5">
            {["bg-violet-500","bg-cyan-500","bg-emerald-500"].map((c,i) => (
              <span key={i} className={`w-2.5 h-2.5 rounded-full ${c} animate-bounce`} style={{ animationDelay: `${i*0.15}s` }} />
            ))}
          </div>
        </div>
      ) : clients.length === 0 ? (
        <div className="glass-card p-16 flex flex-col items-center justify-center text-center">
          <div className="w-20 h-20 rounded-3xl bg-violet-50 border border-violet-100 flex items-center justify-center mb-6">
            <span className="text-4xl text-violet-300">◈</span>
          </div>
          <h3 className="text-xl font-semibold text-slate-800 mb-2">Noch keine Endkunden</h3>
          <p className="text-slate-400 text-sm max-w-md mb-8 leading-relaxed">
            Als Agentur können Sie hier Clients verwalten und deren Kampagnen unabhängig betreiben.
          </p>
          <Link href="/dashboard/clients/new" className="btn-primary flex items-center gap-2">
            <span>+</span><span>Ersten Endkunden erstellen</span>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {clients.map(client => {
            const industryColor = INDUSTRY_COLOR[client.industry] || INDUSTRY_COLOR.other;
            const initials = client.company.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();

            return (
              <div key={client.id} className="glass-card p-6 hover:shadow-md transition-all group">
                {/* Header */}
                <div className="flex items-start gap-3 mb-5">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center font-bold text-white text-sm shadow-md shadow-violet-200 shrink-0">
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="font-bold text-slate-900 truncate">{client.company}</h2>
                    <p className="text-xs text-slate-400 truncate">{client.contact}</p>
                  </div>
                  {client.industry && (
                    <span className={`text-[10px] font-semibold px-2 py-1 rounded-full border shrink-0 ${industryColor}`}>
                      {INDUSTRY_LABEL[client.industry] || client.industry}
                    </span>
                  )}
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-3 mb-5">
                  {[
                    { label: "Kampagnen", value: client.stats.totalCampaigns, color: "text-violet-600" },
                    { label: "Kontakte",  value: client.stats.totalContacts,  color: "text-slate-700" },
                    { label: "Termine",   value: client.stats.totalBooked,    color: "text-emerald-600" },
                  ].map(s => (
                    <div key={s.label} className="text-center p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                      <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* Activity indicator */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-1.5">
                    {client.stats.activeCampaigns > 0 ? (
                      <>
                        <span className="status-dot-green" />
                        <span className="text-xs text-emerald-600 font-medium">
                          {client.stats.activeCampaigns} aktive Kampagne{client.stats.activeCampaigns > 1 ? "n" : ""}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="w-2 h-2 rounded-full bg-slate-300" />
                        <span className="text-xs text-slate-400">Keine aktiven Kampagnen</span>
                      </>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-300">
                    {new Date(client.createdAt).toLocaleDateString("de-CH")}
                  </span>
                </div>

                {/* Contact info */}
                <div className="space-y-1.5 mb-5">
                  {client.email && (
                    <div className="flex items-center gap-2">
                      <span className="text-slate-300 text-xs w-4">✉</span>
                      <span className="text-xs text-slate-500 truncate">{client.email}</span>
                    </div>
                  )}
                  {client.phone && (
                    <div className="flex items-center gap-2">
                      <span className="text-slate-300 text-xs w-4">◊</span>
                      <span className="text-xs text-slate-500">{client.phone}</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-4 border-t border-slate-100">
                  <Link href="/dashboard/campaigns/new"
                    className="flex-1 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold text-center transition-all">
                    + Kampagne
                  </Link>
                  <Link href="/dashboard/campaigns"
                    className="flex-1 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium text-center transition-all">
                    Ansehen →
                  </Link>
                </div>

                {client.notes && (
                  <p className="mt-3 text-[11px] text-slate-400 italic line-clamp-2">{client.notes}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
