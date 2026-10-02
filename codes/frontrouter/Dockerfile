# syntax=docker/dockerfile:1
# Numeria web pages (SPA, static). Build context is the repository root:
#   docker build -f codes/frontrouter/Dockerfile --build-arg GIT_SHA=$(git rev-parse HEAD) .
FROM oven/bun:1.4.2-alpine AS build
WORKDIR /app
COPY codes/frontrouter/package.json codes/frontrouter/bun.lock ./
RUN bun install --frozen-lockfile
COPY codes/frontrouter ./
# The admin page signs in with Firebase; its web config is public by design.
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_APP_ID
RUN bun run build

FROM nginx:1.31.6-alpine
COPY codes/frontrouter/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build/client /usr/share/nginx/html
# A .gz beside every file that compresses, for nginx's gzip_static.
RUN find /usr/share/nginx/html -type f \( -name '*.js' -o -name '*.css' -o -name '*.json' -o -name '*.svg' -o -name '*.html' \) \
      -exec sh -c 'gzip -9 -c "$1" > "$1.gz"' _ {} \;
ARG GIT_SHA=dev
RUN printf '{"sha":"%s"}\n' "$GIT_SHA" > /usr/share/nginx/html/version.json
EXPOSE 80
