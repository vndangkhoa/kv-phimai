---
name: "KV-PhimAI — KV-Cinema Sovereign (Noir IMAX Screening Room)"
description: "Sovereign Vietnamese AI Cinema Streaming & Noir IMAX Screening Room powered by KV-Tube (u.khoavo.vndns.net)"
colors:
  obsidian-void: "#0d0e14"
  slate-screening: "#161822"
  slate-raised: "#1e2130"
  tungsten-gold: "#ffd875"
  tungsten-amber: "#e6b949"
  cinema-crimson: "#e50914"
  crimson-soft: "#ff6b72"
  signal-emerald: "#10b981"
  ivory-crisp: "#f4f4f6"
  slate-secondary: "#c4c8d9"
  slate-muted: "#989fb8"
typography:
  display:
    fontFamily: "'Big Shoulders Display', 'Be Vietnam Pro', sans-serif"
    fontSize: "clamp(2.25rem, 4.5vw, 3.75rem)"
    fontWeight: 800
    lineHeight: 1.04
    letterSpacing: "0.01em"
  headline:
    fontFamily: "'Big Shoulders Display', 'Be Vietnam Pro', sans-serif"
    fontSize: "clamp(1.5rem, 2.6vw, 2.25rem)"
    fontWeight: 800
    lineHeight: 1.08
    letterSpacing: "0.01em"
  title:
    fontFamily: "'Be Vietnam Pro', system-ui, -apple-system, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  body:
    fontFamily: "'Be Vietnam Pro', system-ui, -apple-system, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.04em"
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  2xl: "48px"
components:
  button-primary-noir:
    backgroundColor: "{colors.cinema-crimson}"
    textColor: "{colors.ivory-crisp}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "12px 24px"
  button-accent-gold:
    backgroundColor: "{colors.tungsten-gold}"
    textColor: "{colors.obsidian-void}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "10px 18px"
  card-noir-film:
    backgroundColor: "{colors.slate-screening}"
    textColor: "{colors.ivory-crisp}"
    rounded: "{rounded.lg}"
    padding: "16px"
---

# Design System: KV-PhimAI — KV-Cinema Sovereign (Noir IMAX Screening Room)

## Overview

**Creative North Star: "KV-Cinema Sovereign — The Noir IMAX Screening Room"**

KV-PhimAI is designed as an atmospheric, high-contrast private screening room for **9,220+ curated Vietnamese AI films** (`Veo`, `Sora`, `Seedance`, `Kling`, `Runway`), bound to the sovereign KV-Tube media engine (`https://u.khoavo.vndns.net`) with zero third-party YouTube tracking embeds. Inspired by private IMAX projection rooms, Criterion Channel, and MUBI Dark, the interface pairs an Obsidian Projection Void (`#0d0e14`) and Elevated Screening Slate (`#161822`) with warm Tungsten Projection Gold (`#ffd875`) and Cinema Crimson (`#e50914`).

The system enforces strict typographic and craft discipline: headings stand on their own scale and weight without decorative eyebrow kickers above them, every numeric rank (`#9450`), runtime pill (`4 giờ 15 phút FULL`), and viewer counter uses `tabular-nums`, and every icon is an authored inline SVG with consistent `1.75` stroke geometry.

**Key Characteristics:**
- Dedicated **KV-Cinema Sovereign (Noir IMAX Screening Room)** visual architecture with integrated header theater controls (Search `/`, AI Film Assistant, Vertical Swipe Feed, Watch Party & 6-Digit TV Pairing, and direct `u.khoavo.vndns.net` link).
- High-contrast Vietnamese typography pairing `Big Shoulders Display` (theatrical headers), `Be Vietnam Pro` (full Vietnamese diacritic body & UI copy), and `JetBrains Mono` (telemetry, ranks, and durations).
- Mandatory `font-variant-numeric: tabular-nums` across all ranks, Top 10 numerals, durations, weekly play counts, and category filter badges.
- Complete browser-surface theming (`::selection`, custom dark scrollbars, `:focus-visible` tungsten gold rings, and caret colors).

## Colors

The KV-Cinema Sovereign palette is engineered for late-night home-theater and high-contrast daytime viewing, ensuring ≥4.5:1 contrast for body copy and tinted secondary text on every surface.

