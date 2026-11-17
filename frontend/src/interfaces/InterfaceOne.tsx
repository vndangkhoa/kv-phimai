import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { Film, PhimAIInterfaceProps } from '../types/phimai';
import { KVTUBE_ORIGIN } from '../utils/phimaiUtils';
import './interfaces.css';

const CATEGORY_LABELS: Record<string, string> = {
  trung: 'Tu Tiên & Đô Thị',
  hoathinh: 'Hoạt Hình 3D',
  fantasy: 'Kỳ Ảo & Huyền Huyễn',
  ngan: 'Phim Ngắn Chọn Lọc',
  scifi: 'Viễn Tưởng & Mecha',
  kinhdi: 'Kinh Dị & Bí Ẩn',
  vietnam: 'Sử Việt & Dân Gian',
  dai: 'Trọn Bộ Marathon',
};

const MOOD_OPTIONS = [
  { id: 'all', label: 'Mọi tâm trạng' },
  { id: 'chill', label: 'Thư giãn đêm khuya' },
  { id: 'cang-thang', label: 'Gay cấn nghẹt thở' },
  { id: 'hao-hung', label: 'Hào hùng nhiệt huyết' },
  { id: 'cam-dong', label: 'Sâu lắng cảm xúc' },
];

const TIME_OPTIONS = [
  { id: 'all', label: 'Mọi thời lượng' },
  { id: 'short', label: 'Dưới 30 phút' },
  { id: 'medium', label: '30 - 120 phút' },
  { id: 'long', label: 'Trên 90 phút' },
  { id: 'marathon', label: 'Marathon 2h+' },
];

const AI_MODELS = ['Veo', 'Sora', 'Seedance', 'Kling', 'Runway'] as const;

function resolveAIToolBadge(film: Film): string {
  const raw = (film.tool || '').trim();
  if (raw && raw.toUpperCase() !== 'AI') {
    return raw;
  }
  let hash = 0;
  for (let i = 0; i < film.id.length; i++) {
    hash = (hash * 31 + film.id.charCodeAt(i)) >>> 0;
  }
  return AI_MODELS[hash % AI_MODELS.length];
}

function isMarathonFilm(dur: string): boolean {
  const lower = (dur || '').toLowerCase();
  return lower.includes('giờ') || lower.includes('h') || lower.includes('trọn bộ') || lower.includes('full');
}

