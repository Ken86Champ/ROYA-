"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { FlowStep, StepType, FlowBranch } from "@/lib/campaign-store";
import type { Client } from "@/lib/client-store";

const inp = "w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-800 text-sm placeholder-slate-300 focus:outline-none focus:border-violet-400 transition-colors";
const sel = `${inp} cursor-pointer`;

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

function genId() { return `step_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`; }

function defaultFlow(): FlowStep[] {
  return [
    { id: genId(), type: "opener",   label: "Opener",       delayDays: 0,  condition: "no_reply", messageTemplate: "" },
    { id: genId(), type: "followup", label: "Follow-up 1",  delayDays: 3,  condition: "no_reply", messageTemplate: "" },
    { id: genId(), type: "followup", label: "Follow-up 2",  delayDays: 7,  condition: "no_reply", messageTemplate: "" },
    { id: genId(), type: "breakup",  label: "Break-up",     delayDays: 14, condition: "no_reply", messageTemplate: "" },
  ];
}

interface ParsedContact {
  name: string;
  contact: string;
  channel: string;
  altContact?: string;
  altChannel?: string;
}

function parseCSV(text: string): ParsedContact[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/[^a-z_]/g, ""));
  const idx = (names: string[]) => names.reduce<number>((found, n) => found >= 0 ? found : headers.indexOf(n), -1);

  const nameIdx    = idx(["name", "kontakt", "contact_name"]);
  const contactIdx = idx(["contact", "email", "phone", "telefon", "nummer"]);
  const channelIdx = idx(["channel", "kanal"]);
  const altContactIdx = idx(["alt_contact", "altcontact", "alt_email", "alt_phone"]);
  const altChannelIdx = idx(["alt_channel", "altchannel"]);

  const results: ParsedContact[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map(c => c.trim().replace(/^"|"$/g, ""));
    if (!cols.length || !cols[0]) continue;

    const name    = nameIdx >= 0    ? cols[nameIdx]    ?? "" : cols[0] ?? "";
    const contact = contactIdx >= 0 ? cols[contactIdx] ?? "" : cols[1] ?? "";
    if (!name || !contact) continue;

    const rawChannel = channelIdx >= 0 ? (cols[channelIdx] ?? "").toLowerCase() : "";
    const channel = ["email", "sms", "whatsapp"].includes(rawChannel) ? rawChannel
      : contact.includes("@") ? "email" : "sms";

    const row: ParsedContact = { name, contact, channel };
    if (altContactIdx >= 0 && cols[altContactIdx]) row.altContact = cols[altContactIdx];
    if (altChannelIdx >= 0 && cols[altChannelIdx]) {
      const ac = cols[altChannelIdx].toLowerCase();
      if (["email","sms","whatsapp"].includes(ac)) row.altChannel = ac;
    }
    results.push(row);
  }
  return results;
}

