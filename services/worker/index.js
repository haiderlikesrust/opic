/**
 * Agent worker: consumes tasks from Redis and runs agent runtimes.
 * Each agent runs in isolation with its own config, memory, and tools.
 *
 * Prerequisites: REDIS_URL, DATABASE_URL, CREDENTIAL_SECRET in env.
 * Run: node services/worker/index.js
 */

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

async function main() {
  console.log("[worker] Starting…");
  // TODO: connect Redis, subscribe to agent tasks
  // TODO: for each task: load agent from DB, run cycle (prompt + tools + schedule)
  // TODO: log to AgentLog, respect subscription periodEnd (pause if expired)
  console.log("[worker] Redis URL:", REDIS_URL);
  console.log("[worker] Placeholder running. Implement Redis consumer and agent runtime.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[worker]", err);
  process.exit(1);
});
