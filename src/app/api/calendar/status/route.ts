/**
 * GET /api/calendar/status — Returns calendar connection status
 * POST /api/calendar/status — Updates business hours settings
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

export async function GET(req: NextRequest) {
  // ── Auth Guard ──
  const denied = assertCalendarAccess(req);
  if (denied) return denied;

  const settings = readSettings();
  const connected = !!settings.googleCalendarRefreshToken;
  return secureJson({
    connected,
    calendarEmail: connected ? (settings.googleCalendarEmail || settings.googleCalendarId || '') : '',
    calendarId: connected ? (settings.googleCalendarId || 'primary') : '',
    businessStart: settings.googleCalendarBusinessStart || '09:00',
    businessEnd: settings.googleCalendarBusinessEnd || '17:00',
    slotDuration: parseInt(settings.googleCalendarSlotDuration || '30', 10),
    lookAheadDays: parseInt(settings.googleCalendarLookAheadDays || '5', 10),
  });
}

export async function POST(req: NextRequest) {
  // ── Auth Guard ──
  const denied = assertCalendarAccess(req);
  if (denied) return denied;

  try {
    const body = await req.json();
    const settings = readSettings();

    if (body.businessStart) settings.googleCalendarBusinessStart = body.businessStart;
    if (body.businessEnd) settings.googleCalendarBusinessEnd = body.businessEnd;
    if (body.slotDuration) settings.googleCalendarSlotDuration = String(body.slotDuration);
    if (body.lookAheadDays) settings.googleCalendarLookAheadDays = String(body.lookAheadDays);

    writeSettings(settings);
    return secureJson({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Fehler';
    return secureJson({ error: message }, 500);
  }
}
