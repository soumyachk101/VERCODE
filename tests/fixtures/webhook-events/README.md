# The webhook-events fixture library (SECURITY_TEST_PLAN §1.1 "Forged /
# replayed webhooks" + §2 `webhook-events/`).
#
# The pre-computed signed + forged + replayed + malformed event bodies
# (a the `ST-webhook-*` + `IT-webhook-*` tests' input). A the signatures
# are computed against a *test* webhook secret that's committed as a
# fixture (`secret.json` — a not a real secret, NFR-31 "a committed .env
# with a real value is a CI-secret-scanner defect; a fixture with a test
# value is the whole point").
#
# THE GITHUB WEBHOOK SIGNING (WEBHOOK_SPECIFICATION §1.1, the api's
# `verifyGitHubWebhook` three-layer defense):
#   - a `signed` event: a a valid HMAC-SHA256 over the raw body, a the
#     `X-Hub-Signature-256: sha256=<hex>` header, a the `X-Hub-Timestamp`
#     within a the 5-min window, a a fresh `X-Hub-Delivery` id.
#   - a `forged` event: a the same body with a the wrong-key signature (a
#     `ST-webhook-forged` — a 401, a no queue write, a audit row).
#   - a `replayed` event: a a valid signature but a seen delivery id (a
#     `ST-webhook-replay` — a 200 no-op, a the pipeline doesn't re-run).
#   - a `malformed` event: a a valid signature but a the body fails a the
#     event schema (a `ST-malformed-body` — a 422, a not enqueued).
#
# THE STRIPE (BILLING) WEBHOOK SIGNING (a the mock-billing service's
# `stripeSign` — a the test-mode signature, `t=<ts>,v1=<hmac>`): a the
# `stripe-signed` + a `stripe-forged` fixtures mirror the GitHub pair.
#
# A each fixture carries: a the raw body (a a JSON string — a the HMAC
# source of truth, a the verifier computes over the *raw* bytes, not a
# re-serialized object), a the computed headers, a the expected verdict,
# + a the `timestamp` (a a the fixture's computed timestamp — a the test
# passes it to the verifier's `opts.now` + a the `isDeliverySeen` so a
# replay is reproducible without a live clock).
