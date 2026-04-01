"use client";
import { useState, useEffect, useCallback } from "react";

const inp = "w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-800 text-sm placeholder-slate-300 focus:outline-none focus:border-violet-400 transition-colors";

export interface ConnectedCalendar {
  key: string;
  title: string;
  icon: string;
  bg: string;
  border: string;
  color: string;
  bookingUrl: string;
}

const CALENDAR_DEFS = [
  {
    key: "google",
    icon: "◇",
    bg: "bg-blue-50", border: "border-blue-100", color: "text-blue-600",
    title: "Google Calendar",
    sub: "Termine direkt in Google Calendar buchen",
    authType: "oauth" as const,
    oauthLabel: "Mit Google verbinden",
    urlPlaceholder: "https://calendar.google.com/...",
  },
  {
    key: "outlook",
    icon: "◈",
    bg: "bg-sky-50", border: "border-sky-100", color: "text-sky-600",
    title: "Outlook / Microsoft 365",
    sub: "Termine in Outlook oder Teams-Kalender buchen",
    authType: "oauth" as const,
    oauthLabel: "Mit Microsoft verbinden",
    urlPlaceholder: "https://outlook.office365.com/...",
  },
  {
    key: "calcom",
    icon: "▣",
    bg: "bg-violet-50", border: "border-violet-100", color: "text-violet-600",
    title: "Cal.com",
    sub: "Booking-Links aus Cal.com verwenden",
    authType: "apikey" as const,
    oauthLabel: "",
    urlPlaceholder: "https://cal.com/yourname/demo",
  },
  {
    key: "calendly",
    icon: "◌",
    bg: "bg-teal-50", border: "border-teal-100", color: "text-teal-600",
    title: "Calendly",
    sub: "Calendly-Links für Terminbuchungen",
    authType: "apikey" as const,
    oauthLabel: "",
    urlPlaceholder: "https://calendly.com/yourname/demo",
  },
] as const;

const STORAGE_KEY = "roya_calendars";

function loadCalendars(): ConnectedCalendar[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
}
function saveCalendars(list: ConnectedCalendar[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch {}
}

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  from: string;
}

function loadTwilio(): TwilioConfig {
  try { return JSON.parse(localStorage.getItem("roya_twilio") || "{}"); } catch { return { accountSid: "", authToken: "", from: "" }; }
}
function saveTwilio(cfg: TwilioConfig) {
  try { localStorage.setItem("roya_twilio", JSON.stringify(cfg)); } catch {}
}

interface SystemStatus {
  anthropic: boolean; supabase: boolean; twilio: boolean; mailgun: boolean;
  redis: boolean; slack: boolean; handoffEmail: boolean; cronSecret: boolean;
  baseUrl: string | null; isDev: boolean;
}

