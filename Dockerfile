# Stage 1: Build Frontend SPA (React 19 + Vite + Tailwind CSS)
FROM --platform=linux/amd64 node:22-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci || npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Build Go Backend (Chi + SQLite)
FROM --platform=linux/amd64 golang:1.25-alpine AS backend-builder
WORKDIR /app/backend
COPY backend/ ./
RUN if [ -d "vendor" ]; then \
        CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -mod=vendor -ldflags="-w -s" -o server ./cmd/server; \
    else \
        go mod download && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-w -s" -o server ./cmd/server; \
    fi

# Stage 3: Final Single-Container Runtime (linux/amd64 for Synology NAS & Docker)
FROM --platform=linux/amd64 alpine:latest AS final
WORKDIR /app

RUN apk add --no-cache sqlite ca-certificates tzdata curl wget unzip && \
    wget -q -O /tmp/usque.zip "https://github.com/Diniboy1123/usque/releases/download/v4.2.1/usque_4.2.1_linux_amd64.zip" && \
    unzip -oq /tmp/usque.zip usque -d /usr/local/bin/ && \
    chmod 0755 /usr/local/bin/usque && \
    rm -f /tmp/usque.zip

# Copy compiled Go binary and seeded catalog data
COPY --from=backend-builder /app/backend/server ./server
COPY --from=backend-builder /app/backend/data ./data
COPY --from=backend-builder /app/backend/data ./seed-data

# Copy built React SPA static bundle
COPY --from=frontend-builder /app/frontend/dist ./dist

ENV PORT=8090
ENV DATA_DIR=/app/data
ENV DATABASE_URL=/app/data/phimai.db
ENV KVTUBE_URL=https://u.khoavo.vndns.net
ENV WARP_PROXY=http://127.0.0.1:29083
ENV TZ=Asia/Ho_Chi_Minh

EXPOSE 8090

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://localhost:8090/api/health || exit 1

CMD ["sh", "-c", "mkdir -p \"${DATA_DIR:-/app/data}\" \"${DATA_DIR:-/app/data}/warp\" && for f in /app/seed-data/*.json; do [ -f \"${DATA_DIR:-/app/data}/$(basename \"$f\")\" ] || cp \"$f\" \"${DATA_DIR:-/app/data}/\"; done && (if [ ! -s \"${DATA_DIR:-/app/data}/warp/config.json\" ]; then /usr/local/bin/usque register --accept-tos -c \"${DATA_DIR:-/app/data}/warp/config.json\" >/tmp/usque-reg.log 2>&1 || true; fi; if [ -s \"${DATA_DIR:-/app/data}/warp/config.json\" ]; then chmod 0600 \"${DATA_DIR:-/app/data}/warp/config.json\" && /usr/local/bin/usque -c \"${DATA_DIR:-/app/data}/warp/config.json\" http-proxy --always-reconnect -b 127.0.0.1 -p 29083 -d 1.1.1.1 -d 2606:4700:4700::1111 >/tmp/usque.log 2>&1; fi) & exec ./server"]
