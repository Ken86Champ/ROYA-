/**
 * POST /api/calendar/auth-token
 * Sets a secure HttpOnly cookie for calendar API access.
 * Called by the dashboard on page load — never by external clients.
 */

import { NextResponse } from 'next/server';
import { generateCalendarToken, createAuthCookieHeader, CALENDAR_HEADERS } from '@/server/lib/calendar-guard';

export async function POST() {
  const token = generateCalendarToken();
  const cookie = createAuthCookieHeader(token);

  return NextResponse.json(
    { ok: true },
    {
      status: 200,
      headers: {
        ...CALENDAR_HEADERS,
        'Set-Cookie': cookie,
      },
    },
  );
}
