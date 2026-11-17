# KV-PhimAI

Self-hosted Vietnamese AI-film streaming site: a curated catalog of 9,000+ AI films and short dramas (Vietnamese dubbed / subtitled), auto-updated with new releases, with series episode grouping, adaptive-quality playback, ratings and timestamped comments.

One container: Go (Chi + SQLite) backend + React SPA.

> [!IMPORTANT]
> **PhimAI does not include a video backend.** It only plays videos through an **Invidious + Invidious Companion** server that you run yourself — either inside **[KV-Tube](https://github.com/vndangkhoa/kv-tube)** (easiest) or a standalone Invidious install. Without one, the catalog can be browsed but nothing plays, and the site shows a "Chưa kết nối máy chủ phát video" notice.

---

## Self-hosting

### 1. Get a video backend (pick one)

| Option | What you run | Address to give PhimAI |
|---|---|---|
| **A. KV-Tube** (recommended) | [KV-Tube](https://github.com/vndangkhoa/kv-tube) via its Docker Compose stack, or the KV-Tube SPK for Synology. It already bundles Invidious, Companion and a WARP proxy. (Not KV-Tube's single-container "all-in-one" image — that one has no Invidious.) | The KV-Tube web address (port `3241` by default), e.g. `http://192.168.1.10:3241` or `https://kvtube.example.com` → `KVTUBE_URL` |
| **B. Invidious + Companion** | Your own [Invidious](https://docs.invidious.io/installation/) with [Invidious Companion](https://github.com/iv-org/invidious-companion), with Companion reachable at `/companion/` (the standard Invidious reverse-proxy setup). | The Invidious address → `INVIDIOUS_UPSTREAM` (and `COMPANION_URL` if Companion is on a different host) |

PhimAI talks to the backend **server-to-server**, so the address only needs to be reachable from the PhimAI container (a LAN IP is fine). Viewers never connect to it directly.

### 2. Configure PhimAI

| Variable | Required | Meaning |
|---|---|---|
| `KVTUBE_URL` | Option A | KV-Tube base URL. PhimAI uses `<KVTUBE_URL>/api/invidious` (Invidious API) and `<KVTUBE_URL>/companion` (Companion). |
| `INVIDIOUS_UPSTREAM` | Option B | Invidious API root, e.g. `https://invidious.example.com`. Overrides the one derived from `KVTUBE_URL`. |
| `COMPANION_URL` | Optional | Host that serves `/companion/...`. Defaults to `KVTUBE_URL`, otherwise to the Invidious host. |
| `WARP_PROXY` | Optional | Cloudflare WARP proxy used when YouTube rate-limits the server. Default: built-in `usque` at `http://127.0.0.1:29083`. Set `off` to disable. |
| `PORT`, `DATA_DIR`, `DATABASE_URL`, `TZ` | Optional | Defaults: `8090`, `/app/data`, `/app/data/phimai.db`, container TZ. |

Check the result at `http://<host>:<port>/api/health` → `"backendConfigured": true`.

### 3. Run it

**Docker**
```bash
docker run -d --name kv-phimai --restart unless-stopped \
  -p 8090:8090 \
  -v ./data:/app/data \
  -e KVTUBE_URL=https://kvtube.example.com \
  vndangkhoa/kv-phimai:latest
# Option B instead: -e INVIDIOUS_UPSTREAM=https://invidious.example.com
```

**Docker Compose** — edit [`docker-compose.yml`](docker-compose.yml) (or export `KVTUBE_URL`), then:
```bash
docker compose up -d
```

**Synology (SPK)** — install *KV PhimAI* from the package source `https://syno.vndns.net`. The install wizard asks for the **video backend URL** and type (KV-Tube or Invidious). The same question appears on every package update, so you can change the address then (leave blank to keep the current one).

### Changing the backend later
Re-create the container with the new environment variable (Docker), or re-run the SPK wizard (Synology). The catalog, ratings and comments in the data volume are kept.

---

## Thiết lập tự host (Tiếng Việt)

PhimAI **không kèm máy chủ phát video**. Bạn cần tự chạy **KV-Tube** (khuyên dùng — đã gồm Invidious + Companion) hoặc **Invidious + Invidious Companion** riêng, rồi khai báo địa chỉ:

- KV-Tube: đặt `KVTUBE_URL=https://dia-chi-kvtube-cua-ban`
- Invidious: đặt `INVIDIOUS_UPSTREAM=https://dia-chi-invidious` (và `COMPANION_URL` nếu Companion nằm ở máy khác)
- Gói SPK Synology: nhập địa chỉ ở bước "Máy chủ video" khi cài; mỗi lần cập nhật gói, trình cài đặt sẽ hỏi lại (để trống = giữ nguyên).

Kiểm tra tại `/api/health` → `"backendConfigured": true`. Nếu chưa cấu hình, trang web vẫn hiện danh sách phim nhưng không phát được và sẽ hiển thị thông báo hướng dẫn.

---

## How it works

```
Browser ──► PhimAI (Go, :8090) ──► your Invidious API      (video info, formats, thumbnails)
                    │            └─► your Invidious Companion (video stream bytes)
                    └─► YouTube search / RSS  (background crawler for new AI films)
```

- The catalog (seed JSON + auto-crawled films) lives in memory; the browser downloads it and filters locally.
- Every stream URL is rewritten to the same origin (`/api/invidious/...`), so viewers only ever talk to PhimAI.
- Playback uses adaptive DASH (Shaka Player) with a progressive MP4 fallback.
- New AI films and short dramas are crawled every 30 minutes and saved to `crawled-films.json` in the data volume.

## Main API endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Version, catalog counts, `backendConfigured` |
| `GET` | `/api/films` | Catalog filter/sort/paginate (`sort`, `cat`, `genre`, `q`, `channel`, `page`, `limit`) |
| `GET` | `/api/films/{id}` | Film detail, series episodes, related films |
| `GET/POST` | `/api/films/{id}/episodes` | Discover missing episodes of the same series |
| `GET` | `/api/video/{id}` | Stream formats for the player (same-origin URLs) |
| `GET` | `/api/kvtube/thumb/{id}` | Cached thumbnail proxy |
| `GET/POST` | `/api/crawler/status`, `/api/crawler/sync` | Auto-crawler status / run now |
| `GET/POST` | `/api/ratings`, `/api/rate`, `/api/comments` | Ratings and timestamped comments |

## Development

```bash
export KVTUBE_URL=https://kvtube.example.com   # your backend
./start.sh build   # build Go backend + React frontend
./start.sh serve   # http://localhost:8090
```
