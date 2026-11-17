import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { IoChevronForward } from 'react-icons/io5';
import type { Film, FilterState } from './types/phimai';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { MobileNav } from './components/MobileNav';
import { VideoCard } from './components/VideoCard';
import { WatchPage } from './components/WatchPage';
import { ChannelPage } from './components/ChannelPage';
import { ChannelsDirectoryPage } from './components/ChannelsDirectoryPage';
import { PersistentPlayer } from './components/PersistentPlayer';
import {
  CAT_LABEL,
  GENRE_GROUPS,
  genreMatch,
  getEpisodeInfo,
  getSeriesEpisodes,
  stackSeriesForGrid,
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

function parseRouteFromLocation(): {
  view: 'home' | 'watch' | 'channels' | 'channel';
  videoId: string;
  t: number;
  channelId: string;
  channel: string;
  query: string;
} {
  const path = window.location.pathname || '/';
  const params = new URLSearchParams(window.location.search || '');
  const v = params.get('v') || '';
  const t = parseFloat(params.get('t') || '0') || 0;
  const channel = params.get('channel') || '';
  const query = params.get('q') || '';

  if (path === '/watch' && v) {
    return { view: 'watch', videoId: v, t, channelId: '', channel: '', query: '' };
  }
  if (path === '/channels') {
    return { view: 'channels', videoId: '', t: 0, channelId: '', channel: '', query: '' };
  }
  if (path.startsWith('/channel/')) {
    const seg = path.slice('/channel/'.length).replace(/\/+$/, '');
    let decoded = seg;
    try {
      decoded = decodeURIComponent(seg);
    } catch {
      // ignore
    }
    if (decoded) {
      return { view: 'channel', videoId: '', t: 0, channelId: decoded, channel: '', query: '' };
    }
  }
  return { view: 'home', videoId: '', t: 0, channelId: '', channel, query };
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

  const [routeView, setRouteView] = useState<'home' | 'watch' | 'channels' | 'channel'>(initialRoute.view);
  const [channelRouteId, setChannelRouteId] = useState<string>(initialRoute.channelId);
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

  const chipBarRef = useRef<HTMLDivElement>(null);
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);

  // Lock dark Materialious theme cleanly
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
  }, []);

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

  // Merge catalog helper (avoids unnecessary re-renders if no new/updated films arrived)
  const mergeFilmsIntoCatalog = useCallback((incoming: Film[]) => {
    if (!Array.isArray(incoming) || incoming.length === 0) return;
    setAllFilms((prev) => {
      const byId = new Map<string, Film>();
      for (const f of prev) if (f?.id) byId.set(f.id, f);
      let changed = false;
      for (const f of incoming) {
        if (!f?.id) continue;
        const ex = byId.get(f.id);
        if (!ex) {
          changed = true;
          byId.set(f.id, { ...f, tags: Array.isArray(f.tags) ? f.tags : [] });
        } else if (
          ex.rank !== f.rank ||
          ex.title !== f.title ||
          (f.blurbLong && f.blurbLong !== ex.blurbLong)
        ) {
          changed = true;
          byId.set(f.id, {
            ...ex,
            ...f,
            blurbLong: f.blurbLong || ex.blurbLong,
            tags: f.tags?.length ? f.tags : ex.tags || [],
          });
        }
      }
      if (!changed && prev.length > FALLBACK_SEED_FILMS.length) {
        return prev;
      }
      return Array.from(byId.values()).sort((a, b) => b.rank - a.rank);
    });
  }, []);

  // Refresh latest released / auto-crawled films & manifest counts
  const syncLatestCatalog = useCallback(async () => {
    try {
      const [mfRes, latestRes] = await Promise.allSettled([
        fetch('/api/manifest', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)),
        fetch('/api/films?limit=60&page=1&sort=new', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)),
      ]);
      if (mfRes.status === 'fulfilled' && mfRes.value?.cats) {
        setManifestCategories(mfRes.value.cats);
      }
      if (latestRes.status === 'fulfilled' && Array.isArray(latestRes.value?.items)) {
        mergeFilmsIntoCatalog(latestRes.value.items as Film[]);
      }
    } catch {
      // ignore transient poll failures
    }
  }, [mergeFilmsIntoCatalog]);

  // Fast staged boot + periodic background auto-refresh for latest crawled releases
  useEffect(() => {
    let cancelled = false;
    let lastSyncAt = Date.now();

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
        }
      } finally {
        if (!cancelled) setLoading(false);
      }

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

    const timer = window.setInterval(() => {
      if (cancelled || document.visibilityState === 'hidden') return;
      lastSyncAt = Date.now();
      void syncLatestCatalog();
    }, 45_000);

    const onVisibility = () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      if (Date.now() - lastSyncAt >= 15_000) {
        lastSyncAt = Date.now();
        void syncLatestCatalog();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [mergeFilmsIntoCatalog, syncLatestCatalog]);

  // Sync activeFilm for direct `/watch?v=...` entry
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
        setRouteView('watch');
        setWatchVideoId(parsed.videoId);
        setWatchInitialTime(parsed.t);
        const found = allFilms.find((f) => f.id === parsed.videoId);
        if (found) setActiveFilm(found);
      } else if (parsed.view === 'channels') {
        setRouteView('channels');
      } else if (parsed.view === 'channel' && parsed.channelId) {
        setRouteView('channel');
        setChannelRouteId(parsed.channelId);
      } else {
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

  const handleOpenWatch = useCallback(
    (picked: Film, seekSec = 0) => {
      // Stacked grid cards carry merged rank/views; open the real first episode instead.
      const film = picked.stackedEpisodes?.[0] ?? picked;
      setIsSidebarOpen(false);
      setActiveFilm(film);
      setWatchVideoId(film.id);
      setWatchInitialTime(seekSec);
      setRouteView('watch');
      recordHistory(film.id);
      const url = `/watch?v=${encodeURIComponent(film.id)}${seekSec > 0 ? `&t=${Math.floor(seekSec)}` : ''}`;
      if (`${window.location.pathname}${window.location.search}` !== url) {
        window.history.pushState({ view: 'watch', videoId: film.id }, '', url);
      }
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    },
    [recordHistory]
  );

  const handleOpenChannel = useCallback((channelName: string) => {
    if (!channelName) return;
    setChannelRouteId(channelName);
    setRouteView('channel');
    if (window.innerWidth <= 1024) setIsSidebarOpen(false);
    const url = `/channel/${encodeURIComponent(channelName)}`;
    if (window.location.pathname !== url) {
      window.history.pushState({ view: 'channel', channelId: channelName }, '', url);
    }
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, []);

  const handleOpenChannels = useCallback(() => {
    setRouteView('channels');
    if (window.innerWidth <= 1024) setIsSidebarOpen(false);
    if (window.location.pathname !== '/channels') {
      window.history.pushState({ view: 'channels' }, '', '/channels');
    }
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, []);

  const handleGoHome = useCallback(() => {
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

  // Home grid: every multi-episode series collapsed into one stacked card.
  const gridFilms = useMemo(() => stackSeriesForGrid(filteredFilms), [filteredFilms]);

  const visibleFilms = useMemo(() => gridFilms.slice(0, shownCount), [gridFilms, shownCount]);
  const hasMore = shownCount < gridFilms.length;

  useEffect(() => {
    if (routeView !== 'home' || !hasMore) return;
    const el = loadMoreTriggerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setShownCount((c) => Math.min(gridFilms.length, c + 24));
        }
      },
      { rootMargin: '320px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [routeView, hasMore, gridFilms.length]);

  const categories = useMemo(() => {
    if (Object.keys(manifestCategories).length > 0) return manifestCategories;
    const out: Record<string, number> = {};
    for (const f of allFilms) out[f.cat] = (out[f.cat] || 0) + 1;
    return out;
  }, [manifestCategories, allFilms]);

  const quickChips = [
    { id: 'all', label: 'Tất cả', active: filters.cat === 'all' && filters.genre === 'all' && filters.sort !== 'hot' && !filters.fullOnly && !filters.channel },
    { id: 'hot', label: 'Đang thịnh hành', active: filters.sort === 'hot' },
    { id: 'full', label: 'Trọn bộ FULL', active: filters.fullOnly },
    { id: 'cat:ngan', label: 'Phim ngắn & Short Drama', active: filters.cat === 'ngan' },
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

  // Position of the active film in the stacked grid (matches its series stack too).
  const currentFilmIndex = useMemo(
    () =>
      activeFilm
        ? gridFilms.findIndex(
            (f) => f.id === activeFilm.id || Boolean(f.stackedEpisodes?.some((ep) => ep.id === activeFilm.id))
          )
        : -1,
    [activeFilm, gridFilms]
  );

  const activeSeriesEpisodes = useMemo(
    () => (activeFilm ? getSeriesEpisodes(activeFilm, allFilms) : []),
    [activeFilm, allFilms]
  );

  const fetchedSeriesIdsRef = useRef<Set<string>>(new Set());

  // Automatically discover missing episodes for episodic movies currently being watched
  useEffect(() => {
    if (routeView !== 'watch' || !activeFilm) return;
    const epInfo = getEpisodeInfo(activeFilm.title, activeFilm.channel);
    if (epInfo.epNum === null && activeSeriesEpisodes.length < 2) return;
    const seriesCacheKey = epInfo.baseKey ? `${epInfo.baseKey}||${activeFilm.channel}` : activeFilm.id;
    if (fetchedSeriesIdsRef.current.has(seriesCacheKey)) return;
    fetchedSeriesIdsRef.current.add(seriesCacheKey);

    let cancelled = false;
    fetch(`/api/films/${encodeURIComponent(activeFilm.id)}/episodes`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.ok && Array.isArray(data.episodes) && data.episodes.length > 0) {
          mergeFilmsIntoCatalog(data.episodes as Film[]);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [routeView, activeFilm?.id, activeFilm?.title, activeFilm?.channel, activeSeriesEpisodes.length, mergeFilmsIntoCatalog]);

  const handleNextFilm = useCallback(() => {
    if (!activeFilm) return;
    // 1. Always play the next sequential episode of the same movie (Tập 1 -> Tập 2 -> Tập 3...)
    if (activeSeriesEpisodes.length > 1) {
      const epIdx = activeSeriesEpisodes.findIndex((e) => e.id === activeFilm.id);
      if (epIdx >= 0 && epIdx + 1 < activeSeriesEpisodes.length) {
        const nextEp = activeSeriesEpisodes[epIdx + 1];
        try {
          localStorage.removeItem(`phimai_pos_${nextEp.id}`);
        } catch {
          // ignore
        }
        handleOpenWatch(nextEp, 0);
        return;
      }
    }

    // 2. After finishing the last episode (or on standalone films), advance to the next different film
    if (gridFilms.length === 0) return;
    const sameSeriesIds = new Set(activeSeriesEpisodes.map((e) => e.id));
    const startIdx = currentFilmIndex >= 0 ? currentFilmIndex : -1;
    for (let offset = 1; offset <= gridFilms.length; offset++) {
      const cand = gridFilms[(startIdx + offset) % gridFilms.length];
      const candIds = cand.stackedEpisodes ? cand.stackedEpisodes.map((ep) => ep.id) : [cand.id];
      if (!candIds.includes(activeFilm.id) && !candIds.some((id) => sameSeriesIds.has(id))) {
        handleOpenWatch(cand, 0);
        return;
      }
    }
  }, [activeFilm, activeSeriesEpisodes, gridFilms, currentFilmIndex, handleOpenWatch]);

  const handlePrevFilm = useCallback(() => {
    if (!activeFilm) return;
    if (activeSeriesEpisodes.length > 1) {
      const epIdx = activeSeriesEpisodes.findIndex((e) => e.id === activeFilm.id);
      if (epIdx > 0) {
        const prevEp = activeSeriesEpisodes[epIdx - 1];
        handleOpenWatch(prevEp, 0);
        return;
      }
    }
    if (gridFilms.length === 0) return;
    const prevIdx = currentFilmIndex > 0 ? currentFilmIndex - 1 : gridFilms.length - 1;
    handleOpenWatch(gridFilms[prevIdx], 0);
  }, [activeFilm, activeSeriesEpisodes, gridFilms, currentFilmIndex, handleOpenWatch]);

  const isWatchMode = routeView === 'watch' && Boolean(activeFilm);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--yt-background)', color: 'var(--yt-text-primary)' }}>
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
        allFilms={allFilms}
        onSelectFilm={(f) => handleOpenWatch(f)}
        onlineCount={onlineCount}
      />

      <Sidebar
        isOpen={isSidebarOpen}
        isOverlayMode={isWatchMode || isMobileViewport}
        onClose={() => setIsSidebarOpen(false)}
        activeView={routeView}
        activeChannelName={channelRouteId}
        filters={filters}
        categories={categories}
        allFilms={allFilms}
        onSelectFilter={(patch) => setFilters(patch)}
        onGoHome={handleGoHome}
        onOpenChannels={handleOpenChannels}
        onOpenChannel={handleOpenChannel}
      />

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
            onOpenChannel={handleOpenChannel}
            onBackHome={handleGoHome}
            onFilterByPatch={(patch) => {
              setFilters(patch);
              handleGoHome();
            }}
            onSeekToSec={(sec) => setExternalSeekSec({ sec, nonce: Date.now() })}
            onRateSuccess={(id, nextRating) => setRatings((prev) => ({ ...prev, [id]: nextRating }))}
            onMergeFilms={mergeFilmsIntoCatalog}
          />
        ) : routeView === 'channels' ? (
          <ChannelsDirectoryPage
            onOpenChannel={handleOpenChannel}
            onBackHome={handleGoHome}
          />
        ) : routeView === 'channel' && channelRouteId ? (
          <ChannelPage
            channelId={channelRouteId}
            allFilms={allFilms}
            savedIds={savedIds}
            onToggleSave={toggleSave}
            onOpenFilm={(f) => handleOpenWatch(f)}
            onOpenChannel={handleOpenChannel}
            onBackHome={handleGoHome}
            onOpenDirectory={handleOpenChannels}
          />
        ) : (
          <div className="yt-home-grid-wrapper">
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

            {(filters.query || filters.channel || filters.sort === 'saved' || filters.sort === 'history') && (
              <div style={{ marginBottom: '14px', fontSize: '13.5px', color: 'var(--yt-text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>
                  Tìm thấy <strong style={{ color: 'var(--yt-text-primary)' }}>{gridFilms.length}</strong> bộ phim
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
                      onFilterChannel={(ch) => handleOpenChannel(ch)}
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
                      Tải thêm phim ({gridFilms.length - visibleFilms.length} phim còn lại)
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </main>

      <MobileNav
        activeView={isWatchMode ? 'watch' : routeView}
        activeSort={filters.sort}
        onSelectHome={() => {
          setFilters(DEFAULT_FILTERS);
          handleGoHome();
        }}
        onSelectChannels={handleOpenChannels}
        onSelectHot={() => {
          setFilters({ sort: 'hot' });
          handleGoHome();
        }}
        onSelectSaved={() => {
          setFilters({ sort: 'saved' });
          handleGoHome();
        }}
        onSelectHistory={() => {
          setFilters({ sort: 'history' });
          handleGoHome();
        }}
      />

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
    </div>
  );
}

export default App;
