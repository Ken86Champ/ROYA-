"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";

interface ConnectedCalendar {
  key: string; title: string; icon: string;
  bg: string; border: string; color: string;
  bookingUrl: string;
}
import {
  type Channel, type LeadProfile, type MessageVariation, type BusinessContext,
  DEFAULT_CONTEXT, SEGMENT_META, STATE_META,
  buildLeadProfile, generateInitialMessages, generateStateResponse, generateBookingMessages,
} from "@/lib/reactivation-engine";

// ─── CSV PARSER ───────────────────────────────────────────────────────────────

function parseCSV(text: string) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return null;
  const split = (line: string) => {
    const res: string[] = []; let cur = ""; let inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if ((ch === "," || ch === ";") && !inQ) { res.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    res.push(cur.trim()); return res;
  };
  const headers = split(lines[0]);
  const rows = lines.slice(1).map(l => {
    const cols = split(l); const o: Record<string, string> = {};
    headers.forEach((h, i) => { o[h] = cols[i] ?? ""; }); return o;
  });
  return { headers, rows };
}

function suggestMapping(h: string): string {
  const s = h.toLowerCase().replace(/[_\s-]/g, "");
  if (/email|mail/.test(s)) return "email";
  if (/phone|tel|mobil/.test(s)) return "phone";
  if (/firstname|vorname/.test(s)) return "firstName";
  if (/lastname|nachname/.test(s)) return "lastName";
  if (/name/.test(s)) return "fullName";
  if (/company|firma|unternehmen/.test(s)) return "company";
  if (/title|position|jobtitel/.test(s)) return "jobTitle";
  if (/industry|branche/.test(s)) return "industry";
  if (/city|stadt/.test(s)) return "city";
  if (/date|datum|lastcontact/.test(s)) return "lastContact";
  if (/deal|value|wert/.test(s)) return "dealValue";
  if (/note|notiz/.test(s)) return "notes";
  return "ignore";
}

const STANDARD_FIELDS = [
  { id: "ignore", label: "— Ignorieren —" }, { id: "firstName", label: "Vorname" },
  { id: "lastName", label: "Nachname" }, { id: "fullName", label: "Vollst. Name" },
  { id: "email", label: "E-Mail" }, { id: "phone", label: "Telefon" },
  { id: "company", label: "Unternehmen" }, { id: "jobTitle", label: "Position" },
  { id: "industry", label: "Branche" }, { id: "city", label: "Stadt" },
  { id: "lastContact", label: "Letzter Kontakt" }, { id: "dealValue", label: "Deal-Wert" },
  { id: "notes", label: "Notizen" },
];

// ─── TYPES ────────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4 | 5;

interface AnalyzedLead {
  profile: LeadProfile;
  initialMessages: MessageVariation[];
  selectedInitial?: MessageVariation;
  stateResponses: Record<string, MessageVariation[]>;
  bookingMessages: MessageVariation[];
}

// ─── STEP BAR ─────────────────────────────────────────────────────────────────

const STEPS = [
  { n: 1, label: "Upload" }, { n: 2, label: "Felder" },
  { n: 3, label: "Kontext" }, { n: 4, label: "Analyse" }, { n: 5, label: "Kampagne" },
];

