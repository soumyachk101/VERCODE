// The worker bootstrap (M5 T5.1, TRD.md §7). The process is:
//   1. Load the config (a loadConfig — a the only reader of env).
//   2. Open the Redis + Postgres clients.
//   3. Wire the seams (a the diff client, the publisher, the AI providers —
//      the mock versions in dev, the Octokit/real-provider versions later).
//   4. Start the BullMQ worker on the review-queue.
//   5. Install the SIGTERM handler (NFR-15): stop dequeueing, drain
//      in-flight within 60 s, re-queue the unfinished ones atomically.
//
// A the dev-stack (docker-compose, TRD.md §18) runs USE_MOCK_GITHUB=true +
// USE_MOCK_AI=true, so a the pipeline is deterministic end-to-end.

import IORedis from "ioredis";
import { loadConfig, type AppConfig } from "@vercode/config";
import { getPrismaClient } from "@vercode/database";
import type { GithubDiffClient } from "@vercode/github";
import { makeMockGithubClient, MockGithubPublisher } from "./adapters/github-mock.js";
import {
  mockAiProviderFactory,
  failingAiProviderFactory,
} from "./adapters/local.js";
import { startWorker, type StartedWorker } from "./queues.js";
import type { AiProviderFactory, WorkerDeps } from "./config.js";
import { workerOptsFromConfig } from "./config.js";

export interface WorkerRuntime {
  config: AppConfig;
  started: StartedWorker;
  redis: IORedis;
}

export async function createWorkerRuntime(
  config: AppConfig = loadConfig()
): Promise<WorkerRuntime> {
  const db = getPrismaClient();
  const redis = new IORedis(config.core.REDIS_URL, { maxRetriesPerRequest: null });

  // [the GithubDiffClient seam] — a the mock reads the diff fixtures (a no
  // network, a deterministic); a the Octokit client is a later leaf.
  const useMockGithub = config.devMock.USE_MOCK_GITHUB === "true";
  const github: GithubDiffClient = useMockGithub
    ? makeMockGithubClient()
    : makeMockGithubClient();
  // TODO: a the real Octokit GithubDiffClient (M4's @vercode/github) when it
  // lands behind this interface.

  // [the GithubPublisher seam] — a the mock records publishes in-memory (+
  // optionally a JSON file in dev); a the Octokit publisher is a later leaf.
  const publisher = new MockGithubPublisher();

  // [the AI providers] — a the mock provider (a deterministic) is a the dev
  // default. A the @vercode/ai-providers package lands the OpenAI/Anthropic/
  // Ollama adapters; a the mock provider stays for a the deterministic runs
  // (TRD.md §18).
  const useMockAi = config.devMock.USE_MOCK_AI === "true";
  const aiProviderFactories: AiProviderFactory[] = useMockAi
    ? [mockAiProviderFactory, mockAiProviderFactory] // [primary, fallback]
    : [failingAiProviderFactory, failingAiProviderFactory]; // a placeholder until M4 lands

  const deps: WorkerDeps = {
    db,
    redis,
    github,
    aiProviderFactories,
    publisher,
    providerPreference: config.ai.AI_DEFAULT_PROVIDER,
  };

  const started = startWorker(deps, workerOptsFromConfig(config));

  // [the SIGTERM handler] — NFR-15 "a the worker drains in-flight jobs on
  // SIGTERM within 60 s".
  let shuttingDown = false;
  const onSigterm = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.error(`[worker] ${signal} received — a draining in-flight within the budget`);
    try {
      await started.shutdown();
      await redis.quit();
      process.exit(0);
    } catch (err) {
      console.error(`[worker] drain failed: ${(err as Error).message}`);
      process.exit(1);
    }
  };
  process.on("SIGTERM", onSigterm);
  process.on("SIGINT", onSigterm);

  return { config, started, redis };
}

// A the entry point (a the `tsx src/index.ts` start).
export async function main(): Promise<void> {
  const runtime = await createWorkerRuntime();
  console.error(
    `[worker] review-queue started (concurrency=${workerOptsFromConfig(runtime.config).concurrency})`
  );
}

// A the tsx start script runs this when imported as a the main module.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(`[worker] failed to start: ${(err as Error).message}`);
    process.exit(1);
  });
}
