import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ─── Email / Phone validation ───────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[\d\s\-().]{7,20}$/;

interface ImportContact {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  company?: string;
  jobTitle?: string;
  channel?: string;
  dealValue?: number;
  lossReason?: string;
  originalInterest?: string;
}

// ─── POST: Bulk import contacts ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { contacts, agencyId, clientId, deduplicateBy = "email" } = await req.json() as {
      contacts: ImportContact[];
      agencyId?: string;
      clientId?: string;
      deduplicateBy?: "email" | "phone" | "both";
    };

    if (!Array.isArray(contacts) || contacts.length === 0) {
      return NextResponse.json({ error: "No contacts provided" }, { status: 400 });
    }

    // Resolve agency
    const aid = agencyId || "demo-agency";

    // Resolve client — use first client if none specified
    let cid = clientId;
    if (!cid) {
      const { data: clients } = await supabase
        .from("roya_clients")
        .select("id")
        .eq("agency_id", aid)
        .limit(1);
      cid = clients?.[0]?.id;
    }

    // Fetch existing contacts for dedup
    const { data: existing } = await supabase
      .from("roya_contacts")
      .select("id, email, phone")
      .eq("agency_id", aid);

    const existingEmails = new Set((existing ?? []).map(c => c.email?.toLowerCase()).filter(Boolean));
    const existingPhones = new Set((existing ?? []).map(c => c.phone?.replace(/\D/g, "")).filter(Boolean));

    // Also check opted-out contacts
    const { data: optedOut } = await supabase
      .from("roya_contacts")
      .select("email, phone")
      .eq("agency_id", aid)
      .not("unsubscribed_at", "is", null);

    const optedOutEmails = new Set((optedOut ?? []).map(c => c.email?.toLowerCase()).filter(Boolean));
    const optedOutPhones = new Set((optedOut ?? []).map(c => c.phone?.replace(/\D/g, "")).filter(Boolean));

    const imported: string[] = [];
    const duplicates: string[] = [];
    const invalid: string[] = [];
    const optedOutSkipped: string[] = [];
    const seenInBatch = new Set<string>();

    const rows: Record<string, unknown>[] = [];

    for (const c of contacts) {
      const firstName = c.firstName || (c.fullName ? c.fullName.split(" ")[0] : "");
      const lastName = c.lastName || (c.fullName ? c.fullName.split(" ").slice(1).join(" ") : "");
      const email = c.email?.trim().toLowerCase() || null;
      const phone = c.phone?.trim() || null;
      const name = [firstName, lastName].filter(Boolean).join(" ") || c.fullName || "Unbekannt";

      // Validate
      if (email && !EMAIL_RE.test(email)) {
        invalid.push(`${name}: ungültige E-Mail "${c.email}"`);
        continue;
      }
      if (phone && !PHONE_RE.test(phone)) {
        invalid.push(`${name}: ungültige Telefonnr. "${c.phone}"`);
        continue;
      }
      if (!email && !phone) {
        invalid.push(`${name}: weder E-Mail noch Telefon`);
        continue;
      }

      // Dedup key
      const dedupKey = deduplicateBy === "phone"
        ? phone?.replace(/\D/g, "") || email || ""
        : deduplicateBy === "both"
        ? `${email || ""}|${phone?.replace(/\D/g, "") || ""}`
        : email || phone?.replace(/\D/g, "") || "";

      // Check batch dedup
      if (seenInBatch.has(dedupKey)) {
        duplicates.push(`${name}: Duplikat im Import`);
        continue;
      }
      seenInBatch.add(dedupKey);

      // Check DB dedup
      const isDupEmail = email && existingEmails.has(email);
      const isDupPhone = phone && existingPhones.has(phone.replace(/\D/g, ""));
      if (
        (deduplicateBy === "email" && isDupEmail) ||
        (deduplicateBy === "phone" && isDupPhone) ||
        (deduplicateBy === "both" && (isDupEmail || isDupPhone))
      ) {
        duplicates.push(`${name}: bereits vorhanden`);
        continue;
      }

      // Check opt-out
      if (
        (email && optedOutEmails.has(email)) ||
        (phone && optedOutPhones.has(phone.replace(/\D/g, "")))
      ) {
        optedOutSkipped.push(`${name}: abgemeldet`);
        continue;
      }

      const id = crypto.randomUUID();
      rows.push({
        id,
        agency_id: aid,
        client_id: cid || null,
        first_name: firstName || null,
        last_name: lastName || null,
        email,
        phone,
        company: c.company || null,
        job_title: c.jobTitle || null,
        deal_value: c.dealValue || null,
        loss_reason: c.lossReason || null,
        original_interest: c.originalInterest || null,
        segment: null,
        state: "not_contacted",
      });
      imported.push(name);
    }

    // Batch insert (Supabase supports up to ~1000 per request)
    if (rows.length > 0) {
      const BATCH = 500;
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        const { error } = await supabase.from("roya_contacts").insert(batch);
        if (error) {
          console.error("[contacts/import] Insert error:", error.message);
          return NextResponse.json({ error: `DB-Fehler: ${error.message}` }, { status: 500 });
        }
      }
    }

    // Log import event
    await supabase.from("contact_imports").insert({
      id: crypto.randomUUID(),
      agency_id: aid,
      client_id: cid || null,
      total_rows: contacts.length,
      imported_count: imported.length,
      duplicate_count: duplicates.length,
      invalid_count: invalid.length,
      opted_out_count: optedOutSkipped.length,
      deduplicate_by: deduplicateBy,
    }).then(() => {}, (err) => console.error("[contacts/import] Log error:", err));

    return NextResponse.json({
      imported: imported.length,
      duplicates: duplicates.length,
      invalid: invalid.length,
      optedOut: optedOutSkipped.length,
      total: contacts.length,
      details: {
        imported: imported.slice(0, 10),
        duplicates: duplicates.slice(0, 10),
        invalid: invalid.slice(0, 10),
        optedOut: optedOutSkipped.slice(0, 10),
      },
    });
  } catch (err) {
    console.error("[contacts/import] Error:", err);
    const message = err instanceof Error ? err.message : "Import fehlgeschlagen";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
