FROM denoland/deno:2.3.2

WORKDIR /app

COPY deno.json deno.lock ./
RUN deno install

COPY . .

EXPOSE 8080

CMD ["deno", "run", "--allow-net", "--allow-env", "main.ts"]
