import { Queue, Worker, Job } from "bullmq";
import IORedis from "ioredis";
import { runCampaignOrchestrator } from "../agents/orchestrator.agent";
import { processReply } from "../agents/conversation.agent";
import { segmentContacts } from "../agents/segmentation.agent";
import { handleSendMessage }  from "../workers/send-message";
import { handleCheckNoReply } from "../workers/check-no-reply";
import { handleSendReminder } from "../workers/send-reminder";
import { QUEUE_SEND, QUEUE_NO_REPLY, QUEUE_REMINDER } from "../../src/lib/queue";

const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

export const orchestratorQueue = new Queue("orchestrator", { connection });
export const conversationQueue = new Queue("conversation", { connection });
export const segmentationQueue = new Queue("segmentation", { connection });
export const outreachQueue     = new Queue("outreach",     { connection });

// ROYA outreach queues (shared with src/lib/queue.ts)
export const sendQueue     = new Queue(QUEUE_SEND,     { connection });
export const noReplyQueue  = new Queue(QUEUE_NO_REPLY, { connection });
export const reminderQueue = new Queue(QUEUE_REMINDER, { connection });

export function startWorkers() {
  // ── Existing agent workers ──
  new Worker("orchestrator", async (job: Job) => {
    const { campaign } = job.data;
    return await runCampaignOrchestrator(campaign);
  }, { connection, concurrency: 5 });

  new Worker("conversation", async (job: Job) => {
    return await processReply(job.data);
  }, { connection, concurrency: 20 });

  new Worker("segmentation", async (job: Job) => {
    const { contacts, clientContext } = job.data;
    return await segmentContacts(contacts, clientContext);
  }, { connection, concurrency: 10 });

  // ── Outreach workers ──
  const sendWorker = new Worker(QUEUE_SEND, async (job: Job) => {
    await handleSendMessage(job);
  }, { connection, concurrency: 5 });

  const noReplyWorker = new Worker(QUEUE_NO_REPLY, async (job: Job) => {
    await handleCheckNoReply(job);
  }, { connection, concurrency: 10 });

  const reminderWorker = new Worker(QUEUE_REMINDER, async (job: Job) => {
    await handleSendReminder(job);
  }, { connection, concurrency: 5 });

  for (const w of [sendWorker, noReplyWorker, reminderWorker]) {
    w.on("failed", (job, err) =>
      console.error(`[WORKER] ✗ ${job?.name} ${job?.id}:`, err.message)
    );
  }

  console.log("✅ ROYA Agent + Outreach Workers started");
}
