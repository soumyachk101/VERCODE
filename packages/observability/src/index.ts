// The `@vercode/observability` package — the "failures and retries are
// observable" requirement (OBSERVABILITY.md DEFINITION OF DONE #12).
//
// Three pillars + error tracking:
// - `logger()` — a pino-style structured JSON logger factory (a minimal
//   built-in: console + structured fields, dependency-light; a one record
//   per stage, a correlation id + fields, OBSERVABILITY.md §1).
// - `redact(text)` — a the redaction gate (SECRETS_MANAGEMENT.md §3): a
//   masks OpenAI/Anthropic/Stripe/GitHub key shapes, PEM blocks, DSNs,
//   JWTs, + a a generic high-entropy token; MUST run on every log record
//   + a every stored finding payload + a every provider-bound prompt
//   ("a a secret that reaches a log is a released secret").
// - `tracer()` — a a minimal OTel-compatible span API (a a trace-id /
//   span-id + a a spans array; a a no-op exporter if no OTLP endpoint; a
//   the review pipeline is a one trace with a a span per stage,
//   OBSERVABILITY.md §2).
// - `capture()` — a a Sentry-style capture stub (a a captured-errors array,
//   PII-scrubbed; OBSERVABILITY.md §4 "a a Sentry event that carries a
//   secret is a leak").
//
// The invariant (OBSERVABILITY.md §1 / §5): a a failure, a a retry, a a
// skip, or a a degraded stage is *queryable* by an operator (a the
// structured log + the trace + the capture are the surfaces; a "a
// failure that's only in a log file (not queryable) is a an
// observability defect").

import { redact, type RedactResult } from "./redact.js";

export { redact };
export type { RedactResult };

// ---------------------------------------------------------------------------
// The structured logger (a the pino-style, a one record per stage)
// ---------------------------------------------------------------------------

/** The log level (a the OBSERVABILITY.md §1 "a the levels + a the PII scrub"). */
export type LogLevel = "debug" | "info" | "warn" | "error";

/** A a structured log record (a the JSON shape, a one record per stage). */
export interface LogRecord {
  /** The ISO-8601 timestamp (a the record's write time). */
  time: string;
  level: LogLevel;
  /** The stage (a the `webhook.ingest` / `diff.fetch` / `ai.review` …). */
  stage: string;
  /** The correlation id (a the `job_id`, OBSERVABILITY.md §1 "a the
   * correlation id (= the job_id)"). */
  correlationId: string;
  /** The org id (a the PII-safe join, OBSERVABILITY.md §1 "a the ids are
   * the PII-safe join, not a the PII itself"). */
  orgId?: string;
  /** The outcome (a the `succeeded` / `partial` / `skipped:<reason>` / `failed`). */
  outcome?: string;
  /** The duration in ms (a the stage's wall-clock). */
  durationMs?: number;
  /** A additional structured fields (a the stage-specific detail). */
  fields?: Record<string, unknown>;
  /** The message (a the human-readable summary). */
  msg?: string;
}

export interface LoggerOptions {
  /** The base fields on every record (a the `org_id`, a the service name). */
  baseFields?: Record<string, unknown>;
  /** The log level threshold (a the records below are not emitted). */
  minLevel?: LogLevel;
  /** The sink (a the `console` by default; a the injection for the test —
   * a a an in-memory array). */
  sink?: (record: LogRecord) => void;
  /** The correlation id (a the default per-logger; a the per-record
   * override is the `withCorrelationId` / a the record-level field). */
  correlationId?: string;
  /** The org id (a the default per-logger). */
  orgId?: string;
}

