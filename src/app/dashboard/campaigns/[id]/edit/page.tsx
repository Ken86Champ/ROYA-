"use client";
import { useState, useRef, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import type { Campaign, FlowStep, StepType, FlowBranch, AIFramework, AIModelId, CampaignContact, BusinessContext, PromptFramework } from "@/lib/campaign-types";
import { AI_MODELS, DEFAULT_AI_FRAMEWORK, DEFAULT_BUSINESS_CONTEXT, RULE_TEXT, AVAILABLE_RULES } from "@/lib/campaign-types";
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

// ─── STEP BAR ─────────────────────────────────────────────────────────────────

type WizardStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

const WIZARD_STEPS = [
  { n: 1, label: "Kontakte" },
  { n: 2, label: "Felder" },
  { n: 3, label: "Unternehmen" },
  { n: 4, label: "Einrichten" },
  { n: 5, label: "KI-Setup" },
  { n: 6, label: "Framework" },
  { n: 7, label: "Flow" },
  { n: 8, label: "Speichern" },
];

function StepBar({ current, maxReached, onNavigate }: {
  current: WizardStep;
  maxReached: WizardStep;
  onNavigate: (s: WizardStep) => void;
}) {
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

export default function EditCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<WizardStep>(3);
  const [maxStep, setMaxStep] = useState<WizardStep>(8);

  // Step 6 — Framework
  const [frameworks, setFrameworks] = useState<PromptFramework[]>([]);
  const [frameworksLoading, setFrameworksLoading] = useState(false);
  const [frameworkExpanded, setFrameworkExpanded] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingStep, setEditingStep] = useState<string | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  // Existing contacts from DB
  const [existingContacts, setExistingContacts] = useState<CampaignContact[]>([]);
  const [replaceMode, setReplaceMode] = useState(false);

  // Step 1 — Upload (only when replacing)
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ReturnType<typeof parseCSV>>(null);
  const [parseError, setParseError] = useState("");

  // Step 2 — Column mapping
  const [mappings, setMappings] = useState<{ csvColumn: string; standardField: string }[]>([]);

  // Steps 3–6 — Campaign form
  const [form, setForm] = useState({
    name: "",
    clientId: "",
    channels: [] as string[],
    flow: [] as FlowStep[],
    aiFramework: { ...DEFAULT_AI_FRAMEWORK } as AIFramework,
    businessContext: { ...DEFAULT_BUSINESS_CONTEXT } as BusinessContext,
  });
  const [autoFilling, setAutoFilling] = useState(false);
  const [openBlocks, setOpenBlocks] = useState<Record<string, boolean>>({ b1: true, b2: true, b3: false, b4: false, b5: false });

  // Load campaign + clients
  useEffect(() => {
    Promise.all([
      fetch(`/api/campaigns/${id}`).then(r => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      }),
      fetch("/api/clients").then(r => r.json()).catch(() => []),
    ]).then(([camp, cls]: [Campaign, Client[]]) => {
      setForm({
        name: camp.name,
        clientId: camp.clientId ?? "",
        channels: camp.channels ?? [],
        flow: camp.flow?.length ? camp.flow : [],
        aiFramework: { ...DEFAULT_AI_FRAMEWORK, ...camp.aiFramework, escalation: { ...DEFAULT_AI_FRAMEWORK.escalation, ...(camp.aiFramework?.escalation ?? {}) }, rules: camp.aiFramework?.rules?.length ? camp.aiFramework.rules : DEFAULT_AI_FRAMEWORK.rules },
        businessContext: { ...DEFAULT_BUSINESS_CONTEXT, ...(camp.businessContext ?? {}) },
      });
      setExistingContacts(camp.contacts ?? []);
      setClients(cls);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });
  }, [id]);

  // Load frameworks when reaching step 6
  useEffect(() => {
    if (step === 6 && frameworks.length === 0 && !frameworksLoading) {
      setFrameworksLoading(true);
      fetch("/api/frameworks").then(r => r.json()).then((d: PromptFramework[]) => {
        setFrameworks(d);
        if (!form.aiFramework.frameworkId && d.length > 0) {
          const std = d.find((f: PromptFramework) => f.name === "ROYA Standard") || d[0];
          setForm(prev => ({ ...prev, aiFramework: { ...prev.aiFramework, frameworkId: std.id } }));
        }
        setFrameworksLoading(false);
      }).catch(() => setFrameworksLoading(false));
    }
  }, [step]);

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

  // Build contacts from CSV mappings
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
  const updateFlowStep = (sid: string, patch: Partial<FlowStep>) =>
    setForm(f => ({ ...f, flow: f.flow.map(s => s.id === sid ? { ...s, ...patch } : s) }));

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

  const removeFlowStep = (sid: string) =>
    setForm(f => ({ ...f, flow: f.flow.filter(s => s.id !== sid) }));

  const moveFlowStep = (sid: string, dir: -1 | 1) => {
    setForm(f => {
      const arr = [...f.flow];
      const i = arr.findIndex(s => s.id === sid);
      if (i < 0 || i + dir < 0 || i + dir >= arr.length) return f;
      [arr[i], arr[i + dir]] = [arr[i + dir], arr[i]];
      return { ...f, flow: arr };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const csvContacts = replaceMode ? buildContacts() : null;
      await fetch(`/api/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_all",
          name: form.name,
          clientId: form.clientId || null,
          channels: form.channels,
          flow: form.flow,
          aiFramework: form.aiFramework,
          businessContext: form.businessContext,
          ...(csvContacts ? { contacts: csvContacts } : {}),
        }),
      });
      router.push(`/dashboard/campaigns/${id}/simulate`);
    } catch {
      setSaving(false);
    }
  };

  const csvContacts = replaceMode ? buildContacts() : [];
  const totalContacts = replaceMode ? csvContacts.length : existingContacts.length;

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="text-slate-400 text-sm">Kampagne wird geladen…</div>
    </div>
  );

  return (
    <div className="p-8 max-w-3xl overflow-auto h-full">
      <div className="mb-6">
        <button onClick={() => router.push("/dashboard/campaigns")}
          className="text-sm text-slate-400 hover:text-slate-700 transition-colors flex items-center gap-1 mb-4">
          ← Zurück zu Kampagnen
        </button>
        <h1 className="text-2xl font-bold text-slate-900">Kampagne bearbeiten</h1>
        <p className="text-slate-400 text-sm mt-1">Alle Felder anpassen und direkt zur Simulation</p>
      </div>

      <StepBar current={step} maxReached={maxStep} onNavigate={goToStep} />

      {/* ── STEP 1: Contacts ── */}
      {step === 1 && (
        <div className="glass-card p-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-1">Kontaktliste</h2>
          <p className="text-slate-400 text-sm mb-6">Aktuelle Kontakte beibehalten oder neue CSV hochladen.</p>

          {/* Existing contacts info */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-800">{existingContacts.length} bestehende Kontakte</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {existingContacts.filter(c => c.channel === "sms").length} SMS ·{" "}
                  {existingContacts.filter(c => c.channel === "email").length} E-Mail ·{" "}
                  {existingContacts.filter(c => c.channel === "whatsapp").length} WhatsApp
                </p>
              </div>
              <span className="text-2xl">📋</span>
            </div>
            {existingContacts.length > 0 && (
              <div className="mt-3 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <th className="px-3 py-1.5 text-left text-slate-500 font-semibold">Name</th>
                      <th className="px-3 py-1.5 text-left text-slate-500 font-semibold">Kontakt</th>
                      <th className="px-3 py-1.5 text-left text-slate-500 font-semibold">Kanal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {existingContacts.slice(0, 10).map(c => (
                      <tr key={c.id} className="border-b border-slate-50 last:border-0">
                        <td className="px-3 py-1.5 text-slate-700">{c.name}</td>
                        <td className="px-3 py-1.5 text-slate-500 font-mono">{c.contact}</td>
                        <td className="px-3 py-1.5 text-slate-400">{c.channel}</td>
                      </tr>
                    ))}
                    {existingContacts.length > 10 && (
                      <tr><td colSpan={3} className="px-3 py-1.5 text-slate-400 text-center">… und {existingContacts.length - 10} weitere</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Replace toggle */}
          <button
            onClick={() => { setReplaceMode(!replaceMode); if (replaceMode) { setFile(null); setParsed(null); setMappings([]); } }}
            className={`w-full py-3 rounded-xl border text-sm font-medium transition-all mb-4 ${
              replaceMode
                ? "bg-amber-50 border-amber-300 text-amber-700"
                : "bg-white border-slate-200 text-slate-500 hover:border-violet-300"
            }`}>
            {replaceMode ? "✕ Abbrechen — bestehende Kontakte behalten" : "↻ Neue CSV hochladen (ersetzt alle Kontakte)"}
          </button>

          {/* CSV upload area (only when replacing) */}
          {replaceMode && (
            <>
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
                    <p className="text-emerald-600 text-sm mt-1">{parsed?.rows.length ?? 0} Kontakte · {parsed?.headers.length ?? 0} Spalten</p>
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
            </>
          )}

          <div className="flex justify-between mt-6">
            <div />
            <button onClick={() => goToStep(replaceMode && parsed ? 2 : 3)}
              className="px-6 py-2.5 bg-violet-600 text-white font-semibold rounded-xl hover:bg-violet-700 transition-all">
              {replaceMode && parsed ? "Weiter → Felder zuordnen" : "Weiter → Unternehmen"}
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
              Weiter → Unternehmen
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Unternehmen (5 Blocks) ── */}
      {step === 3 && (() => {
        const bc = form.businessContext;
        const setBc = (patch: Partial<BusinessContext>) =>
          setForm(f => ({ ...f, businessContext: { ...f.businessContext, ...patch } }));

        const handleAutoFill = async () => {
          if (!bc.companyName) return;
          setAutoFilling(true);
          try {
            const res = await fetch("/api/campaigns/autofill", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                companyName: bc.companyName,
                offer: bc.offer,
                leadType: bc.leadType || "b2c",
                industry: bc.industry || "",
              }),
            });
            const data = await res.json();
            setBc({
              offer: data.offer || bc.offer,
              industry: data.industry || bc.industry,
              companyDescription: data.companyDescription || bc.companyDescription,
              usps: data.usps || bc.usps,
              allServices: data.allServices || bc.allServices,
              valueProp: data.valueProp || bc.valueProp,
              painPoint: data.painPoint || bc.painPoint,
              noConvertReason: data.noConvertReason || bc.noConvertReason,
              cta: data.cta || bc.cta,
              targetAudience: data.targetAudience || bc.targetAudience,
              afterCta: data.afterCta || bc.afterCta,
              specialOffer: data.specialOffer || bc.specialOffer,
              objections: data.objections?.length ? data.objections : bc.objections,
            });
          } catch { /* ignore */ }
          setAutoFilling(false);
        };

        const toggleBlock = (id: string) =>
          setOpenBlocks(ob => ({ ...ob, [id]: !ob[id] }));

        const BlockHead = ({ id, icon, title, desc }: { id: string; icon: string; title: string; desc: string }) => (
          <button type="button" onClick={() => toggleBlock(id)}
            className="w-full flex items-center gap-3 text-left">
            <span className="w-7 h-7 rounded-lg bg-violet-50 border border-violet-100 flex items-center justify-center text-violet-500 text-sm shrink-0">{icon}</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-800">{title}</p>
              <p className="text-[11px] text-slate-400">{desc}</p>
            </div>
            <span className={`text-xs text-slate-400 transition-transform ${openBlocks[id] ? "rotate-180" : ""}`}>▾</span>
          </button>
        );

        return (
          <div className="space-y-3">
            <div className="mb-1">
              <h2 className="text-base font-semibold text-slate-800">Unternehmens-Kontext</h2>
              <p className="text-slate-400 text-sm mt-0.5">Je mehr du ausfüllst, desto menschlicher klingt der KI-Agent.</p>
            </div>

            {/* Block 1: Unternehmen */}
            <div className="glass-card overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100">
                <BlockHead id="b1" icon="◈" title="Unternehmen" desc="Wer seid ihr? Grundinfos über das Unternehmen" />
              </div>
              {openBlocks.b1 && (
                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-slate-500 block mb-1.5">Firmenname *</label>
                      <input type="text" value={bc.companyName}
                        onChange={e => setBc({ companyName: e.target.value })}
                        placeholder="z.B. 10X Personaltraining" className={inp} />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 block mb-1.5">Branche</label>
                      <input type="text" value={bc.industry}
                        onChange={e => setBc({ industry: e.target.value })}
                        placeholder="z.B. Fitness & Gesundheit" className={inp} />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 block mb-1.5">Beschreibung</label>
                    <textarea value={bc.companyDescription}
                      onChange={e => setBc({ companyDescription: e.target.value })}
                      rows={2} placeholder="Kurzer Überblick: Was macht das Unternehmen?"
                      className={`${inp} resize-none`} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-slate-500 block mb-1.5">Standort</label>
                      <input type="text" value={bc.location}
                        onChange={e => setBc({ location: e.target.value })}
                        placeholder="z.B. Zürich" className={inp} />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 block mb-1.5">USPs / Alleinstellungsmerkmale</label>
                      <input type="text" value={bc.usps}
                        onChange={e => setBc({ usps: e.target.value })}
                        placeholder="z.B. 1:1 Betreuung, keine Vertragsbindung" className={inp} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* KI-Autofill */}
            <button onClick={handleAutoFill}
              disabled={!bc.companyName || autoFilling}
              className="w-full py-2.5 rounded-xl border border-violet-200 bg-violet-50 text-violet-700 text-sm font-medium hover:bg-violet-100 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
              {autoFilling ? (
                <><span className="animate-spin">⟳</span> KI füllt aus…</>
              ) : (
                <><span>✦</span> KI-Autofill — restliche Felder generieren</>
              )}
            </button>

            {/* Block 2: Kampagnen-Produkt */}
            <div className="glass-card overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100">
                <BlockHead id="b2" icon="◎" title="Kampagnen-Produkt" desc="Was genau wird gepitcht? Konkretes Angebot und Ergebnisse" />
              </div>
              {openBlocks.b2 && (
                <div className="p-5 space-y-4">
                  <div>
                    <label className="text-xs text-slate-500 block mb-1.5">Alle Services (Überblick)</label>
                    <textarea value={bc.allServices}
                      onChange={e => setBc({ allServices: e.target.value })}
                      rows={2} placeholder="z.B. Personal Training, Ernährungsberatung, Gruppenkurse, Online-Coaching"
                      className={`${inp} resize-none`} />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 block mb-1.5">Kampagnen-Produkt / Angebot *</label>
                    <textarea value={bc.offer}
                      onChange={e => setBc({ offer: e.target.value })}
                      rows={2} placeholder="z.B. 8-Wochen Fitness-Comeback-Programm mit 1:1 Betreuung"
                      className={`${inp} resize-none`} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-slate-500 block mb-1.5">Preisbereich</label>
                      <input type="text" value={bc.priceRange}
                        onChange={e => setBc({ priceRange: e.target.value })}
                        placeholder="z.B. CHF 89–149/Monat" className={inp} />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 block mb-1.5">Sonderangebot / Incentive</label>
                      <input type="text" value={bc.specialOffer}
                        onChange={e => setBc({ specialOffer: e.target.value })}
                        placeholder="z.B. Erste 2 Wochen kostenlos" className={inp} />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 block mb-1.5">Konkrete Ergebnisse / Value Prop</label>
                    <textarea value={bc.valueProp}
                      onChange={e => setBc({ valueProp: e.target.value })}
                      rows={2} placeholder="z.B. 93% unserer Comeback-Kunden trainieren nach 6 Monaten noch regelmässig"
                      className={`${inp} resize-none`} />
                  </div>
                </div>
              )}
            </div>

            {/* Block 3: Zielgruppe & Lead-Beziehung */}
            <div className="glass-card overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100">
                <BlockHead id="b3" icon="◇" title="Zielgruppe & Lead-Beziehung" desc="Wen sprecht ihr an? Welche Vorgeschichte?" />
              </div>
              {openBlocks.b3 && (
                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-slate-500 block mb-1.5">Lead-Typ</label>
                      <select value={bc.leadType} onChange={e => setBc({ leadType: e.target.value })} className={sel}>
                        <option value="b2c">B2C (Endkunden)</option>
                        <option value="b2b">B2B (Geschäftskunden)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 block mb-1.5">Lead-Beziehung</label>
                      <select value={bc.leadRelationship} onChange={e => setBc({ leadRelationship: e.target.value })} className={sel}>
                        <option value="former_customer">Ehemalige Kunden</option>
                        <option value="trial">Trial / Probekunden</option>
                        <option value="inquiry">Anfrage ohne Abschluss</option>
                        <option value="cold">Kaltkontakt</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 block mb-1.5">Zielgruppe</label>
                    <input type="text" value={bc.targetAudience}
                      onChange={e => setBc({ targetAudience: e.target.value })}
                      placeholder="z.B. Ehemalige Kunden die seit 3+ Monaten inaktiv sind" className={inp} />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 block mb-1.5">Warum Leads abgesprungen sind</label>
                    <textarea value={bc.noConvertReason}
                      onChange={e => setBc({ noConvertReason: e.target.value })}
                      rows={2} placeholder="z.B. Zeitmangel, finanzielle Gründe, Motivation verloren"
                      className={`${inp} resize-none`} />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 block mb-1.5">Pain Point der Zielgruppe</label>
                    <textarea value={bc.painPoint}
                      onChange={e => setBc({ painPoint: e.target.value })}
                      rows={2} placeholder="z.B. Fühlen sich unwohl, haben Routinen verloren, wissen nicht wie anfangen"
                      className={`${inp} resize-none`} />
                  </div>
                </div>
              )}
            </div>

            {/* Block 4: Gesprächsziel */}
            <div className="glass-card overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100">
                <BlockHead id="b4" icon="→" title="Gesprächsziel" desc="Was soll der Lead tun? Welche Conversion?" />
              </div>
              {openBlocks.b4 && (
                <div className="p-5 space-y-4">
                  <div>
                    <label className="text-xs text-slate-500 block mb-1.5">Call-to-Action (CTA)</label>
                    <input type="text" value={bc.cta}
                      onChange={e => setBc({ cta: e.target.value })}
                      placeholder="z.B. Kostenloses 15-Min Beratungsgespräch buchen" className={inp} />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 block mb-1.5">Was passiert nach dem CTA?</label>
                    <textarea value={bc.afterCta}
                      onChange={e => setBc({ afterCta: e.target.value })}
                      rows={2} placeholder="z.B. Kurzes Telefonat mit Trainer, dann individueller Plan"
                      className={`${inp} resize-none`} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-slate-500 block mb-1.5">Buchungslink</label>
                      <input type="text" value={bc.bookingLink}
                        onChange={e => setBc({ bookingLink: e.target.value })}
                        placeholder="https://calendly.com/..." className={inp} />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 block mb-1.5">Dringlichkeit / Zeitdruck</label>
                      <input type="text" value={bc.urgency}
                        onChange={e => setBc({ urgency: e.target.value })}
                        placeholder="z.B. Nur noch 5 Plätze frei" className={inp} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Block 5: Agent-Wissen */}
            <div className="glass-card overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100">
                <BlockHead id="b5" icon="✦" title="Agent-Wissen" desc="Insider-Infos, Einwände abfangen, Tabu-Themen" />
              </div>
              {openBlocks.b5 && (
                <div className="p-5 space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs text-slate-500">Typische Einwände & Antworten</label>
                      <button type="button" onClick={() => setBc({ objections: [...(bc.objections || []), { objection: '', response: '' }] })}
                        className="text-[11px] text-violet-600 hover:text-violet-800 font-medium">+ Einwand</button>
                    </div>
                    {(bc.objections || []).length > 0 ? (
                      <div className="space-y-2">
                        {bc.objections.map((obj, i) => (
                          <div key={i} className="flex gap-2 items-start">
                            <div className="flex-1 space-y-1.5">
                              <input type="text" value={obj.objection}
                                onChange={e => {
                                  const upd = [...bc.objections];
                                  upd[i] = { ...upd[i], objection: e.target.value };
                                  setBc({ objections: upd });
                                }}
                                placeholder="Einwand: z.B. Ich habe keine Zeit"
                                className={`${inp} text-xs`} />
                              <input type="text" value={obj.response}
                                onChange={e => {
                                  const upd = [...bc.objections];
                                  upd[i] = { ...upd[i], response: e.target.value };
                                  setBc({ objections: upd });
                                }}
                                placeholder="Antwort: z.B. Verständlich — deshalb sind die Sessions nur 30 Min"
                                className={`${inp} text-xs`} />
                            </div>
                            <button type="button"
                              onClick={() => setBc({ objections: bc.objections.filter((_, j) => j !== i) })}
                              className="mt-2 text-slate-300 hover:text-red-400 text-xs shrink-0">✕</button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-300 italic">Noch keine Einwände definiert. Klicke + Einwand.</p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 block mb-1.5">Tabu-Themen / Nicht erwähnen</label>
                    <textarea value={bc.doNotSay}
                      onChange={e => setBc({ doNotSay: e.target.value })}
                      rows={2} placeholder="z.B. Nie den alten Preis erwähnen, nicht über Konkurrenz sprechen"
                      className={`${inp} resize-none`} />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 block mb-1.5">Insider-Wissen</label>
                    <textarea value={bc.insiderKnowledge}
                      onChange={e => setBc({ insiderKnowledge: e.target.value })}
                      rows={2} placeholder="z.B. Wir haben gerade das Studio renoviert, neuen Trainer eingestellt"
                      className={`${inp} resize-none`} />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 block mb-1.5">Beispiel-Gespräch</label>
                    <textarea value={bc.exampleConversation}
                      onChange={e => setBc({ exampleConversation: e.target.value })}
                      rows={4} placeholder={"Agent: Hey Lisa, hier ist [Name] von [Firma]…\nLead: Ah ja, ich war mal bei euch…\nAgent: Genau! Wir haben jetzt…"}
                      className={`${inp} resize-none`} />
                  </div>
                </div>
              )}
            </div>

            {/* Navigation */}
            <div className="flex gap-3 pt-2">
              <button onClick={() => setStep(1)} className="flex-1 btn-secondary py-2.5 text-sm">← Kontakte</button>
              <button onClick={() => goToStep(4)} disabled={!bc.companyName || !bc.offer}
                className="flex-1 btn-primary py-3 text-sm disabled:opacity-40 disabled:cursor-not-allowed">
                Weiter → Einrichten
              </button>
            </div>
          </div>
        );
      })()}

      {/* ── STEP 4: Setup ── */}
      {step === 4 && (
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
            <button onClick={() => setStep(3)} className="flex-1 btn-secondary py-2.5 text-sm">← Unternehmen</button>
            <button onClick={() => goToStep(5)} disabled={!form.name || form.channels.length === 0}
              className="flex-1 btn-primary py-3 text-sm disabled:opacity-40 disabled:cursor-not-allowed">
              Weiter → KI-Setup
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 5: KI-Setup ── */}
      {step === 5 && (() => {
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
              <button onClick={() => setStep(4)} className="flex-1 btn-secondary py-2.5 text-sm">← Zurück</button>
              <button onClick={() => goToStep(6)} className="flex-1 btn-primary py-2.5 text-sm">Weiter → Framework</button>
            </div>
          </div>
        );
      })()}

      {/* ── STEP 6: Prompt-Framework ── */}
      {step === 6 && (() => {
        const selected = frameworks.find(f => f.id === form.aiFramework.frameworkId);
        return (
          <div className="space-y-4">
            <div className="glass-card p-5">
              <h2 className="text-base font-semibold text-slate-800 mb-1">Prompt-Framework</h2>
              <p className="text-xs text-slate-400 mb-4">Definiert wie die KI kommuniziert — Ton, Regeln, Kreativität und Beispiele.</p>

              {frameworksLoading ? (
                <div className="text-center py-8 text-sm text-slate-400">Lade Frameworks …</div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {frameworks.map(fw => (
                    <button key={fw.id}
                      onClick={() => setForm(prev => ({ ...prev, aiFramework: { ...prev.aiFramework, frameworkId: fw.id } }))}
                      className={`text-left p-3 rounded-xl border transition-all ${
                        fw.id === form.aiFramework.frameworkId
                          ? "border-violet-400 bg-violet-50 ring-1 ring-violet-300"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-slate-800">{fw.name}</span>
                        {fw.isSystem && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-400">System</span>}
                      </div>
                      <p className="text-[11px] text-slate-400 leading-snug">{fw.description}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600">T={fw.temperature}</span>
                        <span className="text-[10px] text-slate-300">{fw.rules.length} Regeln</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selected && (
              <div className="glass-card p-5">
                <button onClick={() => setFrameworkExpanded(!frameworkExpanded)}
                  className="w-full flex items-center justify-between text-left">
                  <h3 className="text-sm font-semibold text-slate-700">Details: {selected.name}</h3>
                  <span className="text-slate-400 text-xs">{frameworkExpanded ? "▼" : "▶"}</span>
                </button>

                {frameworkExpanded && (
                  <div className="mt-4 space-y-4">
                    <div>
                      <label className="text-xs font-medium text-slate-500 mb-1 block">Kreativität (Temperature)</label>
                      <div className="flex items-center gap-3">
                        <input type="range" min="0.1" max="1.0" step="0.1" value={selected.temperature} disabled={selected.isSystem} className="flex-1 accent-violet-500" onChange={() => {}} />
                        <span className="text-sm font-mono text-slate-600 w-8 text-right">{selected.temperature}</span>
                      </div>
                      <p className="text-[10px] text-slate-300 mt-1">0.1 = konsistent · 0.5 = ausgewogen · 1.0 = kreativ</p>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-500 mb-1 block">Aktive Regeln</label>
                      <div className="flex flex-wrap gap-1.5">
                        {selected.rules.map(r => (
                          <span key={r} className="text-[11px] px-2 py-1 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100">{RULE_TEXT[r] || r}</span>
                        ))}
                        {selected.rules.length === 0 && <span className="text-[11px] text-slate-300">Keine Regeln definiert</span>}
                      </div>
                    </div>
                    {selected.forbiddenPhrases.length > 0 && (
                      <div>
                        <label className="text-xs font-medium text-slate-500 mb-1 block">Verbotene Ausdrücke</label>
                        <div className="flex flex-wrap gap-1.5">
                          {selected.forbiddenPhrases.map((p, i) => (
                            <span key={i} className="text-[11px] px-2 py-1 rounded-lg bg-red-50 text-red-500 border border-red-100">{p}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    <div>
                      <label className="text-xs font-medium text-slate-500 mb-1 block">Writer-Anweisungen</label>
                      <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-600 whitespace-pre-wrap max-h-32 overflow-y-auto">{selected.writerInstructions || "—"}</div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-500 mb-1 block">Strategist-Anweisungen</label>
                      <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-600 whitespace-pre-wrap max-h-32 overflow-y-auto">{selected.strategistInstructions || "—"}</div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-500 mb-1 block">Interpreter-Anweisungen</label>
                      <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-600 whitespace-pre-wrap max-h-32 overflow-y-auto">{selected.interpreterInstructions || "—"}</div>
                    </div>
                    {selected.exampleMessages.length > 0 && (
                      <div>
                        <label className="text-xs font-medium text-slate-500 mb-1 block">Beispiel-Nachrichten</label>
                        <div className="space-y-2">
                          {selected.exampleMessages.map((ex, i) => (
                            <div key={i} className="bg-slate-50 rounded-xl p-3 text-xs">
                              <span className="font-medium text-violet-500">{ex.context}:</span>{" "}
                              <span className="text-slate-600">{ex.message}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setStep(5)} className="flex-1 btn-secondary py-2.5 text-sm">← Zurück</button>
              <button onClick={() => goToStep(7)} className="flex-1 btn-primary py-2.5 text-sm">Weiter → Flow Designer</button>
            </div>
          </div>
        );
      })()}

      {/* ── STEP 7: Flow Designer ── */}
      {step === 7 && (
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
            <button onClick={() => setStep(6)} className="flex-1 btn-secondary py-2.5 text-sm">← Zurück</button>
            <button onClick={() => goToStep(8)} className="flex-1 btn-primary py-2.5 text-sm">Weiter → Speichern</button>
          </div>
        </div>
      )}

      {/* ── STEP 8: Save ── */}
      {step === 8 && (
        <div className="glass-card p-6 space-y-5">
          <h2 className="text-base font-semibold text-slate-800">Änderungen speichern</h2>
          <div className="bg-slate-50 border border-slate-200 rounded-xl divide-y divide-slate-100">
            {[
              { label: "Kampagne",     value: form.name },
              { label: "Unternehmen",  value: form.businessContext.companyName || "—" },
              { label: "Angebot",      value: form.businessContext.offer ? (form.businessContext.offer.length > 60 ? form.businessContext.offer.slice(0, 60) + "…" : form.businessContext.offer) : "—" },
              { label: "Kanäle",       value: form.channels.map(c => c.toUpperCase()).join(", ") },
              { label: "Flow",         value: `${form.flow.length} Schritte (${form.flow.filter(s => s.type === "condition").length} Conditions)` },
              { label: "Kontakte",     value: replaceMode ? `${csvContacts.length} neue (ersetzt bestehende)` : `${existingContacts.length} bestehend (unverändert)` },
              { label: "Agents",       value: null },
            ].map(row => (
              <div key={row.label} className="flex justify-between items-center px-4 py-3 text-sm">
                <span className="text-slate-500">{row.label}</span>
                {row.value !== null
                  ? <span className="text-slate-800 font-medium">{row.value}</span>
                  : <span className="text-emerald-600 font-medium flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />7 bereit</span>
                }
              </div>
            ))}
          </div>
          <div className="bg-violet-50 border border-violet-100 rounded-xl p-4">
            <p className="text-violet-600 text-xs leading-relaxed">
              Nach dem Speichern wirst du direkt zur <span className="font-semibold">Simulation</span> weitergeleitet, wo du die Kampagne mit deinen Leads testen kannst.
            </p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep(7)} disabled={saving} className="flex-1 btn-secondary py-2.5 text-sm disabled:opacity-40">← Zurück</button>
            <button onClick={handleSave} disabled={saving}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all text-white ${
                saving ? "bg-violet-500" : "bg-violet-600 hover:bg-violet-500"
              }`}>
              {saving ? "Wird gespeichert…" : "Speichern → Simulation"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
