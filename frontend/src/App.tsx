import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { IoChevronForward } from 'react-icons/io5';
import type { Film, FilterState } from './types/phimai';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { MobileNav } from './components/MobileNav';
import { VideoCard } from './components/VideoCard';
import { WatchPage } from './components/WatchPage';
import { PersistentPlayer } from './components/PersistentPlayer';
import { SwipeFeedModal } from './components/SwipeFeedModal';
import { AskAssistantModal } from './components/AskAssistantModal';
import { WatchPartyModal } from './components/WatchPartyModal';
import {
  CAT_LABEL,
  GENRE_GROUPS,
  genreMatch,
  viewsNumber,
} from './utils/phimaiUtils';
import { prefetchVideoStream } from './services/streamService';

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

function parseRouteFromLocation(): { view: 'home' | 'watch' | 'shorts'; videoId: string; t: number; channel: string; query: string } {
  const path = window.location.pathname || '/';
  const params = new URLSearchParams(window.location.search || '');
  const v = params.get('v') || '';
  const t = parseFloat(params.get('t') || '0') || 0;
  const channel = params.get('channel') || '';
  const query = params.get('q') || '';

  if (path === '/watch' && v) {
    return { view: 'watch', videoId: v, t, channel: '', query: '' };
  }
  if (path === '/shorts') {
    return { view: 'shorts', videoId: v, t: 0, channel: '', query: '' };
  }
  return { view: 'home', videoId: '', t: 0, channel, query };
}