/** The pino-style logger (a the structured JSON record factory). */
export interface StructuredLogger {
  child(fields: Record<string, unknown>): StructuredLogger;
  withCorrelationId(correlationId: string): StructuredLogger;
  log(stage: string, msg: string, level?: LogLevel, fields?: Record<string, unknown>): LogRecord;
  debug(stage: string, msg: string, fields?: Record<string, unknown>): LogRecord;
  info(stage: string, msg: string, fields?: Record<string, unknown>): LogRecord;
  warn(stage: string, msg: string, fields?: Record<string, unknown>): LogRecord;
  error(stage: string, msg: string, fields?: Record<string, unknown>): LogRecord;
  /** The records emitted so far (a the in-memory sink's record; a the test's query surface). */
  records: LogRecord[];
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

/**
 * The pino-style structured JSON logger factory (a the OBSERVABILITY.md §1
 * "a one JSON record per stage of the review pipeline").
 *
 * Every record carries the correlation id (= the `job_id`), the org id,
 * the stage, the outcome, + a the duration (a the §1 "a the record carries
 * the correlation id, the org_id, the stage, the outcome, and the
 * duration"). A skip is a log record, not a an absence (a the
 * `skipped: quota_exceeded` writes a record with the `skip_reason`, the
 * NFR-18 "never silent" rule).
 *
 * The redaction gate runs on every record before it's emitted
 * (SECRETS_MANAGEMENT §3 "a the redactor runs on *every* record before
 * it's written") — a a secret-shaped value in a a record is masked, not
 * emitted.
 */
export function logger(opts: LoggerOptions = {}): StructuredLogger {
  const records: LogRecord[] = [];
  const minLevel = opts.minLevel ?? "info";
  const sink = opts.sink ?? ((r: LogRecord) => {
    // A the default sink (a the console, a the structured JSON). A the
    // record is a the JSON (a a the pino-style "a structured field" — a a
    // single-line JSON, a the queryable surface).
    // eslint-disable-next-line no-console
    console.error(JSON.stringify(r));
  });

  const make = (baseFields: Record<string, unknown>, correlationId: string, orgId: string): StructuredLogger => {
    const emit = (stage: string, msg: string, level: LogLevel, fields?: Record<string, unknown>): LogRecord => {
      const record: LogRecord = {
        time: new Date().toISOString(),
        level,
        stage,
        correlationId,
        orgId: orgId || undefined,
        msg,
        ...(level === "debug" || level === "info" ? {} : {}), // a the level-specific fields
      };
      if (fields) record.fields = { ...fields };
      const merged = { ...baseFields, ...record };
      // A the redaction gate (a SECRETS_MANAGEMENT §3 "a the redactor runs
      // on *every* record before it's written"): a a the string fields are
      // the secret-shape surface (a the msg + a the field values).
      const redacted: LogRecord = {
        ...merged,
        msg: redact(String(merged.msg ?? "")).text,
        fields: redactFields(merged.fields),
      };
      if (LEVEL_ORDER[redacted.level] >= LEVEL_ORDER[minLevel]) {
        records.push(redacted);
        sink(redacted);
      }
      return redacted;
    };
    return {
      records,
      child: (f) => make({ ...baseFields, ...f }, correlationId, orgId),
      withCorrelationId: (cid) => make({ ...baseFields, correlationId: cid }, cid, orgId),
      log: (stage, msg, level = "info", fields) => emit(stage, msg, level, fields),
      debug: (stage, msg, fields) => emit(stage, msg, "debug", fields),
      info: (stage, msg, fields) => emit(stage, msg, "info", fields),
      warn: (stage, msg, fields) => emit(stage, msg, "warn", fields),
      error: (stage, msg, fields) => emit(stage, msg, "error", fields),
    };
  };

  // A the redaction of the nested fields (a the string values are the
  // secret-shape surface; a the numbers / booleans / objects pass through).
  function redactFields(fields?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!fields) return undefined;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      out[k] = typeof v === "string" ? redact(v).text : typeof v === "object" && v !== null ? redactFields(v as Record<string, unknown>) : v;
    }
    return out;
  }

  return make(opts.baseFields ?? {}, opts.correlationId ?? "", opts.orgId ?? "");
}

// ---------------------------------------------------------------------------
// The tracer (a the minimal OTel-compatible span API)
// ---------------------------------------------------------------------------

