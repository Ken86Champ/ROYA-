"use client";
import { useState, useRef, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import type { Campaign, FlowStep, CampaignContact, PromptFramework } from "@/lib/campaign-types";

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface ChatMsg {
  id: string;
  role: "agent" | "lead";
  text: string;
  time: string;
  flowStepIdx?: number; // which flow step this agent message corresponds to
}

function nowTime() {
  return new Date().toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });
}

// ─── PHONE MOCKUP ─────────────────────────────────────────────────────────────

function PhoneMockup({
  contact,
  messages,
  typing,
  input,
  onInput,
  onSend,
  onEditMsg,
  channel,
}: {
  contact: CampaignContact | null;
  messages: ChatMsg[];
  typing: boolean;
  input: string;
  onInput: (v: string) => void;
  onSend: () => void;
  onEditMsg: (msg: ChatMsg) => void;
  channel: string;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, typing]);

  return (
    <div className="flex flex-col items-center">
      {/* Phone frame */}
      <div className="relative w-[340px] rounded-[44px] bg-slate-900 shadow-2xl shadow-slate-900/40 p-3 border border-slate-700">
        {/* Notch */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-28 h-6 bg-slate-900 rounded-full z-10 flex items-center justify-center">
          <div className="w-16 h-4 bg-black rounded-full" />
        </div>
        {/* Screen */}
        <div className="rounded-[36px] bg-white overflow-hidden flex flex-col" style={{ height: 620 }}>
          {/* Status bar */}
          <div className="bg-white px-6 pt-8 pb-1 flex items-center justify-between text-[11px] font-semibold text-slate-900">
            <span>9:41</span>
            <div className="flex items-center gap-1">
              <span>●●●●</span>
              <span>WiFi</span>
              <span>⬜</span>
            </div>
          </div>
          {/* Message header */}
          <div className="bg-white border-b border-slate-100 px-4 py-2 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-400 to-violet-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
              {contact ? contact.name.slice(0, 1).toUpperCase() : "?"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900 truncate">{contact?.name || "Lead auswählen"}</p>
              <p className="text-[11px] text-slate-400">{contact?.contact || ""}</p>
            </div>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
              {channel === "whatsapp" ? "WhatsApp" : "SMS"}
            </span>
          </div>

          {/* Chat area */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 bg-slate-50">
            {!contact && (
              <div className="flex items-center justify-center h-full">
                <p className="text-xs text-slate-400 text-center">Wähle einen Lead aus der Liste<br/>um die Simulation zu starten</p>
              </div>
            )}
            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.role === "agent" ? "justify-end" : "justify-start"}`}>
                <div className="max-w-[75%]">
                  {msg.role === "agent" ? (
                    <button
                      onClick={() => onEditMsg(msg)}
                      title="Klicken zum Bearbeiten"
                      className="group relative text-left">
                      <div className="bg-blue-500 text-white text-sm px-3.5 py-2 rounded-2xl rounded-br-md leading-relaxed shadow-sm group-hover:bg-blue-400 transition-colors">
                        {msg.text}
                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-400 rounded-full text-[9px] flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity font-bold">✎</span>
                      </div>
                      <p className="text-[10px] text-slate-400 text-right mt-0.5 pr-1">{msg.time} · zum Bearbeiten klicken</p>
                    </button>
                  ) : (
                    <div>
                      <div className="bg-white text-slate-800 text-sm px-3.5 py-2 rounded-2xl rounded-bl-md leading-relaxed shadow-sm border border-slate-200">
                        {msg.text}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5 pl-1">{msg.time}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {typing && (
              <div className="flex justify-end">
                <div className="bg-blue-100 px-4 py-2.5 rounded-2xl rounded-br-md">
                  <div className="flex gap-1 items-center">
                    <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input bar */}
          <div className="bg-white border-t border-slate-100 px-3 py-2 flex items-center gap-2">
            <input
              value={input}
              onChange={e => onInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && onSend()}
              placeholder="Als Lead antworten…"
              disabled={!contact || typing}
              className="flex-1 bg-slate-100 rounded-full px-4 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none disabled:opacity-40"
            />
            <button
              onClick={onSend}
              disabled={!input.trim() || !contact || typing}
              className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center disabled:opacity-30 hover:bg-blue-400 transition-colors text-sm">
              ↑
            </button>
          </div>
        </div>
        {/* Home indicator */}
        <div className="flex justify-center mt-2">
          <div className="w-28 h-1 bg-white/30 rounded-full" />
        </div>
      </div>

      {/* Quick-reply hint */}
      {contact && messages.length > 0 && !typing && (
        <div className="mt-4 flex flex-wrap gap-2 justify-center max-w-[340px]">
          {["Ja, interessiert", "Was kostet das?", "Aktuell kein Interesse", "Ruf mich an"].map(q => (
            <button key={q} onClick={() => onInput(q)}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-full text-xs text-slate-600 hover:border-violet-300 hover:text-violet-600 transition-colors shadow-sm">
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── EDIT PANEL ───────────────────────────────────────────────────────────────

function EditPanel({
  msg,
  onSave,
  onClose,
  saving,
}: {
  msg: ChatMsg;
  onSave: (newText: string) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [text, setText] = useState(msg.text);
  return (
    <div className="bg-white rounded-2xl border border-violet-200 shadow-lg p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Nachricht bearbeiten</h3>
          <p className="text-xs text-slate-400 mt-0.5">Änderung gilt für alle Leads dieser Kampagne</p>
        </div>
        <button onClick={onClose} className="text-slate-300 hover:text-slate-600 text-lg leading-none">✕</button>
      </div>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        rows={5}
        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:border-violet-400 resize-none"
        autoFocus
      />
      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 py-2 text-sm text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50">
          Abbrechen
        </button>
        <button
          onClick={() => onSave(text)}
          disabled={saving || !text.trim() || text === msg.text}
          className="flex-1 py-2 text-sm font-semibold text-white bg-violet-600 rounded-xl hover:bg-violet-500 disabled:opacity-40 transition-all flex items-center justify-center gap-2">
          {saving ? (
            <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />Speichern…</>
          ) : (
            "Für alle Leads übernehmen →"
          )}
        </button>
      </div>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function CampaignSimulatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedContact, setSelectedContact] = useState<CampaignContact | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [history, setHistory] = useState<{ role: "lead" | "agent"; body: string }[]>([]);
  const [editingMsg, setEditingMsg] = useState<ChatMsg | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [savedSteps, setSavedSteps] = useState<Set<number>>(new Set());
  const [launching, setLaunching] = useState(false);
  const [search, setSearch] = useState("");
  const [simDone, setSimDone] = useState(false);

  // Manual test lead (when campaign has no contacts)
  const [manualName, setManualName] = useState("Thomas Meier");
  const [manualContact, setManualContact] = useState("+41 79 123 45 67");

  // Live test send
  const [liveTestNumber, setLiveTestNumber] = useState("");
  const [liveTestChannel, setLiveTestChannel] = useState<"sms" | "whatsapp">("sms");
  const [liveTestSending, setLiveTestSending] = useState(false);
  const [liveTestResult, setLiveTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [liveMode, setLiveMode] = useState(false);
  const [livePolling, setLivePolling] = useState(false);
  const processedSidsRef = useRef<Set<string>>(new Set());
  const lastPollTimeRef = useRef<string | null>(null);
  const liveModeRef = useRef(false);
  const isPollingRef = useRef(false);
  const historyRef = useRef<{ role: "lead" | "agent"; body: string }[]>([]);
  const typingRef = useRef(false);
  const [activeFramework, setActiveFramework] = useState<PromptFramework | null>(null);
  const [referenceDoc, setReferenceDoc] = useState<string | null>(null);
  const [referenceFileName, setReferenceFileName] = useState<string | null>(null);
  const refFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/campaigns/${id}`)
      .then(r => {
        if (!r.ok) throw new Error(`Campaign nicht gefunden (${r.status})`);
        return r.json();
      })
      .then((c: Campaign) => {
        if (!c.id) throw new Error("Ungültige Kampagne");
        setCampaign(c);
        setLoading(false);
        // Load saved reference doc from campaign
        if (c.aiFramework?.referenceDoc) {
          setReferenceDoc(c.aiFramework.referenceDoc);
          setReferenceFileName("Gespeicherte Vorlage");
        }
        // Load the campaign's prompt framework if linked
        if (c.aiFramework?.frameworkId) {
          fetch(`/api/frameworks/${c.aiFramework.frameworkId}`)
            .then(r => r.ok ? r.json() : null)
            .then(fw => { if (fw) setActiveFramework(fw); })
            .catch(() => {});
        }
      })
      .catch(() => setLoading(false));
  }, [id]);

  const addMsg = (role: "agent" | "lead", text: string, flowStepIdx?: number): ChatMsg => {
    const msg: ChatMsg = { id: crypto.randomUUID(), role, text, time: nowTime(), flowStepIdx };
    setMessages(prev => [...prev, msg]);
    return msg;
  };

  // Keep refs in sync with state so the polling interval always reads fresh values
  const syncHistory = (h: { role: "lead" | "agent"; body: string }[]) => {
    historyRef.current = h;
    setHistory(h);
  };
  const syncTyping = (v: boolean) => {
    typingRef.current = v;
    setTyping(v);
  };

  // ── Live SMS helpers ──────────────────────────────────────────────────────
  const normalizePhone = (num: string) => {
    const digits = num.replace(/\s/g, "");
    if (digits.startsWith("+")) return digits;
    if (digits.startsWith("00")) return "+" + digits.slice(2);
    if (digits.startsWith("0")) return "+41" + digits.slice(1);
    return digits;
  };

  const sendSms = async (text: string) => {
    if (!liveTestNumber.trim()) return;
    let twilio = { accountSid: "", authToken: "", from: "" };
    try { twilio = JSON.parse(localStorage.getItem("roya_twilio") || "{}"); } catch {}
    try {
      await fetch("/api/test-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: liveTestChannel, to: liveTestNumber.trim(), body: text, ...twilio }),
      });
    } catch (err) {
      console.error("[ROYA] SMS send error:", err);
    }
  };

  // ── Live SMS Polling ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!liveMode || !liveTestNumber.trim()) {
      liveModeRef.current = false;
      setLivePolling(false);
      return;
    }

    liveModeRef.current = true;
    setLivePolling(true);

    const interval = setInterval(async () => {
      // Guard: skip if not active, already processing, or AI is typing
      if (!liveModeRef.current || isPollingRef.current || typingRef.current) return;
      isPollingRef.current = true;

      const contact = normalizePhone(liveTestNumber);

      try {
        const params = new URLSearchParams({ contact, channel: liveTestChannel });
        if (lastPollTimeRef.current) params.set("since", lastPollTimeRef.current);

        const res = await fetch(`/api/twilio-poll?${params}`);
        if (!res.ok) { isPollingRef.current = false; return; }
        const data = await res.json();

        const newMsgs = (data.messages || []).filter(
          (m: { sid: string }) => !processedSidsRef.current.has(m.sid)
        );

        if (newMsgs.length === 0) { isPollingRef.current = false; return; }

        // Process only the FIRST new message, then let next tick handle more
        const msg = newMsgs[0];
        processedSidsRef.current.add(msg.sid);
        lastPollTimeRef.current = msg.dateSent;

        // Add lead message to chat
        addMsg("lead", msg.body);
        const newHistory = [...historyRef.current, { role: "lead" as const, body: msg.body }];
        syncHistory(newHistory);
        syncTyping(true);

        // Process through AI
        try {
          const bc = campaign?.businessContext;
          const fw = campaign?.aiFramework;
          const aiRes = await fetch("/api/converse", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              leadName: selectedContact?.name || "Lead",
              message: msg.body,
              history: newHistory,
              business: {
                agentName: fw?.agentName || "Lena",
                companyName: bc?.companyName || campaign?.name || "",
                offer: bc?.offer || campaign?.name || "",
                goal: bc?.cta || "Reaktivierungsgespräch starten",
                tone: fw?.tone || "Warm, direkt und menschlich",
                language: fw?.language || "de",
                ...bc,
                rules: fw?.rules ?? [],
                systemPrompt: fw?.systemPrompt || "",
              },
              ...(activeFramework ? {
                framework: {
                  writerInstructions: activeFramework.writerInstructions,
                  strategistInstructions: activeFramework.strategistInstructions,
                  interpreterInstructions: activeFramework.interpreterInstructions,
                  rules: activeFramework.rules,
                  forbiddenPhrases: activeFramework.forbiddenPhrases,
                  temperature: activeFramework.temperature,
                  exampleMessages: activeFramework.exampleMessages,
                },
              } : {}),
              ...(referenceDoc ? { referenceDoc } : {}),
            }),
          });
          const aiData = await aiRes.json();
          const reply = aiData.reply || "";

          syncTyping(false);
          if (reply) {
            const followupIdx = (campaign?.flow ?? []).findIndex(s => s.type === "followup");
            addMsg("agent", reply, followupIdx >= 0 ? followupIdx : 1);
            const updatedHistory = [...newHistory, { role: "agent" as const, body: reply }];
            syncHistory(updatedHistory);
            // Send the AI reply back via SMS
            await sendSms(reply);
          }
        } catch (err) {
          console.error("[ROYA] Poll AI error:", err);
          syncTyping(false);
        }
      } catch (err) {
        console.error("[ROYA] Poll error:", err);
      } finally {
        isPollingRef.current = false;
      }
    }, 3000);

    return () => {
      liveModeRef.current = false;
      setLivePolling(false);
      clearInterval(interval);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveMode, liveTestNumber]);

  const selectContact = async (contact: CampaignContact) => {
    if (!campaign) return;
    setSelectedContact(contact);
    setMessages([]);
    syncHistory([]);
    setInput("");
    setEditingMsg(null);
    setSimDone(false);
    syncTyping(true);
    // Reset polling state for new contact
    processedSidsRef.current = new Set();
    lastPollTimeRef.current = null;
    isPollingRef.current = false;

    const opener = (campaign.flow ?? []).find(s => s.type === "opener");
    const openerIdx = (campaign.flow ?? []).findIndex(s => s.type === "opener");

    try {
      // Always generate opener via API to ensure correct lead name
      let text = "";
      const fw = campaign.aiFramework ?? {};
      const bc = campaign.businessContext ?? {};
      const res = await fetch("/api/simulate/opener", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadName: contact.name,
          agentName: fw.agentName || "Lena",
          companyName: bc.companyName || campaign.name,
          offer: bc.offer || campaign.name,
          goal: bc.cta || "Reaktivierungsgespräch starten",
          valueProp: bc.valueProp || "",
          painPoint: bc.painPoint || "",
          cta: bc.cta || "",
          specialOffer: bc.specialOffer || "",
          leadRelationship: bc.leadRelationship || "",
          urgency: bc.urgency || "",
          insiderKnowledge: bc.insiderKnowledge || "",
          doNotSay: bc.doNotSay || "",
          tone: fw.tone || "Warm, direkt und menschlich",
          language: fw.language || "de",
          rules: fw.rules ?? [],
          systemPrompt: fw.systemPrompt || "",
        }),
      });
      const data = await res.json();
      text = data.opener || `Hallo ${contact.name}, ist das Thema ${campaign.name} noch aktuell für dich?`;
      syncTyping(false);
      addMsg("agent", text, openerIdx >= 0 ? openerIdx : 0);
      syncHistory([{ role: "agent", body: text }]);
    } catch {
      syncTyping(false);
      const fallback = `Hallo ${contact.name}, ist das Thema ${campaign.name} noch aktuell für dich?`;
      addMsg("agent", fallback, openerIdx >= 0 ? openerIdx : 0);
      syncHistory([{ role: "agent", body: fallback }]);
    }
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || typing || !campaign || !selectedContact) return;
    setInput("");
    addMsg("lead", text);
    const newHistory = [...historyRef.current, { role: "lead" as const, body: text }];
    syncHistory(newHistory);
    syncTyping(true);

    try {
      const res = await fetch("/api/converse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadName: selectedContact.name,
          message: text,
          history: newHistory,
          business: {
            agentName: campaign.aiFramework?.agentName || "Lena",
            companyName: campaign.businessContext?.companyName || campaign.name,
            offer: campaign.businessContext?.offer || campaign.name,
            goal: campaign.businessContext?.cta || "Reaktivierungsgespräch starten",
            tone: campaign.aiFramework?.tone || "Warm, direkt und menschlich",
            language: campaign.aiFramework?.language || "de",
            valueProp: campaign.businessContext?.valueProp || "",
            painPoint: campaign.businessContext?.painPoint || "",
            cta: campaign.businessContext?.cta || "",
            bookingLink: campaign.businessContext?.bookingLink || "",
            // Extended context
            industry: campaign.businessContext?.industry || "",
            companyDescription: campaign.businessContext?.companyDescription || "",
            location: campaign.businessContext?.location || "",
            usps: campaign.businessContext?.usps || "",
            allServices: campaign.businessContext?.allServices || "",
            priceRange: campaign.businessContext?.priceRange || "",
            specialOffer: campaign.businessContext?.specialOffer || "",
            leadRelationship: campaign.businessContext?.leadRelationship || "",
            noConvertReason: campaign.businessContext?.noConvertReason || "",
            afterCta: campaign.businessContext?.afterCta || "",
            urgency: campaign.businessContext?.urgency || "",
            objections: campaign.businessContext?.objections || [],
            doNotSay: campaign.businessContext?.doNotSay || "",
            insiderKnowledge: campaign.businessContext?.insiderKnowledge || "",
            exampleConversation: campaign.businessContext?.exampleConversation || "",
            rules: campaign.aiFramework?.rules ?? [],
            systemPrompt: campaign.aiFramework?.systemPrompt || "",
          },
          // Send full framework data if available
          ...(activeFramework ? {
            framework: {
              writerInstructions: activeFramework.writerInstructions,
              strategistInstructions: activeFramework.strategistInstructions,
              interpreterInstructions: activeFramework.interpreterInstructions,
              rules: activeFramework.rules,
              forbiddenPhrases: activeFramework.forbiddenPhrases,
              temperature: activeFramework.temperature,
              exampleMessages: activeFramework.exampleMessages,
            },
          } : {}),
          // Reference document for style guidance
          ...(referenceDoc ? { referenceDoc } : {}),
        }),
      });
      const data = await res.json();
      syncTyping(false);
      const reply = data.reply || data.error || "⚠ Keine Antwort erhalten.";
      const followupIdx = (campaign.flow ?? []).findIndex(s => s.type === "followup");
      addMsg("agent", reply, followupIdx >= 0 ? followupIdx : 1);
      syncHistory([...historyRef.current, { role: "agent", body: reply }]);
    } catch {
      syncTyping(false);
      const fallback = "⚠ Verbindungsfehler — bitte nochmal versuchen.";
      addMsg("agent", fallback);
      syncHistory([...historyRef.current, { role: "agent", body: fallback }]);
    }
  };

  const saveEdit = async (newText: string) => {
    if (!campaign || editingMsg === null) return;
    setSavingEdit(true);

    const flowStepIdx = editingMsg.flowStepIdx ?? 0;
    // Replace the current contact's first name with {name} placeholder so templates work across leads
    const contactFirstName = selectedContact?.name.split(" ")[0] || "";
    const templateText = contactFirstName
      ? newText.replace(new RegExp(`\\b${contactFirstName}\\b`, "gi"), "{name}")
      : newText;
    const updatedFlow: FlowStep[] = (campaign.flow ?? []).map((s, i) =>
      i === flowStepIdx ? { ...s, messageTemplate: templateText } : s
    );

    try {
      await fetch(`/api/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_flow", flow: updatedFlow }),
      });
      setCampaign(c => c ? { ...c, flow: updatedFlow } : c);
      setMessages(prev => prev.map(m => m.id === editingMsg.id ? { ...m, text: newText } : m));
      syncHistory(historyRef.current.map(m => m.body === editingMsg.text ? { ...m, body: newText } : m));
      setSavedSteps(s => new Set([...s, flowStepIdx]));
      setEditingMsg(null);
    } catch {}
    setSavingEdit(false);
  };

  const sendLiveTest = async () => {
    const agentMsg = messages.filter(m => m.role === "agent").at(-1);
    if (!agentMsg || !liveTestNumber.trim()) return;
    setLiveTestSending(true);
    setLiveTestResult(null);
    lastPollTimeRef.current = new Date().toISOString();
    let twilio = { accountSid: "", authToken: "", from: "" };
    try { twilio = JSON.parse(localStorage.getItem("roya_twilio") || "{}"); } catch {}
    try {
      const res = await fetch("/api/test-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: liveTestChannel, to: liveTestNumber.trim(), body: agentMsg.text, ...twilio }),
      });
      const data = await res.json();
      if (res.ok) {
        setLiveTestResult({ ok: true, msg: "Gesendet ✓" });
        // Auto-enable live mode after first send
        if (!liveMode) setLiveMode(true);
      } else {
        setLiveTestResult({ ok: false, msg: data.error || "Fehler beim Senden" });
      }
    } catch {
      setLiveTestResult({ ok: false, msg: "Netzwerkfehler" });
    }
    setLiveTestSending(false);
  };

  const launchCampaign = async () => {
    setLaunching(true);
    await fetch(`/api/campaigns/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start" }),
    }).catch(() => {});
    router.push("/dashboard/campaigns");
  };

  const filteredContacts = (campaign?.contacts ?? []).filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.contact.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="text-slate-400 text-sm">Kampagne wird geladen…</div>
    </div>
  );

  if (!campaign) return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <div className="text-slate-400 text-sm">Kampagne nicht gefunden.</div>
      <button onClick={() => router.push("/dashboard/campaigns")}
        className="px-4 py-2 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-500 transition-colors">
        ← Zurück zu Kampagnen
      </button>
    </div>
  );

  const channel = campaign.channels?.[0] ?? "sms";

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── LEFT: Lead list ───────────────────────────────────────────────── */}
      <div className="w-72 shrink-0 border-r border-slate-200 bg-white flex flex-col">
        <div className="p-4 border-b border-slate-100">
          <button onClick={() => router.push("/dashboard/campaigns")}
            className="text-xs text-slate-400 hover:text-slate-700 flex items-center gap-1 mb-3 transition-colors">
            ← Zurück zu Kampagnen
          </button>
          <h2 className="text-sm font-semibold text-slate-800 truncate">{campaign.name}</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {campaign.contacts?.length ?? 0} Leads · {(campaign.channels ?? []).map(c => c.toUpperCase()).join(", ")}
          </p>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-slate-100">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Lead suchen…"
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700 placeholder-slate-300 focus:outline-none focus:border-violet-400"
          />
        </div>

        {/* Contact list */}
        <div className="flex-1 overflow-y-auto">
          {/* No contacts → manual test lead entry */}
          {(campaign?.contacts ?? []).length === 0 && (
            <div className="p-4 space-y-3 border-b border-slate-100">
              <p className="text-xs font-semibold text-slate-500">Test-Lead manuell eingeben</p>
              <input value={manualName} onChange={e => setManualName(e.target.value)}
                placeholder="Name" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-violet-400" />
              <input value={manualContact} onChange={e => setManualContact(e.target.value)}
                placeholder="+41 79 123 45 67 oder email@firma.ch" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-violet-400" />
              <button
                disabled={!manualName.trim()}
                onClick={() => {
                  const fake: CampaignContact = {
                    id: "manual_test", name: manualName.trim(),
                    contact: manualContact.trim(), channel: manualContact.includes("@") ? "email" : "sms",
                    status: "pending", currentStep: 0,
                    emailAttempts: 0, smsAttempts: 0, whatsappAttempts: 0,
                  };
                  selectContact(fake);
                }}
                className="w-full py-2 bg-violet-600 text-white text-xs font-semibold rounded-lg hover:bg-violet-500 disabled:opacity-40 transition-all">
                Simulation starten →
              </button>
            </div>
          )}
          {filteredContacts.length === 0 && (campaign?.contacts ?? []).length > 0 ? (
            <p className="text-xs text-slate-400 text-center p-4">Keine Leads gefunden</p>
          ) : filteredContacts.map(c => (
            <button key={c.id} onClick={() => selectContact(c)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-b border-slate-50 hover:bg-violet-50 ${
                selectedContact?.id === c.id ? "bg-violet-50 border-l-2 border-l-violet-500" : ""
              }`}>
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center text-slate-600 text-xs font-bold shrink-0">
                {c.name.slice(0, 1).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-800 truncate">{c.name}</p>
                <p className="text-[11px] text-slate-400 truncate">{c.contact}</p>
              </div>
              {selectedContact?.id === c.id && (
                <span className="w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" />
              )}
            </button>
          ))}
        </div>

        {/* Flow steps indicator */}
        <div className="p-4 border-t border-slate-100 space-y-1">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Flow Templates</p>
          {(campaign.flow ?? []).map((s, i) => (
            <div key={s.id} className="flex items-center gap-2">
              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] ${
                savedSteps.has(i) ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-400"
              }`}>{savedSteps.has(i) ? "✓" : i + 1}</span>
              <span className="text-[11px] text-slate-600 truncate">{s.label}</span>
              {s.messageTemplate && <span className="text-[9px] text-emerald-500 font-medium">gesetzt</span>}
            </div>
          ))}
        </div>
      </div>

      {/* ── CENTER: Phone mockup ───────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto bg-gradient-to-br from-slate-100 to-violet-50 flex flex-col items-center justify-start py-8 px-4 gap-6">
        <div className="text-center max-w-sm">
          <h1 className="text-lg font-bold text-slate-800">Live Simulation</h1>
          <p className="text-xs text-slate-400 mt-1">
            Wähle einen Lead aus → simuliere das Gespräch → klicke auf <span className="font-medium text-blue-500">blaue Nachrichten</span> um sie zu bearbeiten
          </p>
        </div>

        <PhoneMockup
          contact={selectedContact}
          messages={messages}
          typing={typing}
          input={input}
          onInput={setInput}
          onSend={sendMessage}
          onEditMsg={setEditingMsg}
          channel={channel}
        />

        {/* Export chat */}
        {messages.length > 0 && (
          <button
            onClick={() => {
              const lead = selectedContact;
              const lines = [
                `Chat-Export: ${campaign.name}`,
                `Lead: ${lead?.name ?? "?"} (${lead?.contact ?? ""})`,
                `Datum: ${new Date().toLocaleDateString("de-CH")} ${new Date().toLocaleTimeString("de-CH")}`,
                `Framework: ${activeFramework?.name ?? "Standard"}`,
                "",
                ...messages.map(m => `[${m.time}] ${m.role === "agent" ? campaign.aiFramework?.agentName ?? "Agent" : lead?.name ?? "Lead"}: ${m.text}`),
              ];
              const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `chat-${lead?.name?.replace(/\s+/g, "-") ?? "export"}-${new Date().toISOString().slice(0, 10)}.txt`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="w-[340px] py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-500 hover:border-violet-300 hover:text-violet-600 transition-all flex items-center justify-center gap-2"
          >
            <span>↓</span> Chat-Verlauf exportieren ({messages.length} Nachrichten)
          </button>
        )}

        {/* Reference document upload */}
        <div className="w-[340px] bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Referenz-Dokument</h3>
            <p className="text-xs text-slate-400 mt-0.5">Lade ein korrigiertes Chat-Protokoll oder Stilvorlage hoch. Die KI übernimmt diesen Kommunikationsstil.</p>
          </div>
          <input ref={refFileRef} type="file" accept=".txt,.md,.csv" className="hidden" onChange={e => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = ev => {
              const text = ev.target?.result as string;
              if (text && text.length > 0) {
                const doc = text.slice(0, 15000);
                setReferenceDoc(doc);
                setReferenceFileName(file.name);
                // Persist to campaign
                if (campaign) {
                  fetch(`/api/campaigns/${id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "update_framework", aiFramework: { ...campaign.aiFramework, referenceDoc: doc } }),
                  }).catch(() => {});
                }
              }
            };
            reader.readAsText(file, "UTF-8");
            e.target.value = "";
          }} />
          {referenceDoc ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 bg-violet-50 border border-violet-200 rounded-xl px-3 py-2">
                <span className="text-violet-500 text-sm">✓</span>
                <span className="text-xs text-violet-700 font-medium flex-1 truncate">{referenceFileName}</span>
                <span className="text-[10px] text-violet-400">{(referenceDoc.length / 1000).toFixed(1)}k Zeichen</span>
              </div>
              <div className="bg-slate-50 rounded-xl p-3 text-[11px] text-slate-500 max-h-24 overflow-y-auto whitespace-pre-wrap font-mono">{referenceDoc.slice(0, 500)}{referenceDoc.length > 500 ? "…" : ""}</div>
              <div className="flex gap-2">
                <button onClick={() => refFileRef.current?.click()} className="flex-1 py-1.5 rounded-lg text-xs font-medium border border-slate-200 text-slate-500 bg-slate-50 hover:border-violet-300 transition-all">Ersetzen</button>
                <button onClick={() => {
                  setReferenceDoc(null);
                  setReferenceFileName(null);
                  if (campaign) {
                    const { referenceDoc: _removed, ...rest } = campaign.aiFramework || {};
                    fetch(`/api/campaigns/${id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "update_framework", aiFramework: { ...rest, referenceDoc: "" } }),
                    }).catch(() => {});
                  }
                }} className="flex-1 py-1.5 rounded-lg text-xs font-medium border border-red-200 text-red-500 bg-red-50 hover:border-red-300 transition-all">Entfernen</button>
              </div>
            </div>
          ) : (
            <button onClick={() => refFileRef.current?.click()}
              className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-xs text-slate-400 hover:border-violet-300 hover:text-violet-500 transition-all">
              ↑ .txt oder .md hochladen
            </button>
          )}
        </div>

        {/* Live Test senden */}
        {messages.some(m => m.role === "agent") && (
          <div className="w-[340px] bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Live SMS Test</h3>
              <p className="text-xs text-slate-400 mt-0.5">Sendet die Opener-SMS und antwortet automatisch auf Antworten</p>
            </div>
            <div className="flex gap-2">
              {(["sms", "whatsapp"] as const).map(ch => (
                <button key={ch} onClick={() => setLiveTestChannel(ch)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    liveTestChannel === ch ? "bg-violet-600 border-violet-600 text-white" : "border-slate-200 text-slate-500 bg-slate-50 hover:border-violet-300"
                  }`}>
                  {ch === "sms" ? "SMS" : "WhatsApp"}
                </button>
              ))}
            </div>
            <input
              value={liveTestNumber}
              onChange={e => { setLiveTestNumber(e.target.value); setLiveTestResult(null); }}
              placeholder="+41 79 123 45 67"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:border-violet-400"
            />
            {liveTestResult && (
              <p className={`text-xs px-3 py-2 rounded-lg ${liveTestResult.ok ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-600 border border-red-200"}`}>
                {liveTestResult.msg}
              </p>
            )}
            <button onClick={sendLiveTest} disabled={liveTestSending || !liveTestNumber.trim()}
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold rounded-xl disabled:opacity-40 transition-all flex items-center justify-center gap-2">
              {liveTestSending ? (
                <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Wird gesendet…</>
              ) : "Opener senden und Live-Modus starten"}
            </button>

            {/* Live mode status */}
            {liveMode && (
              <div className={`flex items-center justify-between px-3 py-2.5 rounded-xl border ${livePolling ? "bg-green-50 border-green-200" : "bg-slate-50 border-slate-200"}`}>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${livePolling ? "bg-green-500 animate-pulse" : "bg-slate-400"}`} />
                  <span className="text-xs font-medium text-slate-700">
                    {livePolling ? "Wartet auf SMS-Antwort..." : "Live-Modus inaktiv"}
                  </span>
                </div>
                <button
                  onClick={() => { setLiveMode(false); liveModeRef.current = false; }}
                  className="text-[10px] text-red-500 hover:text-red-700 font-medium"
                >
                  Stoppen
                </button>
              </div>
            )}

            <p className="text-[10px] text-slate-400 text-center">
              {liveMode
                ? "KI antwortet automatisch auf eingehende SMS"
                : "Klick sendet den Opener und aktiviert automatische Antworten"}
            </p>
          </div>
        )}

        {/* Launch button */}
        {(campaign.contacts?.length ?? 0) > 0 && (
          <div className="w-[340px] space-y-2">
            {savedSteps.size > 0 && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
                <p className="text-xs text-emerald-700 font-medium">
                  {savedSteps.size} Template{savedSteps.size > 1 ? "s" : ""} gespeichert — gilt für alle {(campaign.contacts?.length ?? 0)} Leads
                </p>
              </div>
            )}
            <button onClick={launchCampaign} disabled={launching}
              className={`w-full py-3 rounded-2xl text-sm font-semibold text-white transition-all flex items-center justify-center gap-2 ${
                launching ? "bg-emerald-500" : "bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-200"
              }`}>
              {launching ? (
                <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Kampagne wird gestartet…</>
              ) : (
                `Kampagne starten → ${(campaign.contacts?.length ?? 0)} Leads`
              )}
            </button>
            <p className="text-[11px] text-slate-400 text-center">
              Simulation ist optional — du kannst jetzt direkt starten
            </p>
          </div>
        )}
      </div>

      {/* ── RIGHT: Edit panel ─────────────────────────────────────────────── */}
      <div className={`w-80 shrink-0 border-l border-slate-200 bg-white flex flex-col transition-all ${editingMsg ? "translate-x-0" : "translate-x-full hidden"}`}>
        {editingMsg && (
          <>
            <div className="p-4 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-800">Nachricht bearbeiten</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Gespeicherte Änderung gilt für alle {(campaign.contacts?.length ?? 0)} Leads
              </p>
            </div>
            <div className="flex-1 p-4">
              <EditPanel
                msg={editingMsg}
                onSave={saveEdit}
                onClose={() => setEditingMsg(null)}
                saving={savingEdit}
              />

              {/* Original preview */}
              <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Original (KI-generiert)</p>
                <p className="text-xs text-slate-500 leading-relaxed">{editingMsg.text}</p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Edit panel overlay (if no right panel space) */}
      {editingMsg && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-slate-900/20 backdrop-blur-sm sm:hidden">
          <div className="w-full max-w-lg">
            <EditPanel
              msg={editingMsg}
              onSave={saveEdit}
              onClose={() => setEditingMsg(null)}
              saving={savingEdit}
            />
          </div>
        </div>
      )}
    </div>
  );
}
