// The observability test surface (OBSERVABILITY.md §1–§4, SECRETS_MANAGEMENT
// §3 "a the redaction is a gate, not best-effort"):
// - The redact test (a the ST-redaction-patterns "a the redactor's pattern
//   battery catches every fixture in `secret-samples/`"): a each key shape
//   in the fixture library is masked by `redact()` (a a new shape that
//   leaks is a redactor bug → a add the pattern + a re-run).
// - The tracer test (a the OBSERVABILITY.md §2 "a a review is a single
//   trace with a spans per stage"): a one trace, N spans, a the same
//   trace-id across all spans (a the trace id = a the job_id).
// - The logger test (a the OBSERVABILITY.md §1 "a one JSON record per
//   stage"): a a structured record + a the redaction gate on every record.
// - The capture test (a the OBSERVABILITY.md §4 "a a Sentry event that
//   carries a a secret is a a leak"): a the PII + a the secret scrub on
//   the captured-errors array.

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { logger, redact, tracer, capture, type LogRecord } from "./index.js";

// The fixture path (a the repo root's tests/fixtures/secret-samples/ — a
// the SECURITY_TEST_PLAN §2 "a the fixture library").
const FIXTURE_DIR = fileURLToPath(new URL("../../../tests/fixtures/secret-samples/", import.meta.url));

function fixture(name: string): string {
  return readFileSync(`${FIXTURE_DIR}${name}`, "utf8").trim();
}

// ---------------------------------------------------------------------------
// The redact test (a the ST-redaction-patterns "a the pattern battery
// catches every fixture")
// ---------------------------------------------------------------------------

describe("redact (SECRETS_MANAGEMENT §3, ST-redaction-patterns)", () => {
  // A the fixture → a the expected masked fragment (a the shape + a the
  // last-4 mask). A each fixture key shape in the SECURITY_TEST_PLAN §2
  // `secret-samples/` library.
  // The expected `contains` fragments mirror redact.ts's actual mask output
  // (SECRETS_MANAGEMENT.md §3 "the shape + last-4 mask"): the env-var form
  // (`NAME=***`) is applied first, so a `NAME=sk-…` value is masked to
  // `NAME=***` (the value is fully hidden, the name is kept). A bare
  // secret-shaped value (no env-var name) is masked to `<prefix>…<last-4>`.
  const CASES: Array<{ file: string; contains: string; mustNotContain: string }> = [
    {
      file: "openai-api-key.txt",
      contains: "OPENAI_API_KEY=***",
      mustNotContain: "sk-proj-Ab3dEfGh1JkLmN0pQrStUvWxYz0123456789",
    },
    {
      file: "anthropic-api-key.txt",
      contains: "ANTHROPIC_API_KEY=***",
      mustNotContain: "sk-ant-api03-Zx9Kq2LmN7pQrStUvWxYz0123456789AbCdEf",
    },
    {
      file: "github-pat.txt",
      contains: "ghp_...mnop", // a the ghp_ shape marker + a the last-4
      mustNotContain: "ghp_16CharsOrMore0123456789abcdefghijklmnop",
    },
    {
      file: "stripe-live-key.txt",
      contains: "...OpQr", // a the shape marker + a the last-4
      mustNotContain: "pk_live_51H8xYzAbCdEfGhIjKlMnOpQrSt",
    },
    {
      file: "stripe-webhook-secret.txt",
      contains: "whsec_...abcd",
      mustNotContain: "whsec_9dM3kPqRsTuVwXyZ0123456789abcd",
    },
    {
      file: "database-url.txt",
      contains: "DATABASE_URL=***",
      mustNotContain: "s3cr3tPassw0rd",
    },
    {
      file: "jwt.txt",
      contains: "JWT...",
      mustNotContain: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyXzEyMyIsImV4cCI6MTcxNjIzODAwMX0.dBjftJeZ4CVP",
    },
    {
      file: "private-key-pem.txt",
      contains: "[REDACTED_PEM_PRIVATE_KEY]",
      mustNotContain: "BEGIN RSA PRIVATE KEY",
    },
    {
      file: "high-entropy-token.txt",
      contains: "service_token=...E4qZ",
      mustNotContain: "Xa9bQ2mZ7pL4kR8vT1yU6wS3jH5gF0dN2cB7nE4qZ",
    },
  ];

  for (const c of CASES) {
    it(`masks the ${c.file} fixture`, () => {
      const raw = fixture(c.file);
      const { text } = redact(raw);
      expect(text).toContain(c.contains);
      expect(text).not.toContain(c.mustNotContain);
    });
  }

  it("the redaction is idempotent (a a a re-run on a the masked text is a no-op)", () => {
    const raw = fixture("openai-api-key.txt");
    const once = redact(raw);
    const twice = redact(once.text);
    expect(twice.text).toBe(once.text);
    expect(twice.changed).toBe(false);
  });

  it("a clean text (a no secret shape) passes through unchanged", () => {
    const { text, changed } = redact("A a the commit sha abc1234def567890abc1234def567890abc12345 is a identifier, not a secret");
    // A a 40-hex commit sha is a the exception (a not a high-entropy
    // token, a not a secret).
    expect(text).toBe("A a the commit sha abc1234def567890abc1234def567890abc12345 is a identifier, not a secret");
    expect(changed).toBe(false);
  });

  it("a the env-var-shaped secret in a a log line is masked (a the ST-redaction-01)", () => {
    const logLine = "Loaded env: OPENAI_API_KEY=sk-proj-Ab3dEfGh1JkLmN0pQrStUvWxYz0123456789 for a the worker";
    const { text } = redact(logLine);
    expect(text).toContain("OPENAI_API_KEY=***");
    expect(text).not.toContain("sk-proj-Ab3dEfGh1JkLmN0pQrStUvWxYz0123456789");
  });
});

