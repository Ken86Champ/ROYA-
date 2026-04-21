/**
 * Calendar Security Guard
 * 
 * SICHERHEITSKONZEPT:
 * 
 * 1. READONLY — Google OAuth Scopes sind NUR calendar.readonly + events.readonly
 *    → Google API verweigert jegliches Schreiben, Ändern, Löschen von Terminen
 * 
 * 2. API-SCHUTZ — Alle /api/calendar/* Endpoints prüfen ein HMAC-Token
 *    → Ohne gültiges Token: 401 Unauthorized
 *    → Token wird nur vom Dashboard gesetzt, nie öffentlich
 * 
 * 3. DATENSPARSAMKEIT — Events-API gibt NIE description/private Notizen raus
 *    → Leads sehen NUR freie Zeitfenster, NIE Termindetails
 * 
 * 4. KEIN CACHING — Alle Kalender-Responses: Cache-Control: no-store, private
 *    → Private Daten bleiben nicht im Browser-Cache
 * 
 * 5. AUDIT-LOG — Jeder Kalender-Zugriff wird mit Timestamp geloggt
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// ── Dashboard Secret ────────────────────────────────────────────────────────

let sessionSecret: string | null = null;

function getDashboardSecret(): string {
  const envSecret = process.env.ROYA_DASHBOARD_SECRET;
  if (envSecret) return envSecret;
  if (!sessionSecret) {
    sessionSecret = crypto.randomBytes(32).toString('hex');
    console.log('[ROYA:SECURITY] Calendar guard: auto-generated session secret. Set ROYA_DASHBOARD_SECRET in .env.local for persistence.');
  }
  return sessionSecret;
}

const COOKIE_NAME = 'roya_cal_auth';

// ── Token generation (called when dashboard loads) ──────────────────────────

export function generateCalendarToken(): string {
  const secret = getDashboardSecret();
  const timestamp = Date.now().toString();
  const hmac = crypto.createHmac('sha256', secret).update(timestamp).digest('hex');
  return `${timestamp}.${hmac}`;
}

export function createAuthCookieHeader(token: string): string {
  const isProduction = process.env.NODE_ENV === 'production';
  return `${COOKIE_NAME}=${token}; Path=/api/calendar; HttpOnly; SameSite=Strict; Max-Age=86400${isProduction ? '; Secure' : ''}`;
}

// ── Token validation ────────────────────────────────────────────────────────

function isValidToken(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return false;

    const [timestamp, hmac] = parts;
    const secret = getDashboardSecret();

    const expected = crypto.createHmac('sha256', secret).update(timestamp).digest('hex');
    if (expected.length !== hmac.length) return false;
    if (!crypto.timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(expected, 'hex'))) {
      return false;
    }

    // Token expires after 24h
    const age = Date.now() - parseInt(timestamp, 10);
    if (age > 86400000 || age < 0) return false;

    return true;
  } catch {
    return false;
  }
}

// ── Main authorization check ────────────────────────────────────────────────

export function assertCalendarAccess(req: NextRequest): NextResponse | null {
  // 1. Check HttpOnly cookie (set by dashboard)
  const cookie = req.cookies.get(COOKIE_NAME)?.value;
  if (cookie && isValidToken(cookie)) {
    logAccess(req, 'cookie');
    return null; // authorized
  }

  // 2. Check Authorization: Bearer header (for server-to-server)
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    // Accept either the raw secret or a valid HMAC token
    if (token === getDashboardSecret() || isValidToken(token)) {
      logAccess(req, 'bearer');
      return null; // authorized
    }
  }

  // 3. In dev mode: allow requests from localhost dashboard (same-origin)
  if (process.env.NODE_ENV !== 'production') {
    const referer = req.headers.get('referer') || '';
    if (referer.includes('localhost') || referer.includes('127.0.0.1')) {
      logAccess(req, 'dev-localhost');
      return null; // authorized
    }
  }

  // DENIED
  console.warn(`[ROYA:SECURITY] Calendar access DENIED | url=${req.nextUrl.pathname} | ip=${req.headers.get('x-forwarded-for') || 'local'}`);
  return NextResponse.json(
    { error: 'Nicht autorisiert — Dashboard-Zugang erforderlich' },
    {
      status: 401,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
      },
    },
  );
}

// ── Security headers for all calendar responses ─────────────────────────────

export const CALENDAR_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  'Pragma': 'no-cache',
  'X-Content-Type-Options': 'nosniff',
  'X-Calendar-Access': 'readonly',
};

export function secureJson(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: CALENDAR_HEADERS });
}

// ── Audit Log ───────────────────────────────────────────────────────────────

function logAccess(req: NextRequest, method: string) {
  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'local';
  console.log(`[ROYA:CALENDAR-AUDIT] ${req.nextUrl.pathname} | auth=${method} | ip=${ip} | ${new Date().toISOString()}`);
}
