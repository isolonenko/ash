FROM denoland/deno:2.0.0 AS build

WORKDIR /app

COPY deno.json ./
RUN deno install

COPY src/ src/
RUN deno compile --allow-net --allow-env --allow-read --output server src/index.ts

FROM gcr.io/distroless/cc-debian12

COPY --from=build /app/server /server

EXPOSE 8000

ENTRYPOINT ["/server"]
