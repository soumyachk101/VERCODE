// Local adapters — a the AI provider seam behind a the @vercode/ai-providers
// package.
//
// The real adapters (OpenAI, Anthropic, Ollama) come from a the
// @vercode/ai-providers package (T4.3, TRD.md §9); a the MockAdapter is a
// deterministic stand-in for a the dev-stack (TRD.md §18 "a mock-AI provider
// for a deterministic runs").
//
// This file provides a the factory that returns a task → provider map for a
// the worker's pipeline. A the provider is the @vercode/ai-providers'
// `AIProvider` interface (a the `completeStructured` contract).
//
// When a live provider config is present (the USE_MOCK_AI=false + a the real
// key), a the index.ts wires a the real adapters; this file is a the mock
// path.

import {
  MockAdapter,
  createOpenAIAdapter,
  createAnthropicAdapter,
  createOllamaAdapter,
  type AIProvider,
  type ReviewTask,
} from "@vercode/ai-providers";

/**
 * Build the mock task → provider map (a the dev default, TRD.md §18).
 *
 * Every task gets a the same MockAdapter with a the "good" scenario — a
 * deterministic, a zero real-token-cost result. A the call count is
 * exposed on a the adapter so a test can assert "a zero provider calls"
 * (the quota-skip test).
 */
export function makeMockAiProviders(): Partial<Record<ReviewTask, AIProvider>> {
  const deep = new MockAdapter("good");
  const security = new MockAdapter("good");
  return {
    "deep-review": deep,
    "security-review": security,
  };
}

/**
 * Build a the failing provider map (a the provider-down test — a the
 * partial path, ERROR_HANDLING §5: a the deterministic findings still
 * publish, the job is `partial`).
 */
export function makeFailingAiProviders(): Partial<Record<ReviewTask, AIProvider>> {
  const deep = new MockAdapter("down");
  const security = new MockAdapter("down");
  return {
    "deep-review": deep,
    "security-review": security,
  };
}

// A the real adapters (a the live-config path).
export function makeRealAiProvidersFromConfig(config: {
  ai: {
    OPENAI_API_KEY?: string;
    ANTHROPIC_API_KEY?: string;
    OLLAMA_BASE_URL?: string;
    AI_FALLBACK_PROVIDER?: string;
  };
}): Partial<Record<ReviewTask, AIProvider>> {
  const providers: Partial<Record<ReviewTask, AIProvider>> = {};
  if (config.ai.OPENAI_API_KEY) {
    const p = createOpenAIAdapter(config.ai.OPENAI_API_KEY);
    providers["deep-review"] = p;
    providers["security-review"] = p;
  }
  if (config.ai.ANTHROPIC_API_KEY) {
    const p = createAnthropicAdapter(config.ai.ANTHROPIC_API_KEY);
    if (!providers["deep-review"]) {
      providers["risk-triage"] = p;
    }
  }
  if (config.ai.OLLAMA_BASE_URL) {
    const p = createOllamaAdapter(config.ai.OLLAMA_BASE_URL);
    if (!providers["deep-review"]) {
      providers["deep-review"] = p;
      providers["security-review"] = p;
    }
  }
  // A the mock adapter is a the fallback (a deterministic).
  const mock = new MockAdapter("good");
  if (!providers["summary"]) providers["summary"] = mock;
  return providers;
}
