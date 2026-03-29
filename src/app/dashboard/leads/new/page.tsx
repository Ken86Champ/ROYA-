"use client";
import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
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

function StepBar({ current }: { current: Step }) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map((s, i) => (
        <div key={s.n} className="flex items-center">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-medium transition-all ${
            s.n === current ? "bg-violet-600 text-white shadow-md shadow-violet-200" :
            s.n < current  ? "bg-violet-50 text-violet-600" : "text-slate-400"
          }`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
              s.n === current ? "bg-white/20 text-white" :
              s.n < current  ? "bg-violet-200 text-violet-700" : "bg-slate-100 text-slate-400"
            }`}>{s.n < current ? "✓" : s.n}</span>
            {s.label}
          </div>
          {i < STEPS.length - 1 && <div className={`w-6 h-[2px] mx-1 ${s.n < current ? "bg-violet-300" : "bg-slate-200"}`} />}
        </div>
      ))}
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function LeadsNewPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [step, setStep] = useState<Step>(1);

  // Step 1
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ReturnType<typeof parseCSV>>(null);
  const [parseError, setParseError] = useState("");

  // Step 2
  const [mappings, setMappings] = useState<{ csvColumn: string; standardField: string }[]>([]);

  // Step 3
  const [ctx, setCtx] = useState<BusinessContext>(DEFAULT_CONTEXT);

  // Step 4
  const [leads, setLeads] = useState<AnalyzedLead[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null);

  // Step 5
  const [channel, setChannel] = useState<Channel>("email");
  const [selectedInitial, setSelectedInitial] = useState<MessageVariation | null>(null);
  const [activeResponseState, setActiveResponseState] = useState<string>("initial");
  const [showReasoning, setShowReasoning] = useState(false);

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

  // ── Analyze ──
  const runAnalysis = () => {
    if (!parsed) return;
    setAnalyzing(true);
    setTimeout(() => {
      const result: AnalyzedLead[] = parsed.rows.slice(0, 50).map((row, idx) => {
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
        return { profile, initialMessages, stateResponses, bookingMessages };
      });
      setLeads(result);
      setSelectedLeadId(result[0]?.profile.id ?? null);
      setAnalyzing(false);
    }, 1800);
  };

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

      <StepBar current={step} />

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
                <p className="text-slate-400 text-sm mt-1">.csv, .txt · Bis zu 50 Leads</p>
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
            <button disabled={!parsed} onClick={() => setStep(2)}
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
            <button onClick={() => setStep(3)} className="px-6 py-2.5 bg-violet-600 text-white font-semibold rounded-xl hover:bg-violet-700 transition-all">Weiter → Kontext</button>
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
              { key: "bookingLink" as const,     label: "Booking-Link",                    span: false, required: false, ph: "z.B. https://cal.com/..." },
            ] as const).map(({ key, label, span, required, ph }) => (
              <div key={key} className={span ? "md:col-span-2" : ""}>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  {label} {required && <span className="text-violet-500">*</span>}
                </label>
                <input type="text" value={ctx[key]}
                  onChange={e => setCtx({ ...ctx, [key]: e.target.value })}
                  placeholder={ph}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-800 text-sm placeholder-slate-300 focus:outline-none focus:border-violet-400 transition-colors" />
              </div>
            ))}
          </div>
          {/* Channel */}
          <div className="mt-6">
            <label className="block text-sm font-medium text-slate-700 mb-2">Kanal</label>
            <div className="flex gap-2">
              {(["email", "sms", "whatsapp"] as Channel[]).map(ch => (
                <button key={ch} onClick={() => setChannel(ch)}
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
              onClick={() => { setStep(4); runAnalysis(); }}
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
              <p className="text-slate-700 font-semibold">Leads werden analysiert…</p>
              <p className="text-slate-400 text-sm mt-1">Profiling · Scoring · Hypothesen · Gesprächsstrategie</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">{leads.length} Leads analysiert</h2>
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
                      className={`glass-card p-4 border cursor-pointer transition-all ${isSelected ? "border-violet-400 shadow-md shadow-violet-100" : `${m.border} hover:border-violet-300`}`}
                      onClick={() => { setSelectedLeadId(p.id); setStep(5); setActiveResponseState("initial"); setSelectedInitial(null); }}>
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
                        <div className="text-right shrink-0">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${m.bg} ${m.border} ${m.color}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
                            {m.label}
                          </span>
                          <p className="text-xs text-slate-400 mt-1">Score: {p.score}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between mt-6">
                <button onClick={() => setStep(3)} className="px-5 py-2.5 text-slate-500 hover:text-slate-800 text-sm font-medium transition-colors">← Zurück</button>
                <button onClick={() => setStep(5)} disabled={!selectedLeadId}
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
              <div className="flex gap-3 mt-6 pt-5 border-t border-slate-200">
                <button className="flex-1 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 transition-all">
                  Kampagne starten →
                </button>
                <button onClick={() => router.push("/dashboard/simulation")}
                  className="px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-100 transition-all">
                  Im Test Lab öffnen ↗
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
    </div>
  );
}
