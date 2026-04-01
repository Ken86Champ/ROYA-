// ─── BullMQ Job Queue ──────────────────────────────────────────────────────────
// Singleton queues for delayed sends and follow-up checks.
// Workers run in server/worker.ts (npm run worker).
//
// In API routes: only import Queue to *enqueue* jobs.
// Never import Worker in Next.js API routes — workers need persistent connections.

import { Queue } from "bullmq";
import IORedis from "ioredis";

// ── Redis connection ───────────────────────────────────────────────────────────

function createRedis() {
  const url = process.env.REDIS_URL;
  if (url) return new IORedis(url, { maxRetriesPerRequest: null });
  return new IORedis({
    host:     process.env.REDIS_HOST     || "127.0.0.1",
    port:     parseInt(process.env.REDIS_PORT || "6379"),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
  });
}

let _redis: IORedis | null = null;

export function getRedis(): IORedis {
  if (!_redis) _redis = createRedis();
  return _redis;
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

function queueOpts() {
  return { connection: getRedis() };
}

export function getSendQueue(): Queue {
  if (!sendQueue) sendQueue = new Queue(QUEUE_SEND, queueOpts());
  return sendQueue;
}

export function getNoReplyQueue(): Queue {
  if (!noReplyQueue) noReplyQueue = new Queue(QUEUE_NO_REPLY, queueOpts());
  return noReplyQueue;
}

export function getReminderQueue(): Queue {
  if (!reminderQueue) reminderQueue = new Queue(QUEUE_REMINDER, queueOpts());
  return reminderQueue;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Enqueue an immediate send for a campaign contact. */
export async function enqueueSend(payload: SendMessagePayload, delayMs = 0) {
  return getSendQueue().add("send", payload, {
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
  return getNoReplyQueue().add("check", payload, {
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
  return getReminderQueue().add("reminder", payload, {
    delay: delayMs,
    attempts: 2,
    removeOnComplete: 200,
    removeOnFail: 100,
  });
}

/** Returns true if Redis is available. Fail gracefully when not configured. */
export async function isQueueAvailable(): Promise<boolean> {
  try {
    const redis = getRedis();
    await redis.ping();
    return true;
  } catch {
    return false;
  }
}
