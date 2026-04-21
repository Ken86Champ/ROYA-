/**
 * Google Calendar Service
 * OAuth2 + FreeBusy API + Available Slot Calculation
 */

import { google } from 'googleapis';
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

// ── OAuth2 Client ───────────────────────────────────────────────────────────

export function getGoogleCredentials(): { clientId: string; clientSecret: string } {
  const settings = readSettings();
  return {
    clientId: process.env.GOOGLE_CALENDAR_CLIENT_ID || settings.googleCalendarClientId || '',
    clientSecret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET || settings.googleCalendarClientSecret || '',
  };
}

export function createOAuth2Client() {
  const { clientId, clientSecret } = getGoogleCredentials();
  return new google.auth.OAuth2(
    clientId,
    clientSecret,
    `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/calendar/callback`,
  );
}

export function generateAuthUrl(): string {
  const client = createOAuth2Client();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events.readonly',
    ],
  });
}

export async function exchangeCode(code: string) {
  const client = createOAuth2Client();
  const { tokens } = await client.getToken(code);
  return tokens;
}

// ── FreeBusy Query ──────────────────────────────────────────────────────────

export interface BusyBlock {
  start: string; // ISO
  end: string;   // ISO
}

export async function getFreeBusy(
  refreshToken: string,
  calendarId: string,
  timeMin: Date,
  timeMax: Date,
): Promise<BusyBlock[]> {
  const client = createOAuth2Client();
  client.setCredentials({ refresh_token: refreshToken });

  const calendar = google.calendar({ version: 'v3', auth: client });

  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      timeZone: 'Europe/Zurich',
      items: [{ id: calendarId }],
    },
  });

  const busy = res.data.calendars?.[calendarId]?.busy ?? [];
  return busy.map(b => ({
    start: b.start ?? '',
    end: b.end ?? '',
  }));
}

// ── Calendar Events ─────────────────────────────────────────────────────────

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;  // ISO
  end: string;    // ISO
  allDay: boolean;
  location?: string;
  description?: string;
  color?: string;
  source: 'google';
}

export async function getEvents(
  refreshToken: string,
  calendarId: string,
  timeMin: Date,
  timeMax: Date,
): Promise<CalendarEvent[]> {
  const client = createOAuth2Client();
  client.setCredentials({ refresh_token: refreshToken });

  const calendar = google.calendar({ version: 'v3', auth: client });

  const res = await calendar.events.list({
    calendarId,
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 100,
    timeZone: 'Europe/Zurich',
  });

  return (res.data.items ?? []).map(e => ({
    id: e.id ?? '',
    title: e.summary ?? '(Kein Titel)',
    start: e.start?.dateTime ?? e.start?.date ?? '',
    end: e.end?.dateTime ?? e.end?.date ?? '',
    allDay: !e.start?.dateTime,
    location: e.location ?? undefined,
    description: e.description ?? undefined,
    color: e.colorId ? `gcal-${e.colorId}` : undefined,
    source: 'google' as const,
  }));
}

// ── Available Slots Calculator ──────────────────────────────────────────────

export interface TimeSlot {
  date: string;       // "2026-04-20"
  dayLabel: string;   // "Mo 20.04."
  start: string;      // "10:00"
  end: string;        // "10:30"
  isoStart: string;   // full ISO for confirmation
}

export interface SlotOptions {
  businessStart?: string; // "09:00"
  businessEnd?: string;   // "17:00"
  slotDuration?: number;  // minutes, default 30
  lookAheadDays?: number; // default 5
}

const DAY_NAMES = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

