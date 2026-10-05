# syntax=docker/dockerfile:1
# Numeria API (numeria-server). Build context is the repository root, as in
# Dokploy with an empty Docker Context Path:
#   docker build -f codes/backrust/Dockerfile --build-arg GIT_SHA=$(git rev-parse HEAD) .

# Same toolchain as rust-toolchain.toml (not copied: rustup would fetch its wasm target too).
FROM rust:1.98.1-slim-trixie AS builder
WORKDIR /build
COPY codes/backrust/Cargo.toml codes/backrust/Cargo.lock ./
COPY codes/backrust/core ./core
COPY codes/backrust/content-cli ./content-cli
COPY codes/backrust/server ./server
RUN cargo build --release --locked -p numeria-server

FROM debian:trixie-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --create-home --uid 1001 numeria
ARG GIT_SHA=dev
ENV GIT_SHA=${GIT_SHA} PORT=3321 CONTENT_DIR=/srv/content
COPY --from=builder /build/target/release/numeria-server /usr/local/bin/numeria-server
# The item bank Class Match plays, the same files the headset bundles.
COPY codes/content/templates /srv/content/templates
COPY codes/content/contoh /srv/content/contoh
COPY codes/content/skills.json /srv/content/skills.json
USER numeria
EXPOSE 3321
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -fsS http://127.0.0.1:3321/health || exit 1
CMD ["numeria-server"]
