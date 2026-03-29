import { Queue, Worker, Job } from "bullmq";
import IORedis from "ioredis";
import { runCampaignOrchestrator } from "../agents/orchestrator.agent";
import { processReply } from "../agents/conversation.agent";
import { segmentContacts } from "../agents/segmentation.agent";

const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

export const orchestratorQueue = new Queue("orchestrator", { connection });
export const conversationQueue = new Queue("conversation", { connection });
export const segmentationQueue = new Queue("segmentation", { connection });
export const outreachQueue = new Queue("outreach", { connection });

export function startWorkers() {
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

  console.log("✅ ROYA Agent Workers started");
}
