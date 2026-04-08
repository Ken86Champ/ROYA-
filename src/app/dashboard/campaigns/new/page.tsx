"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { FlowStep, StepType, FlowBranch, AIFramework, AIModelId } from "@/lib/campaign-store";
import { AI_MODELS, DEFAULT_AI_FRAMEWORK } from "@/lib/campaign-store";
import type { Client } from "@/lib/client-store";

// ─── STYLING ──────────────────────────────────────────────────────────────────

const inp = "w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-800 text-sm placeholder-slate-300 focus:outline-none focus:border-violet-400 transition-colors";
const sel = `${inp} cursor-pointer`;

// ─── FLOW STEP META ───────────────────────────────────────────────────────────

const STEP_TYPE_META: Record<StepType, { label: string; color: string; bg: string; border: string; icon: string; desc: string }> = {
  opener:    { label: "Opener",     color: "text-violet-600",  bg: "bg-violet-50",  border: "border-violet-200",  icon: "◎", desc: "Erster Kontakt — neugierig machen, kein Pitch" },
  followup:  { label: "Follow-up",  color: "text-blue-600",    bg: "bg-blue-50",    border: "border-blue-200",    icon: "→", desc: "Neuer Winkel — Mehrwert liefern" },
  breakup:   { label: "Break-up",   color: "text-red-500",     bg: "bg-red-50",     border: "border-red-200",     icon: "✕", desc: "Letzte Nachricht — Würde bewahren, Tür offen lassen" },
  booking:   { label: "Booking",    color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200", icon: "◇", desc: "Termin bestätigen und vorbereiten" },
  condition: { label: "Condition",  color: "text-amber-600",   bg: "bg-amber-50",   border: "border-amber-200",   icon: "⊕", desc: "Intent auswerten und Flow verzweigen" },
  exit:      { label: "Exit",       color: "text-slate-500",   bg: "bg-slate-100",  border: "border-slate-300",   icon: "◼", desc: "Kontakt schliessen — Flow endet hier" },
};

const INTENT_OPTIONS: FlowBranch["intent"][] = ["hot", "warm", "cold", "question", "timing", "no_reply", "default"];
const INTENT_LABELS: Record<FlowBranch["intent"], string> = {
  hot: "Hot (bereit)", warm: "Warm (interessiert)", cold: "Kalt (kein Interesse)",
  question: "Frage", timing: "Timing-Problem", no_reply: "Keine Antwort", default: "Default (sonst)",
};

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
  if (/channel|kanal/.test(s)) return "channel";
  return "ignore";
}

const STANDARD_FIELDS = [
  { id: "ignore",    label: "— Ignorieren —" },
  { id: "firstName", label: "Vorname" },
  { id: "lastName",  label: "Nachname" },
  { id: "fullName",  label: "Vollst. Name" },
  { id: "email",     label: "E-Mail" },
  { id: "phone",     label: "Telefon" },
  { id: "company",   label: "Unternehmen" },
  { id: "jobTitle",  label: "Position" },
  { id: "industry",  label: "Branche" },
  { id: "city",      label: "Stadt" },
  { id: "channel",   label: "Kanal (email/sms/whatsapp)" },
];

// ─── FLOW HELPERS ─────────────────────────────────────────────────────────────

function genId() { return `step_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`; }

function defaultFlow(): FlowStep[] {
  return [
    { id: genId(), type: "opener",   label: "Opener",      delayDays: 0,  condition: "no_reply", messageTemplate: "" },
    { id: genId(), type: "followup", label: "Follow-up 1", delayDays: 3,  condition: "no_reply", messageTemplate: "" },
    { id: genId(), type: "followup", label: "Follow-up 2", delayDays: 7,  condition: "no_reply", messageTemplate: "" },
    { id: genId(), type: "breakup",  label: "Break-up",    delayDays: 14, condition: "no_reply", messageTemplate: "" },
  ];
}

// ─── STEP BAR ─────────────────────────────────────────────────────────────────

type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;

const WIZARD_STEPS = [
  { n: 1, label: "Upload" },
  { n: 2, label: "Felder" },
  { n: 3, label: "Einrichten" },
  { n: 4, label: "KI-Setup" },
  { n: 5, label: "Flow" },
  { n: 6, label: "Starten" },
];

