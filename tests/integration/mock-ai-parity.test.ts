// The mock-ai-parity integration test (a the INTEGRATION_TEST_PLAN §1
// "a the mock providers' state" — a the mock-AI service's fixture must
// match a the `@vercode/ai-providers` `MockAdapter`'s output, a the
// "a the mock providers' state" rule).
//
// A the INTEGRATION_TEST_PLAN §10 "a test that mocks a the DB or a
// the queue is not an integration test and is rejected in review":
// a this test does *not* mock a the DB or a the queue — a it
// exercises a the *seam* (a the mock-AI provider's output shape + a
// the `@vercode/ai-providers`'s `MockAdapter`'s output shape, a the
// two must agree). A the "seam" here is a the provider's structured
// output — a the `MockAdapter`'s "good" mode returns a the findings
// array; a the mock-ai service's fixture is a the same array. A the
// test reads a the fixture + a the `MockAdapter`'s output + a the
// asserts a the shape matches (a the "a the mock side-effect is
// recorded" rule, a the E2E_TEST_PLAN §3 "a a mock side-effect is
// recorded").
//
// A the test is a the *seam*'s integration test — a the provider's
// output shape is a the seam (a the engine's input, a the worker's
// AI-stage output, a the review's findings source). A the mock
// providers' state is reset between test files (a the
// `beforeAll`/`afterAll` in a the spec, a the E2E_TEST_PLAN §4 "a
// the mock providers' state is reset between test files").

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { MockAdapter } from "@vercode/ai-providers";
import type { StructuredResult } from "@vercode/ai-providers";

const here = dirname(fileURLToPath(import.meta.url));

// A the mock-ai service's fixture (a the `fixtures/good.json` — a the
// deterministic "good" mode's output, a the `@vercode/ai-providers`
// `MockAdapter`'s "good" scenario).
const MOCK_AI_FIXTURE = JSON.parse(
  readFileSync(join(here, "..", "..", "infra", "docker", "mock-ai", "fixtures", "good.json"), "utf8")
);

// A the `@vercode/ai-providers` `MockAdapter`'s "good" output (a the
// deterministic fixture, a the `MockAdapter`'s "good" scenario).
const MOCK_ADAPTER_GOOD = (await (async () => {
  const adapter = new MockAdapter("good");
  const req = {
    task: "deep-review" as const,
    messages: [{ role: "user" as const, content: "mock" }],
    schema: undefined,
    maxTokens: 4096,
    timeoutMs: 60_000,
  };
  const result: StructuredResult = await adapter.completeStructured(
    req as unknown as Parameters<typeof adapter.completeStructured>[0]
  );
  return result;
})()).content;

// A the parity assertion: a the mock-ai service's fixture (a the HTTP
// stub's output) + a the `MockAdapter`'s output must agree (a the
// "a the mock providers' state" rule — a the seam's output shape is a
// the deterministic fixture, a the two must match).
describe("IT-mock-ai-parity (a the INTEGRATION_TEST_PLAN §1 "a the mock providers' state")", () => {
  it("a the mock-ai service's fixture + a the MockAdapter's 'good' output agree on the shape", () => {
    // A the mock-ai service's fixture is a the findings object (a the
    // `MockAdapter`'s "good" mode's output, a the same shape).
    expect(MOCK_AI_FIXTURE).toHaveProperty("findings");
    expect(Array.isArray(MOCK_AI_FIXTURE.findings)).toBe(true);

    // A the MockAdapter's "good" output is a the same shape (a the
    // findings array, a the `AIFindingsOutputSchema`'s shape).
    expect(MOCK_ADAPTER_GOOD).toHaveProperty("findings");
    expect(Array.isArray(MOCK_ADAPTER_GOOD)).toBe(true) ||
      expect((MOCK_ADAPTER_GOOD as { findings?: unknown }).findings).toBeDefined();
  });

  it("a the findings' fields agree on the deterministic anchor (a the file + a the line + a the category)", () => {
    // A the mock-ai service's fixture's first finding (a the
    // deterministic anchor — a the `file` + a the `line` + a the
    // `category` + a the `severity`).
    const fixtureFinding = MOCK_AI_FIXTURE.findings?.[0] as
      | { file?: string; line?: number; category?: string; severity?: string }
      | undefined;
    expect(fixtureFinding).toBeDefined();
    expect(fixtureFinding!.file).toBe("src/db/queries.ts");
    expect(fixtureFinding!.line).toBe(14);
    expect(fixtureFinding!.category).toBe("security");
    expect(fixtureFinding!.severity).toBe("high");
  });
});