### Primary
- **Tungsten Projection Gold** (`{colors.tungsten-gold}`): Primary highlight, Top 10 rank numerals, AI model badges (`Veo`, `Sora`, `Seedance`, `Kling`, `Runway`), active filter pills, and focus rings.
- **Cinema Crimson** (`{colors.cinema-crimson}`): Primary screening CTA (`Chiếu Ngay (IMAX Player)`), marathon indicators, and active genre tags.

### Secondary
- **Tungsten Warm Amber** (`{colors.tungsten-amber}`): Hover state for gold action buttons and secondary warm highlights.
- **Live Signal Emerald** (`{colors.signal-emerald}`): Real-time online viewer indicator dot and active Watch Party room badge.

### Tertiary
- **Soft Crimson** (`{colors.crimson-soft}`): Filter reset actions, community wall heart hover states, and Watch Party icon accents.

### Neutral
- **Obsidian Projection Void** (`{colors.obsidian-void}`): Primary dark-room canvas (`#0d0e14`).
- **Elevated Screening Slate** (`{colors.slate-screening}`): Film card, filter deck, and collapsible sidebar surface (`#161822`).
- **Raised Slate Module** (`{colors.slate-raised}`): Active hero selector item and button hover surface (`#1e2130`).
- **Crisp Ivory** (`{colors.ivory-crisp}`): Primary headline and body ink (`#f4f4f6`).
- **Tinted Silver-Slate** (`{colors.slate-secondary}`): Secondary narrative copy tinted from the dark obsidian hue (`#c4c8d9`, never untinted gray).
- **Muted Slate-Indigo** (`{colors.slate-muted}`): Tertiary metadata and input placeholders (`#989fb8`).

### Named Rules
**The Tinted-Secondary Rule.** Secondary and muted text never use untinted neutral gray; all secondary ink is tinted toward cool silver-indigo (`#c4c8d9` and `#989fb8`) to harmonize with the `#0d0e14` obsidian canvas.

## Typography

**Display Font:** `Big Shoulders Display` with `Be Vietnam Pro` fallback
**Body Font:** `Be Vietnam Pro` (full Vietnamese diacritics)
**Label/Mono Font:** `JetBrains Mono` (telemetry, ranks, durations)

### Hierarchy
- **Display** (800 weight, `clamp(2.25rem, 4.5vw, 3.75rem)`, line-height 1.04): Widescreen Hero film titles and Top 10 rank numerals.
- **Headline** (800 weight, `clamp(1.5rem, 2.6vw, 2.25rem)`, line-height 1.08): Section headers (`TOP 10 PHIM AI THỊNH HÀNH TRONG TUẦN`, `SUẤT CHIẾU MARATHON TRỌN BỘ`, `BỘ LỌC PHÒNG CHIẾU`).
- **Title** (700 weight, `1.0625rem`, line-height 1.3): 16:9 film card titles and modal headers.
- **Body** (400 weight, `0.9375rem`, line-height 1.6, max measure `68ch`): Film synopses (`blurb` / `blurbLong`) and community wall discussions.
- **Label** (600 weight, `0.75rem`, letter-spacing `0.04em`, `tabular-nums`): Rank badges (`#9450`), AI toolchain tags (`Veo`, `Sora`, `Seedance`, `Kling`, `Runway`), and runtime pills (`4 giờ 15 phút FULL`).

### Named Rules
**The No-Kicker Rule.** Headings never carry an eyebrow or kicker label directly above them; metadata badges, ranks, and AI toolchain tags sit below the heading or inside a separate footer bar.

**The Tabular-Numeral Law.** Every rank (`#9450`), Top 10 numeral (`01`–`10`), view counter, and duration string applies `font-variant-numeric: tabular-nums` so columns and reels align with mechanical precision.

## Layout

