/**
 * POST /api/calendar/disconnect — Removes Google Calendar tokens
 */

import { NextRequest, NextResponse } from 'next/server';
import { assertCalendarAccess, secureJson } from '@/server/lib/calendar-guard';
import fs from 'fs';
import path from 'path';

const SETTINGS_FILE = path.join(process.cwd(), 'roya-settings.json');

function readSettings(): Record<string, string> {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
    }
  } catch {}
  return {};
}

function writeSettings(data: Record<string, string>) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

export async function POST(req: NextRequest) {
  // ── Auth Guard ──
  const denied = assertCalendarAccess(req);
  if (denied) return denied;

  const settings = readSettings();
  delete settings.googleCalendarRefreshToken;
  delete settings.googleCalendarId;
  delete settings.googleCalendarEmail;
  writeSettings(settings);
  return secureJson({ success: true, connected: false });
}
