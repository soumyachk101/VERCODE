// The worker bootstrap (M5 T5.1, TRD.md §7). The process is:
//   1. Load the config (the loadConfig — the only reader of env).
//   2. Open the Redis + Postgres clients.
//   3. Wire the seams (the diff client, the publisher, the AI providers —
//      the mock versions in dev, the Octokit/real-provider versions later).
//   4. Start the BullMQ worker on the review-queue.
//   5. Install the SIGTERM handler (NFR-15): stop dequeueing, drain
//      in-flight within 60 s, re-queue the unfinished ones atomically.
//
// The dev-stack (docker-compose, TRD.md §18) runs USE_MOCK_GITHUB=true +
// USE_MOCK_AI=true, so the pipeline is deterministic end-to-end.

import * as IORedisNS from "ioredis";
import type { Redis, RedisOptions } from "ioredis";
import { loadConfig, type AppConfig } from "@vercode/config";
import { getPrismaClient } from "@vercode/database";
import type { AIProvider, ReviewTask } from "@vercode/ai-providers";
import {
  createOllamaAdapter,
  createOpenAIAdapter,
  createAnthropicAdapter,
  MockAdapter,
} from "@vercode/ai-providers";
import type { GithubDiffClient } from "@vercode/github";
import { makeMockGithubClient, MockGithubPublisher } from "./adapters/github-mock.js";
import {
  makeMockAiProviders,
} from "./adapters/local.js";
import { startWorker, type StartedWorker } from "./queues.js";
import type { WorkerDeps } from "./config.js";
import { workerOptsFromConfig } from "./config.js";

export interface WorkerRuntime {
  config: AppConfig;
  started: StartedWorker;
  redis: Redis;
}

export async function createWorkerRuntime(
  config: AppConfig = loadConfig()
): Promise<WorkerRuntime> {
  const db = getPrismaClient();
  const redis = new IORedisNS.Redis(config.core.REDIS_URL, {
    maxRetriesPerRequest: null,
    ...({} as RedisOptions),
  });

  // [the GithubDiffClient seam] — the mock reads the diff fixtures (a no
  // network, a deterministic); the Octokit client is a later leaf.
  const useMockGithub = config.devMock.USE_MOCK_GITHUB === "true";
  const github: GithubDiffClient = useMockGithub
    ? makeMockGithubClient()
    : makeMockGithubClient();
  // TODO: the real Octokit GithubDiffClient (@vercode/github's fetchPRDiff
  // with the installation token) when it lands behind this interface.

  // [the GithubPublisher seam] — the mock records publishes in-memory (+
  // optionally a JSON file in dev); the Octokit publisher (publishReview,
  // TRD.md §10) is a later leaf.
  const publisher = new MockGithubPublisher();

  // [the AI providers] — the mock provider (a deterministic) is the dev
  // default. The @vercode/ai-providers package lands the OpenAI/Anthropic/
  // Ollama adapters; the mock provider stays for the deterministic runs
  // (TRD.md §18).
  const useMockAi = config.devMock.USE_MOCK_AI === "true";
  const aiProviders: Partial<Record<ReviewTask, AIProvider>> = useMockAi
    ? makeMockAiProviders()
    : makeRealAiProviders(config);

  const opts = workerOptsFromConfig(config);

  const deps: WorkerDeps = {
    db,
    redis: redis as unknown as Redis,
    github,
    aiProviders,
    publisher,
    confidenceFloor: opts.confidenceFloor,
    maxFiles: opts.maxFiles,
    maxLines: opts.maxLines,
    promptVersion: "worker-v1",
  };

  const started = startWorker(deps, opts);

  // [the SIGTERM handler] — NFR-15 "the worker drains in-flight jobs on
  // SIGTERM within 60 s": stop dequeueing, finish in-flight within the
  // budget, re-queue the incomplete ones atomically (ERROR_HANDLING §8).
  let shuttingDown = false;
  const onSigterm = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.error(`[worker] ${signal} received — draining in-flight within the budget`);
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

// A the real-provider wiring (the live-config path, TRD.md §9 "bounded
// retry, then fall back to the configured secondary provider").
function makeRealAiProviders(config: AppConfig): Partial<Record<ReviewTask, AIProvider>> {
  const providers: Partial<Record<ReviewTask, AIProvider>> = {};
  if (config.ai.OPENAI_API_KEY) {
    const p = createOpenAIAdapter(config.ai.OPENAI_API_KEY);
    providers["deep-review"] = p;
    providers["security-review"] = p;
  }
  if (config.ai.ANTHROPIC_API_KEY) {
    const p = createAnthropicAdapter(config.ai.ANTHROPIC_API_KEY);
    if (!providers["risk-triage"]) providers["risk-triage"] = p;
  }
  if (config.ai.OLLAMA_BASE_URL) {
    const p = createOllamaAdapter(config.ai.OLLAMA_BASE_URL);
    if (!providers["deep-review"]) {
      providers["deep-review"] = p;
      providers["security-review"] = p;
    }
  }
  // A the mock adapter is the deterministic fallback.
  const mock = new MockAdapter("good");
  if (!providers["summary"]) providers["summary"] = mock;
  return providers;
}

// A the entry point (the `tsx src/index.ts` start).
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