export async function getAvailableSlots(
  refreshToken: string,
  calendarId: string,
  options: SlotOptions = {},
): Promise<TimeSlot[]> {
  const {
    businessStart = '09:00',
    businessEnd = '17:00',
    slotDuration = 30,
    lookAheadDays = 5,
  } = options;

  const [startH, startM] = businessStart.split(':').map(Number);
  const [endH, endM] = businessEnd.split(':').map(Number);

  // Calculate time window: next N business days
  const now = new Date();
  const timeMin = new Date(now);
  // Start from tomorrow if past business hours today
  const nowHour = now.getHours();
  if (nowHour >= endH) {
    timeMin.setDate(timeMin.getDate() + 1);
  }

  // Find end date (skip weekends)
  let businessDaysCount = 0;
  const timeMax = new Date(timeMin);
  while (businessDaysCount < lookAheadDays) {
    timeMax.setDate(timeMax.getDate() + 1);
    const dow = timeMax.getDay();
    if (dow !== 0 && dow !== 6) businessDaysCount++;
  }

  // Fetch busy blocks
  const busyBlocks = await getFreeBusy(refreshToken, calendarId, timeMin, timeMax);

  // Generate available slots day by day
  const slots: TimeSlot[] = [];
  const currentDay = new Date(timeMin);
  currentDay.setHours(0, 0, 0, 0);

  // If today, start from next full slot
  const isToday = currentDay.toDateString() === now.toDateString();

  while (currentDay <= timeMax && slots.length < 30) {
    const dow = currentDay.getDay();
    // Skip weekends
    if (dow === 0 || dow === 6) {
      currentDay.setDate(currentDay.getDate() + 1);
      continue;
    }

    const dateStr = formatDate(currentDay);
    const dayLabel = `${DAY_NAMES[dow]} ${currentDay.getDate().toString().padStart(2, '0')}.${(currentDay.getMonth() + 1).toString().padStart(2, '0')}.`;

    // Build slots for this day
    let slotStart = new Date(currentDay);
    slotStart.setHours(startH, startM, 0, 0);

    const dayEnd = new Date(currentDay);
    dayEnd.setHours(endH, endM, 0, 0);

    // If today, skip past slots
    if (isToday && currentDay.toDateString() === now.toDateString()) {
      // Round up to next slot boundary
      const minutesSinceStart = (now.getHours() - startH) * 60 + (now.getMinutes() - startM);
      const slotsToSkip = Math.ceil(minutesSinceStart / slotDuration);
      slotStart = new Date(currentDay);
      slotStart.setHours(startH, startM + slotsToSkip * slotDuration, 0, 0);
      // Add 30min buffer (don't offer a slot starting in 5 minutes)
      slotStart.setMinutes(slotStart.getMinutes() + 30);
    }

    while (slotStart < dayEnd && slots.length < 30) {
      const slotEnd = new Date(slotStart);
      slotEnd.setMinutes(slotEnd.getMinutes() + slotDuration);

      if (slotEnd > dayEnd) break;

      // Check if slot overlaps with any busy block
      const isBusy = busyBlocks.some(b => {
        const busyStart = new Date(b.start);
        const busyEnd = new Date(b.end);
        return slotStart < busyEnd && slotEnd > busyStart;
      });

      if (!isBusy) {
        slots.push({
          date: dateStr,
          dayLabel,
          start: formatTime(slotStart),
          end: formatTime(slotEnd),
          isoStart: slotStart.toISOString(),
        });
      }

      slotStart.setMinutes(slotStart.getMinutes() + slotDuration);
    }

    currentDay.setDate(currentDay.getDate() + 1);
  }

  return slots;
}

// ── Format available slots as a readable German text for the AI agent ───────

export function formatSlotsForAgent(slots: TimeSlot[]): string {
  if (slots.length === 0) {
    return 'Aktuell keine freien Termine in den nächsten Tagen verfügbar.';
  }

  // Group by date -> pick max 3 per day, max 4 days
  const byDate = new Map<string, TimeSlot[]>();
  for (const s of slots) {
    const existing = byDate.get(s.dayLabel) || [];
    existing.push(s);
    byDate.set(s.dayLabel, existing);
  }

  const lines: string[] = ['Verfügbare Termine:'];
  let dayCount = 0;
  for (const [dayLabel, daySlots] of byDate) {
    if (dayCount >= 4) break;
    const times = daySlots.slice(0, 3).map(s => s.start).join(' oder ');
    lines.push(`- ${dayLabel} um ${times}`);
    dayCount++;
  }

  return lines.join('\n');
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
}

function formatTime(d: Date): string {
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}
