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

RUN apk add --no-cache sqlite ca-certificates tzdata curl wget

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
ENV TZ=Asia/Ho_Chi_Minh

EXPOSE 8090

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://localhost:8090/api/health || exit 1

CMD ["sh", "-c", "mkdir -p \"${DATA_DIR:-/app/data}\" && for f in /app/seed-data/*.json; do [ -f \"${DATA_DIR:-/app/data}/$(basename \"$f\")\" ] || cp \"$f\" \"${DATA_DIR:-/app/data}/\"; done && exec ./server"]
