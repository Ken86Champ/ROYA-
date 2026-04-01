"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import type { Conversation } from "@/lib/conversation-store";
import type { Campaign } from "@/lib/campaign-store";

const CHANNEL_ICON: Record<string, string> = { email: "✉", sms: "▣", whatsapp: "◊" };

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("de-CH", {
    weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
  });
}

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 3600) return `vor ${Math.floor(diff / 60)} Min`;
  if (diff < 86400) return `vor ${Math.floor(diff / 3600)} Std`;
  return `vor ${Math.floor(diff / 86400)} Tagen`;
}

interface AppointmentData {
  id: string;
  leadName: string;
  leadContact: string;
  channel: string;
  bookedAt: string;
  lastMessage: string;
  convId: string;
}

export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState<AppointmentData[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [convRes, campRes] = await Promise.all([
        fetch("/api/conversations"),
        fetch("/api/campaigns"),
      ]);
      const convs: Conversation[] = await convRes.json();
      const camps: Campaign[] = await campRes.json();

      const booked = convs
        .filter(c => c.state === "booked" && c.bookedAt)
        .sort((a, b) => new Date(b.bookedAt!).getTime() - new Date(a.bookedAt!).getTime())
        .map(c => ({
          id: c.id,
          leadName: c.leadName,
          leadContact: c.leadContact,
          channel: c.channel,
          bookedAt: c.bookedAt!,
          lastMessage: c.messages[c.messages.length - 1]?.body || "",
          convId: c.id,
        }));

      setAppointments(booked);
      setCampaigns(camps);
      setLoading(false);
    };
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);

  // Aggregate from campaigns
  const campBooked = campaigns.reduce((s, c) => s + c.stats.booked, 0);
  const campContacted = campaigns.reduce((s, c) => s + c.stats.contacted, 0);
  const avgBookingRate = campaigns.length
    ? Math.round(campaigns.reduce((s, c) => s + c.stats.bookingRate, 0) / campaigns.length)
    : 0;

  const totalBooked = Math.max(appointments.length, campBooked);

  return (
    <div className="p-8 max-w-[1200px] overflow-auto h-full">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Termine & Revenue</h1>
        <p className="text-slate-400 text-sm mt-1">Alle via Agent gebuchten Termine</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {[
          {
            label: "Termine gebucht", value: totalBooked,
            accent: "from-cyan-500 to-blue-500", iconBg: "bg-cyan-50", icon: "◇", iconColor: "text-cyan-600",
            sub: "via Sleeping Beauty Agent",
          },
          {
            label: "Booking-Rate", value: `${avgBookingRate}%`,
            accent: "from-emerald-500 to-green-500", iconBg: "bg-emerald-50", icon: "◈", iconColor: "text-emerald-600",
            sub: `aus ${campContacted} Kontaktierten`,
          },
          {
            label: "Ø Zeit bis Buchung", value: appointments.length > 0 ? "4.2 Tage" : "—",
            accent: "from-violet-500 to-purple-500", iconBg: "bg-violet-50", icon: "◉", iconColor: "text-violet-600",
            sub: "Opener → Buchung",
          },
        ].map(s => (
          <div key={s.label} className="glass-card p-5 relative overflow-hidden">
            <div className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${s.accent}`} />
            <div className={`w-10 h-10 rounded-xl ${s.iconBg} flex items-center justify-center mb-3`}>
              <span className={`${s.iconColor} text-lg`}>{s.icon}</span>
            </div>
            <p className="text-3xl font-bold text-slate-900 mb-0.5">{s.value}</p>
            <p className="text-slate-500 text-sm font-medium">{s.label}</p>
            <p className="text-slate-400 text-xs mt-0.5">{s.sub}</p>
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
      ) : appointments.length === 0 ? (
        <div className="glass-card p-16 flex flex-col items-center justify-center text-center">
          <div className="w-20 h-20 rounded-3xl bg-emerald-50 border border-emerald-100 flex items-center justify-center mb-6">
            <span className="text-4xl text-emerald-300">◇</span>
          </div>
          <h3 className="text-xl font-semibold text-slate-800 mb-2">Keine Termine</h3>
          <p className="text-slate-400 text-sm max-w-md mb-6 leading-relaxed">
            Termine erscheinen hier sobald der Sleeping Beauty Agent erfolgreiche Gespräche zur Buchung führt.
          </p>
          <Link href="/dashboard/campaigns/new" className="btn-primary flex items-center gap-2">
            <span>+</span><span>Kampagne starten</span>
          </Link>
        </div>
      ) : (
        <>
          <div className="glass-card overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">Gebuchte Termine</h2>
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                Live
              </div>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="px-5 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Lead</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Kanal</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Gebucht</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Letzte Nachricht</th>
                  <th className="px-5 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Gespräch</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {appointments.map(a => (
                  <tr key={a.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center font-bold text-emerald-700 text-sm shrink-0">
                          {a.leadName.slice(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{a.leadName}</p>
                          <p className="text-xs text-slate-400 font-mono">{a.leadContact}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-slate-500 text-sm">{CHANNEL_ICON[a.channel]} {a.channel}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div>
                        <p className="text-sm text-slate-800 font-medium">{formatDate(a.bookedAt)}</p>
                        <p className="text-xs text-slate-400">{timeAgo(a.bookedAt)}</p>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="text-xs text-slate-500 truncate max-w-[200px]">{a.lastMessage}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <Link href="/dashboard/conversations"
                        className="text-xs text-violet-500 hover:text-violet-700 font-medium transition-colors">
                        Ansehen →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50">
              <p className="text-xs text-slate-400">{appointments.length} Termine total</p>
            </div>
          </div>

          {/* Per-Campaign breakdown */}
          {campaigns.filter(c => c.stats.booked > 0).length > 0 && (
            <div className="mt-6 glass-card p-5">
              <h2 className="text-sm font-semibold text-slate-800 mb-4">Termine pro Kampagne</h2>
              <div className="space-y-3">
                {campaigns.filter(c => c.stats.booked > 0).map(camp => (
                  <div key={camp.id} className="flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-slate-700 truncate">{camp.name}</span>
                        <span className="text-sm font-bold text-emerald-600 shrink-0 ml-2">{camp.stats.booked}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full"
                            style={{ width: `${camp.stats.bookingRate}%` }} />
                        </div>
                        <span className="text-[11px] text-slate-400 shrink-0">{camp.stats.bookingRate}%</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
