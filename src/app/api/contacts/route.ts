import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ─── GET: List CRM contacts with filters ────────────────────────────────────
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const agencyId = sp.get("agencyId") || "demo-agency";
  const search = sp.get("search") || "";
  const segment = sp.get("segment") || "";
  const state = sp.get("state") || "";
  const channel = sp.get("channel") || "";
  const limit = Math.min(parseInt(sp.get("limit") || "200"), 1000);
  const offset = parseInt(sp.get("offset") || "0");

  let query = supabase
    .from("roya_contacts")
    .select("*", { count: "exact" })
    .eq("agency_id", agencyId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (search) {
    query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%,company.ilike.%${search}%`);
  }
  if (segment) query = query.eq("segment", segment);
  if (state) query = query.eq("state", state);
  if (channel === "email") query = query.not("email", "is", null);
  if (channel === "sms" || channel === "whatsapp") query = query.not("phone", "is", null);

  const { data, count, error } = await query;
  if (error) {
    console.error("[contacts] GET error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Aggregate stats
  const { data: stats } = await supabase
    .from("roya_contacts")
    .select("state, segment")
    .eq("agency_id", agencyId);

  const counts: Record<string, number> = { total: stats?.length ?? 0 };
  for (const s of stats ?? []) {
    if (s.state) counts[`state_${s.state}`] = (counts[`state_${s.state}`] || 0) + 1;
    if (s.segment) counts[`segment_${s.segment}`] = (counts[`segment_${s.segment}`] || 0) + 1;
  }

  return NextResponse.json({
    contacts: data ?? [],
    total: count ?? 0,
    counts,
    offset,
    limit,
  });
}

// ─── PATCH: Update single contact ───────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const { id, ...updates } = await req.json();
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    // Whitelist allowed fields
    const allowed: Record<string, string> = {
      firstName: "first_name", lastName: "last_name",
      email: "email", phone: "phone",
      company: "company", jobTitle: "job_title",
      segment: "segment", state: "state",
      dealValue: "deal_value", lossReason: "loss_reason",
      originalInterest: "original_interest",
    };

    const patch: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(updates)) {
      if (allowed[key]) patch[allowed[key]] = val;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const { error } = await supabase.from("roya_contacts").update(patch).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update fehlgeschlagen";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ─── DELETE: Delete contact(s) ──────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const { ids } = await req.json() as { ids: string[] };
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "No IDs provided" }, { status: 400 });
    }

    // Opt-out instead of hard delete (GDPR: mark unsubscribed, keep record)
    const { error } = await supabase
      .from("roya_contacts")
      .update({ unsubscribed_at: new Date().toISOString(), state: "dead" })
      .in("id", ids);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, count: ids.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delete fehlgeschlagen";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
