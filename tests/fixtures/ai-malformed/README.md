# The ai-malformed fixture library (SECURITY_TEST_PLAN §1.9 "ST-ai-malformed
# + ST-ai-schema-edge" + §2 `ai-malformed/`).
#
# These drive the "the provider's structured output is re-validated, never
# trusted" tests (a the review-engine's invariant 1, AI_SYSTEM_DESIGN §1
# "a the engine re-parses with Zod regardless of the adapter's claim"):
#
#   - `schema-invalid.json` — a a payload that fails the Zod re-validation
#     outright (a a shape that isn't a findings object). A the engine
#     drops it (a the `dropped.invalid` counter, REVIEW_ENGINE_SPEC §2
#     stage [9]).
#   - `out-of-enum-finding.json` — a a "valid-looking but out-of-enum"
#     finding (a the category is a string that's not in
#     `FindingCategorySchema`). A the Zod re-validation drops it (a the
#     `ST-ai-schema-edge` assertion, SECURITY_TEST_PLAN §1.9 "a provider
#     returns a valid-looking but out-of-enum finding → Zod re-validation
#     drops it, the provider's claim is not trusted").
#   - `steered-underreport.json` — a a "steered" under-reporting output (a
#     a the AI is steered to *omit* findings — a the injection crossover's
#     "a silenced deterministic finding" half, BENCHMARK_DATASET §3 "a
#     the injection crossover"). A the gate asserts the *static* findings
#     still publish (a the AI's silence doesn't silence the deterministic
#     stage, ADR-005).
#
# A each fixture is a plain JSON object the ST-* tests + a the benchmark
# harness's injection-outcomes score read in (a the test asserts against
# a fixture, not against inline data).
