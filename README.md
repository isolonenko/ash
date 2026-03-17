# the-chat

Private, peer-to-peer encrypted chat. No accounts, no servers storing messages — just you and the person you're talking to.

Built with WebRTC for direct peer-to-peer connections. A lightweight signaling server helps peers find each other, then gets out of the way.

## Deploy

You need a VPS with a public IP and a domain pointing to it (DNS A record).

```bash
git clone https://github.com/isolonenko/the-chat.git && cd the-chat
sudo ./deploy/bootstrap.sh --domain chat.yourdomain.com --email you@example.com
```

That's it. The script installs Docker, sets up HTTPS, and starts everything.

See [DEPLOYMENT.md](DEPLOYMENT.md) for DNS setup, updates, logs, and troubleshooting.

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