export default function SettingsPage() {
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<"integrations" | "calendars" | "system">("integrations");
  const [sysStatus, setSysStatus] = useState<SystemStatus | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState("");

  // Integration field values (controlled)
  const [claudeKey, setClaudeKey] = useState("");
  const [supabaseUrl, setSupabaseUrl] = useState("");
  const [supabaseKey, setSupabaseKey] = useState("");
  const [twilio, setTwilio] = useState<TwilioConfig>({ accountSid: "", authToken: "", from: "" });
  const [mailgunKey, setMailgunKey] = useState("");
  const [mailgunDomain, setMailgunDomain] = useState("");
  const [mailgunFrom, setMailgunFrom] = useState("");

  // Calendar state
  const [connected, setConnected] = useState<ConnectedCalendar[]>([]);
  const [urlDraft, setUrlDraft] = useState<Record<string, string>>({});
  const [apiDraft, setApiDraft] = useState<Record<string, string>>({});
  const [oauthPending, setOauthPending] = useState<string | null>(null);

  const loadStatus = useCallback(() => {
    fetch("/api/system-status").then(r => r.json()).then(setSysStatus).catch(() => {});
  }, []);

  useEffect(() => {
    setConnected(loadCalendars());
    const t = loadTwilio();
    setTwilio(t);
    try {
      setClaudeKey(localStorage.getItem("roya_claude_key") || "");
      setSupabaseUrl(localStorage.getItem("roya_supabase_url") || "");
      setSupabaseKey(localStorage.getItem("roya_supabase_key") || "");
      setMailgunKey(localStorage.getItem("roya_mailgun_key") || "");
      setMailgunDomain(localStorage.getItem("roya_mailgun_domain") || "");
      setMailgunFrom(localStorage.getItem("roya_mailgun_from") || "");
    } catch {}
    loadStatus();
  }, [loadStatus]);

  const runSeed = async () => {
    setSeeding(true); setSeedMsg("");
    const res = await fetch("/api/seed").then(r => r.json()).catch(() => ({ error: "Failed" }));
    setSeedMsg(res.skipped ? "Bereits geseedet." : res.seeded ? "Demo-Daten erfolgreich angelegt!" : res.error ?? "Fehler");
    setSeeding(false);
    loadStatus();
  };

  const twilioConnected = !!(twilio.accountSid && twilio.authToken && twilio.from);

  const isConnected = (key: string) => connected.some(c => c.key === key);

  const connectCalendar = (def: typeof CALENDAR_DEFS[number], bookingUrl: string) => {
    const entry: ConnectedCalendar = {
      key: def.key, title: def.title, icon: def.icon,
      bg: def.bg, border: def.border, color: def.color,
      bookingUrl,
    };
    const updated = [...connected.filter(c => c.key !== def.key), entry];
    setConnected(updated);
    saveCalendars(updated);
    setOauthPending(null);
  };

  const disconnectCalendar = (key: string) => {
    const updated = connected.filter(c => c.key !== key);
    setConnected(updated);
    saveCalendars(updated);
  };

  const updateBookingUrl = (key: string, url: string) => {
    const updated = connected.map(c => c.key === key ? { ...c, bookingUrl: url } : c);
    setConnected(updated);
    saveCalendars(updated);
  };

  const handleSave = () => {
    try {
      if (claudeKey) localStorage.setItem("roya_claude_key", claudeKey);
      if (supabaseUrl) localStorage.setItem("roya_supabase_url", supabaseUrl);
      if (supabaseKey) localStorage.setItem("roya_supabase_key", supabaseKey);
      saveTwilio(twilio);
      if (mailgunKey) localStorage.setItem("roya_mailgun_key", mailgunKey);
      if (mailgunDomain) localStorage.setItem("roya_mailgun_domain", mailgunDomain);
      if (mailgunFrom) localStorage.setItem("roya_mailgun_from", mailgunFrom);
    } catch {}
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Einstellungen</h1>
        <p className="text-slate-400 text-sm mt-1">API-Verbindungen, Kalender und Agent-Konfiguration</p>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 mb-6 p-1 bg-slate-100 rounded-xl w-fit">
        {([
          { id: "integrations" as const, label: "Integrationen" },
          { id: "calendars"    as const, label: `Kalender ${connected.length > 0 ? `(${connected.length})` : ""}` },
          { id: "system"       as const, label: "System" },
        ]).map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === t.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Integrations Tab ── */}
      {activeTab === "integrations" && (
        <div className="space-y-4">
          {/* Claude API */}
          <div className="glass-card p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-violet-50 border border-violet-100 flex items-center justify-center">
                <span className="text-violet-600 text-lg">◎</span>
              </div>
              <div>
                <h2 className="font-semibold text-slate-800 text-sm">Anthropic Claude API</h2>
                <p className="text-slate-400 text-xs">KI-Agent Engine</p>
              </div>
              {claudeKey && (
                <div className="ml-auto flex items-center gap-2">
                  <span className="status-dot-green" />
                  <span className="text-emerald-600 text-xs font-medium">Verbunden</span>
                </div>
              )}
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1.5">API Key</label>
              <input type="password" placeholder="sk-ant-..." value={claudeKey}
                onChange={e => setClaudeKey(e.target.value)} className={inp} />
            </div>
          </div>

          {/* Supabase */}
          <div className="glass-card p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center">
                <span className="text-emerald-600 text-lg">◉</span>
              </div>
              <div>
                <h2 className="font-semibold text-slate-800 text-sm">Supabase Datenbank</h2>
                <p className="text-slate-400 text-xs">Datenspeicher & Auth</p>
              </div>
              {supabaseUrl && supabaseKey && (
                <div className="ml-auto flex items-center gap-2">
                  <span className="status-dot-green" />
                  <span className="text-emerald-600 text-xs font-medium">Verbunden</span>
                </div>
              )}
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500 block mb-1.5">Supabase URL</label>
                <input type="text" placeholder="https://xxx.supabase.co" value={supabaseUrl}
                  onChange={e => setSupabaseUrl(e.target.value)} className={inp} />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1.5">Anon Key</label>
                <input type="password" placeholder="eyJ..." value={supabaseKey}
                  onChange={e => setSupabaseKey(e.target.value)} className={inp} />
              </div>
            </div>
          </div>

          {/* Twilio */}
          <div className="glass-card p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-cyan-50 border border-cyan-100 flex items-center justify-center">
                <span className="text-cyan-600 text-lg">◊</span>
              </div>
              <div>
                <h2 className="font-semibold text-slate-800 text-sm">Twilio (SMS / WhatsApp)</h2>
                <p className="text-slate-400 text-xs">Messaging-Kanäle</p>
              </div>
              {twilioConnected && (
                <div className="ml-auto flex items-center gap-2">
                  <span className="status-dot-green" />
                  <span className="text-emerald-600 text-xs font-medium">Verbunden</span>
                </div>
              )}
            </div>
            <div className="p-3 rounded-xl bg-cyan-50 border border-cyan-100 mb-4">
              <p className="text-xs text-cyan-700 leading-relaxed">
                Wird für Live Test-Versand von SMS und WhatsApp Nachrichten verwendet. Account SID und Auth Token finden Sie im{" "}
                <span className="font-semibold">Twilio Console Dashboard</span>.
              </p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500 block mb-1.5">Account SID</label>
                <input type="text" placeholder="AC..." value={twilio.accountSid}
                  onChange={e => setTwilio(t => ({ ...t, accountSid: e.target.value }))} className={inp} />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1.5">Auth Token</label>
                <input type="password" placeholder="••••••••••••••••••••••••••••••••" value={twilio.authToken}
                  onChange={e => setTwilio(t => ({ ...t, authToken: e.target.value }))} className={inp} />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1.5">Absender-Nummer</label>
                <input type="text" placeholder="+41 XX XXX XX XX" value={twilio.from}
                  onChange={e => setTwilio(t => ({ ...t, from: e.target.value }))} className={inp} />
                <p className="text-[10px] text-slate-400 mt-1">Für WhatsApp: Die Nummer muss im Twilio WhatsApp Sandbox oder Business Account freigeschaltet sein.</p>
              </div>
            </div>
          </div>

          {/* Mailgun */}
          <div className="glass-card p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center">
                <span className="text-amber-600 text-lg">✎</span>
              </div>
              <div>
                <h2 className="font-semibold text-slate-800 text-sm">Mailgun (E-Mail)</h2>
                <p className="text-slate-400 text-xs">E-Mail-Versand</p>
              </div>
              {mailgunKey && mailgunDomain && (
                <div className="ml-auto flex items-center gap-2">
                  <span className="status-dot-green" />
                  <span className="text-emerald-600 text-xs font-medium">Verbunden</span>
                </div>
              )}
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500 block mb-1.5">API Key</label>
                <input type="password" placeholder="key-..." value={mailgunKey}
                  onChange={e => setMailgunKey(e.target.value)} className={inp} />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1.5">Domain</label>
                <input type="text" placeholder="mg.yourdomain.com" value={mailgunDomain}
                  onChange={e => setMailgunDomain(e.target.value)} className={inp} />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1.5">Absender-Adresse</label>
                <input type="text" placeholder="outreach@yourdomain.com" value={mailgunFrom}
                  onChange={e => setMailgunFrom(e.target.value)} className={inp} />
              </div>
            </div>
          </div>

          <button onClick={handleSave}
            className={`w-full py-3 rounded-xl font-medium text-sm transition-all text-white ${saved ? "bg-emerald-500" : "bg-violet-600 hover:bg-violet-700"}`}>
            {saved ? "✓ Gespeichert" : "Einstellungen speichern"}
          </button>
        </div>
      )}

      {/* ── Calendars Tab ── */}
      {activeTab === "calendars" && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-violet-50 border border-violet-100">
            <p className="text-xs text-violet-700 leading-relaxed">
              <span className="font-semibold">Mehrere Kalender möglich.</span> Verbundene Kalender stehen in Schritt 3 zur Auswahl — der Booking-Link fliesst automatisch in alle generierten Nachrichten ein.
            </p>
          </div>

          {CALENDAR_DEFS.map(def => {
            const conn = connected.find(c => c.key === def.key);
            const isPending = oauthPending === def.key;

            return (
              <div key={def.key} className="glass-card p-6">
                {/* Header */}
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-10 h-10 rounded-xl ${def.bg} border ${def.border} flex items-center justify-center shrink-0`}>
                    <span className={`${def.color} text-lg`}>{def.icon}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="font-semibold text-slate-800 text-sm">{def.title}</h2>
                    <p className="text-slate-400 text-xs">{def.sub}</p>
                  </div>
                  {conn ? (
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="flex items-center gap-1.5">
                        <span className="status-dot-green" />
                        <span className="text-emerald-600 text-xs font-medium">Verbunden</span>
                      </div>
                      <button onClick={() => disconnectCalendar(def.key)}
                        className="text-xs text-slate-400 hover:text-red-500 transition-colors">
                        Trennen
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400 shrink-0">Nicht verbunden</span>
                  )}
                </div>

                {/* Not connected — connect form */}
                {!conn && (
                  <>
                    {def.authType === "oauth" && !isPending && (
                      <button
                        onClick={() => setOauthPending(def.key)}
                        className={`w-full py-2.5 rounded-xl text-sm font-semibold border transition-all ${def.bg} ${def.border} ${def.color} hover:opacity-80`}>
                        {def.oauthLabel} →
                      </button>
                    )}

                    {def.authType === "oauth" && isPending && (
                      <div className="space-y-3">
                        <div className="p-3 rounded-xl bg-blue-50 border border-blue-100">
                          <p className="text-xs text-blue-700 font-medium mb-0.5">OAuth-Simulation</p>
                          <p className="text-xs text-blue-600">Geben Sie Ihre Booking-URL ein, die in allen Nachrichten verwendet wird.</p>
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 block mb-1.5">Booking-URL *</label>
                          <input type="url"
                            value={urlDraft[def.key] || ""}
                            onChange={e => setUrlDraft(p => ({ ...p, [def.key]: e.target.value }))}
                            placeholder={def.urlPlaceholder}
                            className={inp} />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => setOauthPending(null)}
                            className="flex-1 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-medium transition-colors">
                            Abbrechen
                          </button>
                          <button
                            disabled={!urlDraft[def.key]?.trim()}
                            onClick={() => connectCalendar(def, urlDraft[def.key])}
                            className={`flex-1 py-2 rounded-xl text-white text-sm font-bold transition-all ${def.bg} ${def.border} ${def.color} border disabled:opacity-40 bg-opacity-0 !bg-violet-600 hover:bg-violet-700`}>
                            Verbinden
                          </button>
                        </div>
                      </div>
                    )}

                    {def.authType === "apikey" && (
                      <div className="space-y-3">
                        <div>
                          <label className="text-xs text-slate-500 block mb-1.5">API Key</label>
                          <input type="password"
                            value={apiDraft[`${def.key}_key`] || ""}
                            onChange={e => setApiDraft(p => ({ ...p, [`${def.key}_key`]: e.target.value }))}
                            placeholder={def.key === "calcom" ? "cal_live_..." : "eyJ..."}
                            className={inp} />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 block mb-1.5">Booking-URL *</label>
                          <input type="url"
                            value={urlDraft[def.key] || ""}
                            onChange={e => setUrlDraft(p => ({ ...p, [def.key]: e.target.value }))}
                            placeholder={def.urlPlaceholder}
                            className={inp} />
                        </div>
                        <button
                          disabled={!urlDraft[def.key]?.trim()}
                          onClick={() => connectCalendar(def, urlDraft[def.key])}
                          className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-sm font-semibold transition-all">
                          Verbinden
                        </button>
                      </div>
                    )}
                  </>
                )}

                {/* Connected — show & edit booking URL */}
                {conn && (
                  <div className="space-y-3">
                    <div className={`p-3 rounded-xl ${def.bg} border ${def.border}`}>
                      <p className="text-[10px] font-semibold text-slate-500 mb-1">Aktiver Booking-Link</p>
                      <p className={`text-xs font-mono truncate ${def.color}`}>{conn.bookingUrl || "—"}</p>
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 block mb-1.5">Booking-URL ändern</label>
                      <input type="url"
                        defaultValue={conn.bookingUrl}
                        onBlur={e => updateBookingUrl(def.key, e.target.value)}
                        placeholder={def.urlPlaceholder}
                        className={inp} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {connected.length > 0 && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
              <p className="text-xs font-semibold text-emerald-700 mb-2">
                {connected.length} Kalender verbunden — verfügbar in Schritt 3
              </p>
              <div className="space-y-1">
                {connected.map(c => (
                  <div key={c.key} className="flex items-center gap-2">
                    <span className={`text-[10px] ${c.color}`}>{c.icon}</span>
                    <span className="text-[10px] font-semibold text-emerald-700">{c.title}</span>
                    <span className="text-[10px] text-emerald-600 font-mono truncate flex-1">{c.bookingUrl}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── System Tab ── */}
      {activeTab === "system" && (
        <div className="space-y-4">
          {/* Live Status */}
          <div className="glass-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-800 text-sm">System Status</h2>
              <button onClick={loadStatus} className="text-xs text-violet-500 hover:text-violet-700 transition-colors">↺ Aktualisieren</button>
            </div>
            {sysStatus ? (
              <div className="grid grid-cols-2 gap-2">
                {([
                  { key: "anthropic",    label: "Claude API" },
                  { key: "supabase",     label: "Supabase DB" },
                  { key: "twilio",       label: "Twilio" },
                  { key: "mailgun",      label: "Mailgun" },
                  { key: "redis",        label: "Redis / BullMQ" },
                  { key: "slack",        label: "Slack Webhook" },
                  { key: "handoffEmail", label: "Handoff E-Mail" },
                  { key: "cronSecret",   label: "Cron Secret" },
                ] as { key: keyof SystemStatus; label: string }[]).map(({ key, label }) => {
                  const ok = sysStatus[key] === true;
                  return (
                    <div key={key} className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${ok ? "bg-emerald-50 border-emerald-200" : "bg-slate-50 border-slate-200"}`}>
                      <span className={`w-2 h-2 rounded-full shrink-0 ${ok ? "bg-emerald-400" : "bg-slate-300"}`} />
                      <span className={`text-xs font-medium ${ok ? "text-emerald-700" : "text-slate-400"}`}>{label}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-slate-400">Lädt…</p>
            )}
            {sysStatus?.baseUrl && (
              <p className="text-[10px] text-slate-400 mt-3 font-mono">Base URL: {sysStatus.baseUrl}</p>
            )}
          </div>

          {/* .env.local Reference */}
          <div className="glass-card p-6">
            <h2 className="font-semibold text-slate-800 text-sm mb-3">Benötigte .env.local Variablen</h2>
            <div className="bg-slate-900 rounded-xl p-4 font-mono text-[10px] text-slate-300 leading-relaxed overflow-x-auto">
              {[
                "ANTHROPIC_API_KEY=sk-ant-...",
                "NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co",
                "SUPABASE_SERVICE_ROLE_KEY=eyJ...",
                "TWILIO_ACCOUNT_SID=AC...",
                "TWILIO_AUTH_TOKEN=...",
                "TWILIO_FROM_NUMBER=+41...",
                "MAILGUN_API_KEY=key-...",
                "MAILGUN_DOMAIN=mg.yourdomain.com",
                "MAILGUN_FROM=outreach@yourdomain.com",
                "REDIS_URL=redis://localhost:6379",
                "SLACK_WEBHOOK_URL=https://hooks.slack.com/...",
                "HANDOFF_EMAIL=team@youragency.com",
                "CRON_SECRET=your-secret",
                "NEXT_PUBLIC_BASE_URL=https://your-app.vercel.app",
              ].map(line => <div key={line}>{line}</div>)}
            </div>
          </div>

          {/* Dev Tools */}
          {sysStatus?.isDev && (
            <div className="glass-card p-6">
              <h2 className="font-semibold text-slate-800 text-sm mb-3">Developer Tools</h2>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-slate-500 mb-2">Demo-Daten in Supabase einfügen (Clients, Campaigns, Conversations):</p>
                  <button onClick={runSeed} disabled={seeding}
                    className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-xs font-semibold transition-all">
                    {seeding ? "Seeding…" : "Seed Demo Data →"}
                  </button>
                  {seedMsg && <p className={`text-xs mt-2 ${seedMsg.includes("erfolgreich") ? "text-emerald-600" : "text-slate-500"}`}>{seedMsg}</p>}
                </div>
                <div className="border-t border-slate-100 pt-3">
                  <p className="text-xs text-slate-500 mb-2">Scheduler manuell ausführen (alle aktiven Kampagnen):</p>
                  <button onClick={() => fetch("/api/scheduler").then(r => r.json()).then(d => alert(JSON.stringify(d, null, 2)))}
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-all">
                    Run Scheduler (GET)
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
