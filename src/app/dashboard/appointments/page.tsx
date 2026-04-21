"use client";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import type { Campaign, CampaignContact } from "@/lib/campaign-types";

// ── Types ───────────────────────────────────────────────────────────────────

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
  source: "google" | "roya";
}

interface BookedContact extends CampaignContact {
  campaignId: string;
  campaignName: string;
}

const DAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const HOURS = Array.from({ length: 12 }, (_, i) => i + 7); // 07:00 – 18:00

// ── Helpers ─────────────────────────────────────────────────────────────────

function getWeekDays(offset: number): Date[] {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset + offset * 7);
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isToday(d: Date): boolean {
  return isSameDay(d, new Date());
}

function formatDateHeader(d: Date): string {
  return `${d.getDate().toString().padStart(2, "0")}.${(d.getMonth() + 1).toString().padStart(2, "0")}.`;
}

function timeStr(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

function timeAgo(iso?: string) {
  if (!iso) return "—";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "gerade eben";
  if (diff < 3600) return `vor ${Math.floor(diff / 60)} Min`;
  if (diff < 86400) return `vor ${Math.floor(diff / 3600)} Std`;
  return `vor ${Math.floor(diff / 86400)} Tagen`;
}

// ── Event position helpers ──────────────────────────────────────────────────

function eventTop(iso: string): number {
  const d = new Date(iso);
  const minutes = (d.getHours() - 7) * 60 + d.getMinutes();
  return Math.max(0, (minutes / 60) * 64); // 64px per hour
}

function eventHeight(startIso: string, endIso: string): number {
  const s = new Date(startIso).getTime();
  const e = new Date(endIso).getTime();
  const minutes = Math.max(15, (e - s) / 60000);
  return (minutes / 60) * 64;
}

// ── Color helpers ───────────────────────────────────────────────────────────

// Google Calendar events — blue palette
const GOOGLE_COLORS = [
  { bg: "bg-blue-100", border: "border-blue-300", text: "text-blue-800" },
  { bg: "bg-cyan-100", border: "border-cyan-300", text: "text-cyan-800" },
  { bg: "bg-sky-100", border: "border-sky-300", text: "text-sky-800" },
  { bg: "bg-indigo-100", border: "border-indigo-300", text: "text-indigo-800" },
];

// ROYA booked events — distinct purple/violet palette with ROYA badge
const ROYA_COLORS = { bg: "bg-violet-200", border: "border-violet-400", text: "text-violet-900" };

function getGoogleColor(index: number) {
  return GOOGLE_COLORS[index % GOOGLE_COLORS.length];
}

// ── Component ───────────────────────────────────────────────────────────────

export default function AppointmentsPage() {
  const [booked, setBooked] = useState<BookedContact[]>([]);
  const [calEvents, setCalEvents] = useState<CalendarEvent[]>([]);
  const [calConnected, setCalConnected] = useState(false);
  const [calEmail, setCalEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [search, setSearch] = useState("");
  const [authReady, setAuthReady] = useState(false);

  const weekDays = useMemo(() => getWeekDays(weekOffset), [weekOffset]);

  // Acquire auth cookie on mount (for secured calendar API)
  useEffect(() => {
    fetch("/api/calendar/auth-token", { method: "POST" })
      .then(() => setAuthReady(true))
      .catch(() => setAuthReady(true));
  }, []);

  // Load booked contacts
  useEffect(() => {
    fetch("/api/campaigns")
      .then(r => r.json())
      .then((campaigns: Campaign[]) => {
        const all: BookedContact[] = [];
        for (const camp of campaigns) {
          for (const c of camp.contacts) {
            if (c.status === "booked") {
              all.push({ ...c, campaignId: camp.id, campaignName: camp.name });
            }
          }
        }
        all.sort((a, b) => (b.lastContactedAt || "").localeCompare(a.lastContactedAt || ""));
        setBooked(all);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Load Google Calendar events (wait for auth cookie)
  useEffect(() => {
    if (!authReady) return;
    fetch(`/api/calendar/events?weekOffset=${weekOffset}`)
      .then(r => r.json())
      .then(data => {
        setCalConnected(!!data.connected);
        setCalEmail(data.calendarEmail || "");
        setCalEvents(data.events || []);
      })
      .catch(() => {});
  }, [weekOffset, authReady]);

  // Merge ROYA booked contacts as calendar events
  const allCalEvents = useMemo(() => {
    const royaEvents: CalendarEvent[] = booked
      .filter(c => c.lastContactedAt)
      .map(c => ({
        id: `roya-${c.id}`,
        title: `ROYA · ${c.name}`,
        start: c.lastContactedAt!,
        end: new Date(new Date(c.lastContactedAt!).getTime() + 30 * 60000).toISOString(),
        allDay: false,
        source: "roya" as const,
      }));
    return [...calEvents, ...royaEvents];
  }, [calEvents, booked]);

  // Group calendar events by day
  const eventsByDay = useMemo(() => {
    const map = new Map<number, CalendarEvent[]>();
    for (let i = 0; i < 7; i++) map.set(i, []);
    for (const ev of allCalEvents) {
      const evDate = new Date(ev.start);
      for (let i = 0; i < 7; i++) {
        if (isSameDay(evDate, weekDays[i])) {
          map.get(i)!.push(ev);
          break;
        }
      }
    }
    return map;
  }, [allCalEvents, weekDays]);

  // Week label
  const weekLabel = `${formatDateHeader(weekDays[0])} – ${formatDateHeader(weekDays[6])} ${weekDays[6].getFullYear()}`;

  // Export CSV
  const exportCSV = () => {
    const headers = ["Name", "Kontakt", "Kanal", "Kampagne", "Letzter Kontakt"];
    const rows = booked.map(c => [
      c.name, c.contact, c.channel, c.campaignName,
      c.lastContactedAt ? new Date(c.lastContactedAt).toLocaleDateString("de-CH") : "—",
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `termine-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Today line position
  const now = new Date();
  const nowMinutes = (now.getHours() - 7) * 60 + now.getMinutes();
  const nowTop = Math.max(0, (nowMinutes / 60) * 64);
  const showNowLine = nowMinutes >= 0 && nowMinutes <= 12 * 60;
  const todayIndex = weekDays.findIndex(d => isToday(d));

  return (
    <div className="p-8 max-w-[1400px] overflow-auto h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Termine</h1>
          <p className="text-slate-400 text-sm mt-1">
            {calConnected
              ? <span>Google Calendar verbunden · <span className="font-mono text-slate-500">{calEmail}</span></span>
              : "Gebuchte Kontakte aus allen Kampagnen"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View Toggle */}
          <div className="flex p-1 bg-slate-100 rounded-xl">
            <button onClick={() => setView("calendar")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${view === "calendar" ? "bg-white text-slate-900 shadow-sm" : "text-slate-400"}`}>
              Kalender
            </button>
            <button onClick={() => setView("list")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${view === "list" ? "bg-white text-slate-900 shadow-sm" : "text-slate-400"}`}>
              Liste
            </button>
          </div>
          <button onClick={exportCSV} disabled={booked.length === 0}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all disabled:opacity-40">
            ↓ CSV
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="glass-card p-4 text-center">
          <p className="text-3xl font-bold text-emerald-600">{booked.length}</p>
          <p className="text-xs text-slate-400 mt-1">ROYA Termine</p>
        </div>
        <div className="glass-card p-4 text-center">
          <p className="text-3xl font-bold text-blue-600">{calEvents.length}</p>
          <p className="text-xs text-slate-400 mt-1">Google Events diese Woche</p>
        </div>
        <div className="glass-card p-4 text-center">
          <p className={`text-3xl font-bold ${calConnected ? "text-emerald-600" : "text-slate-300"}`}>
            {calConnected ? "✓" : "—"}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {calConnected ? "Kalender verbunden" : (
              <Link href="/dashboard/settings?tab=calendars" className="text-violet-500 hover:underline">Kalender verbinden →</Link>
            )}
          </p>
        </div>
      </div>

      {/* ── Calendar View ── */}
      {view === "calendar" && (
        <div className="glass-card overflow-hidden">
          {/* Week Navigation */}
          <div className="flex items-center justify-between px-6 py-3 border-b border-slate-100 bg-slate-50/50">
            <button onClick={() => setWeekOffset(w => w - 1)}
              className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-100 transition-colors text-slate-500 text-sm font-bold">
              ‹
            </button>
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-slate-800">{weekLabel}</span>
              {weekOffset !== 0 && (
                <button onClick={() => setWeekOffset(0)}
                  className="px-2 py-0.5 rounded-md bg-violet-100 text-violet-600 text-[10px] font-bold hover:bg-violet-200 transition-colors">
                  Heute
                </button>
              )}
            </div>
            <button onClick={() => setWeekOffset(w => w + 1)}
              className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-100 transition-colors text-slate-500 text-sm font-bold">
              ›
            </button>
          </div>

          {/* Day Headers */}
          <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-slate-100">
            <div className="p-2" /> {/* time gutter */}
            {weekDays.map((d, i) => (
              <div key={i} className={`p-2 text-center border-l border-slate-100 ${isToday(d) ? "bg-violet-50" : ""}`}>
                <p className={`text-[10px] font-bold ${isToday(d) ? "text-violet-600" : "text-slate-400"}`}>
                  {DAY_LABELS[i]}
                </p>
                <p className={`text-lg font-bold ${isToday(d) ? "text-violet-600" : "text-slate-700"}`}>
                  {d.getDate()}
                </p>
              </div>
            ))}
          </div>

          {/* Calendar not connected hint */}
          {!calConnected && (
            <div className="px-6 py-3 bg-amber-50 border-b border-amber-100 flex items-center gap-3">
              <span className="text-amber-500 text-sm">⚠</span>
              <p className="text-xs text-amber-700">
                Google Calendar nicht verbunden.{" "}
                <Link href="/dashboard/settings" className="font-semibold underline hover:text-amber-900">
                  Jetzt verbinden
                </Link>{" "}
                um deine echten Termine hier zu sehen.
              </p>
            </div>
          )}

          {/* Time Grid */}
          <div className="grid grid-cols-[60px_repeat(7,1fr)] relative overflow-y-auto" style={{ maxHeight: "640px" }}>
            {/* Hour labels + grid */}
            <div className="relative">
              {HOURS.map(h => (
                <div key={h} className="h-16 flex items-start justify-end pr-2 pt-0.5">
                  <span className="text-[10px] text-slate-300 font-mono">{h.toString().padStart(2, "0")}:00</span>
                </div>
              ))}
            </div>

            {/* Day columns */}
            {weekDays.map((day, dayIdx) => {
              const dayEvents = eventsByDay.get(dayIdx) || [];
              return (
                <div key={dayIdx} className={`relative border-l border-slate-100 ${isToday(day) ? "bg-violet-50/30" : ""}`}>
                  {/* Hour grid lines */}
                  {HOURS.map(h => (
                    <div key={h} className="h-16 border-b border-slate-50" />
                  ))}

                  {/* Events */}
                  {dayEvents.filter(e => !e.allDay).map((ev, evIdx) => {
                    const isRoya = ev.source === "roya";
                    const color = isRoya ? ROYA_COLORS : getGoogleColor(evIdx);
                    const top = eventTop(ev.start);
                    const height = eventHeight(ev.start, ev.end);
                    return (
                      <div
                        key={ev.id}
                        className={`absolute left-1 right-1 rounded-lg px-1.5 py-0.5 overflow-hidden border ${color.bg} ${color.border} ${color.text} cursor-default`}
                        style={{ top: `${top}px`, height: `${Math.max(20, height)}px` }}
                        title={`${ev.title}${ev.location ? ` · ${ev.location}` : ""}\n${timeStr(ev.start)} – ${timeStr(ev.end)}`}
                      >
                        <p className="text-[10px] font-bold truncate leading-tight">
                          {isRoya && <span className="inline-block px-1 py-px mr-1 rounded bg-violet-600 text-white text-[8px] font-extrabold align-middle">ROYA</span>}
                          {ev.title}
                        </p>
                        {height >= 32 && (
                          <p className="text-[9px] opacity-75 truncate">{timeStr(ev.start)} – {timeStr(ev.end)}</p>
                        )}
                        {height >= 48 && ev.location && (
                          <p className="text-[9px] opacity-60 truncate">📍 {ev.location}</p>
                        )}
                      </div>
                    );
                  })}

                  {/* All-day events at top */}
                  {dayEvents.filter(e => e.allDay).map((ev, evIdx) => {
                    const isRoya = ev.source === "roya";
                    const color = isRoya ? ROYA_COLORS : getGoogleColor(evIdx + 3);
                    return (
                      <div key={ev.id}
                        className={`absolute left-1 right-1 top-0 rounded-md px-1.5 py-0.5 border ${color.bg} ${color.border} ${color.text}`}>
                        <p className="text-[9px] font-bold truncate">
                          {isRoya && <span className="inline-block px-1 py-px mr-1 rounded bg-violet-600 text-white text-[8px] font-extrabold">ROYA</span>}
                          {ev.title}
                        </p>
                      </div>
                    );
                  })}

                  {/* Now line */}
                  {showNowLine && todayIndex === dayIdx && (
                    <div className="absolute left-0 right-0 z-10 pointer-events-none" style={{ top: `${nowTop}px` }}>
                      <div className="flex items-center">
                        <div className="w-2 h-2 rounded-full bg-red-500 -ml-1" />
                        <div className="flex-1 h-[2px] bg-red-500" />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── List View ── */}
      {view === "list" && (
        <div>
          {/* Search + Filters */}
          <div className="flex items-center gap-3 mb-4">
            <input type="text" placeholder="Suche nach Name / Kontakt…" value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 placeholder-slate-300 focus:outline-none focus:border-violet-400 w-64" />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="flex gap-1.5">
                {["bg-violet-500", "bg-cyan-500", "bg-emerald-500"].map((c, i) => (
                  <span key={i} className={`w-2.5 h-2.5 rounded-full ${c} animate-bounce`} style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          ) : booked.length === 0 && calEvents.length === 0 ? (
            <div className="glass-card p-16 flex flex-col items-center justify-center text-center">
              <div className="w-20 h-20 rounded-3xl bg-emerald-50 border border-emerald-100 flex items-center justify-center mb-6">
                <span className="text-4xl text-emerald-300">◇</span>
              </div>
              <h3 className="text-xl font-semibold text-slate-800 mb-2">Noch keine Termine</h3>
              <p className="text-slate-400 text-sm max-w-md mb-8 leading-relaxed">
                Sobald Kontakte über eine Kampagne einen Termin buchen oder dein Google Kalender verbunden ist, erscheinen sie hier.
              </p>
              <div className="flex gap-3">
                <Link href="/dashboard/campaigns" className="text-violet-600 hover:underline text-sm">→ Kampagnen</Link>
                <Link href="/dashboard/settings" className="text-blue-600 hover:underline text-sm">→ Kalender verbinden</Link>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Google Calendar Events */}
              {calEvents.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-semibold text-blue-600 mb-2 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                    Google Calendar ({calEvents.length} Events diese Woche)
                  </p>
                  {calEvents
                    .filter(e => !search || e.title.toLowerCase().includes(search.toLowerCase()))
                    .map(ev => (
                    <div key={ev.id} className="flex items-center gap-4 p-3 rounded-xl bg-blue-50 border border-blue-100 mb-1.5">
                      <div className="w-9 h-9 rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center shrink-0">
                        <span className="text-blue-600 text-xs font-bold">G</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-800 text-sm truncate">{ev.title}</p>
                        <p className="text-xs text-blue-500">
                          {ev.allDay ? "Ganztägig" : `${timeStr(ev.start)} – ${timeStr(ev.end)}`}
                          {ev.location && ` · 📍 ${ev.location}`}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-slate-500">{new Date(ev.start).toLocaleDateString("de-CH", { weekday: "short", day: "2-digit", month: "2-digit" })}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ROYA Booked Contacts */}
              {booked.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-emerald-600 mb-2 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    ROYA Buchungen ({booked.length})
                  </p>
                  {booked
                    .filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.contact.toLowerCase().includes(search.toLowerCase()))
                    .map(c => (
                    <div key={c.id} className="flex items-center gap-4 p-4 rounded-xl bg-white border border-slate-100 hover:border-emerald-200 transition-colors">
                      <div className="w-11 h-11 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
                        <span className="text-emerald-600 font-bold text-sm">{c.name.charAt(0).toUpperCase()}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-800">{c.name}</span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 border border-emerald-200 text-emerald-700">
                            ◇ Gebucht
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-400">
                          <span className="font-mono">{c.contact}</span>
                          <span>·</span>
                          <Link href={`/dashboard/campaigns/${c.campaignId}`} className="hover:text-violet-600 transition-colors">
                            {c.campaignName}
                          </Link>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-slate-400">{timeAgo(c.lastContactedAt)}</p>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
