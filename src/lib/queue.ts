// ─── BullMQ Job Queue ──────────────────────────────────────────────────────────
// Singleton queues for delayed sends and follow-up checks.
// Workers run in server/worker.ts (npm run worker).
//
// In API routes: only import Queue to *enqueue* jobs.
// Never import Worker in Next.js API routes — workers need persistent connections.

import { Queue } from "bullmq";
import IORedis from "ioredis";

// ── Redis connection ───────────────────────────────────────────────────────────

function createRedis(): IORedis | null {
  const url = process.env.REDIS_URL;
  const host = process.env.REDIS_HOST;

  // No Redis configured — skip entirely
  if (!url && !host) {
    console.warn("[ROYA] Redis not configured — queues disabled");
    return null;
  }

  try {
    const conn = url
      ? new IORedis(url, { maxRetriesPerRequest: null, enableOfflineQueue: false, lazyConnect: true })
      : new IORedis({
          host,
          port: parseInt(process.env.REDIS_PORT || "6379"),
          password: process.env.REDIS_PASSWORD || undefined,
          maxRetriesPerRequest: null,
          enableOfflineQueue: false,
          lazyConnect: true,
        });

    // Suppress unhandled connection errors
    conn.on("error", (err: Error) => {
      console.warn("[ROYA] Redis connection error (non-fatal):", err.message);
    });

    return conn;
  } catch (err) {
    console.warn("[ROYA] Failed to create Redis client:", err);
    return null;
  }
}

let _redis: IORedis | null | undefined = undefined;

export function getRedis(): IORedis | null {
  if (_redis === undefined) _redis = createRedis();
  return _redis;
}

/** Returns true if Redis is available. */
export async function isQueueAvailable(): Promise<boolean> {
  try {
    const redis = getRedis();
    if (!redis) return false;
    await redis.connect().catch(() => {});
    await redis.ping();
    return true;
  } catch {
    return false;
  }
}

// ── Job payload types ──────────────────────────────────────────────────────────

export interface SendMessagePayload {
  campaignId: string;
  contactId: string;
  stepIndex: number;
  channel: string;
  contact: string;     // phone or email
  leadName: string;
}

export interface CheckNoReplyPayload {
  campaignId: string;
  contactId: string;
  stepIndex: number;
}

export interface SendReminderPayload {
  convId: string;
  contact: string;
  channel: string;
  leadName: string;
  appointmentAt: string;   // ISO — used to build reminder text
}

export type JobPayload =
  | ({ type: "send_message" } & SendMessagePayload)
  | ({ type: "check_no_reply" } & CheckNoReplyPayload)
  | ({ type: "send_reminder" } & SendReminderPayload);

// ── Queue names ────────────────────────────────────────────────────────────────

export const QUEUE_SEND      = "roya:send_message";
export const QUEUE_NO_REPLY  = "roya:check_no_reply";
export const QUEUE_REMINDER  = "roya:send_reminder";

// ── Queue singletons (used by API routes to enqueue) ──────────────────────────

let sendQueue:     Queue | null = null;
let noReplyQueue:  Queue | null = null;
let reminderQueue: Queue | null = null;

function getQueue(name: string, cached: Queue | null): Queue | null {
  if (cached) return cached;
  const redis = getRedis();
  if (!redis) return null;
  return new Queue(name, { connection: redis });
}

export function getSendQueue():     Queue | null { return sendQueue     = getQueue(QUEUE_SEND,     sendQueue); }
export function getNoReplyQueue():  Queue | null { return noReplyQueue  = getQueue(QUEUE_NO_REPLY, noReplyQueue); }
export function getReminderQueue(): Queue | null { return reminderQueue = getQueue(QUEUE_REMINDER, reminderQueue); }

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Enqueue an immediate send for a campaign contact. */
export async function enqueueSend(payload: SendMessagePayload, delayMs = 0) {
  const q = getSendQueue();
  if (!q) return null;
  return q.add("send", payload, {
    delay: delayMs,
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 500,
    removeOnFail: 200,
  });
}

/** Enqueue a no-reply check after N hours (default 48h). */
export async function enqueueNoReplyCheck(
  payload: CheckNoReplyPayload,
  afterHours = 48
) {
  const q = getNoReplyQueue();
  if (!q) return null;
  return q.add("check", payload, {
    delay: afterHours * 3600 * 1000,
    attempts: 2,
    removeOnComplete: 200,
    removeOnFail: 100,
  });
}

/** Enqueue a booking reminder (default 24h before appointment). */
export async function enqueueReminder(
  payload: SendReminderPayload,
  delayMs: number
) {
  const q = getReminderQueue();
  if (!q) return null;
  return q.add("reminder", payload, {
    delay: delayMs,
    attempts: 2,
    removeOnComplete: 200,
    removeOnFail: 100,
  });
}
