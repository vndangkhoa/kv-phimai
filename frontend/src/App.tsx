import { useEffect, useMemo, useState, useCallback } from 'react';
import { InterfaceOne } from './interfaces';
import type { Film, FilterState, PhimAIInterfaceProps } from './types/phimai';
import { PlayerModal } from './components/PlayerModal';
import { SwipeFeedModal } from './components/SwipeFeedModal';
import { AskAssistantModal } from './components/AskAssistantModal';
import { WatchPartyModal } from './components/WatchPartyModal';
import {
  CAT_LABEL,
  GENRE_GROUPS,
  durMinutes,
  genreMatch,
  getKVTubeWatchUrl,
  getThumbUrl,
  viewsNumber,
} from './utils/phimaiUtils';

const DEFAULT_FILTERS: FilterState = {
  query: '',
  cat: 'all',
  genre: 'all',
  fullOnly: false,
  mood: 'all',
  time: 'all',
  familyMode: false,
  sort: 'random',
  channel: '',
};

const FALLBACK_SEED_FILMS: Film[] = [
  {
    id: 'dqCGNrQ6N_o',
    rank: 9450,
    title: 'Phàm Nhân Tu Tiên: Đại Chiến Hư Thiên Điện (Trọn Bộ FULL 4K AI)',
    channel: 'Tiểu Hổ Tu Tiên',
    views: '428,500',
    dur: '4 giờ 15 phút FULL',
    cat: 'trung',
    tool: 'Seedance • Kling • Thuyết minh',
    blurb: 'Hàn Lập bước vào Hư Thiên Điện tranh đoạt Hư Thiên Đỉnh cùng quần hùng Nguyên Anh kỳ trong siêu phẩm hoạt hình 3D AI trọn bộ.',
    tags: ['tu tiên', 'huyền huyễn', 'trọn bộ'],
  },
  {
    id: 'WHzTarsWiXs',
    rank: 9448,
    title: 'THE LAST SIGNAL — Tín Hiệu Cuối Cùng Từ Sao Hỏa',
    channel: 'MYTHRA',
    views: '812,000',
    dur: '28 phút',
    cat: 'scifi',
    tool: 'Veo • Sora • Runway',
    blurb: 'Trạm nghiên cứu liên hành tinh mất liên lạc sau khi giải mã cấu trúc cổ đại dưới bề mặt Sao Hỏa.',
    tags: ['viễn tưởng', 'không gian'],
  },
  {
    id: 'gHVq_PRcpYc',
    rank: 9445,
    title: 'Hào Khí Đông A — Đại Chiến Bạch Đằng Giang (Phim Lịch Sử Việt Nam AI)',
    channel: 'Thước Phim Sử Việt',
    views: '654,200',
    dur: '42 phút FULL',
    cat: 'vietnam',
    tool: 'Veo • Kling • Lồng tiếng',
    blurb: 'Tái hiện trận thủy chiến Bạch Đằng lịch sử với hàng ngàn chiến thuyền và cọc gỗ dưới sự chỉ huy của Hưng Đạo Đại Vương.',
    tags: ['cổ trang', 'chiến thần', 'việt nam'],
  },
];

