# syntax=docker/dockerfile:1
# The headset game, served at /play. Build context is the repository root:
#   docker build -f codes/xrclient/Dockerfile --build-arg GIT_SHA=$(git rev-parse HEAD) \
#     --build-arg VITE_FIREBASE_API_KEY=... (and the other three) .

# 1. The shared core as WebAssembly (src/wasm/pkg is not in git).
FROM rust:1.98.1-slim-trixie AS wasm
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && rustup target add wasm32-unknown-unknown \
    && curl -fsSL https://github.com/wasm-bindgen/wasm-bindgen/releases/download/0.2.129/wasm-bindgen-0.2.129-x86_64-unknown-linux-musl.tar.gz \
       | tar -xz -C /usr/local/bin --strip-components=1 wasm-bindgen-0.2.129-x86_64-unknown-linux-musl/wasm-bindgen
WORKDIR /build
COPY codes/backrust ./
RUN cargo build --locked -p foldlings-core --target wasm32-unknown-unknown --release --features wasm \
    && wasm-bindgen --target web --out-dir /pkg target/wasm32-unknown-unknown/release/foldlings_core.wasm

# 2. The game.
FROM oven/bun:1.4.2-alpine AS build
WORKDIR /src/codes/xrclient
COPY codes/xrclient/package.json codes/xrclient/bun.lock ./
RUN bun install --frozen-lockfile
COPY codes/content /src/codes/content
COPY codes/xrclient ./
COPY --from=wasm /pkg ./src/wasm/pkg
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_APP_ID
ENV NODE_ENV=production
RUN bun run build

FROM nginx:1.31.6-alpine
COPY codes/xrclient/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/codes/xrclient/dist /usr/share/nginx/html/play
ARG GIT_SHA=dev
RUN printf '{"sha":"%s"}\n' "$GIT_SHA" > /usr/share/nginx/html/play/version.json
EXPOSE 80
