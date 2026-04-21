/**
 * Next.js Middleware — Zentraler Sicherheitsschutz
 *
 * SCHUTZKONZEPT:
 * 1. Alle /api/* Routen erfordern ein signiertes Session-Cookie (HMAC-SHA256)
 * 2. Ausnahmen: Webhooks, OAuth-Callbacks, Session-Endpunkt, System-Status
 * 3. /api/debug nur im Development-Modus
 * 4. Rate-Limiting für teure AI-Endpunkte
 * 5. Security-Headers auf allen Responses
 */

import { NextRequest, NextResponse } from 'next/server';

// ── Cookie config ───────────────────────────────────────────────────────────

const SESSION_COOKIE = 'roya_dash_session';

// ── Routes that bypass auth ─────────────────────────────────────────────────

const PUBLIC_ROUTES = [
  '/api/auth/session',           // cookie issuer itself
  '/api/webhooks/twilio',        // Twilio webhook (has own signature check)
  '/api/webhooks/mailgun',       // Mailgun webhook (has own signature check)
  '/api/webhooks/stripe',        // Stripe webhook (has own signature check)
  '/api/calendar/auth',          // Google OAuth initiation (redirect)
  '/api/calendar/callback',      // Google OAuth callback
  '/api/calendar/auth-token',    // Calendar-specific cookie issuer
  '/api/system-status',          // Safe boolean-only status
];

// ── Dev-only routes ─────────────────────────────────────────────────────────

const DEV_ONLY_ROUTES = [
  '/api/debug',
  '/api/debug-classify',
  '/api/seed',
];

// ── Rate-limited routes (expensive AI calls) ────────────────────────────────

const RATE_LIMITED_ROUTES = [
  '/api/generate-message',
  '/api/generate-message/stream',
  '/api/simulate/opener',
  '/api/simulate/reply',
  '/api/converse',
  '/api/campaigns/autofill',
];

const RATE_WINDOW_MS = 60_000; // 1 minute
const RATE_MAX_REQUESTS = 20;  // 20 requests per minute per IP
const rateBuckets = new Map<string, { count: number; reset: number }>();

// ── HMAC helpers (Edge-compatible Web Crypto) ───────────────────────────────

function getDashboardSecret(): string {
  return process.env.ROYA_DASHBOARD_SECRET || 'roya-dev-secret-change-in-production';
}

async function hmacSign(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function isValidSession(token: string): Promise<boolean> {
  try {
    const dotIdx = token.indexOf('.');
    if (dotIdx === -1) return false;

    const timestamp = token.slice(0, dotIdx);
    const providedHmac = token.slice(dotIdx + 1);
    const secret = getDashboardSecret();

    const expected = await hmacSign(timestamp, secret);

    // Constant-time compare (not crypto.timingSafeEqual in Edge, but length+char check)
    if (expected.length !== providedHmac.length) return false;
    let mismatch = 0;
    for (let i = 0; i < expected.length; i++) {
      mismatch |= expected.charCodeAt(i) ^ providedHmac.charCodeAt(i);
    }
    if (mismatch !== 0) return false;

    // Token max age: 24 hours
    const age = Date.now() - parseInt(timestamp, 10);
    if (age > 86_400_000 || age < 0) return false;

    return true;
  } catch {
    return false;
  }
}

// ── Rate limiter ────────────────────────────────────────────────────────────

function checkRateLimit(ip: string): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);

  if (!bucket || now > bucket.reset) {
    rateBuckets.set(ip, { count: 1, reset: now + RATE_WINDOW_MS });
    return { allowed: true, remaining: RATE_MAX_REQUESTS - 1, resetIn: RATE_WINDOW_MS };
  }

  bucket.count++;
  const remaining = Math.max(0, RATE_MAX_REQUESTS - bucket.count);
  const resetIn = bucket.reset - now;

  if (bucket.count > RATE_MAX_REQUESTS) {
    return { allowed: false, remaining: 0, resetIn };
  }
  return { allowed: true, remaining, resetIn };
}

