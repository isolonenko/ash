FROM node:22-alpine

WORKDIR /app

COPY client/package.json client/package-lock.json ./client/
RUN cd client && npm ci

COPY shared/ ./shared/
COPY client/ ./client/

WORKDIR /app/client

EXPOSE 5173

CMD ["npx", "vite", "--host", "0.0.0.0"]
