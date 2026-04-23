/**
 * Calendar slot fetcher for the writer pipeline.
 * Reads settings from env vars (Vercel) or roya-settings.json (local dev).
 * Returns formatted slot text or empty string if calendar not connected.
 */

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

function getRefreshToken(): string | null {
  return process.env.GOOGLE_CALENDAR_REFRESH_TOKEN ||
    readSettings().googleCalendarRefreshToken ||
    null;
}

export interface CalendarSlotsResult {
  formatted: string;
  connected: boolean;
}

export async function fetchCalendarSlotsForWriter(): Promise<CalendarSlotsResult> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    return { formatted: '', connected: false };
  }

  try {
    const { getAvailableSlots, formatSlotsForAgent } = await import('@/server/lib/google-calendar');
    const settings = readSettings();
    const calendarId = process.env.GOOGLE_CALENDAR_ID || settings.googleCalendarId || 'primary';
    const slots = await getAvailableSlots(refreshToken, calendarId, {
      businessStart: process.env.GOOGLE_CALENDAR_BUSINESS_START || settings.googleCalendarBusinessStart || '09:00',
      businessEnd:   process.env.GOOGLE_CALENDAR_BUSINESS_END   || settings.googleCalendarBusinessEnd   || '17:00',
      slotDuration:  parseInt(process.env.GOOGLE_CALENDAR_SLOT_DURATION  || settings.googleCalendarSlotDuration  || '30', 10),
      lookAheadDays: parseInt(process.env.GOOGLE_CALENDAR_LOOK_AHEAD_DAYS || settings.googleCalendarLookAheadDays || '7', 10),
    });
    return { formatted: formatSlotsForAgent(slots), connected: true };
  } catch (err) {
    console.error('[ROYA] Calendar slot fetch failed:', err);
    return { formatted: '', connected: true }; // connected but fetch failed
  }
}