export function App() {
  const initialRoute = useMemo(() => parseRouteFromLocation(), []);

  const [allFilms, setAllFilms] = useState<Film[]>(FALLBACK_SEED_FILMS);
  const [loading, setLoading] = useState(true);
  const [shownCount, setShownCount] = useState(24);
  const [filters, setFiltersState] = useState<FilterState>(() => ({
    ...DEFAULT_FILTERS,
    channel: initialRoute.channel,
    query: initialRoute.query,
  }));

  const [routeView, setRouteView] = useState<'home' | 'watch' | 'shorts'>(
    initialRoute.view === 'shorts' ? 'home' : initialRoute.view
  );
  const [watchVideoId, setWatchVideoId] = useState<string>(initialRoute.videoId);
  const [watchInitialTime, setWatchInitialTime] = useState<number>(initialRoute.t);
  const [activeFilm, setActiveFilm] = useState<Film | null>(() => {
    if (initialRoute.videoId) {
      return (
        FALLBACK_SEED_FILMS.find((f) => f.id === initialRoute.videoId) || {
          id: initialRoute.videoId,
          rank: 0,
          title: 'Đang tải phim AI...',
          channel: 'PhimAI',
          views: '0',
          dur: '',
          cat: 'fantasy',
          tool: 'AI',
          blurb: '',
          tags: [],
        }
      );
    }
    return null;
  });

  // Player shared runtime state
  const [currentPlaySec, setCurrentPlaySec] = useState<number>(0);
  const [externalSeekSec, setExternalSeekSec] = useState<{ sec: number; nonce: number } | null>(null);
  const [sleepMinutes, setSleepMinutes] = useState<number>(0);

  // Layout UI states: separate desktop persistent rail from overlay/mobile drawer
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(() =>
    typeof window !== 'undefined' && initialRoute.view !== 'watch' ? window.innerWidth > 1024 : false
  );
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth <= 768 : false
  );
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      return localStorage.getItem('phimai_theme') === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });

  // Catalog metadata
  const [manifestCategories, setManifestCategories] = useState<Record<string, number>>({});
  const [onlineCount, setOnlineCount] = useState(48);
  const [hotCounts, setHotCounts] = useState<Record<string, number>>({});
  const [ratings, setRatings] = useState<Record<string, { s: number; n: number }>>({});

  // User Saved & History
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

  // Secondary tool modals (Shorts, AI Assistant, Watch Party)
  const [swipeOpen, setSwipeOpen] = useState<boolean>(initialRoute.view === 'shorts');
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
  const [isPartyHost, setIsPartyHost] = useState(false);

  const chipBarRef = useRef<HTMLDivElement>(null);
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);

  // Apply theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('phimai_theme', theme);
    } catch {
      // ignore
    }
  }, [theme]);

  // Sleep timer shutdown
  useEffect(() => {
    if (sleepMinutes <= 0) return;
    const timer = setTimeout(() => {
      const vid = document.querySelector('#persistent-player-host video') as HTMLVideoElement | null;
      const aud = document.querySelector('#persistent-player-host audio') as HTMLAudioElement | null;
      vid?.pause();
      aud?.pause();
      setSleepMinutes(0);
    }, sleepMinutes * 60 * 1000);
    return () => clearTimeout(timer);
  }, [sleepMinutes]);

  // Responsive listener: auto-close overlay drawer when switching down to mobile
  useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobileViewport((prev) => {
        if (!prev && mobile) setIsSidebarOpen(false);
        return mobile;
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Merge catalog helper
  const mergeFilmsIntoCatalog = useCallback((incoming: Film[]) => {
    if (!Array.isArray(incoming) || incoming.length === 0) return;
    setAllFilms((prev) => {
      const byId = new Map<string, Film>();
      for (const f of prev) if (f?.id) byId.set(f.id, f);
      for (const f of incoming) {
        if (!f?.id) continue;
        const ex = byId.get(f.id);
        byId.set(
          f.id,
          ex
            ? { ...ex, ...f, blurbLong: f.blurbLong || ex.blurbLong, tags: f.tags?.length ? f.tags : ex.tags || [] }
            : { ...f, tags: Array.isArray(f.tags) ? f.tags : [] }
        );
      }
      return Array.from(byId.values()).sort((a, b) => b.rank - a.rank);
    });
  }, []);

  // Fast staged boot:
  // 1) Initial 48 films + manifest load immediately in parallel
  // 2) Pre-fetch top 4 stream manifests in background
  // 3) Full 9,220-film index hydrates silently right after
  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        const [mfRes, initialRes] = await Promise.allSettled([
          fetch('/api/manifest').then((r) => (r.ok ? r.json() : null)),
          fetch('/api/films?limit=60&page=1').then((r) => (r.ok ? r.json() : null)),
        ]);

        if (!cancelled && mfRes.status === 'fulfilled' && mfRes.value?.cats) {
          setManifestCategories(mfRes.value.cats);
        }

        if (!cancelled && initialRes.status === 'fulfilled' && initialRes.value?.items) {
          const items = initialRes.value.items as Film[];
          mergeFilmsIntoCatalog(items);
          items.slice(0, 4).forEach((f) => prefetchVideoStream(f.id));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }

      // Secondary metadata
      Promise.allSettled([
        fetch('/api/stats').then((r) => (r.ok ? r.json() : null)),
        fetch('/api/hot').then((r) => (r.ok ? r.json() : null)),
        fetch('/api/ratings').then((r) => (r.ok ? r.json() : null)),
      ]).then((res) => {
        if (cancelled) return;
        const [st, ht, rt] = res;
        if (st.status === 'fulfilled' && st.value?.online) setOnlineCount(Number(st.value.online));
        if (ht.status === 'fulfilled' && ht.value?.counts) setHotCounts(ht.value.counts);
        if (rt.status === 'fulfilled' && rt.value?.ratings) setRatings(rt.value.ratings);
      });

      // Full catalog background hydration
      try {
        const fullRes = await fetch('/api/films?limit=10000&page=1');
        if (fullRes.ok) {
          const fullJson = await fullRes.json();
          if (!cancelled && Array.isArray(fullJson.items)) {
            mergeFilmsIntoCatalog(fullJson.items);
          }
        }
      } catch {
        // ignore
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [mergeFilmsIntoCatalog]);

  // Sync activeFilm once catalog finishes hydrating for direct `/watch?v=...` entry
  useEffect(() => {
    if (!watchVideoId) return;
    const match = allFilms.find((f) => f.id === watchVideoId);
    if (match) {
      setActiveFilm(match);
    } else if (!activeFilm || activeFilm.id !== watchVideoId) {
      fetch(`/api/films/${encodeURIComponent(watchVideoId)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.id) setActiveFilm(data as Film);
        })
        .catch(() => {});
    }
  }, [watchVideoId, allFilms]);

  // Handle browser Back / Forward buttons cleanly
  useEffect(() => {
    const onPopState = () => {
      const parsed = parseRouteFromLocation();
      if (parsed.view === 'watch' && parsed.videoId) {
        setSwipeOpen(false);
        setRouteView('watch');
        setWatchVideoId(parsed.videoId);
        setWatchInitialTime(parsed.t);
        const found = allFilms.find((f) => f.id === parsed.videoId);
        if (found) setActiveFilm(found);
      } else if (parsed.view === 'shorts') {
        setRouteView('home');
        setSwipeOpen(true);
      } else {
        setSwipeOpen(false);
        setRouteView('home');
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [allFilms]);

  const setFilters = useCallback((patch: Partial<FilterState>) => {
    setFiltersState((prev) => ({ ...prev, ...patch }));
    setShownCount(24);
  }, []);

  const recordHistory = useCallback((filmId: string) => {
    setHistoryIds((prev) => {
      const next = [filmId, ...prev.filter((id) => id !== filmId)].slice(0, 30);
      try {
        localStorage.setItem('phimaihot_history', JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  // Open a film on the dedicated /watch?v=<id> page (0ms shallow pushState + optimistic metadata!)
  const handleOpenWatch = useCallback(
    (film: Film, seekSec = 0) => {
      setSwipeOpen(false);
      setIsSidebarOpen(false);
      setActiveFilm(film);
      setWatchVideoId(film.id);
      setWatchInitialTime(seekSec);
      setRouteView('watch');
      recordHistory(film.id);
      prefetchVideoStream(film.id);
      const url = `/watch?v=${encodeURIComponent(film.id)}${seekSec > 0 ? `&t=${Math.floor(seekSec)}` : ''}`;
      if (`${window.location.pathname}${window.location.search}` !== url) {
        window.history.pushState({ view: 'watch', videoId: film.id }, '', url);
      }
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    },
    [recordHistory]
  );

  const handleGoHome = useCallback(() => {
    setSwipeOpen(false);
    setRouteView('home');
    setIsSidebarOpen(window.innerWidth > 1024);
    if (window.location.pathname !== '/') {
      window.history.pushState({ view: 'home' }, '', '/');
    }
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
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

  // Filter & sort visible films
  const filteredFilms = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    let list = allFilms.filter((f) => {
      if (filters.familyMode && f.adult) return false;
      if (filters.cat !== 'all' && f.cat !== filters.cat) return false;
      if (filters.genre !== 'all' && !genreMatch(f, filters.genre)) return false;
      if (filters.fullOnly && !/full|trọn/i.test(f.dur || '')) return false;
      if (filters.channel && f.channel !== filters.channel) return false;
      if (filters.sort === 'saved' && !savedIds.has(f.id)) return false;
      if (filters.sort === 'history' && !historyIds.includes(f.id)) return false;
      if (q) {
        const hay = `${f.title} ${f.channel} ${f.blurb} ${(f.tags || []).join(' ')} ${f.tool}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    if (filters.sort === 'hot') {
      list = [...list].sort((a, b) => (hotCounts[b.id] || 0) - (hotCounts[a.id] || 0) || viewsNumber(b) - viewsNumber(a));
    } else if (filters.sort === 'topview') {
      list = [...list].sort((a, b) => viewsNumber(b) - viewsNumber(a));
    } else if (filters.sort === 'history') {
      const order = new Map(historyIds.map((id, idx) => [id, idx]));
      list = [...list].sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
    } else {
      list = [...list].sort((a, b) => b.rank - a.rank);
    }

    return list;
  }, [allFilms, filters, savedIds, historyIds, hotCounts]);

  const visibleFilms = useMemo(() => filteredFilms.slice(0, shownCount), [filteredFilms, shownCount]);
  const hasMore = shownCount < filteredFilms.length;

  // Infinite scroll on homepage grid
  useEffect(() => {
    if (routeView !== 'home' || !hasMore) return;
    const el = loadMoreTriggerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setShownCount((c) => Math.min(filteredFilms.length, c + 24));
        }
      },
      { rootMargin: '320px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [routeView, hasMore, filteredFilms.length]);

  const categories = useMemo(() => {
    if (Object.keys(manifestCategories).length > 0) return manifestCategories;
    const out: Record<string, number> = {};
    for (const f of allFilms) out[f.cat] = (out[f.cat] || 0) + 1;
    return out;
  }, [manifestCategories, allFilms]);

  // Quick filter chips for kv-tube .yt-chip-bar
  const quickChips = [
    { id: 'all', label: 'Tất cả', active: filters.cat === 'all' && filters.genre === 'all' && filters.sort !== 'hot' && !filters.fullOnly && !filters.channel },
    { id: 'hot', label: 'Đang thịnh hành', active: filters.sort === 'hot' },
    { id: 'full', label: 'Trọn bộ FULL', active: filters.fullOnly },
    { id: 'cat:trung', label: CAT_LABEL.trung, active: filters.cat === 'trung' },
    { id: 'cat:hoathinh', label: CAT_LABEL.hoathinh, active: filters.cat === 'hoathinh' },
    { id: 'cat:fantasy', label: CAT_LABEL.fantasy, active: filters.cat === 'fantasy' },
    { id: 'cat:scifi', label: CAT_LABEL.scifi, active: filters.cat === 'scifi' },
    { id: 'cat:kinhdi', label: CAT_LABEL.kinhdi, active: filters.cat === 'kinhdi' },
    { id: 'cat:vietnam', label: CAT_LABEL.vietnam, active: filters.cat === 'vietnam' },
    ...GENRE_GROUPS.slice(0, 6).map((g) => ({
      id: `genre:${g.id}`,
      label: g.label,
      active: filters.genre === g.id,
    })),
  ];

  const handleChipClick = (chipId: string) => {
    if (chipId === 'all') {
      setFilters(DEFAULT_FILTERS);
    } else if (chipId === 'hot') {
      setFilters({ sort: filters.sort === 'hot' ? 'random' : 'hot' });
    } else if (chipId === 'full') {
      setFilters({ fullOnly: !filters.fullOnly });
    } else if (chipId.startsWith('cat:')) {
      const cat = chipId.slice(4);
      setFilters({ cat: filters.cat === cat ? 'all' : cat, genre: 'all' });
    } else if (chipId.startsWith('genre:')) {
      const g = chipId.slice(6);
      setFilters({ genre: filters.genre === g ? 'all' : g });
    }
  };

  // Determine next/prev film for watch page playback controls
  const currentFilmIndex = useMemo(
    () => (activeFilm ? filteredFilms.findIndex((f) => f.id === activeFilm.id) : -1),
    [activeFilm, filteredFilms]
  );

  const handleNextFilm = useCallback(() => {
    if (filteredFilms.length === 0) return;
    const nextIdx = currentFilmIndex >= 0 ? (currentFilmIndex + 1) % filteredFilms.length : 0;
    handleOpenWatch(filteredFilms[nextIdx]);
  }, [filteredFilms, currentFilmIndex, handleOpenWatch]);

  const handlePrevFilm = useCallback(() => {
    if (filteredFilms.length === 0) return;
    const prevIdx = currentFilmIndex > 0 ? currentFilmIndex - 1 : filteredFilms.length - 1;
    handleOpenWatch(filteredFilms[prevIdx]);
  }, [filteredFilms, currentFilmIndex, handleOpenWatch]);

  const isWatchMode = routeView === 'watch' && Boolean(activeFilm);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--yt-background)', color: 'var(--yt-text-primary)' }}>
      {/* Top Sticky Materialious Header */}
      <Header
        query={filters.query}
        onQueryChange={(q) => {
          setFilters({ query: q });
          if (isWatchMode && q.trim()) handleGoHome();
        }}
        onSubmitSearch={(q) => {
          setFilters({ query: q });
          handleGoHome();
        }}
        onToggleSidebar={() => setIsSidebarOpen((v) => !v)}
        onGoHome={() => {
          setFilters(DEFAULT_FILTERS);
          handleGoHome();
        }}
        onOpenShorts={() => setSwipeOpen(true)}
        onOpenAssistant={() => setAskOpen(true)}
        onOpenWatchParty={() => {
          setWatchPartyFilm(activeFilm || filteredFilms[0] || allFilms[0] || null);
          setWatchPartyOpen(true);
        }}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        allFilms={allFilms}
        onSelectFilm={(f) => handleOpenWatch(f)}
        onlineCount={onlineCount}
      />

      {/* Collapsible Sidebar (Desktop rail or Overlay drawer) */}
      <Sidebar
        isOpen={isSidebarOpen}
        isOverlayMode={isWatchMode || isMobileViewport}
        onClose={() => setIsSidebarOpen(false)}
        filters={filters}
        categories={categories}
        onSelectFilter={(patch) => setFilters(patch)}
        onGoHome={handleGoHome}
        onOpenShorts={() => setSwipeOpen(true)}
        onOpenAssistant={() => setAskOpen(true)}
        onOpenWatchParty={() => {
          setWatchPartyFilm(activeFilm || filteredFilms[0] || allFilms[0] || null);
          setWatchPartyOpen(true);
        }}
      />

      {/* Main Content Area */}
      <main
        className={`yt-main-content ${
          isWatchMode
            ? 'watch-mode'
            : isSidebarOpen && !isMobileViewport
              ? 'sidebar-expanded'
              : 'sidebar-collapsed'
        }`}
      >
        {isWatchMode && activeFilm ? (
          <WatchPage
            film={activeFilm}
            allFilms={allFilms}
            currentTimeSec={currentPlaySec}
            saved={savedIds.has(activeFilm.id)}
            rating={ratings[activeFilm.id]}
            onToggleSave={toggleSave}
            onSelectFilm={(f) => handleOpenWatch(f)}
            onBackHome={handleGoHome}
            onFilterByPatch={(patch) => {
              setFilters(patch);
              handleGoHome();
            }}
            onOpenWatchParty={(f) => {
              setWatchPartyFilm(f);
              setWatchPartyOpen(true);
            }}
            onSeekToSec={(sec) => setExternalSeekSec({ sec, nonce: Date.now() })}
            onRateSuccess={(id, nextRating) => setRatings((prev) => ({ ...prev, [id]: nextRating }))}
          />
        ) : (
          <div className="yt-home-grid-wrapper">
            {/* Sticky Category / Genre Chip Bar */}
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '18px', position: 'relative' }}>
              <div ref={chipBarRef} className="yt-chip-bar" style={{ flex: 1 }}>
                {quickChips.map((chip) => (
                  <button
                    type="button"
                    key={chip.id}
                    onClick={() => handleChipClick(chip.id)}
                    className={`yt-filter-chip ${chip.active ? 'active' : ''}`}
                  >
                    {chip.label}
                  </button>
                ))}
                {filters.channel && (
                  <button
                    type="button"
                    onClick={() => setFilters({ channel: '' })}
                    className="yt-filter-chip active"
                  >
                    Kênh: {filters.channel} ✕
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => chipBarRef.current?.scrollBy({ left: 220, behavior: 'smooth' })}
                className="hidden-mobile"
                style={{
                  background: 'var(--yt-hover)',
                  border: 'none',
                  color: 'var(--yt-text-primary)',
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  marginLeft: '8px',
                  flexShrink: 0,
                }}
                title="Xem thêm thẻ"
              >
                <IoChevronForward size={16} />
              </button>
            </div>

            {/* Active Result Summary */}
            {(filters.query || filters.channel || filters.sort === 'saved' || filters.sort === 'history') && (
              <div style={{ marginBottom: '14px', fontSize: '13.5px', color: 'var(--yt-text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>
                  Tìm thấy <strong style={{ color: 'var(--yt-text-primary)' }}>{filteredFilms.length}</strong> bộ phim
                  {filters.channel ? ` từ kênh "${filters.channel}"` : ''}
                  {filters.query ? ` cho "${filters.query}"` : ''}
                </span>
                <button
                  type="button"
                  onClick={() => setFilters(DEFAULT_FILTERS)}
                  style={{ background: 'none', border: 'none', color: 'var(--yt-blue)', cursor: 'pointer', fontWeight: 600 }}
                >
                  Đặt lại bộ lọc
                </button>
              </div>
            )}

            {/* Video Card Grid */}
            {loading && visibleFilms.length === 0 ? (
              <div className="yt-home-video-grid">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="skeleton" style={{ aspectRatio: '16/9', borderRadius: '12px' }} />
                ))}
              </div>
            ) : visibleFilms.length === 0 ? (
              <div style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--yt-text-secondary)' }}>
                <p style={{ fontSize: '16px', marginBottom: '12px' }}>Không tìm thấy phim phù hợp.</p>
                <button
                  type="button"
                  onClick={() => setFilters(DEFAULT_FILTERS)}
                  className="watch-sub-btn unsubscribed"
                  style={{ height: '38px', padding: '0 20px' }}
                >
                  Xem toàn bộ {allFilms.length} phim
                </button>
              </div>
            ) : (
              <>
                <div className="yt-home-video-grid">
                  {visibleFilms.map((film) => (
                    <VideoCard
                      key={film.id}
                      film={film}
                      saved={savedIds.has(film.id)}
                      onToggleSave={toggleSave}
                      onOpenFilm={(f) => handleOpenWatch(f)}
                      onFilterChannel={(ch) => setFilters({ channel: ch })}
                    />
                  ))}
                </div>
                {hasMore && (
                  <div ref={loadMoreTriggerRef} style={{ padding: '28px', textAlign: 'center' }}>
                    <button
                      type="button"
                      onClick={() => setShownCount((c) => c + 30)}
                      className="watch-action-pill"
                    >
                      Tải thêm phim ({filteredFilms.length - visibleFilms.length} phim còn lại)
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </main>

      {/* Mobile Bottom Navigation */}
      <MobileNav
        activeView={swipeOpen ? 'shorts' : isWatchMode ? 'watch' : 'home'}
        activeSort={filters.sort}
        onSelectHome={() => {
          setFilters(DEFAULT_FILTERS);
          handleGoHome();
        }}
        onSelectHot={() => {
          setFilters({ sort: 'hot' });
          handleGoHome();
        }}
        onSelectShorts={() => setSwipeOpen(true)}
        onSelectSaved={() => {
          setFilters({ sort: 'saved' });
          handleGoHome();
        }}
        onOpenAssistant={() => setAskOpen(true)}
      />

      {/* Persistent Player: mounts inside #watch-player-slot on /watch or docks as mini-player on / */}
      <PersistentPlayer
        activeFilm={activeFilm}
        isWatchPage={isWatchMode}
        initialTimeSec={watchInitialTime}
        sleepMinutes={sleepMinutes}
        onSelectSleepMinutes={setSleepMinutes}
        onNext={handleNextFilm}
        onPrev={handlePrevFilm}
        onVideoEnd={handleNextFilm}
        onTimeUpdate={setCurrentPlaySec}
        onExpandToWatch={(f, cur) => handleOpenWatch(f, cur)}
        onCloseMiniPlayer={() => {
          setActiveFilm(null);
          setWatchVideoId('');
        }}
        externalSeekSec={externalSeekSec}
      />

      {/* Shorts Vertical Swipe Feed */}
      <SwipeFeedModal
        isOpen={swipeOpen}
        startFilm={activeFilm || filteredFilms[0] || allFilms[0] || null}
        films={filteredFilms.length > 0 ? filteredFilms : allFilms}
        savedIds={savedIds}
        onToggleSave={toggleSave}
        onOpenFullPlayer={(f) => handleOpenWatch(f)}
        onClose={() => setSwipeOpen(false)}
      />

      {/* AI Film Assistant */}
      <AskAssistantModal
        isOpen={askOpen}
        films={allFilms}
        onOpenFilm={(f) => handleOpenWatch(f)}
        onApplyFilters={(patch) => {
          setFilters(patch);
          handleGoHome();
        }}
        onClose={() => setAskOpen(false)}
      />

      {/* Watch Party & TV Pair */}
      <WatchPartyModal
        isOpen={watchPartyOpen}
        activeFilm={watchPartyFilm || activeFilm}
        films={allFilms}
        partyCode={partyCode}
        isHost={isPartyHost}
        onSetPartyState={(code, host, filmId) => {
          setPartyCode(code);
          setIsPartyHost(host);
          if (filmId) {
            const match = allFilms.find((f) => f.id === filmId);
            if (match) handleOpenWatch(match);
          }
        }}
        onOpenFilm={(f) => handleOpenWatch(f)}
        onClose={() => setWatchPartyOpen(false)}
      />
    </div>
  );
}

export default App;
