# The malicious-files fixture library (SECURITY_TEST_PLAN §1.6
# "Malicious files / execution (T-07/T-08)" + §2 `malicious-files/`).
#
# These drive the `ST-malicious-file` + `ST-context-clean` tests:
#
#   - `postinstall-package.json` — a `package.json` that bears a malicious
#     `postinstall` hook. The test asserts the manifest is *analyzed, not
#     executed* (a negative check: no install ran, the build-step list is
#     empty, ST-malicious-file).
#   - `lockfile-diff.json` — a generated/lockfile diff (a `pnpm-lock.yaml`
#     + a `package-lock.json` hunk). The test asserts the generated /
#     dependency source is *out of AI scope* (ST-context-clean, a the
#     `classifyFile`'s "generated" + "dependency-manifest" risk-tier,
#     REPOSITORY_STRUCTURE "generated files are excluded from the AI
#     scope, static-only").
#
# A the fixtures are versioned; a the test asserts against a fixture, not
# against inline data (a TEST_STRATEGY §1 "a fixture change is a reviewed
# change").
