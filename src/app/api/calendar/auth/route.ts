/**
 * GET /api/calendar/auth
 * Initiates Google OAuth2 flow — redirects user to Google consent screen
 */

import { NextResponse } from 'next/server';
import { generateAuthUrl, getGoogleCredentials } from '@/server/lib/google-calendar';

export async function GET() {
  const { clientId, clientSecret } = getGoogleCredentials();

  if (!clientId || !clientSecret) {
    const base = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    return NextResponse.redirect(
      `${base}/dashboard/settings?tab=calendars&error=google_credentials_missing`,
    );
  }

  const url = generateAuthUrl();
  return NextResponse.redirect(url);
}
