/**
 * Twilio Webhook Signature Validation
 * Ensures only real Twilio requests reach the webhook.
 * https://www.twilio.com/docs/usage/webhooks/webhooks-security
 */

import crypto from 'crypto';

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
