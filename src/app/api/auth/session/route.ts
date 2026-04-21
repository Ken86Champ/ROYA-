/**
 * POST /api/auth/session
 * 
 * Setzt ein sicheres HttpOnly-Session-Cookie für den Dashboard-Zugang.
 * Wird vom Dashboard-Layout beim Laden aufgerufen.
 * 
 * Sicherheit:
 * - Cookie ist HttpOnly (kein JS-Zugriff, kein XSS)
 * - SameSite=Strict (kein CSRF)
 * - Secure in Production (nur HTTPS)
 * - 24h Gültigkeit, HMAC-SHA256 signiert
 * - Gilt für alle /api/* Routen
 */

import { NextResponse } from 'next/server';
import crypto from 'crypto';

function getDashboardSecret(): string {
  return process.env.ROYA_DASHBOARD_SECRET || 'roya-dev-secret-change-in-production';
}

function generateSessionToken(): string {
  const secret = getDashboardSecret();
  const timestamp = Date.now().toString();
  const hmac = crypto.createHmac('sha256', secret).update(timestamp).digest('hex');
  return `${timestamp}.${hmac}`;
}

export async function POST() {
  const token = generateSessionToken();
  const isProduction = process.env.NODE_ENV === 'production';

  const cookie = [
    `roya_dash_session=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=86400`,
    isProduction ? 'Secure' : '',
  ].filter(Boolean).join('; ');

  return NextResponse.json(
    { ok: true },
    {
      status: 200,
      headers: {
        'Set-Cookie': cookie,
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'X-Content-Type-Options': 'nosniff',
      },
    },
  );
}
