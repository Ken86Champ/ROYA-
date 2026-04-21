import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const format = req.nextUrl.searchParams.get("format") || "csv";
  const type = req.nextUrl.searchParams.get("type") || "contacts"; // contacts | campaigns | appointments

  try {
    if (type === "contacts") {
      return await exportContacts(format);
    }
    if (type === "campaigns") {
      return await exportCampaigns(format);
    }
    if (type === "appointments") {
      return await exportAppointments(format);
    }

    return NextResponse.json({ error: "Unknown type" }, { status: 400 });
  } catch (err) {
    console.error("[export] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

function toCSV(headers: string[], rows: string[][]): string {
  const escape = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
  return [
    headers.map(escape).join(","),
    ...rows.map(r => r.map(escape).join(",")),
  ].join("\n");
}

function csvResponse(csv: string, filename: string) {
  return new Response("\uFEFF" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

async function exportContacts(format: string) {
  const { data: contacts } = await supabase
    .from("roya_contacts")
    .select("*")
    .is("unsubscribed_at", null)
    .order("created_at", { ascending: false })
    .limit(5000);

  if (!contacts || contacts.length === 0) {
    return csvResponse(toCSV(["Info"], [["Keine Kontakte"]]), "kontakte-leer.csv");
  }

  const headers = ["Name", "Vorname", "Nachname", "E-Mail", "Telefon", "Segment", "Status", "Kanal", "Erstellt"];
  const rows = contacts.map((c: Record<string, unknown>) => [
    `${c.first_name || ""} ${c.last_name || ""}`.trim(),
    String(c.first_name || ""),
    String(c.last_name || ""),
    String(c.email || ""),
    String(c.phone || ""),
    String(c.segment || ""),
    String(c.state || ""),
    String(c.preferred_channel || ""),
    c.created_at ? new Date(c.created_at as string).toLocaleDateString("de-CH") : "",
  ]);

  return csvResponse(toCSV(headers, rows), `kontakte-${new Date().toISOString().split("T")[0]}.csv`);
}

async function exportCampaigns(format: string) {
  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  if (!campaigns || campaigns.length === 0) {
    return csvResponse(toCSV(["Info"], [["Keine Kampagnen"]]), "kampagnen-leer.csv");
  }

  // Get contact counts
  const { data: contacts } = await supabase
    .from("campaign_contacts")
    .select("campaign_id, status");

  const campStats: Record<string, { total: number; replied: number; booked: number }> = {};
  for (const c of contacts || []) {
    const cid = c.campaign_id as string;
    if (!campStats[cid]) campStats[cid] = { total: 0, replied: 0, booked: 0 };
    campStats[cid].total++;
    if (["replied", "interested", "booked"].includes(c.status as string)) campStats[cid].replied++;
    if (c.status === "booked") campStats[cid].booked++;
  }

  const headers = ["Name", "Status", "Kanäle", "Kontakte", "Geantwortet", "Gebucht", "Reply-Rate", "Booking-Rate", "Erstellt", "Gestartet"];
  const rows = campaigns.map((camp: Record<string, unknown>) => {
    const s = campStats[camp.id as string] || { total: 0, replied: 0, booked: 0 };
    const replyRate = s.total > 0 ? Math.round((s.replied / s.total) * 100) : 0;
    const bookingRate = s.replied > 0 ? Math.round((s.booked / s.replied) * 100) : 0;
    return [
      String(camp.name || ""),
      String(camp.status || ""),
      Array.isArray(camp.channels) ? (camp.channels as string[]).join(", ") : "",
      String(s.total),
      String(s.replied),
      String(s.booked),
      `${replyRate}%`,
      `${bookingRate}%`,
      camp.created_at ? new Date(camp.created_at as string).toLocaleDateString("de-CH") : "",
      camp.started_at ? new Date(camp.started_at as string).toLocaleDateString("de-CH") : "",
    ];
  });

  return csvResponse(toCSV(headers, rows), `kampagnen-${new Date().toISOString().split("T")[0]}.csv`);
}

async function exportAppointments(format: string) {
  const { data: booked } = await supabase
    .from("campaign_contacts")
    .select("*, campaigns!inner(name)")
    .eq("status", "booked")
    .order("last_contacted_at", { ascending: false })
    .limit(2000);

  if (!booked || booked.length === 0) {
    return csvResponse(toCSV(["Info"], [["Keine Termine"]]), "termine-leer.csv");
  }

  const headers = ["Name", "Kontakt", "Kanal", "Kampagne", "Letzter Kontakt"];
  const rows = booked.map((c: Record<string, unknown>) => [
    String(c.name || ""),
    String(c.contact || ""),
    String(c.channel || ""),
    String((c.campaigns as Record<string, unknown>)?.name || ""),
    c.last_contacted_at ? new Date(c.last_contacted_at as string).toLocaleDateString("de-CH") : "",
  ]);

  return csvResponse(toCSV(headers, rows), `termine-${new Date().toISOString().split("T")[0]}.csv`);
}