export function App() {
  const [allFilms, setAllFilms] = useState<Film[]>(FALLBACK_SEED_FILMS);
  const [loading, setLoading] = useState<boolean>(true);
  const [shownCount, setShownCount] = useState<number>(60);
  const [filters, setFiltersState] = useState<FilterState>(DEFAULT_FILTERS);

  // Metadata states
  const [manifestCategories, setManifestCategories] = useState<Record<string, number>>({});
  const [manifestGenres, setManifestGenres] = useState<Record<string, number>>({});
  const [stats, setStats] = useState({
    online: 48,
    visits: 184520,
    plays: 642910,
    totalFilms: 9220,
    newWeek: 142,
  });
  const [topWeekRaw, setTopWeekRaw] = useState<Array<{ id: string; count: number }>>([]);
  const [hotCounts, setHotCounts] = useState<Record<string, number>>({});
  const [ratings, setRatings] = useState<Record<string, { s: number; n: number }>>({});
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [wallPosts, setWallPosts] = useState<
    Array<{ id: string; name: string; text: string; ts: number; likes: number }>
  >([]);

  // User local persistence
  const [savedIds, setSavedIds] = useState<Set<string>>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('phimaihot_saved') || '[]');
      return new Set(Array.isArray(raw) ? raw : []);
    } catch {
      return new Set();
    }
  });

  const [historyIds, setHistoryIds] = useState<string[]>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('phimaihot_history') || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  });

  // Modals state
  const [activeFilm, setActiveFilm] = useState<Film | null>(null);
  const [swipeOpen, setSwipeOpen] = useState<boolean>(false);
  const [swipeStartFilm, setSwipeStartFilm] = useState<Film | null>(null);
  const [askOpen, setAskOpen] = useState<boolean>(false);
  const [watchPartyOpen, setWatchPartyOpen] = useState<boolean>(false);
  const [watchPartyFilm, setWatchPartyFilm] = useState<Film | null>(null);
  const [partyCode, setPartyCode] = useState<string | null>(() => {
    try {
      const r = new URLSearchParams(window.location.search).get('room');
      return r ? r.toUpperCase() : null;
    } catch {
      return null;
    }
  });
  const [isPartyHost, setIsPartyHost] = useState<boolean>(false);

  // Merge helper for films
  const mergeFilmsIntoCatalog = useCallback((incoming: Film[]) => {
    if (!Array.isArray(incoming) || incoming.length === 0) return;
    setAllFilms((prev) => {
      const byId = new Map<string, Film>();
      for (const f of prev) {
        if (f && f.id) byId.set(f.id, f);
      }
      for (const f of incoming) {
        if (!f || !f.id) continue;
        const existing = byId.get(f.id);
        if (existing) {
          byId.set(f.id, {
            ...existing,
            ...f,
            blurbLong: f.blurbLong || existing.blurbLong,
            tags: Array.isArray(f.tags) && f.tags.length > 0 ? f.tags : existing.tags || [],
          });
        } else {
          byId.set(f.id, {
            ...f,
            tags: Array.isArray(f.tags) ? f.tags : [],
          });
        }
      }
      return Array.from(byId.values()).sort((a, b) => b.rank - a.rank);
    });
  }, []);

  // Initial boot: fetch manifest, initial films, stats, topweek, ratings, comments, wall, and full search index
  useEffect(() => {
    let cancelled = false;

    async function boot() {
      setLoading(true);
      try {
        const [manifestRes, filmsRes] = await Promise.allSettled([
          fetch('/api/manifest').then((r) => (r.ok ? r.json() : null)),
          fetch('/api/films?limit=240&page=1').then((r) => (r.ok ? r.json() : null)),
        ]);

        if (!cancelled && manifestRes.status === 'fulfilled' && manifestRes.value) {
          const mf = manifestRes.value;
          if (mf.cats) setManifestCategories(mf.cats);
          if (mf.genres) setManifestGenres(mf.genres);
          setStats((prev) => ({
            ...prev,
            totalFilms: Number(mf.liveTotal || mf.total || prev.totalFilms),
            newWeek: Number(mf.newLive || prev.newWeek),
          }));
        }

        if (!cancelled && filmsRes.status === 'fulfilled' && filmsRes.value) {
          const items = Array.isArray(filmsRes.value.items)
            ? filmsRes.value.items
            : Array.isArray(filmsRes.value.films)
              ? filmsRes.value.films
              : Array.isArray(filmsRes.value)
                ? filmsRes.value
                : [];
          if (items.length > 0) {
            mergeFilmsIntoCatalog(items);
          }
        }
      } catch {
        // fallback continues below
      } finally {
        if (!cancelled) setLoading(false);
      }

      // Secondary metadata fetches in parallel
      Promise.allSettled([
        fetch('/api/stats').then((r) => (r.ok ? r.json() : null)),
        fetch('/api/topweek').then((r) => (r.ok ? r.json() : null)),
        fetch('/api/hot').then((r) => (r.ok ? r.json() : null)),
        fetch('/api/ratings').then((r) => (r.ok ? r.json() : null)),
        fetch('/api/comment-counts').then((r) => (r.ok ? r.json() : null)),
        fetch('/api/wall').then((r) => (r.ok ? r.json() : null)),
      ]).then((results) => {
        if (cancelled) return;
        const [stRes, twRes, hotRes, rateRes, cmtRes, wallRes] = results;

        if (stRes.status === 'fulfilled' && stRes.value) {
          const s = stRes.value;
          setStats((prev) => ({
            online: Number(s.online || prev.online),
            visits: Number(s.visits || prev.visits),
            plays: Number(s.plays || prev.plays),
            totalFilms: Number(s.totalFilms || prev.totalFilms),
            newWeek: Number(s.newWeek || prev.newWeek),
          }));
        }
        if (twRes.status === 'fulfilled' && twRes.value && Array.isArray(twRes.value.top)) {
          setTopWeekRaw(twRes.value.top);
        }
        if (hotRes.status === 'fulfilled' && hotRes.value && hotRes.value.counts) {
          setHotCounts(hotRes.value.counts);
        }
        if (rateRes.status === 'fulfilled' && rateRes.value && rateRes.value.ratings) {
          setRatings(rateRes.value.ratings);
        }
        if (cmtRes.status === 'fulfilled' && cmtRes.value && cmtRes.value.counts) {
          setCommentCounts(cmtRes.value.counts);
        }
        if (wallRes.status === 'fulfilled' && wallRes.value && Array.isArray(wallRes.value.posts)) {
          setWallPosts(wallRes.value.posts);
        }
      });

      // Load full catalog search-index or larger film batch in background so all 9,220 films are instant
      try {
        const fullRes = await fetch('/api/films?limit=10000&page=1');
        if (fullRes.ok) {
          const fullData = await fullRes.json();
          const list = Array.isArray(fullData.items)
            ? fullData.items
            : Array.isArray(fullData.films)
              ? fullData.films
              : [];
          if (!cancelled && list.length > 0) {
            mergeFilmsIntoCatalog(list);
            return;
          }
        }
      } catch {
        // try static search-index fallback
      }

      try {
        const idxRes = await fetch('/data/search-index.json');
        if (idxRes.ok) {
          const rows = await idxRes.json();
          if (!cancelled && Array.isArray(rows)) {
            const parsed: Film[] = rows.map((r: unknown[]) => ({
              rank: Number(r[0]) || 0,
              id: String(r[1] || ''),
              title: String(r[2] || ''),
              channel: String(r[3] || ''),
              views: String(r[4] || ''),
              dur: String(r[5] || ''),
              cat: String(r[6] || 'fantasy'),
              tool: String(r[7] || 'AI'),
              blurb: String(r[8] || ''),
              tags: Array.isArray(r[9]) ? (r[9] as string[]) : [],
              adult: Boolean(r[10]),
            }));
            mergeFilmsIntoCatalog(parsed);
          }
        }
      } catch {
        // ignore
      }
    }

    boot();
    return () => {
      cancelled = true;
    };
  }, [mergeFilmsIntoCatalog]);

  const setFilters = useCallback((patch: Partial<FilterState>) => {
    setFiltersState((prev) => ({ ...prev, ...patch }));
    setShownCount(60);
  }, []);

  const resetFilters = useCallback(() => {
    setFiltersState(DEFAULT_FILTERS);
    setShownCount(60);
  }, []);

  const toggleSave = useCallback((id: string) => {
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem('phimaihot_saved', JSON.stringify(Array.from(next)));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const handleOpenFilm = useCallback((film: Film) => {
    setActiveFilm(film);
    setHistoryIds((prev) => {
      const next = [film.id, ...prev.filter((id) => id !== film.id)].slice(0, 24);
      try {
        localStorage.setItem('phimaihot_history', JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const handleOpenSwipeFeed = useCallback((startFilm?: Film) => {
    setSwipeStartFilm(startFilm || null);
    setSwipeOpen(true);
  }, []);

  const handleOpenAskAssistant = useCallback(() => {
    setAskOpen(true);
  }, []);

  const handleOpenWatchParty = useCallback((film?: Film) => {
    if (film) setWatchPartyFilm(film);
    setWatchPartyOpen(true);
  }, []);

  // Compute categories & genres counts
  const categories = useMemo(() => {
    if (Object.keys(manifestCategories).length > 0) return manifestCategories;
    const out: Record<string, number> = {};
    for (const f of allFilms) {
      out[f.cat] = (out[f.cat] || 0) + 1;
    }
    return out;
  }, [manifestCategories, allFilms]);

  const genres = useMemo(() => {
    if (Object.keys(manifestGenres).length > 0) return manifestGenres;
    const out: Record<string, number> = {};
    for (const g of GENRE_GROUPS) {
      out[g.id] = allFilms.filter((f) => genreMatch(f, g.id)).length;
    }
    return out;
  }, [manifestGenres, allFilms]);

  // Compute filtered & sorted films
  const filteredFilms = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    const rankMatch = q.match(/^#(\d+)$/);
    if (rankMatch) {
      const targetRank = parseInt(rankMatch[1], 10);
      return allFilms.filter((f) => f.rank === targetRank);
    }

    let list = allFilms.filter((c) => {
      // Sort-specific filter buckets
      if (filters.sort === 'saved' && !savedIds.has(c.id)) return false;
      if (filters.sort === 'history' && !historyIds.includes(c.id)) return false;

      // Category filter
      if (filters.cat && filters.cat !== 'all') {
        if (filters.cat === 'saved') {
          if (!savedIds.has(c.id)) return false;
        } else if (filters.cat === 'history') {
          if (!historyIds.includes(c.id)) return false;
        } else if (filters.cat === 'new') {
          if (c.rank < 9068) return false;
        } else if (filters.cat === 'hot') {
          // keep all, sorted below
        } else if (filters.cat === 'topview') {
          // keep all, sorted below
        } else if (filters.cat === 'trung') {
          if (c.cat !== 'trung' && c.cat !== 'hoathinh') return false;
        } else if (c.cat !== filters.cat) {
          return false;
        }
      }

      // Channel filter
      if (filters.channel && c.channel !== filters.channel) return false;

      // Full-length only filter
      if (filters.fullOnly && !/full|trọn/i.test(c.dur || '')) return false;

      // Genre filter
      if (filters.genre && filters.genre !== 'all' && !genreMatch(c, filters.genre)) {
        return false;
      }

      // Mood filter
      if (filters.mood && filters.mood !== 'all') {
        const hay = `${c.title} ${c.blurb} ${c.blurbLong || ''}`.toLowerCase();
        if (filters.mood === 'cuoi' || filters.mood === 'chill' || filters.mood === 'nhe') {
          if (c.cat === 'kinhdi') return false;
        } else if (filters.mood === 'khoc' || filters.mood === 'cam-dong') {
          if (!['cảm động', 'nước mắt', 'gia đình', 'chữa lành', 'người mẹ', 'tình cảm'].some((k) => hay.includes(k))) {
            return false;
          }
        } else if (filters.mood === 'rung' || filters.mood === 'cang-thang') {
          if (c.cat !== 'kinhdi' && !['kinh dị', 'ám ảnh', 'quỷ', 'sinh tồn', 'mạt thế', 'đại chiến'].some((k) => hay.includes(k))) {
            return false;
          }
        } else if (filters.mood === 'xuyendem' || filters.mood === 'hao-hung') {
          if (durMinutes(c) < 60 && !['đại chiến', 'hào khí', 'tu tiên', 'nghịch thiên'].some((k) => hay.includes(k))) {
            return false;
          }
        }
      }

      // Duration filter
      if (filters.time && filters.time !== 'all') {
        const m = durMinutes(c);
        if (filters.time === 'short' && m > 30) return false;
        if ((filters.time === 'u120' || filters.time === 'medium') && (m <= 30 || m > 120)) return false;
        if ((filters.time === 'h24' || filters.time === 'long') && m <= 90) return false;
        if ((filters.time === 'o240' || filters.time === 'marathon') && m < 120) return false;
      }

      // Family mode filter
      if (filters.familyMode) {
        if (c.adult || c.cat === 'kinhdi') return false;
        if (/(quỷ|xác sống|kinh dị|ám ảnh|chết chóc|tận thế|ma cà rồng)/i.test(`${c.title} ${c.blurb}`)) {
          return false;
        }
      }

      // Search query filter
      if (q) {
        const searchable = `${c.title} ${c.channel} ${c.tool} ${c.blurb} ${c.blurbLong || ''} ${CAT_LABEL[c.cat] || ''} ${(c.tags || []).join(' ')}`.toLowerCase();
        if (!searchable.includes(q)) return false;
      }

      return true;
    });

    // Sort order
    const effectiveSort =
      filters.cat === 'new' || filters.cat === 'hot' || filters.cat === 'topview' || filters.cat === 'history'
        ? (filters.cat as FilterState['sort'])
        : filters.sort;

    if (effectiveSort === 'new') {
      list = [...list].sort((a, b) => b.rank - a.rank);
    } else if (effectiveSort === 'hot') {
      list = [...list].sort((a, b) => (hotCounts[b.id] || 0) - (hotCounts[a.id] || 0) || b.rank - a.rank);
    } else if (effectiveSort === 'topview') {
      list = [...list].sort((a, b) => viewsNumber(b) - viewsNumber(a));
    } else if (effectiveSort === 'history') {
      const orderMap = new Map(historyIds.map((id, i) => [id, i]));
      list = [...list].sort((a, b) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999));
    }

    return list;
  }, [allFilms, filters, savedIds, historyIds, hotCounts]);

  const visibleFilms = useMemo(
    () => filteredFilms.slice(0, shownCount),
    [filteredFilms, shownCount]
  );

  // Hero films (featured full-length & high-craft AI films)
  const heroFilms = useMemo(() => {
    const fulls = allFilms.filter((f) => /full|trọn/i.test(f.dur || '') && !f.adult);
    return (fulls.length >= 6 ? fulls : allFilms).slice(0, 6);
  }, [allFilms]);

  // Top 10 Weekly films
  const topWeekFilms = useMemo(() => {
    const byId = new Map(allFilms.map((f) => [f.id, f]));
    const mapped: Array<{ film: Film; count: number }> = [];
    for (const item of topWeekRaw) {
      const f = byId.get(item.id);
      if (f) mapped.push({ film: f, count: Number(item.count) || 0 });
    }
    if (mapped.length < 10) {
      for (const f of allFilms.slice(0, 15)) {
        if (mapped.length >= 10) break;
        if (!mapped.some((x) => x.film.id === f.id)) {
          mapped.push({ film: f, count: hotCounts[f.id] || Math.max(12, Math.floor(viewsNumber(f) / 1000)) });
        }
      }
    }
    return mapped.slice(0, 10);
  }, [allFilms, topWeekRaw, hotCounts]);

  // Continue watching films
  const continueFilms = useMemo(() => {
    const byId = new Map(allFilms.map((f) => [f.id, f]));
    return historyIds
      .map((id) => byId.get(id))
      .filter((f): f is Film => Boolean(f))
      .slice(0, 10);
  }, [allFilms, historyIds]);

  // Pinned spotlight films (Vietnamese historical & top international AI studios)
  const pinnedFilms = useMemo(() => {
    const vnAndEpic = allFilms.filter(
      (f) => f.cat === 'vietnam' || /MYTHRA|Thước Phim Sử Việt|Lõi Phim AI|Veo|Sora/i.test(`${f.channel} ${f.tool}`)
    );
    return (vnAndEpic.length >= 6 ? vnAndEpic : allFilms).slice(0, 8);
  }, [allFilms]);

  const handleRandomFilm = useCallback(() => {
    const pool = filteredFilms.length > 0 ? filteredFilms : allFilms;
    if (pool.length === 0) return;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (pick) handleOpenFilm(pick);
  }, [filteredFilms, allFilms, handleOpenFilm]);

  const handlePostWall = useCallback(async (name: string, text: string) => {
    const cleanText = text.trim();
    if (!cleanText) return;
    const cleanName = name.trim() || 'Khán giả';
    try {
      localStorage.setItem('phimaihot_nick', cleanName);
    } catch {
      // ignore
    }

    const optimisticPost = {
      id: `local-${Date.now()}`,
      name: cleanName,
      text: cleanText,
      ts: Date.now(),
      likes: 0,
    };
    setWallPosts((prev) => [optimisticPost, ...prev]);

    try {
      const r = await fetch('/api/wall', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: cleanName, text: cleanText }),
      });
      if (r.ok) {
        const w = await fetch('/api/wall').then((res) => (res.ok ? res.json() : null));
        if (w && Array.isArray(w.posts)) {
          setWallPosts(w.posts);
        }
      }
    } catch {
      // keep optimistic
    }
  }, []);

  const handleLikeWall = useCallback(async (id: string) => {
    setWallPosts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, likes: (p.likes || 0) + 1 } : p))
    );
    try {
      await fetch('/api/wall-like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
    } catch {
      // ignore
    }
  }, []);

  const handleRateFilm = useCallback(async (id: string, stars: number) => {
    setRatings((prev) => {
      const cur = prev[id] || { s: 0, n: 0 };
      return {
        ...prev,
        [id]: { s: cur.s + stars, n: cur.n + 1 },
      };
    });
    try {
      const r = await fetch('/api/rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, stars }),
      });
      const j = await r.json().catch(() => null);
      if (j && j.rating) {
        setRatings((prev) => ({ ...prev, [id]: j.rating }));
      }
    } catch {
      // keep optimistic rating
    }
  }, []);

  const handleLoadMore = useCallback(() => {
    setShownCount((prev) => prev + 60);
  }, []);

  const interfaceProps: PhimAIInterfaceProps = {
    films: visibleFilms,
    totalFilms: filteredFilms.length || stats.totalFilms,
    heroFilms,
    topWeekFilms,
    continueFilms,
    pinnedFilms,
    categories,
    genres,
    stats,
    wallPosts,
    filters,
    setFilters,
    resetFilters,
    savedIds,
    toggleSave,
    ratings,
    commentCounts,
    onOpenFilm: handleOpenFilm,
    onOpenSwipeFeed: handleOpenSwipeFeed,
    onOpenAskAssistant: handleOpenAskAssistant,
    onOpenWatchParty: handleOpenWatchParty,
    onRandomFilm: handleRandomFilm,
    onPostWall: handlePostWall,
    onLikeWall: handleLikeWall,
    onLoadMore: handleLoadMore,
    hasMore: shownCount < filteredFilms.length,
    loading,
    getThumbUrl,
    getKVTubeWatchUrl,
    activePartyCode: partyCode,
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0d0e14]">
      <main className="flex-1">
        <InterfaceOne {...interfaceProps} />
      </main>

      <PlayerModal
        film={activeFilm}
        allFilms={allFilms}
        savedIds={savedIds}
        onToggleSave={toggleSave}
        ratings={ratings}
        onRateFilm={handleRateFilm}
        onSelectFilm={handleOpenFilm}
        onClose={() => setActiveFilm(null)}
        onOpenWatchParty={(film) => handleOpenWatchParty(film)}
        onOpenSwipeFeed={(film) => handleOpenSwipeFeed(film)}
        activePartyCode={partyCode}
        isPartyHost={isPartyHost}
      />

      <SwipeFeedModal
        isOpen={swipeOpen}
        startFilm={swipeStartFilm}
        films={filteredFilms.length > 0 ? filteredFilms : allFilms}
        savedIds={savedIds}
        onToggleSave={toggleSave}
        onOpenFullPlayer={(film) => {
          setSwipeOpen(false);
          handleOpenFilm(film);
        }}
        onClose={() => setSwipeOpen(false)}
      />

      <AskAssistantModal
        isOpen={askOpen}
        films={allFilms}
        onOpenFilm={handleOpenFilm}
        onApplyFilters={setFilters}
        onClose={() => setAskOpen(false)}
      />

      <WatchPartyModal
        isOpen={watchPartyOpen}
        activeFilm={watchPartyFilm || activeFilm || heroFilms[0] || null}
        films={allFilms}
        partyCode={partyCode}
        isHost={isPartyHost}
        onSetPartyState={(code, host, filmId) => {
          setPartyCode(code);
          setIsPartyHost(host);
          if (filmId) {
            const matched = allFilms.find((f) => f.id === filmId);
            if (matched) handleOpenFilm(matched);
          }
        }}
        onOpenFilm={handleOpenFilm}
        onClose={() => setWatchPartyOpen(false)}
      />
    </div>
  );
}

export default App;
