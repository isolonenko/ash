# Contributing

Thanks for your interest in Ash. Here's how to get started.

## Setup

You'll need [Node.js 22+](https://nodejs.org/), [pnpm](https://pnpm.io/), and [Deno 2+](https://deno.com/).

```bash
# Client
cd client
cp .env.example .env
pnpm install
pnpm dev

# Server (separate terminal)
cd server
deno task dev
```

The client connects to `ws://localhost:8000` for signaling by default.

## Before Submitting a PR

### Client

```bash
cd client
pnpm tsc -b        # type check
pnpm run lint       # eslint
pnpm test           # vitest
```

### Server

```bash
cd server
deno fmt --check    # formatting
deno lint           # linter
deno check src/**/*.ts  # type check
deno test --allow-all   # tests
```

CI runs all of the above on every PR.

## Project Structure

```
client/          React + Vite, WebRTC peer connections
  src/
    components/  UI components
    lib/rtc/     WebRTC client, peer management, media
    hooks/       React hooks
    stores/      Zustand state
server/          Deno + Hono, WebSocket signaling
  src/
    routes/      HTTP and WebSocket handlers
    lib/         Room management, rate limiting
deploy/          Docker, Caddy, coturn configs
```

## Guidelines

- Keep PRs focused — one thing per PR.
- Add tests for new logic when possible.
- Follow existing patterns in the codebase.
