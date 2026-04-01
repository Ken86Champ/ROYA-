"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import type { Campaign, CampaignContact } from "@/lib/campaign-store";

const STATUS_META: Record<string, { label: string; dot: string; badge: string }> = {
  pending:    { label: "Ausstehend",   dot: "bg-slate-300",   badge: "bg-slate-100 text-slate-500 border-slate-200" },
  contacted:  { label: "Kontaktiert",  dot: "bg-violet-400",  badge: "bg-violet-50 text-violet-700 border-violet-200" },
  replied:    { label: "Geantwortet",  dot: "bg-blue-400",    badge: "bg-blue-50 text-blue-700 border-blue-200" },
  interested: { label: "Interessiert", dot: "bg-amber-400",   badge: "bg-amber-50 text-amber-700 border-amber-200" },
  booked:     { label: "Termin",       dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  closed:     { label: "Geschlossen",  dot: "bg-slate-300",   badge: "bg-slate-100 text-slate-500 border-slate-200" },
  opted_out:  { label: "Abgemeldet",   dot: "bg-red-400",     badge: "bg-red-50 text-red-600 border-red-200" },
};

const CHANNEL_ICON: Record<string, string> = { email: "✉", sms: "▣", whatsapp: "◊" };

interface FlatContact extends CampaignContact {
  campaignName: string;
  campaignId: string;
}

function timeAgo(iso?: string) {
  if (!iso) return "—";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "gerade";
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<FlatContact[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = () =>
      fetch("/api/campaigns").then(r => r.json()).then((camps: Campaign[]) => {
        const flat: FlatContact[] = camps.flatMap(camp =>
          camp.contacts.map(c => ({ ...c, campaignName: camp.name, campaignId: camp.id }))
        );
        setContacts(flat);
        setLoading(false);
      }).catch(() => setLoading(false));
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, []);

  const filtered = contacts.filter(c => {
    const matchSearch = !search || [c.name, c.contact, c.campaignName].some(
      s => s.toLowerCase().includes(search.toLowerCase())
    );
    const matchStatus = statusFilter === "all" || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const counts: Record<string, number> = { all: contacts.length };
  contacts.forEach(c => { counts[c.status] = (counts[c.status] || 0) + 1; });

  return (
    <div className="p-8 max-w-[1200px] overflow-auto h-full">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Kontakte</h1>
          <p className="text-slate-400 text-sm mt-1">Alle Kontakte aus laufenden Kampagnen</p>
        </div>
        <div className="flex items-center gap-3">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Name, E-Mail, Kampagne…"
            className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm text-slate-700 placeholder-slate-300 focus:outline-none focus:border-violet-400 w-60 transition-colors" />
          <Link href="/dashboard/campaigns/new" className="btn-primary text-sm px-4 py-2">
            + Kampagne
          </Link>
        </div>
      </div>

      {/* Stat bar */}
      <div className="glass-card p-4 mb-6 flex items-center gap-3 flex-wrap">
        {[
          { key: "all",       label: "Gesamt",      dot: "bg-slate-300" },
          { key: "contacted", label: "Kontaktiert", dot: "bg-violet-400" },
          { key: "replied",   label: "Geantwortet", dot: "bg-blue-400" },
          { key: "interested",label: "Interessiert",dot: "bg-amber-400" },
          { key: "booked",    label: "Termin",       dot: "bg-emerald-500" },
          { key: "opted_out", label: "Abgemeldet",  dot: "bg-red-400" },
        ].map((s, i, arr) => (
          <div key={s.key} className="flex items-center gap-4">
            <button onClick={() => setStatusFilter(s.key)}
              className={`flex items-center gap-2 px-2.5 py-1 rounded-lg text-sm transition-all ${
                statusFilter === s.key ? "bg-slate-100 font-semibold text-slate-800" : "text-slate-500 hover:text-slate-700"
              }`}>
              <span className={`w-2 h-2 rounded-full ${s.dot}`} />
              <span className="font-semibold">{counts[s.key] ?? 0}</span>
              <span>{s.label}</span>
            </button>
            {i < arr.length - 1 && <div className="w-px h-5 bg-slate-200" />}
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
      ) : filtered.length === 0 ? (
        <div className="glass-card p-16 flex flex-col items-center justify-center text-center">
          <div className="w-20 h-20 rounded-3xl bg-cyan-50 border border-cyan-100 flex items-center justify-center mb-6">
            <span className="text-4xl text-cyan-300">◉</span>
          </div>
          <h3 className="text-xl font-semibold text-slate-800 mb-2">
            {search || statusFilter !== "all" ? "Keine Ergebnisse" : "Noch keine Kontakte"}
          </h3>
          <p className="text-slate-400 text-sm max-w-md mb-6 leading-relaxed">
            {search || statusFilter !== "all"
              ? "Filter oder Suche anpassen."
              : "Kontakte werden automatisch hinzugefügt wenn Sie eine Kampagne mit CSV starten."}
          </p>
          {!search && statusFilter === "all" && (
            <Link href="/dashboard/campaigns/new" className="btn-primary flex items-center gap-2">
              <span>+</span><span>Erste Kampagne starten</span>
            </Link>
          )}
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Kontakt</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Kanal</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Kampagne</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Letzter Kontakt</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Gespräch</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(c => {
                const st = STATUS_META[c.status];
                return (
                  <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-violet-100 flex items-center justify-center font-bold text-violet-700 text-sm shrink-0">
                          {c.name.slice(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{c.name}</p>
                          <p className="text-xs text-slate-400 font-mono">{c.contact}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-slate-500 text-sm">{CHANNEL_ICON[c.channel]} {c.channel}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${st.badge}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />{st.label}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs text-slate-500 truncate max-w-[160px] block">{c.campaignName}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs text-slate-400">{timeAgo(c.lastContactedAt)}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      {c.convId ? (
                        <Link href="/dashboard/conversations"
                          className="text-xs text-violet-500 hover:text-violet-700 font-medium transition-colors">
                          Ansehen →
                        </Link>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
            <p className="text-xs text-slate-400">{filtered.length} Kontakte</p>
            {search && <button onClick={() => setSearch("")} className="text-xs text-violet-500 hover:text-violet-700">Filter zurücksetzen</button>}
          </div>
        </div>
      )}
    </div>
  );
}
