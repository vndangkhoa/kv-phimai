# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

KV-Netflix Stack: Go (Chi + SQLite) backend + React 19 + Vite + Tailwind CSS SPA (1-container Docker ready)

## Users

- **Primary Users**: Vietnamese AI cinema audiences, sci-fi/cultivation (`tu tiên`, `xuyên không`, `trọng sinh`, `mạt thế`) fans, and AI filmmaking enthusiasts browsing on desktop home-theater setups, mobile phones, and living-room smart TVs.
- **User Jobs**:
  - Discover and stream curated AI-generated films (short films, multi-hour full-length compilations, 3D cultivation epics, Vietnamese historical AI recreations, and international AI festival winners) without YouTube ads or tracking.
  - Filter by AI video model (`Veo`, `Sora`, `Seedance`, `Kling`, `Runway`), genre, mood, runtime, or family-safe mode.
  - Ask a Vietnamese natural-language AI film assistant for hyper-specific trope combinations (e.g., `"tu tiên trọn bộ trên 3 tiếng"`, `"xuyên không nữ cường trả thù"`, `"phim lịch sử Việt Nam hào hùng"`).
  - Watch together in synchronized 12-hour Watch Party rooms with live chat or pair instantly with a living-room TV using a 6-digit code.

## Product Purpose

KV-PhimAI is a standalone, self-hosted Vietnamese AI cinema streaming platform with 9,220+ curated AI films presented inside **KV-Cinema Sovereign (Noir IMAX Screening Room)**. It combines the deep curation, Vietnamese trope intelligence, and community features of `phimai.online` with the sovereign self-hosted streaming architecture of KV-Netflix and KV-Tube (`https://u.khoavo.vndns.net`). Success means instant catalog browsing, zero reliance on direct Google/YouTube embeds, and native HTML5 video playback with quality selection via KV-Tube.

## Positioning

Unlike ad-heavy aggregator sites or raw YouTube playlists, KV-PhimAI indexes 9,220+ AI films by both generative AI toolchain (`Sora`, `Veo`, `Seedance`, `Kling`, `Runway`) and Vietnamese narrative tropes (`tu tiên`, `xuyên không`, `trọng sinh`, `tổng tài`, `cổ trang`, `sử Việt`), while routing every thumbnail, video stream, caption track, and fallback embed through the sovereign KV-Tube proxy infrastructure (`https://u.khoavo.vndns.net` / `/api/kvtube/*`).

## Operating Context

- Designed as a private Noir IMAX screening room (`#0d0e14` obsidian void, `#161822` elevated slate, `#ffd875` tungsten projection gold, `#e50914` cinema crimson) across desktop (`1440x900`), mobile (`390x844`), and living-room TV browsers.
- Supports keyboard-first navigation (`/` search focus, arrow-key vertical swipe feed), continuous marathon playback with sleep timers, and 6-digit TV pairing.

## Capabilities and Constraints

- **Full 9,220+ AI Film Catalog**: Backed by a Go (Chi + SQLite + JSON) server on port `8090` with instant search, category/genre/mood/duration/family filtering, series episode grouping, Top 10 Weekly chart, community wall, 5-star ratings, and timestamped comments.
- **Sovereign KV-Tube Media Pipeline**: All video streams (`/api/kvtube/stream/{id}`, `/api/kvtube/video/{id}`), thumbnails (`/api/kvtube/thumb/{id}`), watch links (`https://u.khoavo.vndns.net/watch?v={id}`), and fallback embeds (`https://u.khoavo.vndns.net/embed/{id}`) resolve exclusively through `https://u.khoavo.vndns.net` and local `/api/kvtube/*` endpoints. Direct `youtube.com` or `youtube-nocookie.com` embeds are strictly forbidden.
- **KV-Cinema Sovereign (Noir IMAX Screening Room)**: Full-bleed widescreen IMAX Hero Stage, horizontal scroll-snap cinema reels (`Tiếp Tục Xem Dở`, `Top 10 Phim AI Thịnh Hành Trong Tuần`, `Suất Chiếu Marathon Trọn Bộ`), tactile multi-row filter deck, and collapsible Top 10 & Community Salon sidebar.
- **Shared Core Features**: Native HTML5 `<video>` PlayerModal with quality selector, sleep timer, series episode strip, share card generator, 18+ age gate, and Watch Party sync; TikTok-style vertical `SwipeFeedModal`; Vietnamese NLP `AskAssistantModal`; and `WatchPartyModal` with 6-digit TV pairing.

## Brand Commitments

- **Identity**: KV-PhimAI — KV-Cinema Sovereign (Noir IMAX Screening Room).
- **Language**: Primary interface in authentic, natural Vietnamese with accurate AI filmmaking terminology (`Veo`, `Sora`, `Seedance`, `Kling`, `Runway`, `Vietsub`, `Thuyết minh`, `Trọn bộ`).
- **Craft**: Strict adherence to Impeccable craft-floor standards — no eyebrow/kicker labels above headings, no gradient text, no thick side borders on cards, no emoji standing in for UI icons (authored inline SVGs only), and `tabular-nums` on all ranks, counts, and durations.

## Evidence on Hand

- Reverse-engineered `phimai.online` catalog and metadata in `/mnt/data/Projects/phimai/backend/data/` (9,220 films, real channel names, real durations, view counts, Vietnamese blurbs, ratings, comments, and community wall posts).
- KV-Netflix architecture reference in `/mnt/data/Package Center/kv-netflix` and KV-Tube Invidious streaming integration in `/mnt/data/Package Center/kv-tube` (`https://u.khoavo.vndns.net`).

## Product Principles

1. **Sovereign Playback First**: Every play action opens native HTML5 streaming or KV-Tube (`u.khoavo.vndns.net`) with zero third-party YouTube tracking iframes.
2. **Vietnamese Trope Intelligence**: Search and discovery understand how Vietnamese viewers actually look for films—by cultivation realm, rebirth trope, marathon length (`trọn bộ trên 3 tiếng`), mood, or AI studio.
3. **Atmospheric Noir IMAX Craft**: Every rank numeral, runtime badge, timeline scrubber, and cinema reel is typeset with `tabular-nums`, crisp contrast, and purposeful exponential ease-out motion.
