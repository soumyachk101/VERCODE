# The secret-samples fixture library (SECURITY_TEST_PLAN §2 "the fixture
# library" `secret-samples/` + §3 "the redaction tests").
#
# These are the *key shapes* the redactor must catch (a the `ST-secret-*`
# + `ST-redaction-*` tests' input). A a *new* key shape that leaks is a
# redactor bug → add the pattern + add a sample here + re-run
# `ST-redaction-patterns` (SECURITY_TEST_PLAN §3 "a new key shape that
# leaks is a redactor bug").
#
# THE SAMPLES (a the 6 key shapes the task's spec calls out):
#   1. `openai-api-key.json`        — a an OpenAI `sk-...` API key.
#   2. `github-token.json`         — a a GitHub `ghp_...` personal-access
#      token.
#   3. `stripe-publishable.json`   — a a Stripe `pk_live_...` publishable
#      key (a the *publishable* shape, not the secret key — a the secret
#      key's shape is `sk_live_...`, tested alongside).
#   4. `pem-private-key.json`      — a a PEM private-key block.
#   5. `jwt-token.json`            — a a JWT (a three-dot-separated
#      base64url blob).
#   6. `database-url.json`         — a a `DATABASE_URL` string with
#      embedded credentials.
#
# EVERY SAMPLE'S `secret` is a *fixture value* (a a committed test string,
# NFR-31 "a committed .env with a real value is a CI-secret-scanner
# defect; a fixture with a test value is the whole point"). A the `masked`
# field is what the redactor must emit (a the masked form, e.g. `sk-...
# abcd` for the OpenAI key — a the ST-secret-leak assertion,
# SECURITY_TEST_PLAN §1.5 "the stored finding's payload + the logs + the
# provider-bound prompt contain only the masked form").
#
# THE redactor's pattern battery must catch every fixture in this dir
# (`ST-redaction-patterns`, SECURITY_TEST_PLAN §3). A the `shape` field is
# a the regex family the redactor uses (a the pattern + the masked output,
# a the test reads both + asserts the raw `secret` never appears in a
# log/finding/prompt).
