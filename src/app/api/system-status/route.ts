// Returns which env vars are configured (boolean only — never exposes values).
import { NextResponse } from "next/server";
import { isQueueAvailable } from "@/lib/queue";

export async function GET() {
  const queueOk = await isQueueAvailable().catch(() => false);
  return NextResponse.json({
    anthropic:   !!process.env.ANTHROPIC_API_KEY,
    supabase:    !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    twilio:      !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
    mailgun:     !!(process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN),
    redis:       queueOk,
    slack:       !!process.env.SLACK_WEBHOOK_URL,
    handoffEmail:!!process.env.HANDOFF_EMAIL,
    cronSecret:  !!process.env.CRON_SECRET,
    baseUrl:     process.env.NEXT_PUBLIC_BASE_URL || null,
    isDev:       process.env.NODE_ENV === "development",
  });
}
