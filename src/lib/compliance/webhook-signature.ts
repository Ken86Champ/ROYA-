/**
 * Webhook Signature Validation
 * Twilio: HMAC-SHA1
 * Mailgun: HMAC-SHA256 (timestamp + token + signing key)
 */

import crypto from 'crypto';

// ── Twilio ─────────────────────────────────────────────────────────────────────

export function validateTwilioSignature(
  authToken: string,
  twilioSignature: string,
  url: string,
  params: Record<string, string>,
): boolean {
  // Build the string to sign: URL + sorted params
  const sortedKeys = Object.keys(params).sort();
  const paramString = sortedKeys.reduce((acc, key) => acc + key + params[key], '');
  const stringToSign = url + paramString;

  // HMAC-SHA1 with auth token
  const hmac = crypto.createHmac('sha1', authToken);
  hmac.update(stringToSign);
  const computedSignature = hmac.digest('base64');

  // Timing-safe comparison
  try {
    return crypto.timingSafeEqual(
      Buffer.from(computedSignature),
      Buffer.from(twilioSignature),
    );
  } catch {
    return false;
  }
}

export function extractTwilioParams(formData: FormData): Record<string, string> {
  const params: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value === 'string') {
      params[key] = value;
    }
  });
  return params;
}

// ── Mailgun ────────────────────────────────────────────────────────────────────

/**
 * Validate Mailgun webhook signature.
 * https://documentation.mailgun.com/en/latest/user_manual.html#webhooks
 *
 * Signature = HMAC-SHA256(signing_key, timestamp + token)
 */
export function validateMailgunSignature(
  signingKey: string,
  timestamp: string,
  token: string,
  signature: string,
): boolean {
  if (!signingKey || !timestamp || !token || !signature) return false;

  // Reject if timestamp is older than 5 minutes (replay protection)
  const tsNum = parseInt(timestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (isNaN(tsNum) || Math.abs(now - tsNum) > 300) return false;

  const hmac = crypto.createHmac('sha256', signingKey);
  hmac.update(timestamp + token);
  const computed = hmac.digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(computed),
      Buffer.from(signature),
    );
  } catch {
    return false;
  }
}
