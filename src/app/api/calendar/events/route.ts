/**
 * GET /api/calendar/events
 * Returns Google Calendar events for the given week
 * Query: ?weekOffset=0 (0 = this week, 1 = next week, -1 = last week)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getEvents, type CalendarEvent } from '@/server/lib/google-calendar';
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

function getWeekBounds(offset: number): { start: Date; end: Date } {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset + offset * 7);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  return { start: monday, end: sunday };
}

export async function GET(req: NextRequest) {
  // ── Auth Guard ──
  const denied = assertCalendarAccess(req);
  if (denied) return denied;

  const settings = readSettings();
  const refreshToken = settings.googleCalendarRefreshToken;
  const calendarId = settings.googleCalendarId || 'primary';

  if (!refreshToken) {
    return secureJson({ connected: false, events: [] as CalendarEvent[] });
  }

  const weekOffset = parseInt(req.nextUrl.searchParams.get('weekOffset') || '0', 10);
  const { start, end } = getWeekBounds(weekOffset);

  try {
    const events = await getEvents(refreshToken, calendarId, start, end);
    // Strip private details — never expose description/notes
    const safeEvents = events.map(({ description, ...ev }) => ev);
    return secureJson({
      connected: true,
      calendarEmail: settings.googleCalendarEmail || calendarId,
      weekStart: start.toISOString(),
      weekEnd: end.toISOString(),
      events: safeEvents,
    });
  } catch (err) {
    console.error('[ROYA] Calendar events error:', err);
    return secureJson({ connected: true, events: [] as CalendarEvent[], error: 'Kalender-Abfrage fehlgeschlagen' }, 500);
  }
}
