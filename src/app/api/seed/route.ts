// ─── Dev Seed ─────────────────────────────────────────────────────────────────
// GET /api/seed — seeds Supabase with demo data.
// Only available in development.

import { NextResponse } from "next/server";
import * as clientStore from "@/lib/client-store";
import * as campaignStore from "@/lib/campaign-store";
import * as convStore from "@/lib/conversation-store";
import { supabase } from "@/lib/supabase";

export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Only available in development" }, { status: 403 });
  }

  // Check if already seeded
  const { data: existing } = await supabase.from("clients").select("id").limit(1);
  if (existing && existing.length > 0) {
    return NextResponse.json({ message: "Already seeded", skipped: true });
  }

  // ── Clients ──
  const c1 = await clientStore.create({
    company: "TechFlow AG", contact: "David Müller", email: "d.mueller@techflow.ch",
    phone: "+41 44 123 45 67", industry: "tech",
    notes: "Erstkontakt via LinkedIn. Sehr interessiert an Automatisierung.",
  });
  const c2 = await clientStore.create({
    company: "Helvetia Finanz", contact: "Sandra Bauer", email: "s.bauer@helvetia-finanz.ch",
    phone: "+41 31 456 78 90", industry: "finance",
    notes: "Fokus auf Versicherungs-Leads. Q3 Budget genehmigt.",
  });

  // ── Campaigns ──
  const camp1 = await campaignStore.create({
    name: "Q2 2026 — Tech-KMU Reaktivierung",
    clientId: c1.id,
    channels: ["email", "whatsapp"],
    contacts: [
      { name: "Thomas Meier",       contact: "t.meier@firma.ch",        channel: "email",    altContact: "+41791234567", altChannel: "whatsapp" },
      { name: "Tanja Niederberger", contact: "+41791234567",             channel: "whatsapp" },
      { name: "Marco Bianchi",      contact: "m.bianchi@tech.ch",        channel: "email" },
      { name: "Livia Frei",         contact: "+41762345678",             channel: "whatsapp" },
      { name: "Stefan Keller",      contact: "s.keller@kmu.ch",          channel: "email",    altContact: "+41795678901", altChannel: "sms" },
    ],
    flow: [
      ...campaignStore.defaultFlow(),
      { id: "cond_demo", type: "condition" as const, label: "Intent Check", delayDays: 0, condition: "any" as const, messageTemplate: "",
        branches: [
          { intent: "hot"  as const, nextStepIndex: 3 },
          { intent: "warm" as const, nextStepIndex: 2 },
          { intent: "default" as const, nextStepIndex: 3 },
        ]
      },
    ],
  });

  await campaignStore.start(camp1.id);

  // Simulate some progress
  await supabase.from("campaign_contacts").update({ status: "replied", current_step: 1 })
    .eq("campaign_id", camp1.id).eq("name", "Thomas Meier");
  await supabase.from("campaign_contacts").update({ status: "interested", current_step: 2 })
    .eq("campaign_id", camp1.id).eq("name", "Tanja Niederberger");
  await supabase.from("campaign_contacts").update({ status: "booked", current_step: 3 })
    .eq("campaign_id", camp1.id).eq("name", "Livia Frei");

  const camp2 = await campaignStore.create({
    name: "Juni Reaktivierung — Finance Segment",
    clientId: c2.id,
    channels: ["sms"],
    contacts: [
      { name: "Anna Schmid",  contact: "+41797654321", channel: "sms" },
      { name: "Peter Vogel",  contact: "+41768765432", channel: "sms" },
    ],
  });
  await supabase.from("campaigns").update({ status: "paused" }).eq("id", camp2.id);

  // ── Conversations ──
  const mins = (n: number) => new Date(Date.now() - n * 60000).toISOString();

  const conv1 = await convStore.create({ leadName: "Thomas Meier", leadContact: "t.meier@firma.ch", channel: "email", campaignId: camp1.id });
  await convStore.addMessage(conv1.id, "agent", "Hallo Thomas — kurze Frage zu eurer Pipeline im Q3. Habt ihr die Situation gelöst, weshalb wir damals nicht weitergekommen sind?", "email");
  await convStore.addMessage(conv1.id, "lead", "Hallo! Ja, das Timing war damals schlecht. Was habt ihr jetzt konkret?", "email");
  await supabase.from("conversations").update({
    last_activity: mins(12),
    last_intent: { intent: "warm", confidence: 82, sentiment: "positive", suggestedResponse: "Gerne — wir haben seit dem letzten Gespräch 3 Kunden in eurer Branche ongeboardet. 20 Minuten diese Woche?", nextAction: "reply", reasoning: "Warm signal" },
  }).eq("id", conv1.id);

  const conv2 = await convStore.create({ leadName: "Livia Frei", leadContact: "+41762345678", channel: "whatsapp", campaignId: camp1.id });
  await convStore.addMessage(conv2.id, "agent", "Livia — kurzer Gedanke der vielleicht passt…", "whatsapp");
  await convStore.addMessage(conv2.id, "lead", "Ja, gerne mehr dazu! Können wir kurz telefonieren?", "whatsapp");
  await supabase.from("conversations").update({
    state: "booked", booked_at: new Date().toISOString(),
    last_intent: { intent: "hot", confidence: 95, sentiment: "positive", suggestedResponse: "", nextAction: "book", reasoning: "Hot lead" },
  }).eq("id", conv2.id);

  const conv3 = await convStore.create({ leadName: "Marco Bianchi", leadContact: "m.bianchi@tech.ch", channel: "email", campaignId: camp1.id });
  await convStore.addMessage(conv3.id, "agent", "Marco — wir hatten vor 6 Monaten gesprochen.", "email");
  await convStore.addMessage(conv3.id, "lead", "Haben aktuell kein Budget dafür, sorry.", "email");
  await supabase.from("conversations").update({
    last_intent: { intent: "timing", confidence: 88, sentiment: "neutral", suggestedResponse: "Macht Sinn. Darf ich mich in 2 Monaten nochmals melden?", nextAction: "snooze", reasoning: "Budget constraint" },
  }).eq("id", conv3.id);

  return NextResponse.json({
    seeded: true,
    clients: [c1.company, c2.company],
    campaigns: [camp1.name, camp2.name],
    conversations: 3,
  });
}