KV-Cinema Sovereign employs a theatrical widescreen architecture optimized for both desktop (`1440x900`) and mobile (`390x844`) viewports:
- **Sticky Cinema Control Ribbon (`header`)**: Houses the KV-Cinema Sovereign identity, live online viewer pill (`● 48 đang xem`), instant `/` search bar, and one-click triggers for AI Assistant (`Trợ Lý AI`), Vertical Reels (`Lướt Phim Dọc`), Watch Party & TV Pairing (`Xem Chung & TV`), direct `KV-Tube` link, and Sidebar toggle.
- **Full-Bleed 12-Column Widescreen Hero Stage (`.noir-hero-stage`)**: Asymmetric `7:5` split between narrative projection controls (title, metadata chips, synopsis, primary CTAs, 6-film carousel strip) and the 16:9 widescreen backdrop frame, anchored by a pinned Studio Spotlight & KV-Tube telemetry footer bar.
- **Horizontal Scroll-Snap Cinema Reels (`.noir-reel-strip`)**: Dedicated widescreen strips for `Tiếp Tục Xem Dở`, `Top 10 Phim AI Thịnh Hành Trong Tuần` (with oversized `01`–`10` gold rank numerals), and `Suất Chiếu Marathon Trọn Bộ`.
- **Tactile Multi-Row Filter Deck**: Instant sorting (`Mới cập nhật`, `Đang hot`, `Nhiều lượt xem`, `Ngẫu nhiên`, `Đã lưu`, `Lịch sử xem`), category pills, `#genre` tags, mood/duration selectors, and Family Mode (`Ẩn 18+`).
- **9+3 Screening Grid & Collapsible Sidebar**: Responsive 16:9 film card grid paired with a sticky right sidebar switching between the Top 10 Weekly chart and the live Community Discussion Wall (`Sảnh Thảo Luận Khán Giả`).

## Elevation & Depth

Depth is communicated through tonal surface stepping (`#0d0e14` -> `#161822` -> `#1e2130`) and soft, downward-offset ambient shadows.

### Shadow Vocabulary
- **Noir Card Lift** (`box-shadow: 0 14px 34px -10px rgba(4, 5, 10, 0.72)`): Applied to 16:9 film cards, deepening on hover with a `-4px` vertical lift and tungsten gold border brightening.
- **Noir Hero Stage** (`box-shadow: 0 24px 64px -16px rgba(0, 0, 0, 0.85)`): Anchors the widescreen projection stage.

### Named Rules
**The Hairline-Boundary Rule.** Cards, callouts, and list items use uniform `1px solid` borders tinted from the foreground (`rgba(244, 244, 246, 0.11)`) or tungsten gold (`rgba(255, 216, 117, 0.36)`); thick colored side borders (`border-left` or `border-right` > 1px) are forbidden.

## Shapes

- **Small Badges & Pills (`6px`)**: AI model pills (`Veo`, `Sora`, `Kling`), rank tags (`#9450`), and duration overlays.
- **Interactive Controls (`8px`)**: Search inputs, filter chips, and primary action buttons.
- **Film Cards (`12px`)**: 16:9 cinema cards and Top 10 reel cards (`rounded-xl`).
- **Hero Stage & Filter Deck (`16px`)**: Full-bleed screening stage, filter deck, and sidebar container (`rounded-2xl`).

## Components

### Buttons
- **Primary Play (`#e50914`):** Cinema Crimson fill with crisp white ink, inline play triangle SVG, and subtle hover scale (`1.02`).
- **Tungsten Gold Action (`#ffd875`):** High-contrast gold fill with `#0d0e14` ink for random film discovery, active filter pills, and form submissions.
- **Elevated Slate Action (`#161822`):** `1px solid` hairline border for header quick actions (`Trợ Lý AI`, `Lướt Phim Dọc`, `Xem Chung & TV`, `KV-Tube`).

### Cards / Containers
- **16:9 Noir Film Card (`.noir-card`):** Flush 16:9 thumbnail header with top-left AI model + `#rank` badges, top-right bookmark toggle, bottom-left view count, bottom-right tabular duration pill, body with title/studio/synopsis, and a distinct footer bar with `Chiếu Phim`, `Xem chung`, and `KV-Tube` actions.

## Do's and Don'ts

### Do:
- **Do** route all video streams, thumbnails, and external watch links through `https://u.khoavo.vndns.net` and local `/api/kvtube/*` endpoints.
- **Do** apply `font-variant-numeric: tabular-nums` to all film ranks (`#9450`), Top 10 counters, durations, and filter badge counts.
- **Do** use authored inline SVGs with consistent `1.75` stroke weight for all icons and controls.
- **Do** place metadata badges, ranks, and AI model tags below headings or in card overlays rather than as eyebrow kickers above headings.

### Don't:
- **Don't** embed `youtube.com` or `youtube-nocookie.com` iframes or link directly to Google video servers anywhere in the interface.
- **Don't** place small uppercase eyebrow/kicker labels directly above `<h1>`, `<h2>`, `<h3>`, or `<h4>` elements.
- **Don't** use CSS gradient text (`background-clip: text`), thick colored side borders (`border-left` > 1px), or emoji/Unicode glyphs as UI icons.
