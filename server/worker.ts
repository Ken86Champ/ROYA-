import { startWorkers } from "./queues/agent.queue";

console.log("🚀 Starting ROYA Agent Worker...");
startWorkers();

process.on("SIGTERM", () => {
  console.log("Worker shutting down...");
  process.exit(0);
});