function StepBar({ current, maxReached, onNavigate }: {
  current: Step;
  maxReached: Step;
  onNavigate: (s: Step) => void;
}) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map((s, i) => {
        const clickable = s.n !== current && s.n <= maxReached;
        return (
          <div key={s.n} className="flex items-center">
            <button
              disabled={!clickable && s.n !== current}
              onClick={() => clickable && onNavigate(s.n as Step)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-medium transition-all ${
                s.n === current ? "bg-violet-600 text-white shadow-md shadow-violet-200" :
                s.n < current   ? "bg-violet-50 text-violet-600 hover:bg-violet-100 cursor-pointer" :
                s.n <= maxReached ? "bg-slate-100 text-slate-500 hover:bg-slate-200 cursor-pointer" :
                "text-slate-300 cursor-not-allowed"
              }`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                s.n === current ? "bg-white/20 text-white" :
                s.n < current   ? "bg-violet-200 text-violet-700" : "bg-slate-200 text-slate-400"
              }`}>{s.n < current ? "✓" : s.n}</span>
              {s.label}
            </button>
            {i < STEPS.length - 1 && <div className={`w-6 h-[2px] mx-1 ${s.n < current ? "bg-violet-300" : "bg-slate-200"}`} />}
          </div>
        );
      })}
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function LeadsNewPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const [maxStep, setMaxStep] = useState<Step>(1);

  const goToStep = (s: Step) => {
    setStep(s);
    if (s > maxStep) setMaxStep(s);
  };

  // Step 1
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ReturnType<typeof parseCSV>>(null);
  const [parseError, setParseError] = useState("");

  // Step 2
  const [mappings, setMappings] = useState<{ csvColumn: string; standardField: string }[]>([]);

  // Calendars from Settings
  const [connectedCalendars, setConnectedCalendars] = useState<ConnectedCalendar[]>([]);
  const [selectedCalendarKey, setSelectedCalendarKey] = useState<string>("manual");

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("roya_calendars") || "[]") as ConnectedCalendar[];
      setConnectedCalendars(saved);
      if (saved.length > 0) {
        // Auto-select first connected calendar if bookingLink not yet set
        setSelectedCalendarKey(saved[0].key);
      }
    } catch {}
  }, []);

  // Step 3 — persisted in localStorage
  const [ctx, setCtx] = useState<BusinessContext>(() => {
    if (typeof window === "undefined") return DEFAULT_CONTEXT;
    try {
      const saved = localStorage.getItem("roya_business_context");
      if (saved) return { ...DEFAULT_CONTEXT, ...JSON.parse(saved) };
    } catch {}
    return DEFAULT_CONTEXT;
  });

  const updateCtx = useCallback((patch: Partial<BusinessContext>) => {
    setCtx(prev => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem("roya_business_context", JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  // Step 4
  const [leads, setLeads] = useState<AnalyzedLead[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null);

  // Step 5
  const [channel, setChannel] = useState<Channel>(() => {
    if (typeof window === "undefined") return "email";
    return (localStorage.getItem("roya_channel") as Channel) || "email";
  });

  const updateChannel = (ch: Channel) => {
    setChannel(ch);
    try { localStorage.setItem("roya_channel", ch); } catch {}
  };
  const [selectedInitial, setSelectedInitial] = useState<MessageVariation | null>(null);
  const [activeResponseState, setActiveResponseState] = useState<string>("initial");
  const [showReasoning, setShowReasoning] = useState(false);

  // Live Test Modal
  const [testModal, setTestModal] = useState<{ open: boolean; message: string; subject: string }>({ open: false, message: "", subject: "" });
  const [testTarget, setTestTarget] = useState("");
  const [testSent, setTestSent] = useState(false);

  const openTestModal = (msg: string, subject: string) => {
    setTestModal({ open: true, message: msg, subject });
    setTestSent(false);
    setTestTarget("");
    setTestError("");
  };

  const [testSending, setTestSending] = useState(false);
  const [testError, setTestError] = useState("");

  const sendTest = async () => {
    if (!testTarget.trim()) return;
    setTestError("");
    if (channel === "email") {
      const subj = encodeURIComponent(testModal.subject || "Test-Nachricht von ROYA");
      const body = encodeURIComponent(testModal.message);
      window.open(`mailto:${testTarget}?subject=${subj}&body=${body}`, "_blank");
      setTestSent(true);
      return;
    }
    // SMS / WhatsApp via Twilio API route
    // Credentials from localStorage (Settings page) — server falls back to env vars if empty
    let twilio = { accountSid: "", authToken: "", from: "" };
    try { twilio = JSON.parse(localStorage.getItem("roya_twilio") || "{}"); } catch {}
    setTestSending(true);
    try {
      const res = await fetch("/api/test-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, to: testTarget, body: testModal.message, ...twilio }),
      });
      let data: { error?: string; success?: boolean } = {};
      try { data = await res.json(); } catch {}
      if (!res.ok) { setTestError(data.error || `Fehler beim Senden (${res.status}).`); }
      else { setTestSent(true); }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      setTestError(msg ? `Fehler: ${msg}` : "Netzwerkfehler. Bitte erneut versuchen.");
    } finally {
      setTestSending(false);
    }
  };

  // ── File ──
  const handleFile = useCallback((f: File) => {
    setParseError("");
    setFile(f);
    const reader = new FileReader();
    reader.onload = e => {
      const result = parseCSV(e.target?.result as string);
      if (!result) { setParseError("CSV konnte nicht gelesen werden."); return; }
      setParsed(result);
      setMappings(result.headers.map(h => ({ csvColumn: h, standardField: suggestMapping(h) })));
    };
    reader.readAsText(f, "UTF-8");
  }, []);

  // ── Analyze (chunked — non-blocking for large CSVs) ──
  const [analyzeProgress, setAnalyzeProgress] = useState({ done: 0, total: 0 });

  const runAnalysis = useCallback(() => {
    if (!parsed) return;
    const CHUNK = 50;
    const rows = parsed.rows;
    const total = rows.length;
    setAnalyzing(true);
    setAnalyzeProgress({ done: 0, total });
    setLeads([]);

    const processChunk = (startIdx: number) => {
      const end = Math.min(startIdx + CHUNK, total);
      const chunk: AnalyzedLead[] = [];

      for (let idx = startIdx; idx < end; idx++) {
        const row = rows[idx];
        const norm: Record<string, string> = {};
        mappings.forEach(({ csvColumn, standardField }) => {
          if (standardField !== "ignore") norm[standardField] = row[csvColumn] || "";
        });
        const profile = buildLeadProfile(norm, idx + 1, ctx);
        const initialMessages = generateInitialMessages(profile, channel, ctx);
        const stateResponses: Record<string, MessageVariation[]> = {
          interested:     generateStateResponse("interested",     profile, channel, ctx),
          neutral:        generateStateResponse("neutral",        profile, channel, ctx),
          already_solved: generateStateResponse("already_solved", profile, channel, ctx),
          not_interested: generateStateResponse("not_interested", profile, channel, ctx),
          no_response:    generateStateResponse("no_response",    profile, channel, ctx),
        };
        const bookingMessages = generateBookingMessages(profile, channel, ctx);
        chunk.push({ profile, initialMessages, stateResponses, bookingMessages });
      }

      setLeads(prev => {
        const updated = [...prev, ...chunk];
        if (startIdx === 0) setSelectedLeadId(updated[0]?.profile.id ?? null);
        return updated;
      });
      setAnalyzeProgress({ done: end, total });

      if (end < total) {
        // Yield to browser, then continue next chunk
        setTimeout(() => processChunk(end), 0);
      } else {
        setAnalyzing(false);
      }
    };

    // Small initial delay so the "Analysiere…" UI renders first
    setTimeout(() => processChunk(0), 80);
  }, [parsed, mappings, ctx, channel]);

  const selectedAnalyzed = leads.find(l => l.profile.id === selectedLeadId);
  const segCounts = leads.reduce((acc, l) => { acc[l.profile.segment] = (acc[l.profile.segment] || 0) + 1; return acc; }, {} as Record<string, number>);

  const STATE_TABS = [
    { key: "initial",        label: "Erstnachricht" },
    { key: "interested",     label: "Interessiert" },
    { key: "neutral",        label: "Neutral" },
    { key: "already_solved", label: "Bereits gelöst" },
    { key: "not_interested", label: "Kein Interesse" },
    { key: "no_response",    label: "Keine Antwort" },
    { key: "booking",        label: "Termin" },
  ];

  return (
    <div className="p-8 max-w-[1100px]">
      <div className="mb-6">
        <button onClick={() => router.push("/dashboard/leads")}
          className="text-sm text-slate-400 hover:text-slate-700 transition-colors flex items-center gap-1 mb-4">
          ← Zurück zu Reaktivierung
        </button>
        <h1 className="text-2xl font-bold text-slate-900">Lead Reaktivierungs-Engine</h1>
        <p className="text-slate-400 text-sm mt-1">In 5 Schritten von der CSV zur vollständigen Gesprächsstrategie</p>
      </div>

      <StepBar current={step} maxReached={maxStep} onNavigate={goToStep} />

      {/* ── STEP 1: Upload ── */}
      {step === 1 && (
        <div className="glass-card p-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-1">Lead-Liste hochladen</h2>
          <p className="text-slate-400 text-sm mb-6">CSV-Datei mit bestehenden Leads — die Engine erkennt die Felder automatisch.</p>
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${
              dragging ? "border-violet-400 bg-violet-50" :
              file      ? "border-emerald-300 bg-emerald-50" :
              "border-slate-200 hover:border-violet-300 hover:bg-slate-50"
            }`}>
            <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            {file ? (
              <>
                <div className="w-16 h-16 rounded-2xl bg-emerald-100 border border-emerald-200 flex items-center justify-center mx-auto mb-4">
                  <span className="text-3xl text-emerald-500">✓</span>
                </div>
                <p className="text-emerald-700 font-semibold text-lg">{file.name}</p>
                <p className="text-emerald-600 text-sm mt-1">{parsed?.rows.length ?? 0} Leads · {parsed?.headers.length ?? 0} Spalten</p>
              </>
            ) : (
              <>
                <div className="w-16 h-16 rounded-2xl bg-violet-50 border border-violet-100 flex items-center justify-center mx-auto mb-4">
                  <span className="text-3xl text-violet-300">↑</span>
                </div>
                <p className="text-slate-600 font-semibold">CSV hier hineinziehen oder klicken</p>
                <p className="text-slate-400 text-sm mt-1">.csv, .txt · Unbegrenzte Leads</p>
              </>
            )}
          </div>
          {parseError && <p className="text-red-500 text-sm mt-3">{parseError}</p>}
          <div className="mt-5 p-4 rounded-xl bg-slate-50 border border-slate-200">
            <p className="text-xs font-semibold text-slate-500 mb-1.5">Beispiel-Format:</p>
            <code className="text-xs text-slate-600 font-mono">
              Vorname,Nachname,E-Mail,Unternehmen,Position,Letzter Kontakt,Deal-Wert,Notizen<br/>
              Thomas,Meier,t.meier@firma.ch,Firma AG,CEO,2024-06-15,18500,War sehr interessiert
            </code>
          </div>
          <div className="flex justify-end mt-6">
            <button disabled={!parsed} onClick={() => goToStep(2)}
              className="px-6 py-2.5 bg-violet-600 text-white font-semibold rounded-xl disabled:opacity-40 hover:bg-violet-700 transition-all">
              Weiter → Felder zuordnen
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 2: Mapping ── */}
      {step === 2 && parsed && (
        <div className="glass-card p-8">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 mb-1">Spalten zuordnen</h2>
              <p className="text-slate-400 text-sm">Engine-Vorschläge prüfen und bei Bedarf anpassen.</p>
            </div>
            <span className="badge bg-violet-50 text-violet-600 border border-violet-100">{parsed.headers.length} Spalten</span>
          </div>
          <div className="space-y-2 mb-6">
            <div className="grid grid-cols-3 gap-4 px-4 pb-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">CSV-Spalte</span>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Beispielwert</span>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Internes Feld</span>
            </div>
            {mappings.map((m, i) => (
              <div key={m.csvColumn} className="grid grid-cols-3 gap-4 items-center p-3.5 rounded-xl bg-slate-50 border border-slate-200 hover:border-violet-200 transition-colors">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-md bg-white border border-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-400">{i + 1}</span>
                  <span className="text-sm font-medium text-slate-800 truncate">{m.csvColumn}</span>
                </div>
                <span className="text-xs text-slate-400 font-mono truncate">{parsed.rows[0]?.[m.csvColumn] || "—"}</span>
                <select value={m.standardField}
                  onChange={e => { const u = [...mappings]; u[i] = { ...u[i], standardField: e.target.value }; setMappings(u); }}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:border-violet-400">
                  {STANDARD_FIELDS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                </select>
              </div>
            ))}
          </div>
          {/* Preview */}
          <div className="rounded-xl border border-slate-200 overflow-hidden mb-6">
            <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200">
              <p className="text-xs font-semibold text-slate-500">Vorschau (erste 3 Zeilen)</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200">
                    {mappings.filter(m => m.standardField !== "ignore").map(m => (
                      <th key={m.csvColumn} className="px-3 py-2 text-left font-semibold text-slate-500">
                        {STANDARD_FIELDS.find(f => f.id === m.standardField)?.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.slice(0, 3).map((row, ri) => (
                    <tr key={ri} className="border-b border-slate-100 last:border-0">
                      {mappings.filter(m => m.standardField !== "ignore").map(m => (
                        <td key={m.csvColumn} className="px-3 py-2 text-slate-700 font-mono">{row[m.csvColumn] || "—"}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex justify-between">
            <button onClick={() => setStep(1)} className="px-5 py-2.5 text-slate-500 hover:text-slate-800 text-sm font-medium transition-colors">← Zurück</button>
            <button onClick={() => goToStep(3)} className="px-6 py-2.5 bg-violet-600 text-white font-semibold rounded-xl hover:bg-violet-700 transition-all">Weiter → Kontext</button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Context ── */}
      {step === 3 && (
        <div className="glass-card p-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-1">Business-Kontext</h2>
          <p className="text-slate-400 text-sm mb-6">Dieser Kontext fliesst in jede generierte Nachricht ein.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {([
              { key: "agentName" as const,      label: "Agent-Name (wer schreibt)",       span: false, required: true, ph: "z.B. Sarah" },
              { key: "companyName" as const,     label: "Unternehmensname",                span: false, required: true, ph: "z.B. ROYA" },
              { key: "product" as const,         label: "Produkt / Dienstleistung",        span: false, required: true, ph: "z.B. Revenue Reactivation System" },
              { key: "targetMarket" as const,    label: "Zielsegment",                     span: false, required: false, ph: "z.B. B2B KMU im DACH-Raum" },
              { key: "valueProp" as const,       label: "Value Proposition",               span: true,  required: true, ph: "z.B. 3× mehr Termine ohne manuellen Aufwand" },
              { key: "painPoint" as const,       label: "Hauptschmerz des Leads",          span: false, required: false, ph: "z.B. manuelle Follow-ups" },
              { key: "noConvertReason" as const, label: "Warum hat Lead nicht gekauft?",   span: true,  required: false, ph: "z.B. Timing, Budget, falscher Ansprechpartner" },
              { key: "ctaGoal" as const,         label: "CTA / Gewünschte Aktion",         span: false, required: true, ph: "z.B. 20-Min Demo-Gespräch" },
            ] as const).map(({ key, label, span, required, ph }) => (
              <div key={key} className={span ? "md:col-span-2" : ""}>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  {label} {required && <span className="text-violet-500">*</span>}
                </label>
                <input type="text" value={ctx[key]}
                  onChange={e => updateCtx({ [key]: e.target.value })}
                  placeholder={ph}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-800 text-sm placeholder-slate-300 focus:outline-none focus:border-violet-400 transition-colors" />
              </div>
            ))}

            {/* ── Booking-Link / Kalender-Picker ── */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Booking-Link / Kalender
              </label>
              <div className="space-y-2">
                {/* Connected calendars */}
                {connectedCalendars.map(cal => (
                  <button
                    key={cal.key}
                    type="button"
                    onClick={() => {
                      setSelectedCalendarKey(cal.key);
                      updateCtx({ bookingLink: cal.bookingUrl });
                    }}
                    className={`w-full p-3.5 rounded-xl border text-left transition-all flex items-center gap-3 ${
                      selectedCalendarKey === cal.key
                        ? `${cal.bg} ${cal.border} shadow-sm`
                        : "bg-white border-slate-200 hover:border-violet-200"
                    }`}>
                    <div className={`w-8 h-8 rounded-lg ${cal.bg} border ${cal.border} flex items-center justify-center shrink-0`}>
                      <span className={`text-sm ${cal.color}`}>{cal.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold ${selectedCalendarKey === cal.key ? "text-slate-800" : "text-slate-600"}`}>{cal.title}</p>
                      <p className={`text-[11px] font-mono truncate ${selectedCalendarKey === cal.key ? cal.color : "text-slate-400"}`}>{cal.bookingUrl || "—"}</p>
                    </div>
                    {selectedCalendarKey === cal.key && (
                      <span className="w-5 h-5 rounded-full bg-violet-600 flex items-center justify-center shrink-0">
                        <span className="text-white text-[10px] font-bold">✓</span>
                      </span>
                    )}
                  </button>
                ))}

                {/* Manual input option */}
                <button
                  type="button"
                  onClick={() => setSelectedCalendarKey("manual")}
                  className={`w-full p-3.5 rounded-xl border text-left transition-all flex items-center gap-3 ${
                    selectedCalendarKey === "manual"
                      ? "bg-slate-50 border-slate-300 shadow-sm"
                      : "bg-white border-slate-200 hover:border-slate-300"
                  }`}>
                  <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                    <span className="text-slate-400 text-sm">✎</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-600">Manuell eingeben</p>
                    <p className="text-[11px] text-slate-400">Eigenen Booking-Link verwenden</p>
                  </div>
                  {selectedCalendarKey === "manual" && (
                    <span className="w-5 h-5 rounded-full bg-slate-600 flex items-center justify-center shrink-0">
                      <span className="text-white text-[10px] font-bold">✓</span>
                    </span>
                  )}
                </button>

                {selectedCalendarKey === "manual" && (
                  <input
                    type="url"
                    value={ctx.bookingLink}
                    onChange={e => updateCtx({ bookingLink: e.target.value })}
                    placeholder="z.B. https://cal.com/..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-800 text-sm placeholder-slate-300 focus:outline-none focus:border-violet-400 transition-colors"
                  />
                )}

                {connectedCalendars.length === 0 && (
                  <p className="text-[11px] text-slate-400 pt-1">
                    Tipp: Verbinden Sie Kalender unter{" "}
                    <button onClick={() => router.push("/dashboard/settings")} className="text-violet-500 hover:underline font-medium">Einstellungen → Kalender</button>
                    {" "}für schnelle Auswahl.
                  </p>
                )}
              </div>
            </div>
          </div>
          {/* Channel */}
          <div className="mt-6">
            <label className="block text-sm font-medium text-slate-700 mb-2">Kanal</label>
            <div className="flex gap-2">
              {(["email", "sms", "whatsapp"] as Channel[]).map(ch => (
                <button key={ch} onClick={() => updateChannel(ch)}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${
                    channel === ch ? "bg-violet-600 text-white border-violet-600" : "bg-slate-50 text-slate-500 border-slate-200 hover:border-violet-200"
                  }`}>
                  {ch === "email" ? "✉ E-Mail" : ch === "sms" ? "▣ SMS" : "◊ WhatsApp"}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-between mt-6">
            <button onClick={() => setStep(2)} className="px-5 py-2.5 text-slate-500 hover:text-slate-800 text-sm font-medium transition-colors">← Zurück</button>
            <button
              disabled={!ctx.agentName || !ctx.companyName || !ctx.product || !ctx.ctaGoal}
              onClick={() => { goToStep(4); runAnalysis(); }}
              className="px-6 py-2.5 bg-violet-600 text-white font-semibold rounded-xl disabled:opacity-40 hover:bg-violet-700 transition-all">
              Weiter → Leads analysieren
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 4: Segmentation ── */}
      {step === 4 && (
        <div>
          {analyzing ? (
            <div className="glass-card p-16 flex flex-col items-center justify-center text-center">
              <div className="flex gap-1.5 mb-5">
                {["bg-violet-500", "bg-cyan-500", "bg-emerald-500"].map((c, i) => (
                  <span key={i} className={`w-3 h-3 rounded-full ${c} animate-bounce`} style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
              <p className="text-slate-700 font-semibold mb-1">Leads werden analysiert…</p>
              <p className="text-slate-400 text-sm mb-5">Profiling · Scoring · Hypothesen · Gesprächsstrategie</p>
              {analyzeProgress.total > 0 && (
                <div className="w-64">
                  <div className="flex justify-between text-xs text-slate-400 mb-1.5">
                    <span>{analyzeProgress.done} verarbeitet</span>
                    <span>{analyzeProgress.total} total</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-violet-500 to-cyan-500 rounded-full transition-all duration-200"
                      style={{ width: `${Math.round((analyzeProgress.done / analyzeProgress.total) * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-300 mt-1.5">
                    {Math.round((analyzeProgress.done / analyzeProgress.total) * 100)}%
                  </p>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    {leads.length} {analyzeProgress.total > leads.length ? `/ ${analyzeProgress.total} ` : ""}Leads analysiert
                  </h2>
                  <p className="text-slate-400 text-sm">Klicken Sie einen Lead an um die Gesprächsstrategie zu sehen</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {Object.entries(segCounts).map(([seg, count]) => {
                    const m = SEGMENT_META[seg as keyof typeof SEGMENT_META];
                    return (
                      <span key={seg} className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${m.bg} ${m.border} ${m.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
                        {count} {m.label}
                      </span>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-2">
                {leads.map(({ profile: p }) => {
                  const m = SEGMENT_META[p.segment];
                  const nameDisplay = p.fullName || p.email || `Lead #${p.id}`;
                  const isSelected = selectedLeadId === p.id;
                  return (
                    <div key={p.id}
                      className={`glass-card p-4 border cursor-pointer transition-all group ${isSelected ? "border-violet-400 shadow-md shadow-violet-100" : `${m.border} hover:border-violet-300`}`}
                      onClick={() => { setSelectedLeadId(p.id); goToStep(5); setActiveResponseState("initial"); setSelectedInitial(null); }}>
                      <div className="flex items-start gap-4">
                        <div className={`w-10 h-10 rounded-xl ${m.bg} border ${m.border} flex items-center justify-center shrink-0`}>
                          <span className={`text-lg ${m.color}`}>◉</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1">
                            <span className="font-semibold text-slate-800 text-sm">{nameDisplay}</span>
                            {p.company && <span className="text-xs text-slate-400">{p.company}</span>}
                            {p.jobTitle && <span className="text-xs text-slate-400">· {p.jobTitle}</span>}
                          </div>
                          <p className="text-xs text-slate-500 line-clamp-1 italic">{p.hypothesis}</p>
                          <div className="flex items-center gap-2 flex-wrap mt-1.5">
                            {p.signals.slice(0, 3).map(sig => (
                              <span key={sig} className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">{sig}</span>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-start gap-3 shrink-0">
                          <div className="text-right">
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${m.bg} ${m.border} ${m.color}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
                              {m.label}
                            </span>
                            <p className="text-xs text-slate-400 mt-1">Score: {p.score}</p>
                          </div>
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              setLeads(prev => prev.filter(l => l.profile.id !== p.id));
                              if (selectedLeadId === p.id) setSelectedLeadId(null);
                            }}
                            title="Lead aus Liste entfernen"
                            className="mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center bg-red-50 border border-red-200 text-red-400 hover:bg-red-100 hover:text-red-600 transition-all">
                            ✕
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between mt-6">
                <button onClick={() => setStep(3)} className="px-5 py-2.5 text-slate-500 hover:text-slate-800 text-sm font-medium transition-colors">← Zurück</button>
                <button onClick={() => goToStep(5)} disabled={!selectedLeadId}
                  className="px-6 py-2.5 bg-violet-600 text-white font-semibold rounded-xl disabled:opacity-40 hover:bg-violet-700 transition-all">
                  Kampagne aufbauen →
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── STEP 5: Campaign Builder ── */}
      {step === 5 && selectedAnalyzed && (
        <div>
          {/* Lead Selector Tabs */}
          <div className="flex items-center gap-2 mb-5 flex-wrap">
            <button onClick={() => setStep(4)} className="text-sm text-slate-400 hover:text-slate-700 transition-colors">← Alle Leads</button>
            <span className="text-slate-300">/</span>
            {leads.slice(0, 6).map(({ profile: p }) => {
              const m = SEGMENT_META[p.segment];
              const n = p.firstName || p.fullName?.split(" ")[0] || `Lead ${p.id}`;
              return (
                <button key={p.id}
                  onClick={() => { setSelectedLeadId(p.id); setActiveResponseState("initial"); setSelectedInitial(null); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                    selectedLeadId === p.id ? `${m.bg} ${m.border} ${m.color}` : "bg-slate-50 border-slate-200 text-slate-500 hover:border-violet-200"
                  }`}>
                  {n}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Left: Lead Detail */}
            <div className="space-y-4">
              {(() => {
                const p = selectedAnalyzed.profile;
                const m = SEGMENT_META[p.segment];
                const nameDisplay = p.fullName || p.email || "Unbekannt";
                return (
                  <>
                    <div className="glass-card p-5">
                      <div className="flex items-center gap-3 mb-4">
                        <div className={`w-12 h-12 rounded-xl ${m.bg} border ${m.border} flex items-center justify-center`}>
                          <span className={`text-xl ${m.color}`}>◉</span>
                        </div>
                        <div>
                          <p className="font-bold text-slate-800">{nameDisplay}</p>
                          <p className="text-xs text-slate-400">{p.jobTitle}{p.company ? ` @ ${p.company}` : ""}</p>
                        </div>
                      </div>
                      <div className={`flex items-center justify-between p-2.5 rounded-xl ${m.bg} border ${m.border} mb-3`}>
                        <span className={`text-xs font-bold ${m.color}`}>{m.label}</span>
                        <span className={`text-lg font-black ${m.color}`}>{p.score}</span>
                      </div>
                      <div className="mb-3">
                        <div className="flex justify-between text-[10px] text-slate-400 mb-1"><span>Score</span><span>{p.score}/100</span></div>
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-violet-500 to-violet-400 rounded-full" style={{ width: `${p.score}%` }} />
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Signale</p>
                        <div className="flex flex-wrap gap-1">
                          {p.signals.map(sig => (
                            <span key={sig} className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">{sig}</span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="glass-card p-5">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Hypothese</p>
                      <p className="text-sm text-slate-700 leading-relaxed">{p.hypothesis}</p>
                    </div>

                    <div className="glass-card p-5">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Drop-off Grund</p>
                      <p className="text-sm text-slate-700">{p.dropOffReason}</p>
                      <p className="text-[10px] text-slate-400 mt-2">Konfidenz: {p.confidence === "high" ? "Hoch" : p.confidence === "medium" ? "Mittel" : "Niedrig"}</p>
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Right: Conversation Flow Builder */}
            <div className="lg:col-span-2 glass-card p-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Gesprächsstrategie</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Vollständiger Konversationsfluss für alle 5 Response-States</p>
                </div>
                <button onClick={() => setShowReasoning(!showReasoning)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${showReasoning ? "bg-violet-50 border-violet-200 text-violet-600" : "bg-slate-50 border-slate-200 text-slate-500 hover:border-violet-200"}`}>
                  {showReasoning ? "Begründung aus" : "Begründung ein"}
                </button>
              </div>

              {/* State Tabs */}
              <div className="flex gap-1 flex-wrap mb-5">
                {STATE_TABS.map(({ key, label }) => {
                  const stateMeta = STATE_META[key as keyof typeof STATE_META];
                  return (
                    <button key={key} onClick={() => setActiveResponseState(key)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                        activeResponseState === key
                          ? "bg-violet-600 text-white border-violet-600"
                          : "bg-slate-50 text-slate-500 border-slate-200 hover:border-violet-200"
                      }`}>
                      {stateMeta?.icon} {label}
                    </button>
                  );
                })}
              </div>

              {/* Message Display */}
              {(() => {
                const a = selectedAnalyzed;
                let msgs: MessageVariation[] = [];
                if (activeResponseState === "initial") msgs = a.initialMessages;
                else if (activeResponseState === "booking") msgs = a.bookingMessages;
                else msgs = a.stateResponses[activeResponseState] || [];

                return (
                  <div className="space-y-3">
                    {msgs.map((v, i) => (
                      <div key={v.id}
                        className={`rounded-xl border p-4 transition-all cursor-pointer ${
                          selectedInitial?.id === v.id
                            ? "border-violet-400 bg-violet-50"
                            : "border-slate-200 hover:border-violet-300"
                        }`}
                        onClick={() => activeResponseState === "initial" && setSelectedInitial(v)}>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-700">{v.label}</span>
                            {activeResponseState === "initial" && (
                              <span className="text-[10px] text-slate-400">Variation {i + 1}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                              Score: {v.score}
                            </span>
                            <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{v.tone.split(",")[0]}</span>
                          </div>
                        </div>
                        {v.subject && (
                          <div className="mb-2 px-3 py-1.5 rounded-lg bg-violet-50 border border-violet-100">
                            <span className="text-[10px] text-violet-500 font-semibold">Betreff: </span>
                            <span className="text-[10px] text-violet-700 font-bold">{v.subject}</span>
                          </div>
                        )}
                        <div className="relative">
                          <button
                            onClick={e => { e.stopPropagation(); navigator.clipboard?.writeText(v.body); }}
                            className="absolute top-1 right-1 text-[10px] text-slate-400 hover:text-violet-600 px-1.5 py-0.5 rounded hover:bg-violet-50 transition-colors z-10">
                            ⎘
                          </button>
                          <textarea readOnly value={v.body}
                            rows={channel === "email" ? 7 : 4}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-700 text-sm font-mono resize-none focus:outline-none" />
                        </div>
                        {showReasoning && (
                          <div className="mt-2 p-3 rounded-lg bg-amber-50 border border-amber-100">
                            <p className="text-[10px] text-amber-700 leading-relaxed">{v.reasoning}</p>
                          </div>
                        )}
                      </div>
                    ))}
                    {msgs.length === 0 && (
                      <div className="py-8 text-center">
                        <p className="text-sm text-slate-400">Keine Nachrichten für diesen State generiert.</p>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* CTA Row */}
              <div className="flex gap-3 mt-6 pt-5 border-t border-slate-200 flex-wrap">
                <button className="flex-1 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 transition-all">
                  Kampagne starten →
                </button>
                <button
                  onClick={() => {
                    const a = selectedAnalyzed;
                    const msgs = activeResponseState === "initial" ? a.initialMessages
                      : activeResponseState === "booking" ? a.bookingMessages
                      : a.stateResponses[activeResponseState] || [];
                    const v = msgs[0];
                    if (v) openTestModal(v.body, v.subject || "");
                  }}
                  className="px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium hover:bg-emerald-100 transition-all flex items-center gap-1.5">
                  ✉ Live Test senden
                </button>
                <button onClick={() => {
                  if (selectedAnalyzed) {
                    const p = selectedAnalyzed.profile;
                    const normalized: Record<string, string> = {
                      firstName: p.firstName, lastName: p.lastName,
                      email: p.email, phone: p.phone, company: p.company,
                      jobTitle: p.jobTitle, industry: p.industry, city: p.city,
                      lastContact: p.lastContact, dealValue: String(p.dealValue),
                      notes: p.notes,
                    };
                    try {
                      localStorage.setItem("roya_test_lead", JSON.stringify({ normalized, ctx, channel }));
                    } catch {}
                  }
                  router.push("/dashboard/simulation?from=leads");
                }}
                  className="px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-100 transition-all">
                  Test Lab ↗
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {step === 5 && !selectedAnalyzed && (
        <div className="glass-card p-16 flex flex-col items-center text-center">
          <p className="text-slate-400">Wählen Sie einen Lead in Schritt 4.</p>
          <button onClick={() => setStep(4)} className="mt-4 px-5 py-2 bg-violet-600 text-white text-sm font-semibold rounded-xl hover:bg-violet-700 transition-all">
            ← Zurück zu Leads
          </button>
        </div>
      )}

      {/* ── LIVE TEST MODAL ── */}
      {testModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setTestModal(m => ({ ...m, open: false }))} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-base font-bold text-slate-900">Live Test senden</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {channel === "email" ? "E-Mail an Ihre Adresse" : channel === "sms" ? "SMS an Ihre Nummer" : "WhatsApp an Ihre Nummer"}
                </p>
              </div>
              <button onClick={() => setTestModal(m => ({ ...m, open: false }))} className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 text-sm transition-colors">✕</button>
            </div>

            {testSent ? (
              <div className="py-8 text-center">
                <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto mb-3">
                  <span className="text-2xl text-emerald-500">✓</span>
                </div>
                <p className="font-semibold text-slate-800 mb-1">
                  {channel === "email" ? "E-Mail-Client geöffnet" : "Test gesendet"}
                </p>
                <p className="text-sm text-slate-400">
                  {channel === "email"
                    ? "Prüfen Sie Ihr E-Mail-Programm — die Nachricht ist bereit zum Absenden."
                    : `Nachricht an ${testTarget} übermittelt.`}
                </p>
                <button onClick={() => setTestModal(m => ({ ...m, open: false }))} className="mt-5 px-5 py-2 bg-violet-600 text-white text-sm font-semibold rounded-xl hover:bg-violet-700 transition-all">Schliessen</button>
              </div>
            ) : (
              <>
                {/* Recipient */}
                <div className="mb-4">
                  <label className="text-xs font-semibold text-slate-500 block mb-1.5">
                    {channel === "email" ? "Test-E-Mail-Adresse" : "Test-Nummer (mit Ländervorwahl)"}
                  </label>
                  <input
                    type={channel === "email" ? "email" : "tel"}
                    value={testTarget}
                    onChange={e => setTestTarget(e.target.value)}
                    placeholder={channel === "email" ? "z.B. you@beispiel.ch" : "z.B. +41 79 123 45 67"}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:border-violet-400 transition-colors"
                    autoFocus
                  />
                </div>

                {/* Message Preview */}
                <div className="mb-5">
                  <p className="text-xs font-semibold text-slate-500 mb-1.5">Nachricht</p>
                  {testModal.subject && (
                    <div className="px-3 py-1.5 rounded-t-xl bg-violet-50 border border-violet-100">
                      <span className="text-[10px] text-violet-500 font-semibold">Betreff: </span>
                      <span className="text-[10px] text-violet-700 font-bold">{testModal.subject}</span>
                    </div>
                  )}
                  <textarea readOnly value={testModal.message}
                    rows={5}
                    className={`w-full bg-slate-50 border border-slate-200 text-sm text-slate-600 px-4 py-3 font-mono resize-none focus:outline-none ${testModal.subject ? "rounded-b-xl border-t-0" : "rounded-xl"}`}
                  />
                </div>

                {testError && (
                  <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200">
                    <p className="text-xs text-red-700">{testError}</p>
                  </div>
                )}

                <div className="flex gap-2">
                  <button onClick={() => setTestModal(m => ({ ...m, open: false }))} className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-medium transition-colors">Abbrechen</button>
                  <button
                    onClick={sendTest}
                    disabled={!testTarget.trim() || testSending}
                    className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-sm font-bold transition-all">
                    {testSending ? "Sende…" : channel === "email" ? "✉ E-Mail öffnen" : channel === "sms" ? "▣ SMS senden" : "◊ WhatsApp senden"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
