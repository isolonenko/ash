FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ARG VITE_SIGNALING_URL
ENV VITE_SIGNALING_URL=${VITE_SIGNALING_URL}

RUN npm run build

# Output stage — copies dist to volume mount point
FROM alpine:3.20

COPY --from=builder /app/dist /app/dist

CMD ["cp", "-r", "/app/dist/.", "/output/"]