/** A a span (a the trace's stage, a the OBSERVABILITY.md §2 "a the spans
 * per stage"). */
export interface Span {
  /** The span id (a the unique within the trace). */
  spanId: string;
  /** The trace id (a the `job_id`, OBSERVABILITY.md §2 "a the trace id =
   * the job_id"). */
  traceId: string;
  /** The parent span id (a the root span has no parent). */
  parentSpanId?: string;
  /** The stage name (a the `diff.fetch` / `ai.review` …). */
  name: string;
  /** The span's attributes (a the provider call's token + cost, OBSERVABILITY.md §2 "a the provider calls carry token + cost attributes"). */
  attributes?: Record<string, unknown>;
  /** The start time (a the ISO-8601). */
  startTime: string;
  /** The end time (a set when the span ends; a the open span has no end). */
  endTime?: string;
  /** The outcome (a the `succeeded` / `partial` / `failed`). */
  outcome?: string;
}

/** The trace (a the one review = a one trace, a the spans per stage). */
export interface Trace {
  traceId: string;
  spans: Span[];
}

/** The span handle (a the open span, a the OTel-compatible surface). */
export interface SpanHandle {
  span: Span;
  /** Set a attribute (a the provider call's token + cost). */
  setAttribute(key: string, value: unknown): void;
  /** End the span (a set the end time + a the outcome). */
  end(outcome?: string): void;
}

/** The tracer (a the trace factory + a the span API). */
export interface Tracer {
  /** Start a new trace (a the trace id = a the correlation id / a the job_id). */
  startTrace(traceId: string, name?: string): TraceHandle;
  /** The traces created so far (a the in-memory surface, a the test's query). */
  traces: Trace[];
}

/** The trace handle (a the open trace + a the span API). */
export interface TraceHandle {
  trace: Trace;
  /** Start a a span (a the stage; a the child of a the trace's root). */
  startSpan(name: string, attributes?: Record<string, unknown>): SpanHandle;
  /** End the trace (a mark all open spans ended + a the trace's terminal). */
  end(outcome?: string): void;
}

// A the span/trace id generator (a the deterministic for the test; a the
// real OTel uses a 128-bit random trace id + a 64-bit span id — a the
// minimal API keeps a the job_id as a the trace id + a a counter as a the
// span id).
function nextId(prefix: string, n: number): string {
  return `${prefix}_${n.toString(16)}`;
}

/**
 * The minimal OTel-compatible span API (a the OBSERVABILITY.md §2 "a a
 * review is a single trace with a spans per stage").
 *
 * A the trace id = a the `job_id` (a the correlation is end-to-end, webhook
 * → GitHub publish, OBSERVABILITY.md §2 "a the trace id = the job_id").
 * A the provider calls carry token + cost attributes (a the `ai.review`
 * span's `model` / `inputTokens` / `outputTokens` / `estUsd` /
 * `promptVersion` — a the AC-306's numbers are trace-observable).
 *
 * A the exporter is a no-op if no OTLP endpoint (a the spans are the
 * in-memory array, a the test's + a the local query's surface; a the real
 * OTLP exporter is a a later seam — a the shape is the OTel's
 * `Tracer.startSpan` / `span.end()` API).
 */
export function tracer(): Tracer {
  const traces: Trace[] = [];
  let traceCounter = 0;

  return {
    traces,
    startTrace(traceId, name = "review.pipeline") {
      traceCounter += 1;
      const trace: Trace = { traceId, spans: [] };
      const root: Span = {
        spanId: nextId("root", traceCounter),
        traceId,
        name,
        startTime: new Date().toISOString(),
      };
      trace.spans.push(root);
      let spanCounter = 0;
      traces.push(trace);
      return {
        trace,
        startSpan(spanName, attributes) {
          spanCounter += 1;
          const span: Span = {
            spanId: nextId("span", spanCounter),
            traceId,
            parentSpanId: root.spanId,
            name: spanName,
            attributes: attributes ? { ...attributes } : undefined,
            startTime: new Date().toISOString(),
          };
          trace.spans.push(span);
          return {
            span,
            setAttribute(key, value) {
              span.attributes = { ...(span.attributes ?? {}), [key]: value };
            },
            end(outcome) {
              span.endTime = new Date().toISOString();
              if (outcome) span.outcome = outcome;
            },
          };
        },
        end(outcome) {
          for (const s of trace.spans) {
            if (!s.endTime) s.endTime = new Date().toISOString();
            if (outcome && !s.outcome) s.outcome = outcome;
          }
        },
      };
    },
  };
}

