# Deployment Guide

Deploy the-chat on any VPS with a single command. No external providers needed.

## Prerequisites

1. **A VPS** with a public IP address (any Linux distro — Ubuntu, Debian, Fedora, etc.)
2. **A domain name** with DNS A record pointing to your VPS IP
3. That's it. The script installs Docker if it's missing.

## Quick Start

```bash
sudo ./deploy/bootstrap.sh --domain chat.yourdomain.com --email you@example.com
```

This will:
1. Install Docker + Docker Compose (if not present)
2. Generate a TURN shared secret
3. Detect your server's public IP
4. Build the React client
5. Start three containers: Caddy (HTTPS + static files), Deno (signaling server), coturn (TURN relay)
6. Wait for HTTPS to become healthy (Caddy auto-provisions a Let's Encrypt certificate)
7. Print the live URL

## What Gets Deployed

| Container | Role | Ports |
|-----------|------|-------|
| **Caddy** | Reverse proxy, auto-TLS, serves React client | 80, 443 |
| **Deno server** | WebSocket signaling, presence, TURN credentials | 8000 (internal) |
| **coturn** | TURN/STUN relay for NAT traversal | 3478, 5349, 49152-65535 (UDP) |

All services use a single domain. Caddy routes traffic:
- `/signal/*` → Deno (WebSocket)
- `/presence/*` → Deno (HTTP)
- `/turn-credentials/*` → Deno (HTTP)
- `/health` → Deno (HTTP)
- Everything else → static React client

## Operations

### View Logs

```bash
docker compose -f deploy/docker-compose.yml logs -f          # All services
docker compose -f deploy/docker-compose.yml logs -f caddy     # Caddy only
docker compose -f deploy/docker-compose.yml logs -f server    # Deno server only
docker compose -f deploy/docker-compose.yml logs -f coturn    # TURN relay only
```

### Update

```bash
git pull
sudo ./deploy/bootstrap.sh --domain chat.yourdomain.com --email you@example.com
```

### Stop

```bash
docker compose -f deploy/docker-compose.yml down
```

### Uninstall (removes all data including TLS certs)

```bash
docker compose -f deploy/docker-compose.yml down -v
```

## TLS Certificates

Caddy automatically provisions and renews Let's Encrypt certificates. No manual configuration needed. The email address is used for Let's Encrypt account registration and expiry notifications.

coturn uses Caddy's certificates for TURN-over-TLS on port 5349 (standard TURNS port), providing encrypted relay for clients behind restrictive NATs.

## Local Development

```bash
# Client (terminal 1)
cd client && npm run dev

# Server (terminal 2)
cd server && deno task dev
```

The client dev server defaults to `ws://localhost:8000` for signaling. The Deno dev server starts on port 8000 with file watching.

## Environment Variables

The bootstrap script auto-generates all configuration. For reference:

| Variable | Where | Purpose |
|----------|-------|---------|
| `DOMAIN` | `deploy/.env` | Your domain name |
| `EMAIL` | `deploy/.env` | Let's Encrypt registration email |
| `TURN_SECRET` | `deploy/.env` | HMAC shared secret for TURN credentials (auto-generated) |
| `EXTERNAL_IP` | `deploy/.env` | Server's public IP (auto-detected) |

## Troubleshooting

### Health check times out

The most common cause is DNS not pointing to the server. Verify:

```bash
dig +short chat.yourdomain.com
```

This should return your VPS's public IP. If not, update your DNS and wait for propagation.

### WebRTC connection fails

1. Check coturn is running: `docker compose -f deploy/docker-compose.yml ps coturn`
2. Verify TURN credentials: `curl https://chat.yourdomain.com/turn-credentials`
3. Test TURN connectivity at https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/

### Caddy can't provision TLS

1. Ensure ports 80 and 443 are open in your firewall
2. Ensure no other service is using ports 80/443
3. Check Caddy logs: `docker compose -f deploy/docker-compose.yml logs caddy`