// Cleanup stale buckets every 5 minutes
if (typeof globalThis !== 'undefined') {
  const cleanup = () => {
    const now = Date.now();
    for (const [key, val] of rateBuckets) {
      if (now > val.reset + 60_000) rateBuckets.delete(key);
    }
  };
  // Edge runtime: setInterval may not persist, but this is best-effort
  try { setInterval(cleanup, 300_000); } catch { /* edge compat */ }
}

// ── Security headers ────────────────────────────────────────────────────────

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

// ── Middleware ───────────────────────────────────────────────────────────────

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only protect /api/* routes
  if (!pathname.startsWith('/api')) {
    const res = NextResponse.next();
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
    return res;
  }

  // 1. Dev-only routes blocked in production
  const isDevOnly = DEV_ONLY_ROUTES.some(r => pathname === r || pathname.startsWith(r + '/'));
  if (isDevOnly && process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Dieser Endpunkt ist nur im Entwicklungsmodus verfügbar' },
      { status: 403, headers: SECURITY_HEADERS },
    );
  }

  // 2. Public routes skip auth (webhooks have their own signature checks)
  const isPublic = PUBLIC_ROUTES.some(r => pathname === r || pathname.startsWith(r + '?'));
  if (isPublic) {
    const res = NextResponse.next();
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
    return res;
  }

  // 3. Check session cookie
  const sessionToken = req.cookies.get(SESSION_COOKIE)?.value;
  let authenticated = false;

  if (sessionToken && await isValidSession(sessionToken)) {
    authenticated = true;
  }

  // 4. Check Authorization: Bearer header (server-to-server / internal calls)
  if (!authenticated) {
    const authHeader = req.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      if (token === getDashboardSecret() || await isValidSession(token)) {
        authenticated = true;
      }
    }
  }

  // 5. Dev mode: allow localhost requests (dashboard same-origin)
  if (!authenticated && process.env.NODE_ENV !== 'production') {
    const referer = req.headers.get('referer') || '';
    const origin = req.headers.get('origin') || '';
    if (referer.includes('localhost') || referer.includes('127.0.0.1') ||
        origin.includes('localhost') || origin.includes('127.0.0.1')) {
      authenticated = true;
    }
  }

  if (!authenticated) {
    console.warn(`[ROYA:SECURITY] API access DENIED | ${req.method} ${pathname} | ip=${req.headers.get('x-forwarded-for') || 'local'}`);
    return NextResponse.json(
      { error: 'Nicht autorisiert — Dashboard-Session erforderlich' },
      { status: 401, headers: { ...SECURITY_HEADERS, 'Cache-Control': 'no-store' } },
    );
  }

  // 6. Rate limiting for AI endpoints
  const isRateLimited = RATE_LIMITED_ROUTES.some(r => pathname === r || pathname.startsWith(r));
  if (isRateLimited) {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
    const { allowed, remaining, resetIn } = checkRateLimit(ip);

    if (!allowed) {
      return NextResponse.json(
        { error: 'Zu viele Anfragen — bitte warte einen Moment' },
        {
          status: 429,
          headers: {
            ...SECURITY_HEADERS,
            'Retry-After': Math.ceil(resetIn / 1000).toString(),
            'X-RateLimit-Limit': RATE_MAX_REQUESTS.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': Math.ceil(resetIn / 1000).toString(),
          },
        },
      );
    }

    const res = NextResponse.next();
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
    res.headers.set('X-RateLimit-Limit', RATE_MAX_REQUESTS.toString());
    res.headers.set('X-RateLimit-Remaining', remaining.toString());
    return res;
  }

  // 7. Audit log for sensitive routes
  const sensitiveRoutes = ['/api/settings', '/api/test-send', '/api/contacts/import'];
  if (sensitiveRoutes.some(r => pathname.startsWith(r))) {
    console.log(`[ROYA:AUDIT] ${req.method} ${pathname} | ip=${req.headers.get('x-forwarded-for') || 'local'} | ${new Date().toISOString()}`);
  }

  const res = NextResponse.next();
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
  return res;
}

export const config = {
  matcher: [
    // Match all API routes and dashboard pages
    '/api/:path*',
    '/dashboard/:path*',
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
