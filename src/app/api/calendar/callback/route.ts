/**
 * GET /api/calendar/callback
 * Google OAuth2 callback — exchanges auth code for tokens and stores them
 */

import { NextRequest, NextResponse } from 'next/server';
import { exchangeCode, createOAuth2Client } from '@/server/lib/google-calendar';
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

function writeSettings(data: Record<string, string>) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const error = req.nextUrl.searchParams.get('error');

  if (error) {
    const base = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    return NextResponse.redirect(`${base}/dashboard/settings?calendar=error&reason=${encodeURIComponent(error)}`);
  }

  if (!code) {
    return NextResponse.json({ error: 'Missing authorization code' }, { status: 400 });
  }

  try {
    const tokens = await exchangeCode(code);

    if (!tokens.refresh_token) {
      const base = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
      return NextResponse.redirect(`${base}/dashboard/settings?calendar=error&reason=no_refresh_token`);
    }

    // Fetch the user's primary calendar
    const client = createOAuth2Client();
    client.setCredentials(tokens);
    const calendar = google.calendar({ version: 'v3', auth: client });
    const calList = await calendar.calendarList.list({ maxResults: 50 });
    // Always prefer the primary calendar (the user's main calendar, not subscriptions)
    const primaryCal = calList.data.items?.find(c => c.primary);
    const fallbackCal = calList.data.items?.find(c => c.accessRole === 'owner') || calList.data.items?.[0];
    const chosenCal = primaryCal || fallbackCal;
    const calendarId = chosenCal?.id || 'primary';
    const calendarEmail = primaryCal?.summary || chosenCal?.summary || calendarId;

    // Store tokens in settings
    const settings = readSettings();
    settings.googleCalendarRefreshToken = tokens.refresh_token;
    settings.googleCalendarId = calendarId;
    settings.googleCalendarEmail = calendarEmail;
    if (!settings.googleCalendarBusinessStart) settings.googleCalendarBusinessStart = '09:00';
    if (!settings.googleCalendarBusinessEnd) settings.googleCalendarBusinessEnd = '17:00';
    if (!settings.googleCalendarSlotDuration) settings.googleCalendarSlotDuration = '30';
    if (!settings.googleCalendarLookAheadDays) settings.googleCalendarLookAheadDays = '5';
    writeSettings(settings);

    const base = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    return NextResponse.redirect(`${base}/dashboard/settings?calendar=connected`);
  } catch (err) {
    console.error('[ROYA] Google Calendar OAuth error:', err);
    const base = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    return NextResponse.redirect(`${base}/dashboard/settings?calendar=error&reason=token_exchange_failed`);
  }
}
