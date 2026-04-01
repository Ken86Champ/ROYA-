import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const SETTINGS_FILE = path.join(process.cwd(), "roya-settings.json");

function readSettings(): Record<string, string> {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
    }
  } catch {}
  return {};
}

function writeSettings(data: Record<string, string>) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2), "utf-8");
}

export async function GET() {
  const settings = readSettings();
  // Merge with env variables as fallback (env takes precedence for security)
  const merged: Record<string, string> = {
    twilioAccountSid:  settings.twilioAccountSid  || process.env.TWILIO_ACCOUNT_SID  || "",
    twilioAuthToken:   settings.twilioAuthToken   || process.env.TWILIO_AUTH_TOKEN   || "",
    twilioFrom:        settings.twilioFrom        || process.env.TWILIO_FROM_NUMBER   || "",
    claudeKey:         settings.claudeKey         || process.env.ANTHROPIC_API_KEY    || "",
    supabaseUrl:       settings.supabaseUrl       || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    supabaseKey:       settings.supabaseKey       || process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    mailgunKey:        settings.mailgunKey        || process.env.MAILGUN_API_KEY      || "",
    mailgunDomain:     settings.mailgunDomain     || process.env.MAILGUN_DOMAIN       || "",
    mailgunFrom:       settings.mailgunFrom       || process.env.MAILGUN_FROM         || "",
  };
  return NextResponse.json(merged);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const current = readSettings();
    const updated = { ...current, ...body };
    writeSettings(updated);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Fehler";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
