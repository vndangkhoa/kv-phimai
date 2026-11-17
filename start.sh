#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
export PORT="${PORT:-8090}"
export KVTUBE_URL="${KVTUBE_URL:-https://u.khoavo.vndns.net}"

PIDS=()
cleanup() {
  for pid in "${PIDS[@]:-}"; do
    if [ -n "$pid" ]; then
      kill "$pid" 2>/dev/null || true
    fi
  done
}
trap cleanup SIGINT SIGTERM EXIT

CMD="${1:-serve}"
shift || true

build_backend() {
  echo "[KV-PhimAI] Building Go backend..."
  (cd "$BACKEND_DIR" && go build -o server ./cmd/server)
}

build_frontend() {
  if [ -f "$FRONTEND_DIR/package.json" ]; then
    echo "[KV-PhimAI] Building React frontend..."
    (cd "$FRONTEND_DIR" && npm run build)
  fi
}

case "$CMD" in
  serve|backend)
    build_backend
    echo "[KV-PhimAI] Starting server on http://localhost:${PORT} (KV-Tube: ${KVTUBE_URL})..."
    cd "$BACKEND_DIR" && exec ./server
    ;;
  build)
    build_backend
    build_frontend
    ;;
  frontend)
    cd "$FRONTEND_DIR" && exec npm run dev
    ;;
  all)
    build_backend
    (cd "$BACKEND_DIR" && exec ./server) &
    PIDS+=($!)
    (cd "$FRONTEND_DIR" && exec npm run dev) &
    PIDS+=($!)
    wait
    ;;
  docker)
    exec docker compose -f "$ROOT_DIR/docker-compose.yml" up --build "$@"
    ;;
  *)
    echo "Usage: ./start.sh [serve|backend|frontend|build|all|docker]"
    exit 1
    ;;
esac