function StepBar({ current, maxReached, onNavigate }: {
  current: WizardStep;
  maxReached: WizardStep;
  onNavigate: (s: WizardStep) => void;
}) {
  // Show condensed bar for 6 steps
  return (
    <div className="flex items-center gap-0 mb-8">
      {WIZARD_STEPS.map((s, i) => {
        const clickable = s.n !== current && s.n <= maxReached;
        return (
          <div key={s.n} className="flex items-center">
            <button
              disabled={!clickable && s.n !== current}
              onClick={() => clickable && onNavigate(s.n as WizardStep)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-medium transition-all ${
                s.n === current      ? "bg-violet-600 text-white shadow-md shadow-violet-200" :
                s.n < current        ? "bg-violet-50 text-violet-600 hover:bg-violet-100 cursor-pointer" :
                s.n <= maxReached    ? "bg-slate-100 text-slate-500 hover:bg-slate-200 cursor-pointer" :
                "text-slate-300 cursor-not-allowed"
              }`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                s.n === current ? "bg-white/20 text-white" :
                s.n < current   ? "bg-violet-200 text-violet-700" : "bg-slate-200 text-slate-400"
              }`}>{s.n < current ? "✓" : s.n}</span>
              {s.label}
            </button>
            {i < WIZARD_STEPS.length - 1 && <div className={`w-6 h-[2px] mx-1 ${s.n < current ? "bg-violet-300" : "bg-slate-200"}`} />}
          </div>
        );
      })}
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function NewCampaignPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<WizardStep>(1);
  const [maxStep, setMaxStep] = useState<WizardStep>(1);
  const [dragging, setDragging] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [editingStep, setEditingStep] = useState<string | null>(null);
  const [clients, setClients] = useState<Client[]>([]);

  // Step 1 — Upload
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ReturnType<typeof parseCSV>>(null);
  const [parseError, setParseError] = useState("");

  // Step 2 — Column mapping
  const [mappings, setMappings] = useState<{ csvColumn: string; standardField: string }[]>([]);

  // Steps 3–5 — Campaign form
  const [form, setForm] = useState({
    name: "",
    clientId: "",
    channels: [] as string[],
    flow: defaultFlow(),
    aiFramework: { ...DEFAULT_AI_FRAMEWORK } as AIFramework,
  });

  useEffect(() => {
    fetch("/api/clients").then(r => r.json()).then(setClients).catch(() => {});
  }, []);

  const goToStep = (s: WizardStep) => {
    setStep(s);
    if (s > maxStep) setMaxStep(s);
  };

  const toggleChannel = (ch: string) =>
    setForm(f => ({ ...f, channels: f.channels.includes(ch) ? f.channels.filter(c => c !== ch) : [...f.channels, ch] }));

  const handleFile = (f: File) => {
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
  };

  // Build contacts from mappings
  const buildContacts = () => {
    if (!parsed) return [];
    return parsed.rows.map(row => {
      const obj: Record<string, string> = {};
      mappings.forEach(({ csvColumn, standardField }) => {
        if (standardField !== "ignore") obj[standardField] = row[csvColumn] || "";
      });
      const name = obj.fullName || [obj.firstName, obj.lastName].filter(Boolean).join(" ") || "";
      const contact = obj.email || obj.phone || "";
      const rawChannel = (obj.channel || "").toLowerCase();
      const channel = ["email", "sms", "whatsapp"].includes(rawChannel) ? rawChannel
        : contact.includes("@") ? "email" : "sms";
      return { name, contact, channel, ...obj };
    }).filter(c => c.contact);
  };

  // Flow step helpers
  const updateFlowStep = (id: string, patch: Partial<FlowStep>) =>
    setForm(f => ({ ...f, flow: f.flow.map(s => s.id === id ? { ...s, ...patch } : s) }));

  const addBranch = (stepId: string) =>
    setForm(f => ({ ...f, flow: f.flow.map(s => s.id !== stepId ? s : {
      ...s, branches: [...(s.branches ?? []), { intent: "default" as const, nextStepIndex: 0 }]
    })}));

  const updateBranch = (stepId: string, branchIdx: number, patch: Partial<FlowBranch>) =>
    setForm(f => ({ ...f, flow: f.flow.map(s => s.id !== stepId ? s : {
      ...s, branches: (s.branches ?? []).map((b, i) => i === branchIdx ? { ...b, ...patch } : b)
    })}));

  const removeBranch = (stepId: string, branchIdx: number) =>
    setForm(f => ({ ...f, flow: f.flow.map(s => s.id !== stepId ? s : {
      ...s, branches: (s.branches ?? []).filter((_, i) => i !== branchIdx)
    })}));

  const addFlowStep = (type: StepType) => {
    const last = form.flow[form.flow.length - 1];
    const newStep: FlowStep = {
      id: genId(), type, label: STEP_TYPE_META[type].label,
      delayDays: type === "condition" || type === "exit" ? 0 : (last?.delayDays ?? 0) + 3,
      condition: "no_reply", messageTemplate: "",
      ...(type === "condition" ? { branches: [{ intent: "hot" as const, nextStepIndex: 0 }, { intent: "default" as const, nextStepIndex: 0 }] } : {}),
    };
    setForm(f => ({ ...f, flow: [...f.flow, newStep] }));
    setEditingStep(newStep.id);
  };

  const removeFlowStep = (id: string) =>
    setForm(f => ({ ...f, flow: f.flow.filter(s => s.id !== id) }));

  const moveFlowStep = (id: string, dir: -1 | 1) => {
    setForm(f => {
      const arr = [...f.flow];
      const i = arr.findIndex(s => s.id === id);
      if (i < 0 || i + dir < 0 || i + dir >= arr.length) return f;
      [arr[i], arr[i + dir]] = [arr[i + dir], arr[i]];
      return { ...f, flow: arr };
    });
  };

  const handleLaunch = async () => {
    setLaunching(true);
    const contacts = buildContacts();
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          clientId: form.clientId || undefined,
          channels: form.channels,
          flow: form.flow,
          aiFramework: form.aiFramework,
          contacts,
        }),
      });
      const camp = await res.json();
      router.push(`/dashboard/campaigns/${camp.id}/simulate`);
    } catch {
      setLaunching(false);
    }
  };

  const contacts = buildContacts();

  return (
    <div className="p-8 max-w-3xl overflow-auto h-full">
      <div className="mb-6">
        <button onClick={() => router.push("/dashboard/campaigns")}
          className="text-sm text-slate-400 hover:text-slate-700 transition-colors flex items-center gap-1 mb-4">
          ← Zurück zu Kampagnen
        </button>
        <h1 className="text-2xl font-bold text-slate-900">Kampagnen-Engine</h1>
        <p className="text-slate-400 text-sm mt-1">In 5 Schritten von der CSV zur vollständigen Kampagne</p>
      </div>

      <StepBar current={step} maxReached={maxStep} onNavigate={goToStep} />

      {/* ── STEP 1: Upload ── */}
      {step === 1 && (
        <div className="glass-card p-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-1">Kontaktliste hochladen</h2>
          <p className="text-slate-400 text-sm mb-6">CSV-Datei mit Kontakten — die Engine erkennt die Felder automatisch.</p>
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
                <p className="text-emerald-600 text-sm mt-1">{parsed?.rows.length ?? 0} Kontakte · {parsed?.headers.length ?? 0} Spalten · Klicken zum Ersetzen</p>
              </>
            ) : (
              <>
                <div className="w-16 h-16 rounded-2xl bg-violet-50 border border-violet-100 flex items-center justify-center mx-auto mb-4">
                  <span className="text-3xl text-violet-300">↑</span>
                </div>
                <p className="text-slate-600 font-semibold">CSV hier hineinziehen oder klicken</p>
                <p className="text-slate-400 text-sm mt-1">.csv, .txt · Unbegrenzte Kontakte</p>
              </>
            )}
          </div>
          {parseError && <p className="text-red-500 text-sm mt-3">{parseError}</p>}
          <div className="mt-5 p-4 rounded-xl bg-slate-50 border border-slate-200">
            <p className="text-xs font-semibold text-slate-500 mb-1.5">Beispiel-Format:</p>
            <code className="text-xs text-slate-600 font-mono">
              Vorname,Nachname,E-Mail,Unternehmen,Kanal<br/>
              Anna,Müller,a.mueller@firma.ch,Firma AG,email
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

      {/* ── STEP 2: Column mapping ── */}
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
            <button onClick={() => goToStep(3)} className="px-6 py-2.5 bg-violet-600 text-white font-semibold rounded-xl hover:bg-violet-700 transition-all">
              Weiter → Einrichten
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Setup ── */}
      {step === 3 && (
        <div className="glass-card p-6 space-y-5">
          <h2 className="text-base font-semibold text-slate-800">Kampagne einrichten</h2>
          <div>
            <label className="text-xs text-slate-500 block mb-1.5">Kampagnen-Name *</label>
            <input type="text" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="z.B. Q3 2026 Tech-KMU Reaktivierung" className={inp} />
          </div>
          {clients.length > 0 && (
            <div>
              <label className="text-xs text-slate-500 block mb-1.5">Endkunde (optional)</label>
              <select value={form.clientId} onChange={e => setForm(f => ({ ...f, clientId: e.target.value }))} className={sel}>
                <option value="">Kein Endkunde</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.company}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="text-xs text-slate-500 block mb-1.5">Kanäle *</label>
            <div className="flex gap-3">
              {[{ id: "email", icon: "✉", label: "E-Mail" }, { id: "sms", icon: "▣", label: "SMS" }, { id: "whatsapp", icon: "◊", label: "WhatsApp" }].map(ch => (
                <button key={ch.id} onClick={() => toggleChannel(ch.id)}
                  className={`flex-1 py-3 rounded-xl border text-sm font-medium transition-all flex flex-col items-center gap-1 ${
                    form.channels.includes(ch.id) ? "bg-violet-600 border-violet-600 text-white shadow-md shadow-violet-200" : "border-slate-200 text-slate-500 bg-slate-50 hover:border-violet-300"
                  }`}>
                  <span className="text-xl">{ch.icon}</span>
                  <span>{ch.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setStep(2)} className="flex-1 btn-secondary py-2.5 text-sm">← Zurück</button>
            <button onClick={() => goToStep(4)} disabled={!form.name || form.channels.length === 0}
              className="flex-1 btn-primary py-3 text-sm disabled:opacity-40 disabled:cursor-not-allowed">
              Weiter → KI-Setup
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 4: KI-Setup ── */}
      {step === 4 && (() => {
        const fw = form.aiFramework;
        const setFw = (patch: Partial<AIFramework>) =>
          setForm(f => ({ ...f, aiFramework: { ...f.aiFramework, ...patch } }));
        const toggleRule = (r: string) => setFw({
          rules: fw.rules.includes(r) ? fw.rules.filter(x => x !== r) : [...fw.rules, r]
        });
        const RULES = [
          { id: "max_2_sentences",    label: "Max. 2 Sätze pro Antwort" },
          { id: "end_with_question",  label: "Immer mit Frage abschliessen" },
          { id: "no_price_in_opener", label: "Kein Preis im ersten Kontakt" },
          { id: "use_first_name",     label: "Lead mit Vornamen ansprechen" },
          { id: "no_emoji",           label: "Keine Emojis" },
          { id: "swiss_german_ok",    label: "Schweizerdeutsch erlaubt" },
        ];
        return (
          <div className="space-y-4">
            {/* Agent Identity */}
            <div className="glass-card p-6 space-y-4">
              <h2 className="text-base font-semibold text-slate-800">KI-Agenten-Profil</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-500 block mb-1.5">Agent-Name</label>
                  <input value={fw.agentName} onChange={e => setFw({ agentName: e.target.value })} className={inp} placeholder="Lena" />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1.5">Rolle</label>
                  <input value={fw.agentRole} onChange={e => setFw({ agentRole: e.target.value })} className={inp} placeholder="Reaktivierungsagentin" />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1.5">Ton & Persönlichkeit</label>
                <input value={fw.tone} onChange={e => setFw({ tone: e.target.value })} className={inp} placeholder="Warm, direkt und menschlich…" />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1.5">Sprache</label>
                <select value={fw.language} onChange={e => setFw({ language: e.target.value })} className={sel}>
                  <option value="de">Deutsch</option>
                  <option value="en">English</option>
                  <option value="fr">Français</option>
                  <option value="it">Italiano</option>
                </select>
              </div>
            </div>

            {/* Model Routing */}
            <div className="glass-card p-6 space-y-4">
              <div>
                <h2 className="text-base font-semibold text-slate-800">Modell-Routing</h2>
                <p className="text-xs text-slate-400 mt-0.5">Standard für normale Gespräche · Premium für komplexe Fälle</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {(["standardModel", "premiumModel"] as const).map(key => (
                  <div key={key}>
                    <label className="text-xs text-slate-500 block mb-1.5">
                      {key === "standardModel" ? "Standard-Modell" : "Premium-Modell"}
                    </label>
                    <div className="space-y-2">
                      {AI_MODELS.map(m => (
                        <button key={m.id} disabled={!m.available}
                          onClick={() => setFw({ [key]: m.id as AIModelId })}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all text-sm ${
                            fw[key] === m.id
                              ? "bg-violet-50 border-violet-400 text-violet-900"
                              : m.available
                              ? "bg-white border-slate-200 text-slate-700 hover:border-violet-300"
                              : "bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed"
                          }`}>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                            m.provider === "anthropic" ? "bg-violet-100 text-violet-700" :
                            m.provider === "openai"    ? "bg-emerald-100 text-emerald-700" :
                            "bg-blue-100 text-blue-700"
                          }`}>{m.badge}</span>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate text-xs">{m.label}</p>
                            <p className="text-[10px] text-slate-400 truncate">{m.desc}</p>
                          </div>
                          {fw[key] === m.id && <span className="text-violet-500 text-xs shrink-0">✓</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                <div>
                  <label className="text-xs text-slate-500 block mb-1.5">Eskalation nach (Turns)</label>
                  <input type="number" min={1} max={20} value={fw.escalation.afterTurns}
                    onChange={e => setFw({ escalation: { ...fw.escalation, afterTurns: Number(e.target.value) } })}
                    className={inp} />
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1.5">Eskalations-Trigger</label>
                  <p className="text-xs text-slate-400 mt-1">Auto: bei Preisfragen, Einwänden, Buchungsbereitschaft</p>
                </div>
              </div>
            </div>

            {/* Conversation Rules */}
            <div className="glass-card p-6 space-y-4">
              <h2 className="text-base font-semibold text-slate-800">Gesprächsregeln</h2>
              <div className="grid grid-cols-2 gap-2">
                {RULES.map(r => (
                  <button key={r.id} onClick={() => toggleRule(r.id)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left text-xs transition-all ${
                      fw.rules.includes(r.id)
                        ? "bg-violet-50 border-violet-300 text-violet-800"
                        : "bg-white border-slate-200 text-slate-600 hover:border-violet-200"
                    }`}>
                    <span className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${fw.rules.includes(r.id) ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-400"}`}>
                      {fw.rules.includes(r.id) ? "✓" : ""}
                    </span>
                    {r.label}
                  </button>
                ))}
              </div>

              {/* Custom system prompt */}
              <div>
                <label className="text-xs text-slate-500 block mb-1.5">
                  Custom-Anweisungen <span className="text-slate-300">(optional — wird in jeden Prompt injiziert)</span>
                </label>
                <textarea value={fw.systemPrompt} onChange={e => setFw({ systemPrompt: e.target.value })}
                  rows={4} placeholder="z.B.: Erwähne immer unseren USP 'kein Jahresvertrag'. Frage nach dem aktuellen Anbieter des Leads…"
                  className={`${inp} resize-none`} />
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep(3)} className="flex-1 btn-secondary py-2.5 text-sm">← Zurück</button>
              <button onClick={() => goToStep(5)} className="flex-1 btn-primary py-2.5 text-sm">Weiter → Flow Designer</button>
            </div>
          </div>
        );
      })()}

      {/* ── STEP 5: Flow Designer ── */}
      {step === 5 && (
        <div className="space-y-4">
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-800">Conversation Flow</h2>
                <p className="text-xs text-slate-400 mt-0.5">Verkaufspsychologisch optimierter 4-Touchpoint-Flow</p>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-slate-400">KI generiert alle Nachrichten automatisch</span>
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
              </div>
            </div>

            <div className="p-3 rounded-xl bg-violet-50 border border-violet-100 mb-5 text-xs text-violet-700 leading-relaxed">
              <span className="font-semibold">Strategie:</span> Opener (Pattern Interrupt) → Follow-up (Reciprocity + Social Proof) → Break-up (Loss Aversion). Condition-Nodes verzweigen den Flow je nach Intent des Leads.
            </div>

            <div className="space-y-3">
              {form.flow.map((s, i) => {
                const meta = STEP_TYPE_META[s.type];
                const isEditing = editingStep === s.id;
                const isCondition = s.type === "condition";
                const isExit = s.type === "exit";

                return (
                  <div key={s.id}>
                    <div className={`rounded-xl border transition-all ${isEditing ? `${meta.bg} ${meta.border}` : "bg-white border-slate-200"}`}>
                      <div className="flex items-center gap-3 p-4 cursor-pointer"
                        onClick={() => setEditingStep(isEditing ? null : s.id)}>
                        <div className={`w-8 h-8 rounded-lg ${meta.bg} border ${meta.border} flex items-center justify-center shrink-0`}>
                          <span className={`text-sm ${meta.color}`}>{meta.icon}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-slate-800">{s.label}</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${meta.bg} ${meta.border} ${meta.color}`}>{meta.label}</span>
                            {s.delayDays > 0 && !isCondition && !isExit && (
                              <span className="text-[10px] text-slate-400">+{s.delayDays} Tage</span>
                            )}
                            {isCondition && s.branches && (
                              <span className="text-[10px] text-slate-400">{s.branches.length} Branches</span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5">{meta.desc}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={e => { e.stopPropagation(); moveFlowStep(s.id, -1); }}
                            disabled={i === 0} className="p-1 text-slate-300 hover:text-slate-600 disabled:opacity-30">↑</button>
                          <button onClick={e => { e.stopPropagation(); moveFlowStep(s.id, 1); }}
                            disabled={i === form.flow.length - 1} className="p-1 text-slate-300 hover:text-slate-600 disabled:opacity-30">↓</button>
                          <button onClick={e => { e.stopPropagation(); removeFlowStep(s.id); }}
                            disabled={form.flow.length <= 1}
                            className="p-1 text-slate-300 hover:text-red-500 disabled:opacity-30 ml-1">✕</button>
                          <span className={`text-xs text-slate-400 ml-1 transition-transform ${isEditing ? "rotate-180" : ""}`}>▾</span>
                        </div>
                      </div>

                      {isEditing && (
                        <div className="px-4 pb-4 space-y-3 border-t border-slate-100 pt-3">
                          {!isExit && (
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-xs text-slate-500 block mb-1">Label</label>
                                <input type="text" value={s.label}
                                  onChange={e => updateFlowStep(s.id, { label: e.target.value })}
                                  className={inp} />
                              </div>
                              {!isCondition && (
                                <div>
                                  <label className="text-xs text-slate-500 block mb-1">Verzögerung (Tage)</label>
                                  <input type="number" min={0} max={90} value={s.delayDays}
                                    onChange={e => updateFlowStep(s.id, { delayDays: Number(e.target.value) })}
                                    className={inp} />
                                </div>
                              )}
                            </div>
                          )}
                          {!isCondition && !isExit && (
                            <div>
                              <label className="text-xs text-slate-500 block mb-1">
                                Nachricht-Template <span className="text-slate-300">(leer = KI generiert live)</span>
                              </label>
                              <textarea value={s.messageTemplate}
                                onChange={e => updateFlowStep(s.id, { messageTemplate: e.target.value })}
                                placeholder="Leer lassen für KI-generierte Nachrichten (empfohlen)"
                                rows={3} className={`${inp} resize-none`} />
                            </div>
                          )}
                          {isCondition && (
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <label className="text-xs text-slate-500">Branches (Intent → Schritt-Index)</label>
                                <button onClick={() => addBranch(s.id)}
                                  className="text-[11px] text-violet-600 hover:text-violet-800 font-medium">+ Branch</button>
                              </div>
                              <div className="space-y-2">
                                {(s.branches ?? []).map((b, bi) => (
                                  <div key={bi} className="flex items-center gap-2">
                                    <select value={b.intent}
                                      onChange={e => updateBranch(s.id, bi, { intent: e.target.value as FlowBranch["intent"] })}
                                      className="flex-1 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:border-violet-400">
                                      {INTENT_OPTIONS.map(opt => (
                                        <option key={opt} value={opt}>{INTENT_LABELS[opt]}</option>
                                      ))}
                                    </select>
                                    <span className="text-slate-400 text-xs">→ Schritt</span>
                                    <input type="number" min={0} max={form.flow.length - 1} value={b.nextStepIndex}
                                      onChange={e => updateBranch(s.id, bi, { nextStepIndex: Number(e.target.value) })}
                                      className="w-16 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:border-violet-400" />
                                    <button onClick={() => removeBranch(s.id, bi)}
                                      className="text-slate-300 hover:text-red-400 text-xs">✕</button>
                                  </div>
                                ))}
                                {(s.branches ?? []).length === 0 && (
                                  <p className="text-xs text-slate-400 italic">Keine Branches — füge mindestens einen hinzu</p>
                                )}
                              </div>
                              <p className="text-[10px] text-slate-400 mt-2">Schritt-Index = Position im Flow (0 = erster Schritt).</p>
                            </div>
                          )}
                          <div>
                            <label className="text-xs text-slate-500 block mb-1">Schritt-Typ</label>
                            <div className="flex gap-1.5 flex-wrap">
                              {(Object.keys(STEP_TYPE_META) as StepType[]).map(t => (
                                <button key={t} onClick={() => updateFlowStep(s.id, {
                                  type: t,
                                  ...(t === "condition" && !s.branches ? { branches: [{ intent: "hot" as const, nextStepIndex: 0 }, { intent: "default" as const, nextStepIndex: 0 }] } : {}),
                                })}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                                    s.type === t ? `${STEP_TYPE_META[t].bg} ${STEP_TYPE_META[t].border} ${STEP_TYPE_META[t].color}` : "bg-slate-50 border-slate-200 text-slate-400"
                                  }`}>
                                  {STEP_TYPE_META[t].icon} {STEP_TYPE_META[t].label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    {i < form.flow.length - 1 && (
                      <div className="flex items-center justify-center py-1">
                        <div className="w-px h-4 bg-slate-200" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-xs text-slate-400 mb-2">Schritt hinzufügen:</p>
              <div className="flex gap-2 flex-wrap">
                {(Object.keys(STEP_TYPE_META) as StepType[]).map(t => (
                  <button key={t} onClick={() => addFlowStep(t)}
                    className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all ${STEP_TYPE_META[t].bg} ${STEP_TYPE_META[t].border} ${STEP_TYPE_META[t].color} hover:opacity-80`}>
                    + {STEP_TYPE_META[t].label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep(4)} className="flex-1 btn-secondary py-2.5 text-sm">← Zurück</button>
            <button onClick={() => goToStep(6)} className="flex-1 btn-primary py-2.5 text-sm">Weiter → Starten</button>
          </div>
        </div>
      )}

      {/* ── STEP 6: Launch ── */}
      {step === 6 && (
        <div className="glass-card p-6 space-y-5">
          <h2 className="text-base font-semibold text-slate-800">Kampagne starten</h2>
          <div className="bg-slate-50 border border-slate-200 rounded-xl divide-y divide-slate-100">
            {[
              { label: "Kampagne",  value: form.name },
              { label: "Kanäle",   value: form.channels.map(c => c.toUpperCase()).join(", ") },
              { label: "Flow",     value: `${form.flow.length} Schritte (${form.flow.filter(s => s.type === "condition").length} Conditions)` },
              { label: "Kontakte", value: contacts.length > 0 ? `${contacts.length} importiert` : "Kein Import" },
              { label: "Agents",   value: null },
            ].map(row => (
              <div key={row.label} className="flex justify-between items-center px-4 py-3 text-sm">
                <span className="text-slate-500">{row.label}</span>
                {row.value !== null
                  ? <span className="text-slate-800 font-medium">{row.value}</span>
                  : <span className="text-emerald-600 font-medium flex items-center gap-1.5"><span className="status-dot-green" />7 bereit</span>
                }
              </div>
            ))}
          </div>
          <div className="bg-violet-50 border border-violet-100 rounded-xl p-4">
            <p className="text-violet-600 text-xs leading-relaxed">
              Die 7 KI-Agents starten sofort: Intent Classifier wartet auf Antworten → automatische Replies → Condition-Nodes verzweigen den Flow → Termin-Buchung. Alle Gespräche live unter{" "}
              <span className="font-semibold">Gespräche</span>.
            </p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep(5)} disabled={launching} className="flex-1 btn-secondary py-2.5 text-sm disabled:opacity-40">← Zurück</button>
            <button onClick={handleLaunch} disabled={launching}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all text-white ${
                launching ? "bg-emerald-500" : "bg-emerald-600 hover:bg-emerald-500"
              }`}>
              {launching ? "Wird erstellt…" : "Weiter → Simulation"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
