# syntax=docker/dockerfile:1
# Numeria web pages (SPA, static). Build context is the repository root:
#   docker build -f codes/frontrouter/Dockerfile --build-arg GIT_SHA=$(git rev-parse HEAD) .
FROM oven/bun:1.4.2-alpine AS build
WORKDIR /app
COPY codes/frontrouter/package.json codes/frontrouter/bun.lock ./
RUN bun install --frozen-lockfile
COPY codes/frontrouter ./
RUN bun run build

FROM nginx:1.31.6-alpine
COPY codes/frontrouter/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build/client /usr/share/nginx/html
ARG GIT_SHA=dev
RUN printf '{"sha":"%s"}\n' "$GIT_SHA" > /usr/share/nginx/html/version.json
EXPOSE 80
