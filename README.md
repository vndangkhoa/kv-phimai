# KV-PhimAI — KV-Cinema Sovereign (Noir IMAX Screening Room)

**KV-PhimAI** is a standalone, single-container web application for discovering, streaming, and watching **9,220+ AI-generated films** (`Veo`, `Sora`, `Seedance`, `Kling`, `Runway`, `Higgsfield`, `Wan`) with Vietnamese dubbing, subtitles, series episode grouping, natural-language AI film search, 12-hour Watch Party rooms, and 6-digit TV pairing.

Built on the **KV-Netflix Stack** (`Go Chi + SQLite` backend + `React 19 + TypeScript + Vite + Tailwind CSS` SPA) and powered by **KV-Tube** (`https://u.khoavo.vndns.net`) for zero-Google/YouTube direct iframe tracking and strict Companion WARP stream IP-symmetry.

---

## KV-Cinema Sovereign Interface (Noir IMAX Screening Room)

- **Atmosphere & Palette**: Deep Obsidian Projection Void (`#0d0e14`), Elevated Screening Slate (`#161822`), warm Tungsten Projection Gold (`#ffd875`), and Cinema Crimson (`#e50914`).
- **Top Cinema Control Ribbon**: Instant `/` search focus, live viewer presence badge, one-click **AI Film Assistant** (`Trợ Lý AI`), **Vertical Swipe Feed** (`Lướt Phim Dọc`), **12-Hour Watch Party & 6-Digit TV Pairing** (`Xem Chung & TV`), direct **KV-Tube (`u.khoavo.vndns.net`)** link, and collapsible sidebar toggle.
- **Full-Bleed Widescreen Hero Stage**: 12-column IMAX projection stage with AI toolchain badges, `#rank` & runtime pills, 6-film interactive carousel strip, and pinned Studio Spotlight footer bar.
- **Cinema Reels & Tactile Filter Deck**: Horizontal scroll-snap reels for *Tiếp Tục Xem Dở*, *Top 10 Phim AI Thịnh Hành Trong Tuần* (with oversized `01`–`10` tabular rank numerals), and *Suất Chiếu Marathon Trọn Bộ*, paired with multi-facet category, `#genre`, mood, duration, and Family Mode (`Ẩn 18+`) filters.

---

## Architecture & KV-Tube Stream Integration

- **Zero Direct YouTube Embeds**: Every video metadata request, MP4 stream, DASH/HLS manifest, caption track, and thumbnail routes through `https://u.khoavo.vndns.net` (`/api/kvtube/video/{id}`, `/api/kvtube/stream/{id}`, `/api/kvtube/thumb/{id}`).
- **Range-Enabled Streaming Proxy**: `/api/kvtube/stream/{id}` forwards `Range` headers with `Accept-Encoding: identity` and response-header-only timeouts (`WriteTimeout: 0`) so multi-hour marathon films never cut off.
- **Full 9,220-Film Catalog Offline & Online**: Pre-seeded in `backend/data/` (`manifest.json`, `search-index.json`, `films-first.json`, `films-new.json`, `films-hot.json`, `hot.json`, `topweek.json`, `ratings.json`, `comment-counts.json`, `wall.json`, `suggest.json`, `screening.json`, `meta-extra.json`) and persisted in SQLite (`phimai.db`).

---

## REST API Endpoints (`PORT=8090`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Service health, KV-Tube upstream URL, and catalog counts |
| `GET` | `/api/manifest` | Catalog manifest, category/genre counts, and curated playlists |
| `GET` | `/api/films` | Paginated catalog filter (`sort=new\|hot\|topview\|vote\|random`, `cat`, `genre`, `full=1`, `mood`, `time`, `family=1`, `q`, `channel`, `tool`, `page`, `limit`) |
| `GET` | `/api/films/search?q=...` | Vietnamese accent-insensitive full-text & tag search across 9,220 films |
| `GET` | `/api/films/{id}` | Film metadata, auto-grouped series episodes, related films, ratings, and KV-Tube URLs |
| `GET` | `/api/kvtube/video/{id}` | Extracts & rewrites stream/manifest/caption URLs via `https://u.khoavo.vndns.net/api/invidious/api/v1/videos/{id}?local=true` |
| `GET` | `/api/kvtube/stream/{id}` | Range-enabled MP4 stream proxy via `https://u.khoavo.vndns.net/api/invidious/latest_version` |
| `GET` | `/api/kvtube/thumb/{id}` | Cached poster thumbnail proxy via `https://u.khoavo.vndns.net/api/invidious/vi/{id}/hqdefault.jpg` with SVG fallback |
| `GET/POST` | `/api/stats`, `/api/visit`, `/api/sitebeat`, `/api/view`, `/api/presence` | Real-time viewer presence and playback counters |
| `GET/POST` | `/api/hot`, `/api/topweek`, `/api/ratings`, `/api/rate` | All-time hot counts, Top 10 Weekly chart, and 5-star ratings |
| `GET/POST` | `/api/comment-counts`, `/api/comments` | Timestamped film comments |
| `GET/POST` | `/api/wall`, `/api/wall-like`, `/api/suggest`, `/api/screening` | Community discussion wall, film suggestions, and Saturday 20:00 screening room |
| `GET/POST` | `/api/room-create`, `/api/room`, `/api/room-state`, `/api/room-chat` | 12-hour synchronized Watch Party rooms with live chat |
| `GET/POST` | `/api/tv-pair` | 6-character Smart TV / Android TV pairing (`create`, `link`, `status`) |

---

## Quick Start

### Local Build & Run
```bash
chmod +x start.sh
./start.sh build
./start.sh serve
# Open http://localhost:8090
```

### Docker Compose
```bash
docker compose up -d --build
```