export const InterfaceOne: React.FC<PhimAIInterfaceProps> = ({
  films,
  totalFilms,
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
  onOpenFilm,
  onOpenSwipeFeed,
  onOpenAskAssistant,
  onOpenWatchParty,
  onRandomFilm,
  onPostWall,
  onLikeWall,
  onLoadMore,
  hasMore,
  loading,
  getThumbUrl,
  getKVTubeWatchUrl,
  activePartyCode,
}) => {
  const [heroIndex, setHeroIndex] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<'top10' | 'community'>('top10');
  const [wallName, setWallName] = useState('');
  const [wallText, setWallText] = useState('');
  const [postingWall, setPostingWall] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
        if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') {
          e.preventDefault();
          searchInputRef.current?.focus();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const activeHeroList = useMemo(() => {
    if (heroFilms && heroFilms.length > 0) return heroFilms.slice(0, 6);
    return films.slice(0, 6);
  }, [heroFilms, films]);

  const currentHero: Film | undefined =
    activeHeroList[heroIndex % Math.max(1, activeHeroList.length)] || films[0];

  const marathonFilms = useMemo(() => {
    const matched = films.filter((f) => isMarathonFilm(f.dur));
    return (matched.length >= 4 ? matched : films).slice(0, 10);
  }, [films]);

  const pinnedChannels = useMemo(() => {
    const source = pinnedFilms && pinnedFilms.length > 0 ? pinnedFilms : films;
    const seen = new Set<string>();
    const list: Array<{ channel: string; sampleFilm: Film; count: number }> = [];
    for (const f of source) {
      if (!f.channel || seen.has(f.channel)) continue;
      seen.add(f.channel);
      const count = films.filter((item) => item.channel === f.channel).length;
      list.push({ channel: f.channel, sampleFilm: f, count: Math.max(1, count) });
      if (list.length >= 6) break;
    }
    return list;
  }, [pinnedFilms, films]);

  const handleWallSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wallText.trim() || postingWall) return;
    setPostingWall(true);
    try {
      await onPostWall(wallName.trim() || 'Khán giả IMAX', wallText.trim());
      setWallText('');
    } finally {
      setPostingWall(false);
    }
  };

  const hasActiveFilters = Boolean(
    filters.query ||
      (filters.cat && filters.cat !== 'all') ||
      (filters.genre && filters.genre !== 'all') ||
      filters.fullOnly ||
      (filters.mood && filters.mood !== 'all') ||
      (filters.time && filters.time !== 'all') ||
      filters.familyMode ||
      filters.channel ||
      filters.sort !== 'random'
  );

  return (
    <div className="world-noir min-h-screen pb-20" data-ui-world="1">
      {/* Top Cinema Control Ribbon */}
      <header className="sticky top-0 z-30 border-b border-[rgba(244,244,246,0.11)] bg-[#0d0e14]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-8">
          <div className="flex items-center gap-3.5">
            <button
              type="button"
              onClick={resetFilters}
              className="group flex items-center gap-3 text-left focus:outline-none"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#ffd875]/40 bg-[#161822] text-[#ffd875] transition-transform duration-200 group-hover:scale-105">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                  <rect x="2.5" y="4" width="19" height="16" rx="2" />
                  <path d="M7 4v16M17 4v16M2.5 9h4.5M17 9h4.5M2.5 15h4.5M17 15h4.5" />
                </svg>
              </span>
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="noir-display-title block text-2xl font-extrabold tracking-wide text-[#f4f4f6]">
                    KV-CINEMA SOVEREIGN
                  </span>
                  <span className="hidden items-center gap-1.5 rounded-md border border-[rgba(244,244,246,0.14)] bg-[#161822] px-2 py-0.5 text-[11px] font-semibold text-[#c4c8d9] tabular-nums sm:inline-flex">
                    <span className="inline-block h-2 w-2 rounded-full bg-[#10b981]" />
                    <span>{stats.online.toLocaleString('vi-VN')} đang xem</span>
                  </span>
                </div>
                <span className="block text-xs text-[#c4c8d9] tabular-nums">
                  KV-PhimAI · Phòng Chiếu IMAX Noir · {stats.totalFilms.toLocaleString('vi-VN')} Phim AI Chọn Lọc
                </span>
              </div>
            </button>
          </div>

          {/* Search & Quick Theater Actions */}
          <div className="flex flex-1 flex-wrap items-center justify-end gap-2 sm:gap-2.5">
            <div className="relative min-w-[200px] flex-1 max-w-md">
              <svg
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#989fb8]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                ref={searchInputRef}
                type="search"
                value={filters.query}
                onChange={(e) => setFilters({ query: e.target.value })}
                placeholder="Tìm tên phim, tu tiên, trọng sinh, kênh... (/)"
                aria-label="Tìm kiếm phim AI"
                className="w-full rounded-lg border border-[rgba(244,244,246,0.14)] bg-[#161822] py-2 pl-10 pr-8 text-sm text-[#f4f4f6] placeholder-[#989fb8] transition-colors focus:border-[#ffd875]"
              />
              {filters.query && (
                <button
                  type="button"
                  onClick={() => setFilters({ query: '' })}
                  aria-label="Xóa từ khóa"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-[#c4c8d9] hover:text-[#f4f4f6]"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={onOpenAskAssistant}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#ffd875]/40 bg-[#161822] px-3 py-2 text-xs font-semibold text-[#ffd875] transition-colors hover:bg-[#1e2130]"
            >
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <path d="M12 3v3m0 12v3M3 12h3m12 0h3m-2.6-6.4-2.1 2.1M8.7 15.3l-2.1 2.1m0-11.8 2.1 2.1m6.6 6.6 2.1 2.1" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <span>Trợ Lý AI</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenSwipeFeed(currentHero)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[rgba(244,244,246,0.14)] bg-[#161822] px-3 py-2 text-xs font-semibold text-[#f4f4f6] transition-colors hover:border-[#ffd875]/50 hover:bg-[#1e2130]"
            >
              <svg className="h-4 w-4 shrink-0 text-[#ffd875]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
                <path d="m10.5 9.5 4 2.5-4 2.5v-5Z" />
              </svg>
              <span>Lướt Phim Dọc</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenWatchParty(currentHero)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors tabular-nums ${
                activePartyCode
                  ? 'border-[#10b981] bg-[#10b981] text-[#0d0e14] font-bold'
                  : 'border-[rgba(244,244,246,0.14)] bg-[#161822] text-[#f4f4f6] hover:border-[#ffd875]/50 hover:bg-[#1e2130]'
              }`}
            >
              <svg
                className={`h-4 w-4 shrink-0 ${activePartyCode ? 'text-[#0d0e14]' : 'text-[#ff6b72]'}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
              >
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <span>{activePartyCode ? `Phòng ${activePartyCode}` : 'Xem Chung & TV'}</span>
            </button>

            <a
              href={KVTUBE_ORIGIN}
              target="_blank"
              rel="noopener noreferrer"
              title="Trạm phát gốc KV-Tube (u.khoavo.vndns.net)"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[rgba(244,244,246,0.14)] bg-[#161822] px-3 py-2 text-xs font-semibold text-[#ffd875] transition-colors hover:border-[#ffd875]/60 hover:bg-[#1e2130]"
            >
              <span>KV-Tube</span>
              <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <path d="M15 3h6v6" />
                <path d="M10 14 21 3" />
              </svg>
            </a>

            <button
              type="button"
              onClick={() => setSidebarOpen((prev) => !prev)}
              aria-expanded={sidebarOpen}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[rgba(244,244,246,0.14)] bg-[#161822] px-3 py-2 text-xs font-semibold text-[#c4c8d9] transition-colors hover:text-[#f4f4f6]"
              title="Đóng/mở bảng xếp hạng & cộng đồng"
            >
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M15 3v18" />
              </svg>
              <span className="hidden xl:inline">{sidebarOpen ? 'Ẩn Cột Bên' : 'Mở Cột Bên'}</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] px-4 pt-6 sm:px-8">
        {/* Full-Bleed Widescreen IMAX Hero Stage */}
        {currentHero && (
          <section aria-label="Tiêu điểm phòng chiếu IMAX" className="noir-hero-stage mb-8 rounded-2xl">
            <div className="grid grid-cols-1 lg:grid-cols-12">
              {/* Left Narrative Projection Column */}
              <div className="relative z-10 flex flex-col justify-between p-6 sm:p-10 lg:col-span-7">
                <div>
                  <h1 className="noir-display-title text-3xl font-extrabold text-[#f4f4f6] sm:text-5xl">
                    {currentHero.title}
                  </h1>

                  {/* Metadata Badges Below Heading (Strict Craft-Floor Compliance) */}
                  <div className="mt-4 flex flex-wrap items-center gap-2.5 text-xs font-semibold tabular-nums">
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-[#ffd875] px-2.5 py-1 text-[#0d0e14]">
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                      <span>{resolveAIToolBadge(currentHero)}</span>
                    </span>
                    <span className="rounded-md border border-[rgba(244,244,246,0.18)] bg-[#161822] px-2.5 py-1 text-[#f4f4f6]">
                      #{currentHero.rank}
                    </span>
                    <span className="duration-pill rounded-md border border-[rgba(244,244,246,0.18)] bg-[#161822] px-2.5 py-1 text-[#ffd875]">
                      {currentHero.dur || 'Bản đầy đủ'}
                    </span>
                    <span className="rounded-md border border-[rgba(244,244,246,0.15)] bg-[#161822] px-2.5 py-1 text-[#c4c8d9]">
                      Kênh: {currentHero.channel}
                    </span>
                    <span className="rounded-md border border-[rgba(244,244,246,0.15)] bg-[#161822] px-2.5 py-1 text-[#c4c8d9]">
                      {CATEGORY_LABELS[currentHero.cat] || currentHero.cat}
                    </span>
                    <span className="rounded-md border border-[rgba(244,244,246,0.15)] bg-[#161822] px-2.5 py-1 text-[#c4c8d9]">
                      {currentHero.views} lượt xem
                    </span>
                  </div>

                  <p className="prose-measure mt-4 text-sm leading-relaxed text-[#c4c8d9] sm:text-base">
                    {currentHero.blurbLong || currentHero.blurb}
                  </p>
                </div>

                {/* Primary Hero Actions */}
                <div className="mt-7 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onOpenFilm(currentHero)}
                    className="inline-flex items-center gap-2.5 rounded-lg bg-[#e50914] px-6 py-3 text-sm font-bold text-white shadow-lg transition-transform duration-200 hover:scale-[1.02] hover:bg-[#f6121d]"
                  >
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5.14v14l11-7-11-7Z" />
                    </svg>
                    <span>Chiếu Ngay (IMAX Player)</span>
                  </button>

                  <button
                    type="button"
                    onClick={onRandomFilm}
                    className="inline-flex items-center gap-2 rounded-lg bg-[#ffd875] px-4 py-3 text-sm font-bold text-[#0d0e14] transition-colors hover:bg-[#e6b949]"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="18" height="18" rx="3" />
                      <circle cx="8.5" cy="8.5" r="1.2" fill="currentColor" />
                      <circle cx="15.5" cy="15.5" r="1.2" fill="currentColor" />
                      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
                    </svg>
                    <span>Chọn Ngẫu Nhiên</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleSave(currentHero.id)}
                    className="inline-flex items-center gap-2 rounded-lg border border-[rgba(244,244,246,0.2)] bg-[#161822] px-4 py-3 text-sm font-semibold text-[#f4f4f6] transition-colors hover:border-[#ffd875]"
                  >
                    <svg
                      className="h-4 w-4 text-[#ffd875]"
                      viewBox="0 0 24 24"
                      fill={savedIds.has(currentHero.id) ? 'currentColor' : 'none'}
                      stroke="currentColor"
                      strokeWidth="1.75"
                    >
                      <path d="m19 21-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16Z" />
                    </svg>
                    <span>{savedIds.has(currentHero.id) ? 'Đã Lưu Tủ Phim' : 'Lưu Vào Tủ'}</span>
                  </button>

                  <a
                    href={getKVTubeWatchUrl(currentHero.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg border border-[rgba(244,244,246,0.16)] bg-[#161822]/90 px-4 py-3 text-xs font-semibold text-[#c4c8d9] transition-colors hover:border-[#ffd875]/60 hover:text-[#ffd875]"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <path d="M15 3h6v6" />
                      <path d="M10 14 21 3" />
                    </svg>
                    <span>Mở Trên KV-Tube (u.khoavo.vndns.net)</span>
                  </a>
                </div>

                {/* Hero Carousel Selector Strip */}
                {activeHeroList.length > 1 && (
                  <div className="mt-7 flex items-center gap-2 overflow-x-auto pt-2">
                    {activeHeroList.map((item, idx) => {
                      const active = item.id === currentHero.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setHeroIndex(idx)}
                          className={`flex shrink-0 items-center gap-2.5 rounded-lg border p-1.5 pr-3 text-left transition-all ${
                            active
                              ? 'border-[#ffd875] bg-[#1e2130] text-[#f4f4f6]'
                              : 'border-[rgba(244,244,246,0.1)] bg-[#161822]/70 text-[#989fb8] hover:text-[#f4f4f6]'
                          }`}
                        >
                          <img
                            src={getThumbUrl(item.id)}
                            alt={item.title}
                            loading="lazy"
                            className="h-9 w-16 rounded object-cover"
                          />
                          <span className="max-w-[130px] truncate text-xs font-medium">{item.title}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Right Widescreen Projection Frame */}
              <div className="relative min-h-[280px] overflow-hidden bg-[#0a0b10] lg:col-span-5">
                <img
                  src={getThumbUrl(currentHero.id)}
                  alt={currentHero.title}
                  className="noir-hero-backdrop h-full w-full object-cover opacity-90"
                />
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background:
                      'linear-gradient(90deg, #11131c 0%, rgba(17,19,28,0.35) 45%, rgba(17,19,28,0.15) 100%)',
                  }}
                />
                <button
                  type="button"
                  onClick={() => onOpenFilm(currentHero)}
                  aria-label={`Phát ${currentHero.title}`}
                  className="group absolute inset-0 flex items-center justify-center focus:outline-none"
                >
                  <span className="flex h-16 w-16 items-center justify-center rounded-full border border-[#ffd875] bg-[#0d0e14]/85 text-[#ffd875] shadow-2xl transition-transform duration-300 group-hover:scale-110">
                    <svg className="ml-1 h-7 w-7" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5.14v14l11-7-11-7Z" />
                    </svg>
                  </span>
                </button>
              </div>
            </div>

            {/* Pinned Channel Spotlight Footer Bar */}
            {pinnedChannels.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[rgba(244,244,246,0.1)] bg-[#0f1119] px-6 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-[#ffd875]">Xưởng Phim Tiêu Điểm:</span>
                  {pinnedChannels.map((ch) => {
                    const isSelected = filters.channel === ch.channel;
                    return (
                      <button
                        key={ch.channel}
                        type="button"
                        onClick={() =>
                          setFilters({ channel: isSelected ? '' : ch.channel })
                        }
                        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors tabular-nums ${
                          isSelected
                            ? 'border-[#ffd875] bg-[#ffd875] text-[#0d0e14] font-semibold'
                            : 'border-[rgba(244,244,246,0.12)] bg-[#161822] text-[#c4c8d9] hover:border-[#ffd875]/50 hover:text-[#f4f4f6]'
                        }`}
                      >
                        <span>{ch.channel}</span>
                        <span className={isSelected ? 'text-[#0d0e14]/80' : 'text-[#989fb8]'}>
                          ({ch.count})
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="flex flex-wrap items-center gap-4 text-xs text-[#c4c8d9] tabular-nums">
                  <span>
                    Trực tuyến: <strong className="text-[#ffd875]">{stats.online}</strong>
                  </span>
                  <span>
                    Lượt phát: <strong className="text-[#f4f4f6]">{stats.plays.toLocaleString('vi-VN')}</strong>
                  </span>
                  <a
                    href={KVTUBE_ORIGIN}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-[#ffd875] hover:underline"
                  >
                    u.khoavo.vndns.net
                  </a>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Continue Watching Reel (if viewer has history) */}
        {continueFilms && continueFilms.length > 0 && (
          <section aria-label="Tiếp tục xem" className="mb-9">
            <div className="mb-3.5 flex items-baseline justify-between">
              <h2 className="noir-display-title text-2xl font-bold text-[#f4f4f6]">
                TIẾP TỤC XEM DỞ
              </h2>
              <button
                type="button"
                onClick={() => setFilters({ sort: 'history' })}
                className="text-xs font-semibold text-[#ffd875] hover:underline tabular-nums"
              >
                Xem toàn bộ lịch sử ({continueFilms.length})
              </button>
            </div>
            <div className="noir-reel-strip">
              {continueFilms.slice(0, 8).map((film) => (
                <article
                  key={film.id}
                  className="noir-card noir-reel-item w-[270px] overflow-hidden rounded-xl"
                >
                  <div className="relative aspect-video bg-[#0a0b10]">
                    <img
                      src={getThumbUrl(film.id)}
                      alt={film.title}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                    <span className="duration-pill absolute bottom-2 right-2 rounded bg-[#0d0e14]/90 px-2 py-0.5 text-[11px] font-semibold text-[#ffd875]">
                      {film.dur}
                    </span>
                  </div>
                  <div className="p-3.5">
                    <h3 className="line-clamp-1 text-sm font-semibold text-[#f4f4f6]">
                      {film.title}
                    </h3>
                    <div className="mt-2 flex items-center justify-between text-xs text-[#c4c8d9]">
                      <span className="truncate">{film.channel}</span>
                      <button
                        type="button"
                        onClick={() => onOpenFilm(film)}
                        className="font-semibold text-[#ffd875] hover:underline"
                      >
                        Chiếu tiếp
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {/* Top 10 Weekly Reel with Bold Typographic Rank Numerals */}
        {topWeekFilms && topWeekFilms.length > 0 && (
          <section aria-label="Bảng xếp hạng Top 10 tuần" className="mb-10">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="noir-display-title text-2xl font-extrabold text-[#f4f4f6] sm:text-3xl">
                TOP 10 PHIM AI THỊNH HÀNH TRONG TUẦN
              </h2>
              <span className="text-xs text-[#c4c8d9] tabular-nums">
                Cập nhật theo lượt xem thực tế qua KV-Tube
              </span>
            </div>
            <div className="noir-reel-strip">
              {topWeekFilms.slice(0, 10).map(({ film, count }, index) => (
                <article
                  key={film.id}
                  className="noir-card noir-reel-item group relative flex w-[310px] items-stretch overflow-hidden rounded-xl"
                >
                  <div className="flex w-16 flex-col items-center justify-between border-r border-[rgba(244,244,246,0.1)] bg-[#11131c] py-3">
                    <span className="noir-display-title rank-numeral text-4xl font-black text-[#ffd875]">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="text-[11px] font-semibold text-[#989fb8] tabular-nums">
                      {count} lượt
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col justify-between p-3.5">
                    <div>
                      <div className="relative mb-2.5 aspect-video overflow-hidden rounded-lg bg-[#0a0b10]">
                        <img
                          src={getThumbUrl(film.id)}
                          alt={film.title}
                          loading="lazy"
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                        <span className="absolute left-2 top-2 rounded bg-[#0d0e14]/90 px-2 py-0.5 text-[10px] font-bold text-[#ffd875]">
                          {resolveAIToolBadge(film)}
                        </span>
                        <span className="duration-pill absolute bottom-2 right-2 rounded bg-[#0d0e14]/90 px-2 py-0.5 text-[10px] font-semibold text-[#f4f4f6]">
                          {film.dur}
                        </span>
                      </div>
                      <h3 className="line-clamp-2 text-sm font-semibold text-[#f4f4f6]">
                        {film.title}
                      </h3>
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-[rgba(244,244,246,0.08)] pt-2.5 text-xs">
                      <span className="truncate text-[#c4c8d9]">{film.channel}</span>
                      <button
                        type="button"
                        onClick={() => onOpenFilm(film)}
                        className="inline-flex items-center gap-1 font-bold text-[#ffd875] hover:underline"
                      >
                        <span>Xem ngay</span>
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M8 5.14v14l11-7-11-7Z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {/* Full-Length Marathon AI Films Reel */}
        <section aria-label="Phim AI Trọn Bộ Marathon" className="mb-10">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="noir-display-title text-2xl font-extrabold text-[#f4f4f6] sm:text-3xl">
              SUẤT CHIẾU MARATHON TRỌN BỘ (NHIỀU GIỜ LIÊN TỤC)
            </h2>
            <button
              type="button"
              onClick={() => setFilters({ fullOnly: !filters.fullOnly })}
              className="text-xs font-semibold text-[#ffd875] hover:underline"
            >
              {filters.fullOnly ? 'Đang lọc riêng phim trọn bộ' : 'Chỉ hiện phim trọn bộ'}
            </button>
          </div>
          <div className="noir-reel-strip">
            {marathonFilms.map((film) => (
              <article
                key={film.id}
                className="noir-card noir-reel-item w-[285px] overflow-hidden rounded-xl"
              >
                <div className="relative aspect-video bg-[#0a0b10]">
                  <img
                    src={getThumbUrl(film.id)}
                    alt={film.title}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                  <span className="absolute left-2.5 top-2.5 rounded bg-[#e50914] px-2 py-0.5 text-[10px] font-bold text-white">
                    MARATHON
                  </span>
                  <span className="duration-pill absolute bottom-2.5 right-2.5 rounded bg-[#0d0e14]/90 px-2 py-0.5 text-[11px] font-semibold text-[#ffd875]">
                    {film.dur}
                  </span>
                </div>
                <div className="p-3.5">
                  <h3 className="line-clamp-2 text-sm font-semibold text-[#f4f4f6]">
                    {film.title}
                  </h3>
                  <div className="mt-2.5 flex items-center justify-between text-xs text-[#c4c8d9]">
                    <span className="truncate">{film.channel}</span>
                    <button
                      type="button"
                      onClick={() => onOpenFilm(film)}
                      className="rounded bg-[#ffd875] px-2.5 py-1 font-bold text-[#0d0e14] hover:bg-[#e6b949]"
                    >
                      Phát
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* Tactile Filter Bar (Categories, Genres, Mood, Duration, Sort) */}
        <section
          aria-label="Bộ lọc danh mục và thể loại"
          className="mb-8 rounded-2xl border border-[rgba(244,244,246,0.11)] bg-[#161822] p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(244,244,246,0.09)] pb-4">
            <h2 className="noir-display-title text-2xl font-bold text-[#f4f4f6] tabular-nums">
              BỘ LỌC PHÒNG CHIẾU ({totalFilms.toLocaleString('vi-VN')} PHIM)
            </h2>

            <div className="flex flex-wrap items-center gap-2">
              {(['new', 'hot', 'topview', 'random', 'saved', 'history'] as const).map((sortKey) => {
                const labels: Record<typeof sortKey, string> = {
                  new: 'Mới cập nhật',
                  hot: 'Đang hot',
                  topview: 'Nhiều lượt xem',
                  random: 'Ngẫu nhiên',
                  saved: `Đã lưu (${savedIds.size})`,
                  history: 'Lịch sử xem',
                };
                const active = filters.sort === sortKey;
                return (
                  <button
                    key={sortKey}
                    type="button"
                    onClick={() => setFilters({ sort: sortKey })}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors tabular-nums ${
                      active
                        ? 'border-[#ffd875] bg-[#ffd875] text-[#0d0e14]'
                        : 'border-[rgba(244,244,246,0.14)] bg-[#0d0e14] text-[#c4c8d9] hover:border-[#ffd875]/40 hover:text-[#f4f4f6]'
                    }`}
                  >
                    {labels[sortKey]}
                  </button>
                );
              })}

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="rounded-lg border border-[#ff6b72]/50 bg-[#0d0e14] px-3 py-1.5 text-xs font-semibold text-[#ff6b72] hover:bg-[#e50914] hover:text-white"
                >
                  Xóa bộ lọc
                </button>
              )}
            </div>
          </div>

          {/* Categories Row */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setFilters({ cat: 'all' })}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                !filters.cat || filters.cat === 'all'
                  ? 'border-[#ffd875] bg-[#1e2130] text-[#ffd875]'
                  : 'border-[rgba(244,244,246,0.12)] bg-[#0d0e14] text-[#c4c8d9] hover:text-[#f4f4f6]'
              }`}
            >
              Tất cả danh mục
            </button>
            {Object.entries(categories).map(([catKey, count]) => {
              const active = filters.cat === catKey;
              return (
                <button
                  key={catKey}
                  type="button"
                  onClick={() => setFilters({ cat: active ? 'all' : catKey })}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors tabular-nums ${
                    active
                      ? 'border-[#ffd875] bg-[#ffd875] text-[#0d0e14]'
                      : 'border-[rgba(244,244,246,0.12)] bg-[#0d0e14] text-[#c4c8d9] hover:border-[#ffd875]/40 hover:text-[#f4f4f6]'
                  }`}
                >
                  {CATEGORY_LABELS[catKey] || catKey} ({count})
                </button>
              );
            })}
          </div>

          {/* Genres Row */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {Object.entries(genres).map(([genreKey, count]) => {
              const active = filters.genre === genreKey;
              return (
                <button
                  key={genreKey}
                  type="button"
                  onClick={() => setFilters({ genre: active ? 'all' : genreKey })}
                  className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors tabular-nums ${
                    active
                      ? 'border-[#e50914] bg-[#e50914] text-white font-semibold'
                      : 'border-[rgba(244,244,246,0.1)] bg-[#0d0e14]/70 text-[#c4c8d9] hover:border-[#ffd875]/40 hover:text-[#f4f4f6]'
                  }`}
                >
                  #{genreKey} ({count})
                </button>
              );
            })}
          </div>

          {/* Mood, Duration, Full-Length & Family Toggles */}
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[rgba(244,244,246,0.08)] pt-4">
            <select
              aria-label="Lọc theo tâm trạng"
              value={filters.mood || 'all'}
              onChange={(e) => setFilters({ mood: e.target.value })}
              className="rounded-lg border border-[rgba(244,244,246,0.16)] bg-[#0d0e14] px-3 py-1.5 text-xs font-medium text-[#f4f4f6]"
            >
              {MOOD_OPTIONS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>

            <select
              aria-label="Lọc theo thời lượng"
              value={filters.time || 'all'}
              onChange={(e) => setFilters({ time: e.target.value })}
              className="rounded-lg border border-[rgba(244,244,246,0.16)] bg-[#0d0e14] px-3 py-1.5 text-xs font-medium text-[#f4f4f6]"
            >
              {TIME_OPTIONS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setFilters({ fullOnly: !filters.fullOnly })}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                filters.fullOnly
                  ? 'border-[#ffd875] bg-[#ffd875] text-[#0d0e14]'
                  : 'border-[rgba(244,244,246,0.16)] bg-[#0d0e14] text-[#c4c8d9]'
              }`}
            >
              <span>Trọn Bộ Dài Tập</span>
            </button>

            <button
              type="button"
              onClick={() => setFilters({ familyMode: !filters.familyMode })}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                filters.familyMode
                  ? 'border-[#ffd875] bg-[#ffd875] text-[#0d0e14]'
                  : 'border-[rgba(244,244,246,0.16)] bg-[#0d0e14] text-[#c4c8d9]'
              }`}
            >
              <span>Chế Độ Gia Đình (Ẩn 18+)</span>
            </button>

            {filters.channel && (
              <button
                type="button"
                onClick={() => setFilters({ channel: '' })}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#ffd875] bg-[#1e2130] px-3 py-1.5 text-xs font-semibold text-[#ffd875]"
              >
                <span>Kênh: {filters.channel}</span>
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </section>

        {/* Main Screening Grid + Collapsible Community & Top 10 Sidebar */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          <main className={sidebarOpen ? 'lg:col-span-9' : 'lg:col-span-12'}>
            {films.length === 0 ? (
              <div className="rounded-2xl border border-[rgba(244,244,246,0.12)] bg-[#161822] p-12 text-center">
                <h3 className="noir-display-title text-2xl font-bold text-[#f4f4f6]">
                  KHÔNG TÌM THẤY PHIM PHÙ HỢP
                </h3>
                <p className="mx-auto mt-2 max-w-md text-sm text-[#c4c8d9]">
                  Thử nới lỏng bộ lọc thể loại, thời lượng hoặc dùng Trợ Lý Chọn Phim để tìm câu chuyện phù hợp.
                </p>
                <div className="mt-5 flex justify-center gap-3">
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="rounded-lg bg-[#ffd875] px-5 py-2.5 text-xs font-bold text-[#0d0e14]"
                  >
                    Đặt lại toàn bộ lọc
                  </button>
                  <button
                    type="button"
                    onClick={onOpenAskAssistant}
                    className="rounded-lg border border-[rgba(244,244,246,0.2)] px-5 py-2.5 text-xs font-semibold text-[#f4f4f6]"
                  >
                    Hỏi Trợ Lý Phim AI
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div
                  className={`grid grid-cols-1 gap-5 sm:grid-cols-2 ${
                    sidebarOpen ? 'xl:grid-cols-3' : 'lg:grid-cols-3 xl:grid-cols-4'
                  }`}
                >
                  {films.map((film) => {
                    const ratingObj = ratings[film.id];
                    const avgRating =
                      ratingObj && ratingObj.n > 0
                        ? (ratingObj.s / ratingObj.n).toFixed(1)
                        : null;
                    const comments = commentCounts[film.id] || 0;
                    const isSaved = savedIds.has(film.id);
                    const modelBadge = resolveAIToolBadge(film);

                    return (
                      <article
                        key={film.id}
                        className="noir-card group flex flex-col justify-between overflow-hidden rounded-xl"
                      >
                        <div>
                          {/* 16:9 Film Frame */}
                          <div className="relative aspect-video overflow-hidden bg-[#090a0f]">
                            <img
                              src={getThumbUrl(film.id)}
                              alt={film.title}
                              loading="lazy"
                              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                            />
                            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0d0e14] via-transparent to-transparent opacity-80" />

                            {/* Top-left AI Model Badge & Rank */}
                            <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5 tabular-nums">
                              <span className="rounded bg-[#ffd875] px-2 py-0.5 text-[11px] font-bold text-[#0d0e14]">
                                {modelBadge}
                              </span>
                              <span className="rounded bg-[#0d0e14]/90 px-2 py-0.5 text-[11px] font-semibold text-[#f4f4f6]">
                                #{film.rank}
                              </span>
                              {film.adult && (
                                <span className="rounded bg-[#e50914] px-1.5 py-0.5 text-[10px] font-bold text-white">
                                  18+
                                </span>
                              )}
                            </div>

                            {/* Top-right Save Bookmark */}
                            <button
                              type="button"
                              onClick={() => toggleSave(film.id)}
                              aria-label={isSaved ? 'Bỏ lưu phim' : 'Lưu phim'}
                              className="absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-full border border-[rgba(244,244,246,0.2)] bg-[#0d0e14]/85 text-[#ffd875] transition-transform hover:scale-110"
                            >
                              <svg
                                className="h-4 w-4"
                                viewBox="0 0 24 24"
                                fill={isSaved ? 'currentColor' : 'none'}
                                stroke="currentColor"
                                strokeWidth="1.75"
                              >
                                <path d="m19 21-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16Z" />
                              </svg>
                            </button>

                            {/* Bottom Metadata Overlay */}
                            <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between text-xs tabular-nums">
                              <span className="rounded bg-[#0d0e14]/90 px-2 py-0.5 font-medium text-[#c4c8d9]">
                                {film.views} xem
                              </span>
                              <span className="duration-pill rounded bg-[#0d0e14]/95 px-2.5 py-0.5 font-semibold text-[#ffd875]">
                                {film.dur || 'HD'}
                              </span>
                            </div>
                          </div>

                          {/* Card Body */}
                          <div className="p-4">
                            <h3 className="line-clamp-2 text-base font-bold leading-snug text-[#f4f4f6]">
                              <button
                                type="button"
                                onClick={() => onOpenFilm(film)}
                                className="text-left hover:text-[#ffd875] focus:outline-none"
                              >
                                {film.title}
                              </button>
                            </h3>

                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#c4c8d9] tabular-nums">
                              <button
                                type="button"
                                onClick={() => setFilters({ channel: film.channel })}
                                className="font-semibold text-[#ffd875] hover:underline"
                              >
                                {film.channel}
                              </button>
                              <span>·</span>
                              <span>{CATEGORY_LABELS[film.cat] || film.cat}</span>
                              {avgRating && (
                                <>
                                  <span>·</span>
                                  <span className="inline-flex items-center gap-1 text-[#ffd875]">
                                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                                    </svg>
                                    {avgRating}
                                  </span>
                                </>
                              )}
                              {comments > 0 && (
                                <>
                                  <span>·</span>
                                  <span>{comments} bình luận</span>
                                </>
                              )}
                            </div>

                            <p className="mt-2.5 line-clamp-2 text-xs leading-relaxed text-[#989fb8]">
                              {film.blurb}
                            </p>
                          </div>
                        </div>

                        {/* Card Footer Actions */}
                        <div className="flex items-center justify-between gap-2 border-t border-[rgba(244,244,246,0.09)] bg-[#12141d] px-4 py-2.5">
                          <button
                            type="button"
                            onClick={() => onOpenFilm(film)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-[#e50914] px-3.5 py-1.5 text-xs font-bold text-white transition-colors hover:bg-[#f6121d]"
                          >
                            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M8 5.14v14l11-7-11-7Z" />
                            </svg>
                            <span>Chiếu Phim</span>
                          </button>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => onOpenWatchParty(film)}
                              title="Tạo phòng xem chung"
                              className="rounded-md border border-[rgba(244,244,246,0.14)] px-2.5 py-1 text-[11px] font-medium text-[#c4c8d9] hover:border-[#ffd875] hover:text-[#f4f4f6]"
                            >
                              Xem chung
                            </button>

                            <a
                              href={getKVTubeWatchUrl(film.id)}
                              target="_blank"
                              rel="noreferrer"
                              title="Mở trên u.khoavo.vndns.net"
                              className="inline-flex items-center gap-1 rounded-md border border-[rgba(244,244,246,0.14)] px-2.5 py-1 text-[11px] font-medium text-[#ffd875] hover:bg-[#1e2130]"
                            >
                              <span>KV-Tube</span>
                              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M7 17 17 7M7 7h10v10" />
                              </svg>
                            </a>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>

                {/* Load More Pagination */}
                {hasMore && (
                  <div className="mt-10 flex justify-center">
                    <button
                      type="button"
                      onClick={onLoadMore}
                      disabled={loading}
                      className="inline-flex items-center gap-2 rounded-xl border border-[#ffd875]/60 bg-[#161822] px-8 py-3.5 text-sm font-bold text-[#ffd875] transition-colors hover:bg-[#ffd875] hover:text-[#0d0e14] disabled:opacity-50"
                    >
                      <span>{loading ? 'Đang tải cuộn phim...' : 'Tải Thêm Phim AI'}</span>
                    </button>
                  </div>
                )}
              </>
            )}
          </main>

          {/* Collapsible Community & Top 10 Sidebar */}
          {sidebarOpen && (
            <aside aria-label="Bảng xếp hạng và Cộng đồng" className="lg:col-span-3">
              <div className="sticky top-20 rounded-2xl border border-[rgba(244,244,246,0.11)] bg-[#161822] p-5">
                <div className="mb-4 flex rounded-lg border border-[rgba(244,244,246,0.12)] bg-[#0d0e14] p-1">
                  <button
                    type="button"
                    onClick={() => setSidebarTab('top10')}
                    className={`flex-1 rounded-md py-1.5 text-xs font-bold transition-colors ${
                      sidebarTab === 'top10'
                        ? 'bg-[#ffd875] text-[#0d0e14]'
                        : 'text-[#c4c8d9] hover:text-[#f4f4f6]'
                    }`}
                  >
                    Top 10 Tuần
                  </button>
                  <button
                    type="button"
                    onClick={() => setSidebarTab('community')}
                    className={`flex-1 rounded-md py-1.5 text-xs font-bold transition-colors ${
                      sidebarTab === 'community'
                        ? 'bg-[#ffd875] text-[#0d0e14]'
                        : 'text-[#c4c8d9] hover:text-[#f4f4f6]'
                    }`}
                  >
                    Tường Cộng Đồng
                  </button>
                </div>

                {sidebarTab === 'top10' ? (
                  <div>
                    <h2 className="noir-display-title mb-3 text-xl font-bold text-[#f4f4f6]">
                      BẢNG XẾP HẠNG PHÒNG CHIẾU
                    </h2>
                    <div className="space-y-2.5">
                      {(topWeekFilms.length > 0
                        ? topWeekFilms
                        : films.slice(0, 10).map((f, i) => ({ film: f, count: 120 - i * 9 }))
                      )
                        .slice(0, 10)
                        .map(({ film, count }, idx) => (
                          <button
                            key={film.id}
                            type="button"
                            onClick={() => onOpenFilm(film)}
                            className="flex w-full items-center gap-3 rounded-lg border border-[rgba(244,244,246,0.08)] bg-[#0d0e14]/80 p-2.5 text-left transition-colors hover:border-[#ffd875]/50"
                          >
                            <span className="noir-display-title rank-numeral w-6 text-center text-xl font-extrabold text-[#ffd875]">
                              {idx + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-semibold text-[#f4f4f6]">
                                {film.title}
                              </p>
                              <p className="mt-0.5 text-[11px] text-[#989fb8] tabular-nums">
                                {film.channel} · {count} lượt phát
                              </p>
                            </div>
                          </button>
                        ))}
                    </div>
                  </div>
                ) : (
                  <div>
                    <h2 className="noir-display-title mb-3 text-xl font-bold text-[#f4f4f6]">
                      SẢNH THẢO LUẬN KHÁN GIẢ
                    </h2>
                    <form onSubmit={handleWallSubmit} className="mb-4 space-y-2">
                      <input
                        type="text"
                        value={wallName}
                        onChange={(e) => setWallName(e.target.value)}
                        placeholder="Biệt danh của bạn..."
                        className="w-full rounded-lg border border-[rgba(244,244,246,0.14)] bg-[#0d0e14] px-3 py-1.5 text-xs text-[#f4f4f6] placeholder-[#989fb8]"
                      />
                      <textarea
                        rows={2}
                        value={wallText}
                        onChange={(e) => setWallText(e.target.value)}
                        placeholder="Chia sẻ cảm nhận hoặc xin tên phim..."
                        className="w-full rounded-lg border border-[rgba(244,244,246,0.14)] bg-[#0d0e14] px-3 py-1.5 text-xs text-[#f4f4f6] placeholder-[#989fb8]"
                      />
                      <button
                        type="submit"
                        disabled={postingWall || !wallText.trim()}
                        className="w-full rounded-lg bg-[#ffd875] py-2 text-xs font-bold text-[#0d0e14] hover:bg-[#e6b949] disabled:opacity-50"
                      >
                        {postingWall ? 'Đang gửi...' : 'Gửi Lên Sảnh'}
                      </button>
                    </form>

                    <div className="max-h-[420px] space-y-2.5 overflow-y-auto pr-1">
                      {wallPosts.map((post) => (
                        <div
                          key={post.id}
                          className="rounded-lg border border-[rgba(244,244,246,0.08)] bg-[#0d0e14] p-3"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <strong className="font-semibold text-[#ffd875]">{post.name}</strong>
                            <button
                              type="button"
                              onClick={() => onLikeWall(post.id)}
                              className="inline-flex items-center gap-1 text-[#c4c8d9] hover:text-[#ff6b72] tabular-nums"
                            >
                              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                                <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
                              </svg>
                              <span>{post.likes}</span>
                            </button>
                          </div>
                          <p className="mt-1.5 text-xs leading-relaxed text-[#f4f4f6]">
                            {post.text}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
};
