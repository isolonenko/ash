FROM denoland/deno:2.0.0

WORKDIR /app

# Cache dependencies first
COPY deno.json ./
RUN deno install

# Copy source
COPY src/ src/

EXPOSE 8000

CMD ["deno", "run", "--allow-net", "--allow-env", "--allow-read", "src/index.ts"]
