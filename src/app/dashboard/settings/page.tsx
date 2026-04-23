"use client";
import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";

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
  whatsappFrom?: string;
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
  return (
    <Suspense>
      <SettingsPageContent />
    </Suspense>
  );
}

function SettingsPageContent() {
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<"integrations" | "calendars" | "billing" | "agents" | "system">("integrations");
  const [sysStatus, setSysStatus] = useState<SystemStatus | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState("");

  // Agent config state
  const [agentConfig, setAgentConfig] = useState<{
    persona: { companyName: string; industry: string; tone: string; language: string; agentName: string };
    agents: Record<string, { model: string; enabled: boolean }>;
    notifications: { escalationEmail: boolean; dailySummary: boolean; bookingAlert: boolean; emailAddress: string };
  } | null>(null);
  const [agentSaving, setAgentSaving] = useState(false);
  const [agentSaved, setAgentSaved] = useState(false);

  // Billing state
  interface BillingStatus {
    agencyId: string; agencyName: string; plan: string; planLabel: string;
    subscriptionStatus: string; currentPeriodEnd: string | null;
    hasStripeCustomer: boolean; hasSubscription: boolean;
    limits: { maxContacts: number; maxClients: number; channels: string[]; features: string[]; priceMonthly: number };
    usage: { contacts: number; clients: number };
    contactsPercent: number;
    allPlans: { id: string; label: string; maxContacts: number; maxClients: number; channels: string[]; features: string[]; priceMonthly: number }[];
  }
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);

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

  // Google Calendar real connection state
  const searchParams = useSearchParams();
  const [gcalStatus, setGcalStatus] = useState<{
    connected: boolean;
    calendarEmail: string;
    businessStart: string;
    businessEnd: string;
    slotDuration: number;
    lookAheadDays: number;
  } | null>(null);
  const [gcalSaving, setGcalSaving] = useState(false);
  const [gcalTestSlots, setGcalTestSlots] = useState<string | null>(null);
  const [gcalTesting, setGcalTesting] = useState(false);
  const [gcalClientId, setGcalClientId] = useState("");
  const [gcalClientSecret, setGcalClientSecret] = useState("");
  const [gcalConnecting, setGcalConnecting] = useState(false);

  const loadStatus = useCallback(() => {
    fetch("/api/system-status").then(r => r.json()).then(setSysStatus).catch(() => {});
  }, []);

  useEffect(() => {
    setConnected(loadCalendars());
    // Load from server-persisted settings (falls back to env vars)
    fetch("/api/settings").then(r => r.json()).then(s => {
      setTwilio({ accountSid: s.twilioAccountSid || "", authToken: s.twilioAuthToken || "", from: s.twilioFrom || "", whatsappFrom: s.twilioWhatsappFrom || "" });
      setClaudeKey(s.claudeKey || "");
      setSupabaseUrl(s.supabaseUrl || "");
      setSupabaseKey(s.supabaseKey || "");
      setMailgunKey(s.mailgunKey || "");
      setMailgunDomain(s.mailgunDomain || "");
      setMailgunFrom(s.mailgunFrom || "");
      // Load Google Calendar credentials if saved
      if (s.googleCalendarClientId) setGcalClientId(s.googleCalendarClientId);
      if (s.googleCalendarClientSecret) setGcalClientSecret(s.googleCalendarClientSecret);
      // Also sync to localStorage for other pages that still read from it
      try {
        if (s.twilioAccountSid) localStorage.setItem("roya_twilio", JSON.stringify({ accountSid: s.twilioAccountSid, authToken: s.twilioAuthToken, from: s.twilioFrom, whatsappFrom: s.twilioWhatsappFrom || "" }));
        if (s.claudeKey) localStorage.setItem("roya_claude_key", s.claudeKey);
        if (s.mailgunKey) localStorage.setItem("roya_mailgun_key", s.mailgunKey);
        if (s.mailgunDomain) localStorage.setItem("roya_mailgun_domain", s.mailgunDomain);
        if (s.mailgunFrom) localStorage.setItem("roya_mailgun_from", s.mailgunFrom);
      } catch {}
    }).catch(() => {
      // Fallback to localStorage if API unavailable
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
    });
    loadStatus();
    // Load billing
    fetch("/api/billing/status").then(r => r.json()).then(setBilling).catch(() => {});
    // Acquire auth cookie for secured calendar APIs
    fetch("/api/calendar/auth-token", { method: "POST" }).then(() => {
      // Load Google Calendar status after cookie is set
      fetch("/api/calendar/status").then(r => r.json()).then(setGcalStatus).catch(() => {});
      // Check for calendar callback redirect
      if (searchParams.get("calendar") === "connected") {
        setActiveTab("calendars");
        fetch("/api/calendar/status").then(r => r.json()).then(setGcalStatus).catch(() => {});
      }
      // Check for error redirect from OAuth
      if (searchParams.get("error") === "google_credentials_missing") {
        setActiveTab("calendars");
      }
      // Check for tab param
      if (searchParams.get("tab") === "calendars") {
        setActiveTab("calendars");
      }
    }).catch(() => {});
  }, [loadStatus, searchParams]);

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

  const handleSave = async () => {
    const payload = {
      twilioAccountSid: twilio.accountSid,
      twilioAuthToken:  twilio.authToken,
      twilioFrom:       twilio.from,
      twilioWhatsappFrom: twilio.whatsappFrom || "",
      claudeKey,
      supabaseUrl,
      supabaseKey,
      mailgunKey,
      mailgunDomain,
      mailgunFrom,
    };
    // Save to server (persistent across browser resets)
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {});
    // Also sync to localStorage for other pages
    try {
      saveTwilio(twilio);
      if (claudeKey) localStorage.setItem("roya_claude_key", claudeKey);
      if (supabaseUrl) localStorage.setItem("roya_supabase_url", supabaseUrl);
      if (supabaseKey) localStorage.setItem("roya_supabase_key", supabaseKey);
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
          { id: "billing"      as const, label: "Abrechnung" },
          { id: "agents"       as const, label: "Agent-Konfig" },
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
                <label className="text-xs text-slate-500 block mb-1.5">SMS Absender-Nummer</label>
                <input type="text" placeholder="+1 260 529 7326" value={twilio.from}
                  onChange={e => setTwilio(t => ({ ...t, from: e.target.value }))} className={inp} />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1.5">WhatsApp Absender-Nummer</label>
                <input type="text" placeholder="+14155238886 (Sandbox)" value={twilio.whatsappFrom || ""}
                  onChange={e => setTwilio(t => ({ ...t, whatsappFrom: e.target.value }))} className={inp} />
                <p className="text-[10px] text-slate-400 mt-1">Twilio Sandbox: +14155238886. Eigene Nummer nur mit genehmigtem WhatsApp Business Sender.</p>
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
          {/* Google Credentials Error Banner */}
          {searchParams.get("error") === "google_credentials_missing" && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200">
              <p className="text-sm font-semibold text-red-700 mb-1">Google Calendar Credentials fehlen</p>
              <p className="text-xs text-red-600 leading-relaxed">
                Setze <code className="bg-red-100 px-1 rounded text-[10px]">GOOGLE_CALENDAR_CLIENT_ID</code> und{" "}
                <code className="bg-red-100 px-1 rounded text-[10px]">GOOGLE_CALENDAR_CLIENT_SECRET</code> in{" "}
                <code className="bg-red-100 px-1 rounded text-[10px]">.env.local</code>.
                Erstelle diese in der <span className="font-semibold">Google Cloud Console</span> → APIs &amp; Services → Credentials → OAuth 2.0 Client ID.
                Starte danach den Server neu.
              </p>
            </div>
          )}

          {/* Google Calendar — Real OAuth Integration */}
          <div className="glass-card p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19.5 3h-3V1.5h-1.5V3h-6V1.5H7.5V3h-3C3.675 3 3 3.675 3 4.5v15c0 .825.675 1.5 1.5 1.5h15c.825 0 1.5-.675 1.5-1.5v-15c0-.825-.675-1.5-1.5-1.5zm0 16.5h-15V8.25h15v11.25zm0-12.75h-15V4.5h15v2.25z"/>
                </svg>
              </div>
              <div className="flex-1">
                <h2 className="font-semibold text-slate-800 text-sm">Google Calendar</h2>
                <p className="text-slate-400 text-xs">Echtzeit-Verfügbarkeitsprüfung für Terminbuchungen</p>
              </div>
              {gcalStatus?.connected ? (
                <div className="flex items-center gap-3 shrink-0">
                  <div className="flex items-center gap-1.5">
                    <span className="status-dot-green" />
                    <span className="text-emerald-600 text-xs font-medium">Verbunden</span>
                  </div>
                  <button onClick={async () => {
                    await fetch("/api/calendar/disconnect", { method: "POST" });
                    setGcalStatus(s => s ? { ...s, connected: false, calendarEmail: "" } : s);
                    setGcalTestSlots(null);
                  }}
                    className="text-xs text-slate-400 hover:text-red-500 transition-colors">
                    Trennen
                  </button>
                </div>
              ) : (
                <span className="text-xs text-slate-400 shrink-0">Nicht verbunden</span>
              )}
            </div>

            {gcalStatus?.connected ? (
              <div className="space-y-4">
                {/* Connected account info */}
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                  <p className="text-[10px] font-semibold text-emerald-700 mb-0.5">Verbundener Kalender</p>
                  <p className="text-xs text-emerald-600 font-mono">{gcalStatus.calendarEmail}</p>
                </div>

                {/* Business Hours Settings */}
                <div>
                  <p className="text-xs font-semibold text-slate-700 mb-2">Geschäftszeiten</p>
                  <p className="text-[10px] text-slate-400 mb-3">Termine werden nur innerhalb dieser Zeiten vorgeschlagen.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] text-slate-500 mb-1 block">Von</label>
                      <input type="time" value={gcalStatus.businessStart}
                        onChange={e => setGcalStatus(s => s ? { ...s, businessStart: e.target.value } : s)}
                        className={inp} />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 mb-1 block">Bis</label>
                      <input type="time" value={gcalStatus.businessEnd}
                        onChange={e => setGcalStatus(s => s ? { ...s, businessEnd: e.target.value } : s)}
                        className={inp} />
                    </div>
                  </div>
                </div>

                {/* Slot configuration */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-slate-500 mb-1 block">Termindauer (Min.)</label>
                    <select value={gcalStatus.slotDuration}
                      onChange={e => setGcalStatus(s => s ? { ...s, slotDuration: parseInt(e.target.value) } : s)}
                      className={inp}>
                      <option value={15}>15 Minuten</option>
                      <option value={30}>30 Minuten</option>
                      <option value={45}>45 Minuten</option>
                      <option value={60}>60 Minuten</option>
                      <option value={90}>90 Minuten</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 mb-1 block">Vorausschau (Tage)</label>
                    <select value={gcalStatus.lookAheadDays}
                      onChange={e => setGcalStatus(s => s ? { ...s, lookAheadDays: parseInt(e.target.value) } : s)}
                      className={inp}>
                      <option value={3}>3 Werktage</option>
                      <option value={5}>5 Werktage</option>
                      <option value={7}>7 Werktage</option>
                      <option value={10}>10 Werktage</option>
                    </select>
                  </div>
                </div>

                {/* Save button */}
                <button disabled={gcalSaving} onClick={async () => {
                  setGcalSaving(true);
                  await fetch("/api/calendar/status", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      businessStart: gcalStatus.businessStart,
                      businessEnd: gcalStatus.businessEnd,
                      slotDuration: gcalStatus.slotDuration,
                      lookAheadDays: gcalStatus.lookAheadDays,
                    }),
                  });
                  setGcalSaving(false);
                }}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-all">
                  {gcalSaving ? "Speichert…" : "Kalender-Einstellungen speichern"}
                </button>

                {/* Test: Show available slots */}
                <div className="border-t border-slate-100 pt-4">
                  <p className="text-xs font-semibold text-slate-700 mb-2">Verfügbarkeit testen</p>
                  <button disabled={gcalTesting} onClick={async () => {
                    setGcalTesting(true);
                    setGcalTestSlots(null);
                    try {
                      const res = await fetch("/api/calendar/slots").then(r => r.json());
                      setGcalTestSlots(res.formatted || "Keine freien Slots gefunden.");
                    } catch {
                      setGcalTestSlots("Fehler beim Abrufen der Slots.");
                    }
                    setGcalTesting(false);
                  }}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-all">
                    {gcalTesting ? "Lädt…" : "Freie Zeiten abrufen →"}
                  </button>
                  {gcalTestSlots && (
                    <div className="mt-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                      <p className="text-xs text-slate-600 whitespace-pre-line font-mono leading-relaxed">{gcalTestSlots}</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-3 rounded-xl bg-blue-50 border border-blue-100">
                  <p className="text-xs text-blue-700 leading-relaxed">
                    <span className="font-semibold">So funktioniert{"'"}s:</span> Gib deine Google OAuth Credentials ein, klicke verbinden,
                    und ROYA prüft automatisch deine Verfügbarkeit. Keine Doppelbuchungen mehr.
                  </p>
                </div>

                {/* Step 1: Instructions */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <p className="text-xs font-semibold text-slate-700 mb-2">Anleitung — Credentials erstellen</p>
                  <ol className="text-[11px] text-slate-500 space-y-1 list-decimal list-inside leading-relaxed">
                    <li>Öffne die <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener" className="text-blue-600 underline hover:text-blue-800">Google Cloud Console → Credentials</a></li>
                    <li>Klicke <span className="font-semibold">Create Credentials → OAuth 2.0 Client ID</span></li>
                    <li>Typ: <span className="font-semibold">Web Application</span></li>
                    <li>Authorized Redirect URI: <code className="bg-slate-100 px-1 rounded text-[10px]">http://localhost:3000/api/calendar/callback</code></li>
                    <li>Kopiere Client ID und Client Secret hierher:</li>
                  </ol>
                </div>

                {/* Step 2: Credential Inputs */}
                <div>
                  <label className="text-[10px] text-slate-500 mb-1 block">Google Client ID</label>
                  <input type="text" value={gcalClientId}
                    onChange={e => setGcalClientId(e.target.value)}
                    placeholder="123456789-abc.apps.googleusercontent.com"
                    className={inp} />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 mb-1 block">Google Client Secret</label>
                  <input type="password" value={gcalClientSecret}
                    onChange={e => setGcalClientSecret(e.target.value)}
                    placeholder="GOCSPX-..."
                    className={inp} />
                </div>

                {/* Step 3: Connect Button */}
                <button
                  disabled={!gcalClientId.trim() || !gcalClientSecret.trim() || gcalConnecting}
                  onClick={async () => {
                    setGcalConnecting(true);
                    try {
                      // Save credentials to settings first
                      await fetch("/api/settings", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          googleCalendarClientId: gcalClientId.trim(),
                          googleCalendarClientSecret: gcalClientSecret.trim(),
                        }),
                      });
                      // Then redirect to OAuth flow
                      window.location.href = "/api/calendar/auth";
                    } catch {
                      setGcalConnecting(false);
                    }
                  }}
                  className="block w-full py-3 rounded-xl text-sm font-semibold text-center bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white transition-all">
                  {gcalConnecting ? "Verbinde…" : "Mit Google Calendar verbinden →"}
                </button>
              </div>
            )}
          </div>

          {/* Other Calendar Providers (Outlook, Cal.com, Calendly) */}
          <div className="glass-card p-6">
            <h2 className="font-semibold text-slate-800 text-sm mb-1">Weitere Kalender-Anbindungen</h2>
            <p className="text-xs text-slate-400 mb-4">Verbinde weitere Kalender oder nutze Booking-Links als Fallback.</p>

            {/* Outlook / Microsoft 365 */}
            <div className="mb-5 pb-5 border-b border-slate-100">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-sky-600" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M21.5 3h-8.5L12 4.5V6H4.5C3.67 6 3 6.67 3 7.5v9c0 .83.67 1.5 1.5 1.5H12v1.5L13 21h8.5c.83 0 1.5-.67 1.5-1.5v-15c0-.83-.67-1.5-1.5-1.5zM12 16.5H4.5v-9H12v9zm9 3h-7.5V18H15v-1.5h-1.5v-3H15V12h-1.5V7.5h7.5v12zM18 9h-1.5v1.5H18V9zm0 3h-1.5v1.5H18V12zm0 3h-1.5v1.5H18V15z"/>
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-slate-700">Outlook / Microsoft 365</h3>
                  <p className="text-[10px] text-slate-400">Termine in Outlook oder Teams-Kalender</p>
                </div>
                {isConnected("outlook") ? (
                  <button onClick={() => disconnectCalendar("outlook")}
                    className="text-xs text-slate-400 hover:text-red-500 transition-colors">Trennen</button>
                ) : (
                  <span className="text-xs text-slate-400">Nicht verbunden</span>
                )}
              </div>
              {isConnected("outlook") ? (
                <div className="p-2 rounded-lg bg-sky-50 border border-sky-100">
                  <input type="url" defaultValue={connected.find(c => c.key === "outlook")?.bookingUrl}
                    onBlur={e => updateBookingUrl("outlook", e.target.value)}
                    placeholder="https://outlook.office365.com/..." className={inp} />
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="p-3 rounded-xl bg-sky-50 border border-sky-100">
                    <p className="text-xs text-sky-700 leading-relaxed">
                      <span className="font-semibold">Outlook-Integration:</span> Gib deinen Microsoft Booking-Link ein,
                      damit der Agent diesen bei Terminwünschen an Leads sendet.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <input type="url" value={urlDraft["outlook"] || ""}
                      onChange={e => setUrlDraft(p => ({ ...p, outlook: e.target.value }))}
                      placeholder="https://outlook.office365.com/..." className={`flex-1 ${inp}`} />
                    <button disabled={!urlDraft["outlook"]?.trim()}
                      onClick={() => connectCalendar(CALENDAR_DEFS.find(d => d.key === "outlook")!, urlDraft["outlook"])}
                      className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-40 text-white text-xs font-semibold transition-all whitespace-nowrap">
                      Verbinden
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Cal.com & Calendly booking links */}
            {CALENDAR_DEFS.filter(d => d.key !== "google" && d.key !== "outlook").map(def => {
              const conn = connected.find(c => c.key === def.key);
              return (
                <div key={def.key} className="mb-3 last:mb-0">
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`w-8 h-8 rounded-lg ${def.bg} border ${def.border} flex items-center justify-center shrink-0`}>
                      <span className={`${def.color} text-sm`}>{def.icon}</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-700">{def.title}</p>
                    </div>
                    {conn ? (
                      <button onClick={() => disconnectCalendar(def.key)}
                        className="text-xs text-slate-400 hover:text-red-500 transition-colors">Trennen</button>
                    ) : null}
                  </div>
                  {conn ? (
                    <div className={`p-2 rounded-lg ${def.bg} border ${def.border}`}>
                      <input type="url" defaultValue={conn.bookingUrl}
                        onBlur={e => updateBookingUrl(def.key, e.target.value)}
                        placeholder={def.urlPlaceholder} className={inp} />
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input type="url" value={urlDraft[def.key] || ""}
                        onChange={e => setUrlDraft(p => ({ ...p, [def.key]: e.target.value }))}
                        placeholder={def.urlPlaceholder} className={`flex-1 ${inp}`} />
                      <button disabled={!urlDraft[def.key]?.trim()}
                        onClick={() => connectCalendar(def, urlDraft[def.key])}
                        className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-xs font-semibold transition-all whitespace-nowrap">
                        Verbinden
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* How it works explanation */}
          <div className="p-4 rounded-xl bg-violet-50 border border-violet-100">
            <p className="text-xs font-semibold text-violet-700 mb-2">So funktioniert die Kalender-Integration</p>
            <div className="space-y-1.5 text-xs text-violet-600 leading-relaxed">
              <p>1. Lead schreibt z.B. &quot;Ja, Termin wäre super!&quot;</p>
              <p>2. ROYA erkennt den Terminwunsch automatisch</p>
              <p>3. Dein Google Kalender wird in Echtzeit auf freie Zeiten geprüft</p>
              <p>4. Der Agent schlägt nur tatsächlich verfügbare Zeiten vor</p>
              <p>5. Keine Doppelbuchungen — alles automatisch ✓</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Billing Tab ── */}
      {activeTab === "billing" && (
        <div className="space-y-4">
          {/* Current Plan Card */}
          {billing ? (
            <>
              <div className="glass-card p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="font-semibold text-slate-800 text-sm">Aktueller Plan</h2>
                    <p className="text-slate-400 text-xs mt-0.5">{billing.agencyName}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-3 py-1 rounded-lg text-xs font-bold ${
                      billing.plan === "enterprise" ? "bg-amber-100 text-amber-700" :
                      billing.plan === "agency" ? "bg-violet-100 text-violet-700" :
                      billing.plan === "growth" ? "bg-blue-100 text-blue-700" :
                      "bg-slate-100 text-slate-600"
                    }`}>
                      {billing.planLabel}
                    </span>
                    {billing.subscriptionStatus === "active" && (
                      <span className="flex items-center gap-1">
                        <span className="status-dot-green" />
                        <span className="text-emerald-600 text-[10px] font-medium">Aktiv</span>
                      </span>
                    )}
                    {billing.subscriptionStatus === "past_due" && (
                      <span className="text-red-500 text-[10px] font-medium">Zahlung ausstehend</span>
                    )}
                    {billing.subscriptionStatus === "canceling" && (
                      <span className="text-amber-500 text-[10px] font-medium">Läuft aus</span>
                    )}
                  </div>
                </div>

                {/* Usage Bars */}
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-[11px] text-slate-500">Kontakte</span>
                      <span className="text-[11px] text-slate-600 font-medium">
                        {billing.usage.contacts.toLocaleString()} / {billing.limits.maxContacts === Infinity ? "∞" : billing.limits.maxContacts.toLocaleString()}
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${
                        billing.contactsPercent > 90 ? "bg-red-400" : billing.contactsPercent > 70 ? "bg-amber-400" : "bg-violet-400"
                      }`} style={{ width: `${Math.min(billing.contactsPercent, 100)}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-[11px] text-slate-500">Endkunden</span>
                      <span className="text-[11px] text-slate-600 font-medium">
                        {billing.usage.clients} / {billing.limits.maxClients === Infinity ? "∞" : billing.limits.maxClients}
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-violet-400 transition-all"
                        style={{ width: `${billing.limits.maxClients === Infinity ? 0 : Math.min(Math.round((billing.usage.clients / billing.limits.maxClients) * 100), 100)}%` }} />
                    </div>
                  </div>
                </div>

                {/* Active channels */}
                <div className="mt-4 flex gap-2">
                  {["email", "sms", "whatsapp"].map(ch => (
                    <span key={ch} className={`px-2.5 py-1 rounded-lg text-[10px] font-medium ${
                      billing.limits.channels.includes(ch) 
                        ? "bg-emerald-50 text-emerald-600 border border-emerald-200" 
                        : "bg-slate-50 text-slate-300 border border-slate-100 line-through"
                    }`}>
                      {ch === "email" ? "📧 E-Mail" : ch === "sms" ? "💬 SMS" : "📱 WhatsApp"}
                    </span>
                  ))}
                </div>

                {billing.currentPeriodEnd && (
                  <p className="text-[10px] text-slate-400 mt-3">
                    Nächste Abrechnung: {new Date(billing.currentPeriodEnd).toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" })}
                  </p>
                )}
              </div>

              {/* Plan Comparison */}
              <div className="glass-card p-6">
                <h2 className="font-semibold text-slate-800 text-sm mb-4">Verfügbare Pläne</h2>
                <div className="grid grid-cols-2 gap-3">
                  {billing.allPlans.filter(p => p.id !== "enterprise").map(p => {
                    const isCurrent = p.id === billing.plan;
                    const isUpgrade = billing.allPlans.findIndex(x => x.id === p.id) > billing.allPlans.findIndex(x => x.id === billing.plan);
                    return (
                      <div key={p.id} className={`p-4 rounded-xl border-2 transition-all ${
                        isCurrent ? "border-violet-400 bg-violet-50" : "border-slate-200 bg-white hover:border-violet-200"
                      }`}>
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-bold text-slate-800 text-sm">{p.label}</h3>
                          {isCurrent && <span className="bg-violet-500 text-white text-[9px] px-2 py-0.5 rounded-full font-bold">AKTUELL</span>}
                        </div>
                        <p className="text-xl font-bold text-slate-900">
                          {p.priceMonthly === 0 ? "Individuell" : `€${(p.priceMonthly / 100).toLocaleString()}`}
                          {p.priceMonthly > 0 && <span className="text-xs font-normal text-slate-400">/Monat</span>}
                        </p>
                        <div className="mt-3 space-y-1.5">
                          <p className="text-[11px] text-slate-500">
                            ✓ {p.maxContacts === Infinity ? "Unbegrenzt" : p.maxContacts.toLocaleString()} Kontakte
                          </p>
                          <p className="text-[11px] text-slate-500">
                            ✓ {p.maxClients === Infinity ? "Unbegrenzt" : p.maxClients} Endkunden
                          </p>
                          <p className="text-[11px] text-slate-500">
                            ✓ {p.channels.join(", ")}
                          </p>
                        </div>
                        {!isCurrent && isUpgrade && (
                          <button
                            disabled={billingLoading}
                            onClick={async () => {
                              setBillingLoading(true);
                              try {
                                const res = await fetch("/api/billing/checkout", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ agencyId: billing.agencyId, plan: p.id }),
                                }).then(r => r.json());
                                if (res.url) window.location.href = res.url;
                                else alert(res.error || "Checkout fehlgeschlagen");
                              } catch { alert("Verbindungsfehler"); }
                              setBillingLoading(false);
                            }}
                            className="w-full mt-3 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-xs font-semibold transition-all">
                            {billingLoading ? "…" : "Upgrade →"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Manage Subscription */}
              {billing.hasSubscription && (
                <div className="glass-card p-6">
                  <h2 className="font-semibold text-slate-800 text-sm mb-3">Abo verwalten</h2>
                  <p className="text-xs text-slate-500 mb-4">
                    Zahlungsmethode ändern, Plan wechseln oder Abo kündigen — alles im Stripe Kundenportal.
                  </p>
                  <button
                    disabled={billingLoading}
                    onClick={async () => {
                      setBillingLoading(true);
                      try {
                        const res = await fetch("/api/billing/portal", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ agencyId: billing.agencyId }),
                        }).then(r => r.json());
                        if (res.url) window.location.href = res.url;
                        else alert(res.error || "Portal-Fehler");
                      } catch { alert("Verbindungsfehler"); }
                      setBillingLoading(false);
                    }}
                    className="px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-semibold transition-all">
                    {billingLoading ? "…" : "Stripe Kundenportal öffnen →"}
                  </button>
                </div>
              )}

              {/* Env hints for setup */}
              {!billing.hasSubscription && (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
                  <p className="text-xs text-amber-700 leading-relaxed">
                    <span className="font-semibold">Stripe Setup:</span> Setze <code className="bg-amber-100 px-1 rounded text-[10px]">STRIPE_SECRET_KEY</code>,{" "}
                    <code className="bg-amber-100 px-1 rounded text-[10px]">STRIPE_WEBHOOK_SECRET</code> und{" "}
                    <code className="bg-amber-100 px-1 rounded text-[10px]">STRIPE_PRICE_STARTER</code> / <code className="bg-amber-100 px-1 rounded text-[10px]">STRIPE_PRICE_GROWTH</code> / <code className="bg-amber-100 px-1 rounded text-[10px]">STRIPE_PRICE_AGENCY</code>{" "}
                    in <code className="bg-amber-100 px-1 rounded text-[10px]">.env.local</code>.
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="glass-card p-6 text-center">
              <p className="text-sm text-slate-400">Lade Abrechnungsdaten…</p>
            </div>
          )}
        </div>
      )}

      {/* ── System Tab ── */}
      {activeTab === "agents" && (
        <div className="space-y-4">
          {/* Load config on mount */}
          {!agentConfig && (() => { fetch("/api/settings/agent-config").then(r => r.json()).then(setAgentConfig).catch(() => {}); return null; })()}

          {/* Persona */}
          <div className="glass-card p-6">
            <h2 className="font-semibold text-slate-800 text-sm mb-4">Business Persona</h2>
            <p className="text-xs text-slate-400 mb-4">Definiert den Ton und Kontext für alle AI-Agenten.</p>
            {agentConfig && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-500 mb-1 block">Firmenname</label>
                  <input value={agentConfig.persona.companyName}
                    onChange={e => setAgentConfig(c => c ? { ...c, persona: { ...c.persona, companyName: e.target.value } } : c)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 text-sm placeholder-slate-300 focus:outline-none focus:border-violet-400" placeholder="z.B. 10X Coaching" />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 mb-1 block">Branche</label>
                  <input value={agentConfig.persona.industry}
                    onChange={e => setAgentConfig(c => c ? { ...c, persona: { ...c.persona, industry: e.target.value } } : c)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 text-sm placeholder-slate-300 focus:outline-none focus:border-violet-400" placeholder="z.B. SaaS, Coaching, Agentur" />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 mb-1 block">Agent-Name</label>
                  <input value={agentConfig.persona.agentName}
                    onChange={e => setAgentConfig(c => c ? { ...c, persona: { ...c.persona, agentName: e.target.value } } : c)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 text-sm placeholder-slate-300 focus:outline-none focus:border-violet-400" placeholder="z.B. Lena" />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 mb-1 block">Ton</label>
                  <select value={agentConfig.persona.tone}
                    onChange={e => setAgentConfig(c => c ? { ...c, persona: { ...c.persona, tone: e.target.value } } : c)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 text-sm focus:outline-none focus:border-violet-400">
                    <option value="professionell">Professionell</option>
                    <option value="locker">Locker &amp; freundlich</option>
                    <option value="direkt">Direkt &amp; knapp</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 mb-1 block">Sprache</label>
                  <select value={agentConfig.persona.language}
                    onChange={e => setAgentConfig(c => c ? { ...c, persona: { ...c.persona, language: e.target.value } } : c)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 text-sm focus:outline-none focus:border-violet-400">
                    <option value="deutsch-du">Deutsch (Du)</option>
                    <option value="deutsch-sie">Deutsch (Sie)</option>
                    <option value="english">English</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Agent Models */}
          <div className="glass-card p-6">
            <h2 className="font-semibold text-slate-800 text-sm mb-1">Agent-Modelle</h2>
            <p className="text-xs text-slate-400 mb-4">Wähle das Claude-Modell je Agent. Grössere Modelle = bessere Qualität, höhere Kosten.</p>
            {agentConfig && (
              <div className="space-y-2">
                {([
                  { key: "orchestrator",  label: "Orchestrator",   desc: "Kampagnen-Steuerung" },
                  { key: "conversation",  label: "Sleeping Beauty", desc: "Gespräche führen" },
                  { key: "writer",        label: "Writer",          desc: "Nachrichten generieren" },
                  { key: "segmentation",  label: "Segmentierung",   desc: "Kontakte klassifizieren" },
                  { key: "booking",       label: "Booking",         desc: "Termine vereinbaren" },
                  { key: "channelRouter", label: "Channel Router",  desc: "Kanal auswählen" },
                  { key: "analytics",     label: "Analytics",       desc: "Insights generieren" },
                ] as { key: string; label: string; desc: string }[]).map(a => (
                  <div key={a.key} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-800">{a.label}</p>
                      <p className="text-[10px] text-slate-400">{a.desc}</p>
                    </div>
                    <select value={agentConfig.agents[a.key]?.model || "claude-haiku-4-5"}
                      onChange={e => setAgentConfig(c => c ? { ...c, agents: { ...c.agents, [a.key]: { ...c.agents[a.key], model: e.target.value } } } : c)}
                      className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:border-violet-400">
                      <option value="claude-opus-4-6">Opus 4.6 (top)</option>
                      <option value="claude-sonnet-4-6">Sonnet 4.6</option>
                      <option value="claude-haiku-4-5">Haiku 4.5 (schnell)</option>
                    </select>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={agentConfig.agents[a.key]?.enabled !== false}
                        onChange={e => setAgentConfig(c => c ? { ...c, agents: { ...c.agents, [a.key]: { ...c.agents[a.key], enabled: e.target.checked } } } : c)}
                        className="rounded" />
                      <span className="text-[10px] text-slate-500">Aktiv</span>
                    </label>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notifications */}
          <div className="glass-card p-6">
            <h2 className="font-semibold text-slate-800 text-sm mb-4">Benachrichtigungen</h2>
            {agentConfig && (
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] text-slate-500 mb-1 block">Benachrichtigungs-E-Mail</label>
                  <input value={agentConfig.notifications.emailAddress}
                    onChange={e => setAgentConfig(c => c ? { ...c, notifications: { ...c.notifications, emailAddress: e.target.value } } : c)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 text-sm placeholder-slate-300 focus:outline-none focus:border-violet-400"
                    placeholder="team@agentur.de" />
                </div>
                {([
                  { key: "escalationEmail" as const, label: "Eskalation: sofort per E-Mail benachrichtigen" },
                  { key: "bookingAlert" as const,    label: "Buchung: sofort per E-Mail benachrichtigen" },
                  { key: "dailySummary" as const,    label: "Tägliche Zusammenfassung (morgens)" },
                ]).map(n => (
                  <label key={n.key} className="flex items-center gap-3 px-3 py-2.5 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors">
                    <input type="checkbox" checked={agentConfig.notifications[n.key]}
                      onChange={e => setAgentConfig(c => c ? { ...c, notifications: { ...c.notifications, [n.key]: e.target.checked } } : c)}
                      className="rounded" />
                    <span className="text-sm text-slate-700">{n.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Save */}
          <button
            disabled={agentSaving || !agentConfig}
            onClick={async () => {
              if (!agentConfig) return;
              setAgentSaving(true);
              await fetch("/api/settings/agent-config", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ config: agentConfig }),
              });
              setAgentSaving(false);
              setAgentSaved(true);
              setTimeout(() => setAgentSaved(false), 3000);
            }}
            className="w-full py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white font-semibold rounded-xl transition-all">
            {agentSaving ? "Speichert…" : agentSaved ? "✓ Gespeichert" : "Agent-Konfiguration speichern"}
          </button>
        </div>
      )}

      {/* ── System Tab (original) ── */}
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
                "MAILGUN_WEBHOOK_SIGNING_KEY=...",
                "GOOGLE_CALENDAR_CLIENT_ID=... (Google Cloud Console)",
                "GOOGLE_CALENDAR_CLIENT_SECRET=...",
                "STRIPE_SECRET_KEY=sk_live_...",
                "STRIPE_WEBHOOK_SECRET=whsec_...",
                "STRIPE_PRICE_STARTER=price_...",
                "STRIPE_PRICE_GROWTH=price_...",
                "STRIPE_PRICE_AGENCY=price_...",
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
