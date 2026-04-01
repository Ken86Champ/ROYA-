"use client";
import { useEffect, useRef, useState, useCallback } from "react";

interface ContactEntry {
  contact: string;
  lastMessage: string;
  lastAt: string;
  direction: string;
}

interface Message {
  sid: string;
  direction: "inbound" | "outbound";
  body: string;
  dateSent: string;
  status: string;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const isToday =
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear();
  if (isToday) return "Heute";
  return d.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit" });
}

function displayContact(contact: string) {
  return contact.replace(/^\+41/, "0").replace(/(\d{3})(\d{3})(\d{2})(\d{2})/, "$1 $2 $3 $4");
}

export default function LiveChatPage() {
  const [contacts, setContacts] = useState<ContactEntry[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchContacts = useCallback(async () => {
    const res = await fetch("/api/live-chat").catch(() => null);
    if (!res?.ok) return;
    const data = await res.json();
    setContacts(data.contacts || []);
    setLoadingContacts(false);
  }, []);

  const fetchMessages = useCallback(async (contact: string) => {
    const res = await fetch(`/api/live-chat?contact=${encodeURIComponent(contact)}`).catch(() => null);
    if (!res?.ok) return;
    const data = await res.json();
    setMessages(data.messages || []);
    setLoadingMessages(false);
  }, []);

  // Initial load + poll contacts every 5s
  useEffect(() => {
    fetchContacts();
    const t = setInterval(fetchContacts, 5000);
    return () => clearInterval(t);
  }, [fetchContacts]);

  // Poll messages for selected contact every 3s
  useEffect(() => {
    if (!selected) return;
    setLoadingMessages(true);
    fetchMessages(selected);
    const t = setInterval(() => fetchMessages(selected), 3000);
    return () => clearInterval(t);
  }, [selected, fetchMessages]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Group messages by date for separators
  const grouped: { date: string; msgs: Message[] }[] = [];
  for (const msg of messages) {
    const d = formatDate(msg.dateSent);
    const last = grouped[grouped.length - 1];
    if (!last || last.date !== d) {
      grouped.push({ date: d, msgs: [msg] });
    } else {
      last.msgs.push(msg);
    }
  }

  return (
    <div className="flex h-full bg-slate-50">
      {/* Contact list */}
      <div className="w-80 border-r border-slate-200 bg-white flex flex-col shrink-0">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800">Live-Gespraeche</h3>
          <p className="text-xs text-slate-400 mt-0.5">Echtzeit SMS / WhatsApp</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingContacts && (
            <div className="flex items-center justify-center py-12">
              <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {!loadingContacts && contacts.length === 0 && (
            <div className="px-5 py-8 text-center">
              <p className="text-sm text-slate-400">Noch keine Gespraeche</p>
              <p className="text-xs text-slate-300 mt-1">Schick eine Test-SMS</p>
            </div>
          )}
          {contacts.map((c) => (
            <button
              key={c.contact}
              onClick={() => setSelected(c.contact)}
              className={`w-full text-left px-4 py-3.5 border-b border-slate-50 hover:bg-slate-50 transition-colors ${
                selected === c.contact ? "bg-violet-50 border-l-2 border-l-violet-500" : ""
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center text-white text-xs font-bold shrink-0">
                  {c.contact.slice(-2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-800 truncate">
                      {displayContact(c.contact)}
                    </span>
                    <span className="text-[10px] text-slate-400 shrink-0 ml-2">
                      {formatTime(c.lastAt)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 truncate mt-0.5">{c.lastMessage}</p>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Live indicator */}
        <div className="px-4 py-3 border-t border-slate-100 flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
          <span className="text-xs text-slate-400">Live — alle 3s aktualisiert</span>
        </div>
      </div>

      {/* Chat view */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
            <div className="w-16 h-16 rounded-2xl bg-violet-100 flex items-center justify-center mb-4">
              <span className="text-3xl">◊</span>
            </div>
            <h3 className="text-base font-semibold text-slate-700">Gespraech auswaehlen</h3>
            <p className="text-sm text-slate-400 mt-1">
              Waehle einen Kontakt links um den Chat zu sehen
            </p>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="px-6 py-3.5 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center text-white text-xs font-bold">
                  {selected.slice(-2)}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">{displayContact(selected)}</p>
                  <p className="text-xs text-slate-400">SMS — ROYA Agent aktiv</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-100 px-2.5 py-1 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  Agent aktiv
                </span>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-1">
              {loadingMessages && messages.length === 0 && (
                <div className="flex items-center justify-center py-12">
                  <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              {grouped.map(({ date, msgs }) => (
                <div key={date}>
                  {/* Date separator */}
                  <div className="flex items-center gap-3 my-4">
                    <div className="flex-1 h-px bg-slate-200" />
                    <span className="text-[11px] text-slate-400 font-medium">{date}</span>
                    <div className="flex-1 h-px bg-slate-200" />
                  </div>

                  {msgs.map((msg) => {
                    const isLead = msg.direction === "inbound";
                    return (
                      <div
                        key={msg.sid}
                        className={`flex mb-2 ${isLead ? "justify-end" : "justify-start"}`}
                      >
                        {/* Agent avatar */}
                        {!isLead && (
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center text-white text-[10px] font-bold mr-2 mt-auto shrink-0">
                            R
                          </div>
                        )}

                        <div className={`max-w-[65%] ${isLead ? "" : ""}`}>
                          <div
                            className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                              isLead
                                ? "bg-[#1B8CF3] text-white rounded-br-sm"
                                : "bg-white border border-slate-200 text-slate-800 rounded-bl-sm shadow-sm"
                            }`}
                          >
                            {msg.body}
                          </div>
                          <div
                            className={`text-[10px] text-slate-400 mt-1 ${
                              isLead ? "text-right" : "text-left ml-1"
                            }`}
                          >
                            {formatTime(msg.dateSent)}
                            {!isLead && (
                              <span className={`ml-1.5 ${msg.status === "delivered" ? "text-green-500" : "text-slate-300"}`}>
                                {msg.status === "delivered" ? "✓✓" : msg.status === "sent" ? "✓" : "..."}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Lead avatar */}
                        {isLead && (
                          <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 text-[10px] font-bold ml-2 mt-auto shrink-0">
                            {selected.slice(-2)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            {/* Info bar */}
            <div className="px-6 py-3 border-t border-slate-200 bg-white flex items-center gap-3 shrink-0">
              <span className="text-xs text-slate-400">
                {messages.length} Nachrichten —{" "}
                {messages.filter(m => m.direction === "inbound").length} vom Lead,{" "}
                {messages.filter(m => m.direction === "outbound").length} vom Agent
              </span>
              <div className="ml-auto flex items-center gap-1.5 text-xs text-slate-400">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" />
                </span>
                Aktualisiert alle 3s
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
