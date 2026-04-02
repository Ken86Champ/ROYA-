import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const results: Record<string, unknown> = {};

  // Test each table
  for (const table of ["clients", "campaigns", "campaign_contacts", "conversations", "messages"]) {
    const { data, error } = await (supabase as any).from(table).select("*").limit(1);
    results[table] = error
      ? { error: error.message, code: error.code }
      : { ok: true, sampleRow: data?.[0] ?? null };
  }

  // Test insert into clients
  const testId = `debug_${Date.now()}`;
  const { error: insertErr } = await (supabase as any).from("clients").insert({
    id: testId,
    company: "__debug_test__",
    contact: "", email: "", phone: "", industry: "", notes: "",
    created_at: new Date().toISOString(),
  });
  results["clients_insert_test"] = insertErr
    ? { error: insertErr.message }
    : { ok: true };

  // Cleanup test row
  if (!insertErr) {
    await (supabase as any).from("clients").delete().eq("id", testId);
  }

  // Test insert into campaigns
  const campTestId = `debug_camp_${Date.now()}`;
  const { error: campInsertErr } = await (supabase as any).from("campaigns").insert({
    id: campTestId,
    name: "__debug_campaign__",
    channels: ["sms"],
    status: "draft",
    flow: [],
    created_at: new Date().toISOString(),
    mode: "draft",
  });
  results["campaigns_insert_test"] = campInsertErr
    ? { error: campInsertErr.message }
    : { ok: true };

  if (!campInsertErr) {
    await (supabase as any).from("campaigns").delete().eq("id", campTestId);
  }

  return NextResponse.json(results, { status: 200 });
}
