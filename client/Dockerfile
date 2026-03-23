FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

ARG VITE_SIGNALING_URL
ENV VITE_SIGNALING_URL=${VITE_SIGNALING_URL}

RUN pnpm run build

# Output stage — copies dist to volume mount point
FROM alpine:3.20

COPY --from=builder /app/dist /app/dist

CMD ["cp", "-r", "/app/dist/.", "/output/"]
