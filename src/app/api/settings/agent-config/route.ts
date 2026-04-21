// ─── GET /api/settings/agent-config ──────────────────────────────────────────
// ─── PUT /api/settings/agent-config ──────────────────────────────────────────
// Read + write agent configuration from agency_settings table.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const DEFAULT_CONFIG = {
  persona: {
    companyName: "",
    industry: "",
    tone: "professionell",       // professionell | locker | direkt
    language: "deutsch-du",       // deutsch-du | deutsch-sie | english
    agentName: "ROYA",
  },
  agents: {
    orchestrator: { model: "claude-opus-4-6", enabled: true },
    conversation: { model: "claude-opus-4-6", enabled: true },
    writer:       { model: "claude-sonnet-4-6", enabled: true },
    segmentation: { model: "claude-haiku-4-5", enabled: true },
    booking:      { model: "claude-haiku-4-5", enabled: true },
    channelRouter:{ model: "claude-haiku-4-5", enabled: true },
    analytics:    { model: "claude-sonnet-4-6", enabled: true },
  },
  notifications: {
    escalationEmail: true,
    dailySummary: false,
    bookingAlert: true,
    emailAddress: "",
  },
};

export async function GET(req: NextRequest) {
  const agencyId = req.nextUrl.searchParams.get("agencyId") || "demo-agency";

  const { data } = await supabase
    .from("agency_settings")
    .select("config")
    .eq("agency_id", agencyId)
    .single();

  return NextResponse.json(data?.config ?? DEFAULT_CONFIG);
}

export async function PUT(req: NextRequest) {
  try {
    const { agencyId = "demo-agency", config } = await req.json();

    if (!config || typeof config !== "object") {
      return NextResponse.json({ error: "Invalid config" }, { status: 400 });
    }

    // Upsert
    const { error } = await supabase
      .from("agency_settings")
      .upsert(
        { agency_id: agencyId, config, updated_at: new Date().toISOString() },
        { onConflict: "agency_id" },
      );

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Speichern fehlgeschlagen";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