export default function NewCampaignPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(1);
  const [launching, setLaunching] = useState(false);
  const [editingStep, setEditingStep] = useState<string | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [parsedContacts, setParsedContacts] = useState<ParsedContact[]>([]);

  useEffect(() => {
    fetch("/api/clients").then(r => r.json()).then(setClients).catch(() => {});
  }, []);

  const [form, setForm] = useState({
    name: "",
    clientId: "",
    channels: [] as string[],
    file: null as File | null,
    flow: defaultFlow(),
  });

  const toggleChannel = (ch: string) =>
    setForm(f => ({ ...f, channels: f.channels.includes(ch) ? f.channels.filter(c => c !== ch) : [...f.channels, ch] }));

  const handleFile = (file: File) => {
    setForm(f => ({ ...f, file }));
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target?.result as string;
      setParsedContacts(parseCSV(text));
    };
    reader.readAsText(file);
  };

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

  const addStep = (type: StepType) => {
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

  const removeStep = (id: string) =>
    setForm(f => ({ ...f, flow: f.flow.filter(s => s.id !== id) }));

  const moveStep = (id: string, dir: -1 | 1) => {
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
    await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        clientId: form.clientId || undefined,
        channels: form.channels,
        flow: form.flow,
        contacts: parsedContacts,
      }),
    }).then(async res => {
      const camp = await res.json();
      await fetch(`/api/campaigns/${camp.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
    }).catch(() => {});
    setTimeout(() => router.push("/dashboard/campaigns"), 800);
  };

  const STEPS = ["Einrichten", "Flow Designer", "Import", "Starten"];

  return (
    <div className="p-8 max-w-3xl overflow-auto h-full">
      <div className="mb-8">
        <button onClick={() => router.push("/dashboard/campaigns")}
          className="text-slate-400 hover:text-slate-700 text-sm flex items-center gap-2 mb-4 transition-colors">
          ← Zurück
        </button>
        <h1 className="text-2xl font-bold text-slate-900">Neue Kampagne</h1>
        <p className="text-slate-400 text-sm mt-1">Autonome Reaktivierungskampagne mit KI-Flow aufbauen</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center mb-8">
        {STEPS.map((label, i) => {
          const s = i + 1; const done = s < step; const active = s === step;
          return (
            <div key={label} className="flex items-center flex-1 last:flex-none">
              <button onClick={() => s < step && setStep(s)} className="flex items-center gap-2 cursor-pointer">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  done ? "bg-emerald-500 text-white" : active ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-400"
                }`}>{done ? "✓" : s}</div>
                <span className={`text-xs font-medium whitespace-nowrap ${
                  active ? "text-slate-800" : done ? "text-slate-500" : "text-slate-300"
                }`}>{label}</span>
              </button>
              {i < STEPS.length - 1 && <div className={`flex-1 h-px mx-3 ${s < step ? "bg-emerald-300" : "bg-slate-200"}`} />}
            </div>
          );
        })}
      </div>

      {/* ── Step 1: Setup ── */}
      {step === 1 && (
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
          <button onClick={() => setStep(2)} disabled={!form.name || form.channels.length === 0}
            className="w-full btn-primary py-3 text-sm disabled:opacity-40 disabled:cursor-not-allowed">
            Weiter → Flow Designer
          </button>
        </div>
      )}

      {/* ── Step 2: Flow Designer ── */}
      {step === 2 && (
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

            {/* Flow nodes */}
            <div className="space-y-3">
              {form.flow.map((s, i) => {
                const meta = STEP_TYPE_META[s.type];
                const isEditing = editingStep === s.id;
                const isCondition = s.type === "condition";
                const isExit = s.type === "exit";

                return (
                  <div key={s.id}>
                    <div className={`rounded-xl border transition-all ${isEditing ? `${meta.bg} ${meta.border}` : "bg-white border-slate-200"}`}>
                      <div
                        className="flex items-center gap-3 p-4 cursor-pointer"
                        onClick={() => setEditingStep(isEditing ? null : s.id)}>
                        <div className={`w-8 h-8 rounded-lg ${meta.bg} border ${meta.border} flex items-center justify-center shrink-0`}>
                          <span className={`text-sm ${meta.color}`}>{meta.icon}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-slate-800">{s.label}</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${meta.bg} ${meta.border} ${meta.color}`}>
                              {meta.label}
                            </span>
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
                          <button onClick={e => { e.stopPropagation(); moveStep(s.id, -1); }}
                            disabled={i === 0} className="p-1 text-slate-300 hover:text-slate-600 disabled:opacity-30">↑</button>
                          <button onClick={e => { e.stopPropagation(); moveStep(s.id, 1); }}
                            disabled={i === form.flow.length - 1} className="p-1 text-slate-300 hover:text-slate-600 disabled:opacity-30">↓</button>
                          <button onClick={e => { e.stopPropagation(); removeStep(s.id); }}
                            disabled={form.flow.length <= 1}
                            className="p-1 text-slate-300 hover:text-red-500 disabled:opacity-30 ml-1">✕</button>
                          <span className={`text-xs text-slate-400 ml-1 transition-transform ${isEditing ? "rotate-180" : ""}`}>▾</span>
                        </div>
                      </div>

                      {isEditing && (
                        <div className="px-4 pb-4 space-y-3 border-t border-slate-100 pt-3">
                          {/* Label + Delay (non-condition/exit) */}
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

                          {/* Message template — only for message nodes */}
                          {!isCondition && !isExit && (
                            <div>
                              <label className="text-xs text-slate-500 block mb-1">
                                Nachricht-Template <span className="text-slate-300">(leer = KI generiert live)</span>
                              </label>
                              <textarea
                                value={s.messageTemplate}
                                onChange={e => updateFlowStep(s.id, { messageTemplate: e.target.value })}
                                placeholder="Leer lassen für KI-generierte Nachrichten (empfohlen)"
                                rows={3}
                                className={`${inp} resize-none`}
                              />
                            </div>
                          )}

                          {/* Condition branches */}
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
                                    <select
                                      value={b.intent}
                                      onChange={e => updateBranch(s.id, bi, { intent: e.target.value as FlowBranch["intent"] })}
                                      className="flex-1 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:border-violet-400">
                                      {INTENT_OPTIONS.map(opt => (
                                        <option key={opt} value={opt}>{INTENT_LABELS[opt]}</option>
                                      ))}
                                    </select>
                                    <span className="text-slate-400 text-xs">→ Schritt</span>
                                    <input
                                      type="number" min={0} max={form.flow.length - 1}
                                      value={b.nextStepIndex}
                                      onChange={e => updateBranch(s.id, bi, { nextStepIndex: Number(e.target.value) })}
                                      className="w-16 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:border-violet-400"
                                    />
                                    <button onClick={() => removeBranch(s.id, bi)}
                                      className="text-slate-300 hover:text-red-400 text-xs">✕</button>
                                  </div>
                                ))}
                                {(s.branches ?? []).length === 0 && (
                                  <p className="text-xs text-slate-400 italic">Keine Branches — füge mindestens einen hinzu</p>
                                )}
                              </div>
                              <p className="text-[10px] text-slate-400 mt-2">Schritt-Index = Position im Flow (0 = erster Schritt). Default-Branch wird verwendet falls kein Intent übereinstimmt.</p>
                            </div>
                          )}

                          {/* Step type switcher */}
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

            {/* Add step */}
            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-xs text-slate-400 mb-2">Schritt hinzufügen:</p>
              <div className="flex gap-2 flex-wrap">
                {(Object.keys(STEP_TYPE_META) as StepType[]).map(t => (
                  <button key={t} onClick={() => addStep(t)}
                    className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all ${STEP_TYPE_META[t].bg} ${STEP_TYPE_META[t].border} ${STEP_TYPE_META[t].color} hover:opacity-80`}>
                    + {STEP_TYPE_META[t].label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep(1)} className="flex-1 btn-secondary py-2.5 text-sm">← Zurück</button>
            <button onClick={() => setStep(3)} className="flex-1 btn-primary py-2.5 text-sm">Weiter → Import</button>
          </div>
        </div>
      )}

      {/* ── Step 3: Import ── */}
      {step === 3 && (
        <div className="glass-card p-6 space-y-5">
          <h2 className="text-base font-semibold text-slate-800">Kontakte importieren</h2>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500">
            <span className="font-medium text-slate-700">CSV-Format:</span>{" "}
            <code className="bg-white border border-slate-200 rounded px-1.5 py-0.5">name, contact, channel, alt_contact, alt_channel</code>
            <br />
            <span className="mt-1 block">Spalten <code className="bg-white border border-slate-200 rounded px-1 py-0.5">channel</code>: email / sms / whatsapp. Wird automatisch aus E-Mail-Adresse erkannt falls leer.</span>
          </div>
          <div
            onClick={() => fileRef.current?.click()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f?.name.endsWith(".csv")) handleFile(f); }}
            onDragOver={e => e.preventDefault()}
            className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
              form.file ? "border-emerald-300 bg-emerald-50" : "border-slate-200 hover:border-violet-300 hover:bg-violet-50"
            }`}>
            <input ref={fileRef} type="file" accept=".csv"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              className="hidden" />
            {form.file ? (
              <>
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 border border-emerald-200 flex items-center justify-center mx-auto mb-3">
                  <span className="text-emerald-600 text-xl">✓</span>
                </div>
                <p className="text-slate-800 font-medium text-sm">{form.file.name}</p>
                <p className="text-slate-400 text-xs mt-1">
                  {(form.file.size / 1024).toFixed(0)} KB · {parsedContacts.length} Kontakte erkannt · Klicken zum Ersetzen
                </p>
              </>
            ) : (
              <>
                <div className="w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center mx-auto mb-3">
                  <span className="text-slate-400 text-xl">↑</span>
                </div>
                <p className="text-slate-700 font-medium text-sm">CSV hochladen (optional)</p>
                <p className="text-slate-400 text-xs mt-1">Klicken oder hierher ziehen</p>
              </>
            )}
          </div>

          {/* Contact preview table */}
          {parsedContacts.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-slate-700">{parsedContacts.length} Kontakte erkannt</p>
                <button onClick={() => { setForm(f => ({ ...f, file: null })); setParsedContacts([]); }}
                  className="text-xs text-red-400 hover:text-red-600">Verwerfen</button>
              </div>
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="grid grid-cols-[auto_1fr_auto_auto] text-[10px] font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 px-3 py-2 gap-3">
                  <span>#</span><span>Name</span><span>Kontakt</span><span>Kanal</span>
                </div>
                <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
                  {parsedContacts.slice(0, 50).map((c, i) => (
                    <div key={i} className="grid grid-cols-[auto_1fr_auto_auto] text-xs px-3 py-2 gap-3 items-center hover:bg-slate-50">
                      <span className="text-slate-400">{i + 1}</span>
                      <span className="text-slate-800 font-medium truncate">{c.name}</span>
                      <span className="text-slate-500 truncate max-w-[140px]">{c.contact}</span>
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                        c.channel === "email" ? "bg-violet-100 text-violet-700" :
                        c.channel === "whatsapp" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"
                      }`}>{c.channel}</span>
                    </div>
                  ))}
                  {parsedContacts.length > 50 && (
                    <div className="px-3 py-2 text-xs text-slate-400 text-center">
                      + {parsedContacts.length - 50} weitere Kontakte
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => setStep(2)} className="flex-1 btn-secondary py-2.5 text-sm">← Zurück</button>
            <button onClick={() => setStep(4)} className="flex-1 btn-primary py-2.5 text-sm">Weiter → Starten</button>
          </div>
        </div>
      )}

      {/* ── Step 4: Launch ── */}
      {step === 4 && (
        <div className="glass-card p-6 space-y-5">
          <h2 className="text-base font-semibold text-slate-800">Kampagne starten</h2>
          <div className="bg-slate-50 border border-slate-200 rounded-xl divide-y divide-slate-100">
            {[
              { label: "Kampagne",   value: form.name },
              { label: "Kanäle",    value: form.channels.map(c => c.toUpperCase()).join(", ") },
              { label: "Flow",      value: `${form.flow.length} Schritte (${form.flow.filter(s => s.type === "condition").length} Conditions)` },
              { label: "Kontakte",  value: parsedContacts.length > 0 ? `${parsedContacts.length} importiert` : form.file?.name ?? "Kein Import" },
              { label: "Agents",    value: null },
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
            <button onClick={() => setStep(3)} disabled={launching} className="flex-1 btn-secondary py-2.5 text-sm disabled:opacity-40">← Zurück</button>
            <button onClick={handleLaunch} disabled={launching}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all text-white ${
                launching ? "bg-emerald-500" : "bg-emerald-600 hover:bg-emerald-500"
              }`}>
              {launching ? "Wird gestartet…" : "Kampagne starten →"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
