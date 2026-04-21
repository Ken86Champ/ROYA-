/**
 * GET /api/calendar/slots
 * Returns available time slots from Google Calendar for the booking agent
 * Query params: date (optional), duration (optional)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAvailableSlots, formatSlotsForAgent } from '@/server/lib/google-calendar';
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

export async function GET(req: NextRequest) {
  // ── Auth Guard ──
  const denied = assertCalendarAccess(req);
  if (denied) return denied;

  const settings = readSettings();

  const refreshToken = settings.googleCalendarRefreshToken;
  const calendarId = settings.googleCalendarId || 'primary';

  if (!refreshToken) {
    return secureJson(
      { error: 'Google Calendar nicht verbunden', connected: false, slots: [], formatted: '' },
    );
  }

  try {
    const duration = parseInt(req.nextUrl.searchParams.get('duration') || settings.googleCalendarSlotDuration || '30', 10);
    const lookAheadDays = parseInt(settings.googleCalendarLookAheadDays || '5', 10);

    const slots = await getAvailableSlots(refreshToken, calendarId, {
      businessStart: settings.googleCalendarBusinessStart || '09:00',
      businessEnd: settings.googleCalendarBusinessEnd || '17:00',
      slotDuration: duration,
      lookAheadDays,
    });

    return secureJson({
      connected: true,
      calendarId,
      calendarEmail: settings.googleCalendarEmail || calendarId,
      slots,
      formatted: formatSlotsForAgent(slots),
    });
  } catch (err) {
    console.error('[ROYA] Calendar slots error:', err);
    return secureJson(
      { error: 'Kalender-Abfrage fehlgeschlagen', connected: true, slots: [], formatted: '' },
      500,
    );
  }
}
