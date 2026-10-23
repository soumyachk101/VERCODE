# GitHub App Setup Guide

This guide walks through creating the two GitHub resources VERCODE needs:
a **GitHub App** (the webhook receiver that reviews PRs) and a **GitHub
OAuth App** (the per-user handle read for the account page). Both are
free-tier, no-cost, and can be created in under 10 minutes.

## 1. Create the GitHub App

1. Go to https://github.com/settings/apps/new (under your account or org settings).
2. Fill in:

   | Field | Value |
   |---|---|
   | GitHub App name | `vercode` |
   | Description | `AI code review and enforcement for pull requests` |
   | Homepage URL | Your deployed web URL (e.g. `https://vercode.example.com`) |
   | Callback URL | Leave empty (OAuth handled separately) |
   | Webhook active | ✅ Yes |
   | Webhook secret | Any 32+ char string (copy it into `.env` as `GITHUB_WEBHOOK_SECRET`) |
   | Is this App for an organization account? | Pick one — you can add both later |

3. Under **Permissions**:

   | Scope | Access |
   |---|---|
   | `checks` | Write |
   | `contents` | Read |
   | `issues` | Read |
   | `metadata` | Read |
   | `pull_requests` | Write |

   Repository permissions must be exactly these five — no admin, no secrets, no packages.

4. Click **Create GitHub App**.
5. Under **App Settings → Private keys**, generate a new private key.
   Copy the PEM contents into `.env` as `GITHUB_APP_PRIVATE_KEY`.
6. Under **App Settings → General**, note the **App ID** → `.env` `GITHUB_APP_ID`.
7. Under **App Settings → Webhooks**, ensure the event subscription is:
   - `installation` (activates)
   - `pull_request` (opened, synchronize, reopened, closed)
   - `installation_repositories` (added, removed)
   - `check_run` (rerequested)

## 2. Create the OAuth App (per-user handle read)

1. Go to https://github.com/settings/developers/new-oauth-app
2. Fill in:

   | Field | Value |
   |---|---|
   | Application name | `vercode` |
   | Homepage URL | Your deployed web URL |
   | Callback URL | `http://localhost:4000/auth/github/callback` (dev) or your production API URL |

3. Click **Register application**.
4. Under **OAuth Applications → vercode → OAuth**, click **Generate a new client**
   (or **Generate client secret**).
5. Copy the **Client ID** into `.env` as `GITHUB_CLIENT_ID`.
6. Copy the **Client Secret** into `.env` as `GITHUB_CLIENT_SECRET`.

## 3. Fill in `.env`

At the root of the repo (`.env`), set:

```env
# GitHub App (repo-scoped webhook receiver)
GITHUB_APP_ID=<App ID from step 1>
GITHUB_APP_PRIVATE_KEY=<PEM key, base64-encoded if long — see below>
GITHUB_WEBHOOK_SECRET=<the secret you set in step 1>
GITHUB_API_BASE=https://api.github.com

# GitHub OAuth App (per-user handle read)
GITHUB_CLIENT_ID=<client id from step 2>
GITHUB_CLIENT_SECRET=<client secret from step 2>

# Turn off mock mode for live integration
USE_MOCK_GITHUB=false
```

### Encoding the private key

The `.env` file treats newlines as line breaks. Base64-encode the PEM key:

```bash
# macOS
base64 < github-app-key.pem | tr -d '\n' > /dev/null
# or simply inline it with escaped newlines:
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
```

## 4. Install the GitHub App on your repo

1. Go to https://github.com/apps/vercode/installations/new
   (or: your repo → Settings → Install app → find `vercode` → Install).
2. Select the repositories you want VERCODE to review.
3. Click **Install**.

GitHub will POST an `installation` webhook event to your API. If the API
is running with `USE_MOCK_GITHUB=false` and the webhook URL is reachable,
the installation is recorded and the repos are upserted into Postgres.

## 5. Set your API's public webhook URL

In the GitHub App settings, set:

- **Webhook URL**: `https://your-api-host/api/v1/webhooks/github`
- **Webhook secret**: the same value as `GITHUB_WEBHOOK_SECRET` in `.env`

For local dev with a tunnel (e.g. `cloudflared` or `ngrok`):

```bash
cloudflared tunnel --url http://localhost:4000
# copy the https://...trycloudflare.com URL as the Webhook URL in GitHub
```

## 6. Verify the full flow

```bash
# 1. Start the API
cd apps/api && pnpm start

# 2. Start the web app
cd apps/web && pnpm start

# 3. Open a PR in a connected repo
#    → VERCODE's webhook fires, a review job is enqueued,
#      the worker publishes findings + verdict to the PR.

# 4. In the dashboard:
#    /overview should show the connected install + repos
#    /reviews should show the review job
```
