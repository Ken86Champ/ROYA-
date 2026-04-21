"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";

const STATE_META: Record<string, { label: string; dot: string; badge: string }> = {
  not_contacted:      { label: "Neu",           dot: "bg-slate-300",   badge: "bg-slate-100 text-slate-500 border-slate-200" },
  first_message_sent: { label: "Kontaktiert",   dot: "bg-violet-400",  badge: "bg-violet-50 text-violet-700 border-violet-200" },
  replied_positive:   { label: "Positiv",       dot: "bg-blue-400",    badge: "bg-blue-50 text-blue-700 border-blue-200" },
  replied_negative:   { label: "Negativ",       dot: "bg-red-300",     badge: "bg-red-50 text-red-600 border-red-200" },
  qualified:          { label: "Qualifiziert",  dot: "bg-amber-400",   badge: "bg-amber-50 text-amber-700 border-amber-200" },
  booking_pushed:     { label: "Termin gesendet",dot: "bg-cyan-400",   badge: "bg-cyan-50 text-cyan-700 border-cyan-200" },
  booked:             { label: "Gebucht",       dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  dead:               { label: "Inaktiv",       dot: "bg-slate-300",   badge: "bg-slate-100 text-slate-400 border-slate-200" },
};

const SEGMENT_META: Record<string, { label: string; color: string }> = {
  hot:  { label: "Hot",  color: "text-red-600 bg-red-50 border-red-200" },
  warm: { label: "Warm", color: "text-amber-600 bg-amber-50 border-amber-200" },
  cold: { label: "Cold", color: "text-blue-600 bg-blue-50 border-blue-200" },
  lost: { label: "Lost", color: "text-slate-500 bg-slate-50 border-slate-200" },
};

// CSV parser (same as campaign wizard)
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

function suggestField(h: string): string {
  const s = h.toLowerCase().replace(/[_\s-]/g, "");
  if (/email|mail/.test(s)) return "email";
  if (/phone|tel|mobil/.test(s)) return "phone";
  if (/firstname|vorname/.test(s)) return "firstName";
  if (/lastname|nachname/.test(s)) return "lastName";
  if (/name/.test(s)) return "fullName";
  if (/company|firma|unternehmen/.test(s)) return "company";
  if (/title|position|jobtitel/.test(s)) return "jobTitle";
  return "ignore";
}

interface CRMContact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  job_title: string | null;
  segment: string | null;
  state: string;
  deal_value: number | null;
  loss_reason: string | null;
  original_interest: string | null;
  unsubscribed_at: string | null;
  created_at: string;
}

interface ImportResult {
  imported: number;
  duplicates: number;
  invalid: number;
  optedOut: number;
  total: number;
  details: { imported: string[]; duplicates: string[]; invalid: string[]; optedOut: string[] };
}

const inp = "w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 text-sm placeholder-slate-300 focus:outline-none focus:border-violet-400 transition-colors";