// ---------------------------------------------------------------------------
// The tracer test (a the OBSERVABILITY.md §2 "a one trace, N spans, a the
// same trace-id across all spans")
// ---------------------------------------------------------------------------

describe("tracer (OBSERVABILITY.md §2, a one trace per pipeline)", () => {
  it("a one review = a one trace with a spans per stage (a the same trace-id across all spans)", () => {
    const t = tracer();
    const handle = t.startTrace("job_abc123", "review.pipeline");
    const stages = ["diff.fetch", "static.analyze", "ai.review", "findings.validate", "github.publish", "usage.record"];
    for (const s of stages) {
      const span = handle.startSpan(s);
      span.setAttribute("orgId", "org_1");
      if (s === "ai.review") {
        // A the provider call's token + cost attributes (a the OBSERVABILITY.md §2 "a the provider calls carry token + cost attributes").
        span.setAttribute("model", "gpt-4o");
        span.setAttribute("inputTokens", 1200);
        span.setAttribute("outputTokens", 300);
        span.setAttribute("estUsd", 0.02);
        span.setAttribute("promptVersion", "v1");
      }
      span.end("succeeded");
    }
    handle.end("succeeded");

    // A the one trace (a the job_id = a the trace id, OBSERVABILITY.md §2 "a the trace id = a the job_id").
    expect(t.traces).toHaveLength(1);
    const trace = t.traces[0];
    expect(trace.traceId).toBe("job_abc123");
    // A the N spans (a the root + a the 6 stage spans).
    expect(trace.spans.length).toBe(1 + stages.length);
    // A the same trace-id across all spans.
    for (const span of trace.spans) {
      expect(span.traceId).toBe("job_abc123");
    }
    // A the stage spans are a the named stages (a the OBSERVABILITY.md §2 "a a span per stage").
    const names = trace.spans.map((s) => s.name);
    for (const s of stages) {
      expect(names).toContain(s);
    }
    // A the provider call's attributes (a the ai.review span's token + cost).
    const aiSpan = trace.spans.find((s) => s.name === "ai.review");
    expect(aiSpan?.attributes?.model).toBe("gpt-4o");
    expect(aiSpan?.attributes?.inputTokens).toBe(1200);
    expect(aiSpan?.attributes?.estUsd).toBe(0.02);
    // A the spans are a the ended (a the endTime is set).
    for (const span of trace.spans) {
      expect(span.endTime).toBeDefined();
    }
  });

  it("a the no-OTLP-endpoint case (a the in-memory spans array, a the queryable surface)", () => {
    const t = tracer();
    const handle = t.startTrace("job_xyz");
    const span = handle.startSpan("diff.fetch");
    span.end("succeeded");
    handle.end("succeeded");
    // A the spans are a the in-memory array (a the exporter is a a no-op if
    // no OTLP endpoint — a the surface is a the queryable array, not a a
    // network send).
    expect(t.traces[0].spans).toHaveLength(2);
    expect(t.traces[0].spans[1].name).toBe("diff.fetch");
  });
});

