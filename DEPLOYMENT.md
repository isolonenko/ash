# Deployment Guide

This guide covers deploying all components of the-chat application to production.

## Overview

The application consists of two deployed components:

1. **React Client** — Hosted on Netlify (auto-deploys from GitHub)
2. **Signaling Server** — Cloudflare Worker with Durable Objects + KV

TURN relay is provided by [Metered](https://www.metered.ca/) (managed service) — the CF Worker proxies credentials to keep the API key server-side.

## Prerequisites

- **Cloudflare account** — For signaling server hosting ([dash.cloudflare.com](https://dash.cloudflare.com))
- **Netlify account** — For client hosting ([netlify.com](https://netlify.com))
- **Metered account** — For TURN relay ([metered.ca](https://www.metered.ca/)) — free tier: 500 GB/month
- **GitHub repository** — For CI/CD automation

## Bootstrapping Order

Deploy in this order because each component depends on the previous one's URL:

1. **Metered TURN** (sign up) → get API key and app name
2. **Signaling Server** (Cloudflare Workers) → requires Metered credentials, generates Worker URL
3. **Client** (Netlify) → requires signaling server URL

## Step 1: Metered TURN (Managed Service)

1. Sign up at [metered.ca](https://www.metered.ca/)
2. Create a new app (or use the default one)
3. Note these values from the dashboard:
   - **App Name** — the subdomain part (e.g., `the-chat`)
   - **API Key** — found in the API section

No server setup needed — Metered handles TURN infrastructure globally.

## Step 2: Signaling Server (Cloudflare Workers)

### Install Wrangler

```bash
cd server
npm install
```

### Login to Cloudflare

```bash
npx wrangler login
```

### Create KV Namespace

```bash
npx wrangler kv namespace create PRESENCE
```

Copy the `id` from the output and replace `placeholder-create-with-wrangler-kv-namespace-create` in `server/wrangler.jsonc`.

### Set Runtime Secrets

```bash
npx wrangler secret put METERED_API_KEY      # paste your Metered API key
npx wrangler secret put METERED_APP_NAME     # paste your Metered app name
```

### Deploy

```bash
npm run deploy
```

This runs `wrangler deploy` and outputs your Worker URL (e.g., `https://the-chat-server.<subdomain>.workers.dev`).

### Verify Deployment

**Health check:**
```bash
curl https://the-chat-server.<subdomain>.workers.dev/health
```

Expected response:
```json
{"status":"ok","service":"the-chat-server","timestamp":"..."}
```

**TURN credentials endpoint:**
```bash
curl https://the-chat-server.<subdomain>.workers.dev/turn-credentials
```

Expected response (proxied from Metered):
```json
{
  "iceServers": [
    {"urls":"stun:a.relay.metered.ca:80"},
    {"urls":"turn:a.relay.metered.ca:80","username":"...","credential":"..."},
    {"urls":"turn:a.relay.metered.ca:443","username":"...","credential":"..."},
    {"urls":"turn:a.relay.metered.ca:443?transport=tcp","username":"...","credential":"..."}
  ]
}
```

If you get a 503 error, verify that `METERED_API_KEY` and `METERED_APP_NAME` are set correctly.

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
   - **Value:** `wss://the-chat-server.<subdomain>.workers.dev`

**Important:** Use `wss://` (WebSocket Secure), not `ws://`.

### Deploy

Netlify auto-deploys when you push to the `main` branch. The initial deployment starts immediately after connecting the repository.

## Environment Variables Reference

| Variable | Service | Where to Set | Example |
|----------|---------|--------------|---------|
| `METERED_API_KEY` | CF Worker | `wrangler secret put` | (from Metered dashboard) |
| `METERED_APP_NAME` | CF Worker | `wrangler secret put` | `the-chat` |
| `VITE_SIGNALING_URL` | Client | Netlify UI | `wss://the-chat-server.xxx.workers.dev` |

## Secrets Management

### METERED_API_KEY / METERED_APP_NAME

Set via `wrangler secret put`. The Worker uses these to proxy TURN credential requests to Metered's API, keeping the API key server-side.

To rotate:
1. Generate a new API key in the Metered dashboard
2. Update: `npx wrangler secret put METERED_API_KEY`

### VITE_SIGNALING_URL

This is **not a secret** but is deployment-specific. It's set in the Netlify UI and baked into the client build.

Use the WebSocket Secure protocol: `wss://the-chat-server.<subdomain>.workers.dev`

## Local Development

```bash
# Start the client dev server
cd client && npm run dev

# Start the CF Worker locally (separate terminal)
cd server && npm run dev
```

`npm run dev` in the server runs `wrangler dev`, which starts a local Worker with Durable Objects and KV.

**Note:** TURN credentials require `METERED_API_KEY` and `METERED_APP_NAME` to be set. Create a `.dev.vars` file in `server/`:

```
METERED_API_KEY=your-api-key
METERED_APP_NAME=your-app-name
```

If TURN is not configured, the client falls back to STUN-only (direct connections still work on most networks).

## Troubleshooting

### TURN Credential 503 Error

**Symptom:** `/turn-credentials` returns 503.

**Cause:** `METERED_API_KEY` or `METERED_APP_NAME` not set.

**Fix:**
```bash
npx wrangler secret put METERED_API_KEY
npx wrangler secret put METERED_APP_NAME
```

### TURN Credential 502 Error

**Symptom:** `/turn-credentials` returns 502.

**Cause:** Metered API is unreachable or returning errors (wrong app name, expired key, etc.)

**Fix:**
1. Verify your Metered app name and API key in the Metered dashboard
2. Test directly: `curl "https://<app-name>.metered.live/api/v1/turn/credentials?apiKey=<key>"`

### Client Can't Connect to Signaling Server

**Symptom:** "Connecting..." appears indefinitely in the UI.

**Causes:**
1. `VITE_SIGNALING_URL` not set in Netlify
2. Using `ws://` instead of `wss://`
3. Wrong Worker URL

**Fix:**
1. Go to Netlify **Site settings** → **Environment variables**
2. Verify `VITE_SIGNALING_URL` is set to `wss://the-chat-server.<subdomain>.workers.dev`
3. Trigger a rebuild in Netlify (env var changes require rebuild)

### TURN Authentication Fails

**Symptom:** WebRTC connection fails, console shows ICE gathering errors.

**Causes:**
1. Metered credentials not configured on Worker
2. Metered account issue (quota exceeded, expired)

**Fix:**
1. Check `/turn-credentials` endpoint returns valid ICE servers
2. Check Metered dashboard for usage/status
3. Test TURN connectivity: https://webrtc.github.io/samples/web/content/trickle-ice/

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
