# Deployment Guide

This guide covers deploying all three components of the-chat application to production.

## Overview

The application consists of three deployed components:

1. **React Client** — Hosted on Netlify (auto-deploys from GitHub)
2. **Signaling Server** — Node.js WebSocket server on Fly.io (auto-deploys via GitHub Actions)
3. **TURN Server (coturn)** — Media relay server on Hetzner VPS (manual deployment)

## Prerequisites

- **Fly.io account** — For signaling server hosting ([fly.io](https://fly.io))
- **Netlify account** — For client hosting ([netlify.com](https://netlify.com))
- **Hetzner VPS** — CX22 instance ($4/month) for coturn ([hetzner.com](https://hetzner.com))
- **Domain name** — For TURN server (e.g., `turn.yourdomain.com`)
- **GitHub repository** — For CI/CD automation

## Bootstrapping Order

Deploy in this order because each component depends on the previous one's URL:

1. **coturn TURN Server** (Hetzner VPS) → generates TURN server URL
2. **Signaling Server** (Fly.io) → requires TURN URL, generates signaling URL
3. **Client** (Netlify) → requires signaling URL

## Step 1: coturn TURN Server (Hetzner VPS)

### Full Setup Guide

See [`coturn/PRODUCTION.md`](coturn/PRODUCTION.md) for comprehensive setup instructions including:
- VPS provisioning and firewall configuration
- DNS setup for your domain
- Let's Encrypt TLS certificate installation
- Docker-based coturn deployment

### Critical Configuration

When setting up coturn, note these values:

**`static-auth-secret`** in `/opt/coturn/turnserver.conf`:
```
static-auth-secret=<CHANGE_ME>
```

This secret **must match** the `TURN_SHARED_SECRET` you'll set on the Fly.io signaling server in Step 2.

**TURN server URL** format after deployment:
```
turn:<your-domain>:3478
```

Example: `turn:turn.example.com:3478`

## Step 2: Signaling Server (Fly.io)

### Create Fly.io App

```bash
fly apps create <your-app-name>
```

Or use the default app name `thechat-signal` defined in `server/fly.toml`.

### Configure App Name

Edit `server/fly.toml` if you want a different app name:

```toml
app = "your-custom-name"
```

### Set Runtime Secrets

Set the environment variables required by the signaling server:

```bash
fly secrets set \
  TURN_SHARED_SECRET=<your-secret> \
  TURN_SERVER_URL=turn:<your-domain>:3478
```

**Important:**
- `TURN_SHARED_SECRET` must match the `static-auth-secret` in your coturn configuration
- `TURN_SERVER_URL` should use the domain you configured for coturn in Step 1

### Deploy

Deploy the signaling server from the `server/` directory:

```bash
cd server
fly deploy --remote-only
```

The `--remote-only` flag builds the Docker image on Fly.io's servers (no local Docker required).

### Verify Deployment

**Health check:**
```bash
curl https://<your-app>.fly.dev/health
```

Expected response:
```json
{"status":"ok"}
```

**TURN credentials endpoint:**
```bash
curl https://<your-app>.fly.dev/turn-credentials
```

Expected response (ephemeral credentials):
```json
{
  "urls": ["turn:turn.example.com:3478"],
  "username": "1740182400",
  "credential": "generatedHmacPasswordHash"
}
```

If you get a 503 error, verify that `TURN_SHARED_SECRET` is set correctly.

## Step 3: Client (Netlify)

### Connect Repository

1. Log in to [Netlify](https://netlify.com)
2. Click "Add new site" → "Import an existing project"
3. Connect your GitHub repository
4. Select the `the-chat` repository

### Build Settings

Netlify auto-detects build settings from `netlify.toml`:

```toml
[build]
  base = "."
  command = "cd client && npm ci && npm run build"
  publish = "client/dist"
```

No manual configuration needed.

### Set Environment Variable

In the Netlify UI, configure the signaling server URL:

1. Go to **Site settings** → **Environment variables**
2. Add a new variable:
   - **Key:** `VITE_SIGNALING_URL`
   - **Value:** `wss://<your-app>.fly.dev`
   
   Replace `<your-app>` with your Fly.io app name from Step 2.

**Important:** Use `wss://` (WebSocket Secure), not `ws://`.

### Deploy

Netlify auto-deploys when you push to the `main` branch. The initial deployment starts immediately after connecting the repository.

## Step 4: GitHub Actions CI/CD

### Generate Fly.io Deploy Token

Generate a deploy token for GitHub Actions:

```bash
fly tokens create deploy -a <your-app-name>
```

Copy the token (starts with `FlyV1_`).

### Add GitHub Secret

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add:
   - **Name:** `FLY_API_TOKEN`
   - **Secret:** Paste the token from the previous step

### Auto-Deployment Behavior

The `.github/workflows/deploy-server.yml` workflow is configured to:

- **Trigger:** Push to `main` branch
- **Path filter:** Only when files in `server/**` or `shared/**` change
- **Action:** Run `flyctl deploy --remote-only` in the `server/` directory

The client auto-deploys via Netlify's built-in GitHub integration (no workflow needed).

## Environment Variables Reference

| Variable | Service | Where to Set | Example |
|----------|---------|--------------|---------|
| `TURN_SHARED_SECRET` | Signaling Server | `fly secrets set` | (random string, same as coturn) |
| `TURN_SERVER_URL` | Signaling Server | `fly secrets set` | `turn:turn.example.com:3478` |
| `PORT` | Signaling Server | `fly.toml` (auto) | `8080` |
| `VITE_SIGNALING_URL` | Client | Netlify UI | `wss://thechat-signal.fly.dev` |
| `static-auth-secret` | coturn | `turnserver.prod.conf` | (same as TURN_SHARED_SECRET) |

## Secrets Management

### TURN_SHARED_SECRET

This secret must be **identical** in two places:

1. **Fly.io signaling server** — Set via `fly secrets set TURN_SHARED_SECRET=...`
2. **coturn VPS** — Set in `/opt/coturn/turnserver.conf` as `static-auth-secret=...`

The signaling server uses this secret to generate ephemeral TURN credentials using HMAC-SHA1. When clients authenticate to coturn with these credentials, coturn validates them using the same shared secret.

**If the secrets don't match, TURN authentication will fail.**

To update the secret:

1. Update coturn config: Edit `/opt/coturn/turnserver.conf` and change `static-auth-secret`
2. Restart coturn: `docker restart coturn`
3. Update Fly.io: `fly secrets set TURN_SHARED_SECRET=<new-secret>`

### FLY_API_TOKEN

This is a **GitHub repository secret only**, used for CI/CD deployments. It's not used at runtime by the signaling server.

Generate via: `fly tokens create deploy -a <your-app-name>`

### VITE_SIGNALING_URL

This is **not a secret** but is deployment-specific. It's set in the Netlify UI and baked into the client build.

Use the WebSocket Secure protocol: `wss://<your-app>.fly.dev`

## Local Development

Local development continues to work with `docker compose up`:

```bash
docker compose up
```

This starts:
- Client at `http://localhost:5173`
- Server at `http://localhost:8080`
- Local coturn (no TLS, using static credentials)

**No production environment variables are needed for local development.**

## Troubleshooting

### TURN Credential 503 Error

**Symptom:** `curl https://<your-app>.fly.dev/turn-credentials` returns 503.

**Cause:** `TURN_SHARED_SECRET` not set on Fly.io.

**Fix:**
```bash
fly secrets set TURN_SHARED_SECRET=<your-secret>
```

### WebSocket Disconnects Frequently

**Symptom:** Client loses connection to signaling server.

**Cause:** Fly.io auto-stops idle machines by default.

**Fix:** Verify `auto_stop_machines = "off"` in `server/fly.toml`:
```toml
[http_service]
  auto_stop_machines = "off"
  auto_start_machines = true
  min_machines_running = 1
```

Redeploy: `fly deploy --remote-only`

### Netlify 404 on Page Refresh

**Symptom:** Navigating to `/room/123` directly returns 404.

**Cause:** Netlify serves static files, doesn't handle React Router.

**Fix:** Verify redirect rules in `netlify.toml`:
```toml
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

This should already be configured. If not, add it and redeploy.

### Client Can't Connect to Signaling Server

**Symptom:** "Connecting..." appears indefinitely in the UI.

**Causes:**
1. `VITE_SIGNALING_URL` not set in Netlify
2. Using `ws://` instead of `wss://`
3. Wrong Fly.io app URL

**Fix:**
1. Go to Netlify **Site settings** → **Environment variables**
2. Verify `VITE_SIGNALING_URL` is set to `wss://<your-app>.fly.dev`
3. Trigger a rebuild in Netlify (env var changes require rebuild)

### TURN Authentication Fails

**Symptom:** WebRTC connection fails, console shows ICE gathering errors.

**Causes:**
1. `TURN_SHARED_SECRET` mismatch between Fly.io and coturn
2. coturn not running
3. Firewall blocking ports

**Fix:**
1. Verify secrets match:
   - Fly.io: `fly secrets list`
   - coturn: `cat /opt/coturn/turnserver.conf | grep static-auth-secret`
2. Check coturn logs: `docker logs coturn | grep -i auth`
3. Verify firewall rules on Hetzner VPS: `ufw status`
4. Test TURN connectivity: https://webrtc.github.io/samples/web/content/trickle-ice/

### GitHub Actions Deploy Fails

**Symptom:** Workflow fails with "Error: failed to fetch an image or build from source".

**Causes:**
1. `FLY_API_TOKEN` not set in GitHub secrets
2. Token expired or invalid
3. Fly.io app doesn't exist

**Fix:**
1. Verify secret exists: GitHub repo → **Settings** → **Secrets** → **Actions**
2. Regenerate token: `fly tokens create deploy -a <your-app-name>`
3. Update GitHub secret with new token
4. Verify app exists: `fly apps list`