// ---------------------------------------------------------------------------
// The Sentry-style capture (a the PII-scrubbed captured-errors array)
// ---------------------------------------------------------------------------

/** A a captured error (a the Sentry event, a the PII + a the secret
 * scrubbed). */
export interface CapturedError {
  /** The error's id (a the capture's correlation). */
  id: string;
  /** The correlation id (a the `job_id`, OBSERVABILITY.md §4 "a a Sentry
   * event is joinable to the trace + a the log records"). */
  correlationId?: string;
  /** The org id (a the org-scoped release tag, OBSERVABILITY.md §4). */
  orgId?: string;
  /** The error's name (a the `TypeError` / `ApiError` …). */
  name: string;
  /** The error's message (a the scrubbed — a no secret, a no PII). */
  message: string;
  /** The stack (a the scrubbed). */
  stack?: string;
  /** A the breadcrumbs (a the recent log records, a the scrubbed). */
  breadcrumbs?: Array<{ level: string; msg: string; time: string }>;
  /** The capture time (a the ISO-8601). */
  time: string;
}

/** The capture stub (a the in-memory captured-errors array; a the real
 * Sentry DSN send is a a later seam — a the shape is a the OTel's
 * `Tracer` / a the Sentry's `captureException` API). */
export interface ErrorCapture {
  captured: CapturedError[];
  /** Capture a error (a the PII + a the secret scrubbed — a the redactor
   * applies to the capture's payload pre-send, SECRETS_MANAGEMENT §3 "a
   * the Sentry scrub is a the same gate extended to a the capture"). */
  capture(err: unknown, ctx?: { correlationId?: string; orgId?: string; breadcrumbs?: Array<{ level: string; msg: string; time: string }> }): CapturedError;
  /** The error's PII + a the secret scrub (a the message + a the stack +
   * a the breadcrumbs are redacted). */
  scrub(text: string): string;
}

/**
 * The Sentry-style capture stub (a the OBSERVABILITY.md §4 "a a 500 / a a
 * unhandled worker exception is captured with a the correlation id (a the
 * job_id) — a a Sentry event is joinable to the trace + a the log records
 * (a the same id threads all three)").
 *
 * A the PII + a the secret scrub (a SECRETS_MANAGEMENT §3 "a a Sentry
 * event that carries a a secret is a a leak"): a the capture runs a the
 * redactor on the message + a the stack + a the breadcrumbs before they're
 * stored — a the captured-errors array is a the scrubbed surface.
 */
export function capture(): ErrorCapture {
  const captured: CapturedError[] = [];
  let counter = 0;

  const scrub = (text: string): string => redact(text).text;

  return {
    captured,
    scrub,
    capture(err, ctx) {
      counter += 1;
      const name = err instanceof Error ? err.name : typeof err;
      const message = scrub(err instanceof Error ? err.message : String(err));
      const stack = scrub(err instanceof Error ? (err.stack ?? "") : "");
      const rec: CapturedError = {
        id: `cap_${counter.toString(16)}`,
        correlationId: ctx?.correlationId,
        orgId: ctx?.orgId,
        name,
        message,
        stack: stack || undefined,
        breadcrumbs: ctx?.breadcrumbs?.map((b) => ({
          level: b.level,
          msg: scrub(b.msg),
          time: b.time,
        })),
        time: new Date().toISOString(),
      };
      captured.push(rec);
      return rec;
    },
  };
}