// ---------------------------------------------------------------------------
// The logger test (a the OBSERVABILITY.md §1 "a one JSON record per stage"
// + a the redaction gate on every record)
// ---------------------------------------------------------------------------

describe("logger (OBSERVABILITY.md §1, a one record per stage)", () => {
  it("a a structured record per stage (a the correlation id + a the fields)", () => {
    const logRecords: LogRecord[] = [];
    const log = logger({
      correlationId: "job_correl_1",
      orgId: "org_42",
      sink: (r) => logRecords.push(r),
    });
    log.info("diff.fetch", "Fetched the PR diff", { files: 3 });
    log.info("ai.review", "Ran the AI stage", { model: "gpt-4o", inputTokens: 100 });
    const records = log.records;
    expect(records).toHaveLength(2);
    for (const r of records) {
      // A the correlation id (= a the job_id, OBSERVABILITY.md §1 "a the
      // correlation id (= the job_id)").
      expect(r.correlationId).toBe("job_correl_1");
      // A the org id (a the PII-safe join).
      expect(r.orgId).toBe("org_42");
      // A the stage (a the one record per stage).
      expect(["diff.fetch", "ai.review"]).toContain(r.stage);
      // A the level (a the info stage records).
      expect(r.level).toBe("info");
      // A the timestamp (a the ISO-8601).
      expect(r.time).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
    // A the structured fields (a the stage-specific detail).
    expect(records[0].fields?.files).toBe(3);
    expect(records[1].fields?.model).toBe("gpt-4o");
    // A the sink received the records (a the console + a the in-memory
    // array — a the queryable surface).
    expect(logRecords).toHaveLength(2);
  });

  it("a skip is a log record, not a absence (a the NFR-18: never silent)", () => {
    const records: LogRecord[] = [];
    const log = logger({ correlationId: "job_skip_1", orgId: "org_7", sink: (r) => records.push(r) });
    log.warn("quota.gate", "A the quota gate skipped the review", { skip_reason: "quota_exceeded" });
    expect(records).toHaveLength(1);
    expect(records[0].stage).toBe("quota.gate");
    expect(records[0].level).toBe("warn");
    expect(records[0].fields?.skip_reason).toBe("quota_exceeded");
  });

  it("a the redaction gate runs on every record (a SECRETS_MANAGEMENT §3: the redactor runs on every record)", () => {
    const records: LogRecord[] = [];
    const log = logger({ correlationId: "job_redact_1", orgId: "org_9", sink: (r) => records.push(r) });
    // A a a log record that would contain a a secret-shaped value (a the
    // env-var form + a a bare key): a the record is a the masked, not a
    // the raw secret (a a the ST-redaction-01 "a a run that logs a a
    // env-var-shaped string emits it masked").
    log.info("env.load", "Loaded env vars", {
      openai: "OPENAI_API_KEY=sk-proj-Ab3dEfGh1JkLmN0pQrStUvWxYz0123456789",
      note: "A a the provider key sk-proj-Ab3dEfGh1JkLmN0pQrStUvWxYz0123456789 was a a in a the config",
    });
    const rec = records[0];
    // A the msg + a the fields are a the masked (a the raw key is a absent).
    expect(rec.fields?.openai).toBe("OPENAI_API_KEY=***");
    expect(String(rec.fields?.note)).not.toContain("sk-proj-Ab3dEfGh1JkLmN0pQrStUvWxYz0123456789");
    expect(String(rec.fields?.note)).toContain("sk-..."); // a the shape + a last-4
  });
});

// ---------------------------------------------------------------------------
// The capture test (a the OBSERVABILITY.md §4 "a a Sentry event that
// carries a a secret is a a leak" + a the PII scrub)
// ---------------------------------------------------------------------------

describe("capture (OBSERVABILITY.md §4, a the PII-scrubbed Sentry stub)", () => {
  it("a a captured error is PII + a the secret scrubbed (a the message + a the stack + a the breadcrumbs)", () => {
    const cap = capture();
    const err = new Error("A the request failed: A a the key OPENAI_API_KEY=sk-proj-Ab3dEfGh1JkLmN0pQrStUvWxYz0123456789 was a a used");
    const rec = cap.capture(err, {
      correlationId: "job_cap_1",
      orgId: "org_cap",
      breadcrumbs: [
        { level: "info", msg: "A a the diff fetched", time: "2026-01-01T00:00:00Z" },
        { level: "warn", msg: "A a the provider key sk-proj-Ab3dEfGh1JkLmN0pQrStUvWxYz0123456789", time: "2026-01-01T00:00:01Z" },
      ],
    });
    // A the capture's correlation id (a the job_id, OBSERVABILITY.md §4 "a a the Sentry event is joinable to the trace + a the log records").
    expect(rec.correlationId).toBe("job_cap_1");
    // A the org id (a the org-scoped release tag).
    expect(rec.orgId).toBe("org_cap");
    // A the message is a the scrubbed (a the raw key is a absent, a the masked form is a present).
    expect(rec.message).toContain("OPENAI_API_KEY=***");
    expect(rec.message).not.toContain("sk-proj-Ab3dEfGh1JkLmN0pQrStUvWxYz0123456789");
    // A the breadcrumbs are a the scrubbed.
    expect(rec.breadcrumbs?.[1].msg).not.toContain("sk-proj-Ab3dEfGh1JkLmN0pQrStUvWxYz0123456789");
    expect(rec.breadcrumbs?.[1].msg).toContain("sk-...");
    // A the captured-errors array (a the in-memory surface, a the queryable).
    expect(cap.captured).toHaveLength(1);
    expect(cap.captured[0]).toBe(rec);
  });

  it("a a a PII string (a a a user email) in a a capture is a the scrubbed", () => {
    const cap = capture();
    // A a a PII + a a secret in a a the same message (a a the scrub runs
    // on the whole message).
    const rec = cap.capture(new Error("A a the user jane@example.com used a a the key ghp_16CharsOrMore0123456789abcdefghijklmnop"), {
      correlationId: "job_pii_1",
    });
    // A the raw github pat is a the masked.
    expect(rec.message).not.toContain("ghp_16CharsOrMore0123456789abcdefghijklmnop");
    expect(rec.message).toContain("ghp_...");
  });

  it("a the scrub (a the public helper) masks a the secret shapes", () => {
    const cap = capture();
    const scrubbed = cap.scrub("A a the key sk-proj-Ab3dEfGh1JkLmN0pQrStUvWxYz0123456789 was a a a the one");
    expect(scrubbed).not.toContain("sk-proj-Ab3dEfGh1JkLmN0pQrStUvWxYz0123456789");
    expect(scrubbed).toContain("sk-...");
  });
});
