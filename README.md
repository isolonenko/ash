# the-chat

Private, peer-to-peer encrypted chat. No accounts, no servers storing messages — just you and the person you're talking to.

Built with WebRTC for direct peer-to-peer connections. A lightweight signaling server helps peers find each other, then gets out of the way.

## Self-Hosted Deployment

Deploy on any VPS with a single command. You need:

1. A VPS with a public IP (any Linux distro)
2. A domain name with DNS pointing to your VPS

```bash
sudo ./deploy/bootstrap.sh --domain chat.yourdomain.com --email you@example.com
```

This sets up everything automatically:
- **Caddy** — HTTPS reverse proxy with auto-provisioned Let's Encrypt certificates
- **Deno signaling server** — WebSocket signaling, presence, TURN credential generation
- **coturn** — TURN/STUN relay for NAT traversal

No external providers. No accounts. No tracking. Your server, your rules.

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed operations guide.

## Local Development

```bash
# Client
cd client && npm run dev

# Server
cd server && deno task dev
```

## Architecture

- **Client**: React + Vite, WebRTC peer connections
- **Server**: Deno + Hono, WebSocket signaling, in-memory state
- **TURN relay**: coturn with time-limited HMAC credentials
- **TLS**: Caddy auto-provisions Let's Encrypt certificates

All communication between peers is encrypted end-to-end via WebRTC. The server only facilitates the initial connection handshake.

## License

MIT