export default function ContactsPage() {
  const [contacts, setContacts] = useState<CRMContact[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [segmentFilter, setSegmentFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Import modal
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importParsed, setImportParsed] = useState<{ headers: string[]; rows: Record<string, string>[] } | null>(null);
  const [importMappings, setImportMappings] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Edit modal
  const [editContact, setEditContact] = useState<CRMContact | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (stateFilter) params.set("state", stateFilter);
    if (segmentFilter) params.set("segment", segmentFilter);
    fetch(`/api/contacts?${params}`).then(r => r.json()).then(data => {
      setContacts(data.contacts ?? []);
      setCounts(data.counts ?? {});
      setTotal(data.total ?? 0);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [search, stateFilter, segmentFilter]);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  // ── Import handlers ──
  const handleImportFile = (f: File) => {
    setImportFile(f);
    setImportResult(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseCSV(text);
      setImportParsed(parsed);
      if (parsed) {
        const mappings: Record<string, string> = {};
        parsed.headers.forEach(h => { mappings[h] = suggestField(h); });
        setImportMappings(mappings);
      }
    };
    reader.readAsText(f);
  };

  const handleImportSubmit = async () => {
    if (!importParsed) return;
    setImporting(true);
    const contacts = importParsed.rows.map(row => {
      const obj: Record<string, string> = {};
      Object.entries(importMappings).forEach(([csv, field]) => {
        if (field !== "ignore") obj[field] = row[csv] || "";
      });
      return obj;
    });
    try {
      const res = await fetch("/api/contacts/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacts, deduplicateBy: "both" }),
      }).then(r => r.json());
      setImportResult(res);
      if (res.imported > 0) load();
    } catch { setImportResult({ imported: 0, duplicates: 0, invalid: 0, optedOut: 0, total: 0, details: { imported: [], duplicates: [], invalid: [], optedOut: [] } }); }
    setImporting(false);
  };

  // ── Edit handlers ──
  const openEdit = (c: CRMContact) => {
    setEditContact(c);
    setEditForm({
      firstName: c.first_name || "",
      lastName: c.last_name || "",
      email: c.email || "",
      phone: c.phone || "",
      company: c.company || "",
      jobTitle: c.job_title || "",
      segment: c.segment || "",
      state: c.state || "",
      dealValue: c.deal_value?.toString() || "",
    });
  };

  const handleSaveEdit = async () => {
    if (!editContact) return;
    setSaving(true);
    await fetch("/api/contacts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editContact.id, ...editForm, dealValue: editForm.dealValue ? parseFloat(editForm.dealValue) : null }),
    });
    setSaving(false);
    setEditContact(null);
    load();
  };

  // ── Delete handler ──
  const handleDelete = async (ids: string[]) => {
    if (!confirm(`${ids.length} Kontakt(e) als abgemeldet markieren?`)) return;
    await fetch("/api/contacts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    setSelected(new Set());
    load();
  };

  const toggleSelect = (id: string) => setSelected(s => {
    const next = new Set(s);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const toggleAll = () => setSelected(s => s.size === contacts.length ? new Set() : new Set(contacts.map(c => c.id)));

  const displayName = (c: CRMContact) => [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || c.phone || "—";

  return (
    <div className="p-8 max-w-[1200px] overflow-auto h-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Kontakte (CRM)</h1>
          <p className="text-slate-400 text-sm mt-1">{total} Kontakte gesamt</p>
        </div>
        <div className="flex items-center gap-3">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Suche…"
            className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm text-slate-700 placeholder-slate-300 focus:outline-none focus:border-violet-400 w-48 transition-colors" />
          <a href="/api/export?type=contacts" download
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl transition-all">
            ↓ CSV
          </a>
          <button onClick={() => { setShowImport(true); setImportFile(null); setImportParsed(null); setImportResult(null); }}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-xl transition-all">
            ↑ CSV Import
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="glass-card p-3 mb-5 flex items-center gap-2 flex-wrap">
        <span className="text-[10px] text-slate-400 font-semibold uppercase mr-1">Status:</span>
        {[
          { key: "", label: "Alle", count: counts.total || 0 },
          { key: "not_contacted", label: "Neu" },
          { key: "first_message_sent", label: "Kontaktiert" },
          { key: "replied_positive", label: "Positiv" },
          { key: "qualified", label: "Qualifiziert" },
          { key: "booked", label: "Gebucht" },
        ].map(f => (
          <button key={f.key} onClick={() => setStateFilter(f.key)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
              stateFilter === f.key ? "bg-violet-100 text-violet-700" : "text-slate-500 hover:bg-slate-100"
            }`}>
            {f.label}
            {f.count !== undefined ? ` (${f.count})` : counts[`state_${f.key}`] ? ` (${counts[`state_${f.key}`]})` : ""}
          </button>
        ))}
        <div className="w-px h-5 bg-slate-200 mx-1" />
        <span className="text-[10px] text-slate-400 font-semibold uppercase mr-1">Segment:</span>
        {["", "hot", "warm", "cold", "lost"].map(s => (
          <button key={s} onClick={() => setSegmentFilter(s)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
              segmentFilter === s ? "bg-violet-100 text-violet-700" : "text-slate-500 hover:bg-slate-100"
            }`}>
            {s || "Alle"}{counts[`segment_${s}`] ? ` (${counts[`segment_${s}`]})` : ""}
          </button>
        ))}
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="glass-card p-3 mb-4 flex items-center gap-3 bg-violet-50 border-violet-200">
          <span className="text-xs font-semibold text-violet-700">{selected.size} ausgewählt</span>
          <button onClick={() => handleDelete(Array.from(selected))}
            className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-all">
            Abmelden
          </button>
          <button onClick={() => setSelected(new Set())}
            className="text-xs text-slate-500 hover:text-slate-700">Auswahl aufheben</button>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex gap-1.5">
            {["bg-violet-500","bg-cyan-500","bg-emerald-500"].map((c, i) => (
              <span key={i} className={`w-2.5 h-2.5 rounded-full ${c} animate-bounce`} style={{ animationDelay: `${i*0.15}s` }} />
            ))}
          </div>
        </div>
      ) : contacts.length === 0 ? (
        <div className="glass-card p-16 flex flex-col items-center justify-center text-center">
          <div className="w-20 h-20 rounded-3xl bg-violet-50 border border-violet-100 flex items-center justify-center mb-6">
            <span className="text-4xl text-violet-300">◉</span>
          </div>
          <h3 className="text-xl font-semibold text-slate-800 mb-2">Noch keine CRM-Kontakte</h3>
          <p className="text-slate-400 text-sm max-w-md mb-6">Importiere eine CSV-Datei oder starte eine Kampagne.</p>
          <button onClick={() => { setShowImport(true); setImportFile(null); setImportParsed(null); setImportResult(null); }}
            className="btn-primary flex items-center gap-2">
            <span>↑</span><span>CSV Import</span>
          </button>
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-3 py-3 w-10">
                  <input type="checkbox" checked={selected.size === contacts.length && contacts.length > 0}
                    onChange={toggleAll} className="rounded" />
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Kontakt</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">E-Mail / Telefon</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Segment</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Unternehmen</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {contacts.map(c => {
                const st = STATE_META[c.state] || STATE_META.not_contacted;
                const seg = c.segment ? SEGMENT_META[c.segment] : null;
                return (
                  <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-3 py-3">
                      <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} className="rounded" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-violet-100 flex items-center justify-center font-bold text-violet-700 text-sm shrink-0">
                          {(c.first_name || c.email || "?")[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{displayName(c)}</p>
                          {c.job_title && <p className="text-[10px] text-slate-400">{c.job_title}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {c.email && <p className="text-xs text-slate-600 font-mono">{c.email}</p>}
                      {c.phone && <p className="text-xs text-slate-400 font-mono">{c.phone}</p>}
                    </td>
                    <td className="px-4 py-3">
                      {seg ? (
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${seg.color}`}>{seg.label}</span>
                      ) : (
                        <span className="text-[10px] text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${st.badge}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />{st.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-slate-500 truncate max-w-[120px] block">{c.company || "—"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(c)} className="text-xs text-violet-500 hover:text-violet-700 font-medium">Bearbeiten</button>
                        <button onClick={() => handleDelete([c.id])} className="text-xs text-red-400 hover:text-red-600 font-medium">Abmelden</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
            <p className="text-xs text-slate-400">{contacts.length} von {total} Kontakten</p>
          </div>
        </div>
      )}

      {/* ── Import Modal ── */}
      {showImport && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowImport(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">CSV Import</h2>
              <button onClick={() => setShowImport(false)} className="text-slate-400 hover:text-slate-600 text-lg">✕</button>
            </div>
            <div className="p-6 space-y-4">
              {/* Upload */}
              {!importParsed && (
                <div
                  onClick={() => fileRef.current?.click()}
                  className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center cursor-pointer hover:border-violet-300 transition-all">
                  <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleImportFile(f); }} />
                  <p className="text-slate-600 font-semibold">CSV hier klicken oder ziehen</p>
                  <p className="text-slate-400 text-sm mt-1">.csv, .txt</p>
                </div>
              )}

              {/* Mapping */}
              {importParsed && !importResult && (
                <>
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                    <p className="text-xs text-emerald-700 font-semibold">{importFile?.name}: {importParsed.rows.length} Zeilen, {importParsed.headers.length} Spalten</p>
                  </div>
                  <div className="space-y-2">
                    {importParsed.headers.map(h => (
                      <div key={h} className="flex items-center gap-3">
                        <span className="text-xs text-slate-600 font-mono w-32 truncate">{h}</span>
                        <span className="text-slate-300">→</span>
                        <select value={importMappings[h] || "ignore"}
                          onChange={e => setImportMappings(m => ({ ...m, [h]: e.target.value }))}
                          className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs">
                          <option value="ignore">— Ignorieren —</option>
                          <option value="firstName">Vorname</option>
                          <option value="lastName">Nachname</option>
                          <option value="fullName">Vollst. Name</option>
                          <option value="email">E-Mail</option>
                          <option value="phone">Telefon</option>
                          <option value="company">Unternehmen</option>
                          <option value="jobTitle">Position</option>
                        </select>
                      </div>
                    ))}
                  </div>
                  <button onClick={handleImportSubmit} disabled={importing}
                    className="w-full py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-all">
                    {importing ? "Importiere…" : `${importParsed.rows.length} Kontakte importieren`}
                  </button>
                </>
              )}

              {/* Result */}
              {importResult && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-center">
                      <p className="text-2xl font-bold text-emerald-600">{importResult.imported}</p>
                      <p className="text-[10px] text-emerald-700">Importiert</p>
                    </div>
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-center">
                      <p className="text-2xl font-bold text-amber-600">{importResult.duplicates}</p>
                      <p className="text-[10px] text-amber-700">Duplikate</p>
                    </div>
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-center">
                      <p className="text-2xl font-bold text-red-500">{importResult.invalid}</p>
                      <p className="text-[10px] text-red-600">Ungültig</p>
                    </div>
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center">
                      <p className="text-2xl font-bold text-slate-500">{importResult.optedOut}</p>
                      <p className="text-[10px] text-slate-600">Abgemeldet</p>
                    </div>
                  </div>
                  {importResult.details.invalid.length > 0 && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                      <p className="text-[10px] font-semibold text-red-600 mb-1">Ungültige Einträge:</p>
                      {importResult.details.invalid.map((d, i) => <p key={i} className="text-[10px] text-red-500">{d}</p>)}
                    </div>
                  )}
                  <button onClick={() => setShowImport(false)}
                    className="w-full py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-xl">Schliessen</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Modal ── */}
      {editContact && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setEditContact(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Kontakt bearbeiten</h2>
              <button onClick={() => setEditContact(null)} className="text-slate-400 hover:text-slate-600 text-lg">✕</button>
            </div>
            <div className="p-6 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-500 mb-1 block">Vorname</label>
                  <input value={editForm.firstName || ""} onChange={e => setEditForm(f => ({ ...f, firstName: e.target.value }))} className={inp} />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 mb-1 block">Nachname</label>
                  <input value={editForm.lastName || ""} onChange={e => setEditForm(f => ({ ...f, lastName: e.target.value }))} className={inp} />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-slate-500 mb-1 block">E-Mail</label>
                <input value={editForm.email || ""} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} className={inp} />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 mb-1 block">Telefon</label>
                <input value={editForm.phone || ""} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} className={inp} />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 mb-1 block">Unternehmen</label>
                <input value={editForm.company || ""} onChange={e => setEditForm(f => ({ ...f, company: e.target.value }))} className={inp} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-500 mb-1 block">Segment</label>
                  <select value={editForm.segment || ""} onChange={e => setEditForm(f => ({ ...f, segment: e.target.value }))}
                    className={inp}>
                    <option value="">—</option>
                    <option value="hot">Hot</option>
                    <option value="warm">Warm</option>
                    <option value="cold">Cold</option>
                    <option value="lost">Lost</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-slate-500 mb-1 block">Deal-Wert (€)</label>
                  <input type="number" value={editForm.dealValue || ""} onChange={e => setEditForm(f => ({ ...f, dealValue: e.target.value }))} className={inp} />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setEditContact(null)} className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-xl">Abbrechen</button>
                <button onClick={handleSaveEdit} disabled={saving}
                  className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-sm font-semibold rounded-xl">
                  {saving ? "…" : "Speichern"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
