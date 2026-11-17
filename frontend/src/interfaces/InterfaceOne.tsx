import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppShell } from '@astryxdesign/core/AppShell';
import { TopNav } from '@astryxdesign/core/TopNav';
import { MobileNav, MobileNavToggle } from '@astryxdesign/core/MobileNav';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { ToggleButton } from '@astryxdesign/core/ToggleButton';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { Selector } from '@astryxdesign/core/Selector';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { Badge } from '@astryxdesign/core/Badge';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Grid } from '@astryxdesign/core/Grid';
import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
import { Divider } from '@astryxdesign/core/Divider';
import { useMediaQuery } from '@astryxdesign/core/hooks';
import {
  Bookmark,
  Dices,
  ExternalLink,
  Heart,
  PanelRight,
  Play,
  Search,
  Smartphone,
  Sparkles,
  Star,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import type { Film, PhimAIInterfaceProps } from '../types/phimai';
import { KVTUBE_ORIGIN } from '../utils/phimaiUtils';
import './interfaces.css';

/*
 * Responsive contract (KV-Cinema Sovereign on Astryx)
 *   ≥1024 (lg)  TopNav carries the full action row (labels from 1440, icon-only
 *               with tooltips 1024–1439). Film grid + sticky Top 10 / Community
 *               sidebar side by side; sidebar toggle hides the column.
 *   <1024       AppShell mobileNav breakpoint "lg": compact bar = logo, search
 *               trigger, menu toggle. Actions move into the MobileNav drawer.
 *               Sidebar stacks below the grid as a full-width section.
 *   <640        Hero: projection frame first, primary CTA full width, secondary
 *               CTAs in a 2-column group. Filter rows and reels scroll-snap
 *               horizontally inside their own track; the page never overflows.
 *   Touch       Below lg every Astryx control is ≥44px (index.css size tokens);
 *               custom chips and text links get min-h-11.
 */

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
  { value: 'all', label: 'Mọi tâm trạng' },
  { value: 'chill', label: 'Thư giãn đêm khuya' },
  { value: 'cang-thang', label: 'Gay cấn nghẹt thở' },
  { value: 'hao-hung', label: 'Hào hùng nhiệt huyết' },
  { value: 'cam-dong', label: 'Sâu lắng cảm xúc' },
];

const TIME_OPTIONS = [
  { value: 'all', label: 'Mọi thời lượng' },
  { value: 'short', label: 'Dưới 30 phút' },
  { value: 'medium', label: '30 - 120 phút' },
  { value: 'long', label: 'Trên 90 phút' },
  { value: 'marathon', label: 'Marathon 2h+' },
];

const SORT_KEYS = ['new', 'hot', 'topview', 'random', 'saved', 'history'] as const;

const AI_MODELS = ['Veo', 'Sora', 'Seedance', 'Kling', 'Runway'] as const;

const ICON = { size: 16, strokeWidth: 1.75 } as const;

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

/** Brand mark: authored 35mm film-frame glyph, 1.75 stroke. */
const BrandMark: React.FC = () => (
  <span className="kv-brand-mark" aria-hidden="true">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <rect x="2.5" y="4" width="19" height="16" rx="2" />
      <path d="M7 4v16M17 4v16M2.5 9h4.5M17 9h4.5M2.5 15h4.5M17 15h4.5" />
    </svg>
  </span>
);

/** Small overlay label on a thumbnail (duration, rank, model). Metadata, not a Badge. */
const FramePill: React.FC<{ className?: string; tone?: 'gold' | 'ivory' | 'muted' | 'solid'; children: React.ReactNode }> = ({
  className = '',
  tone = 'ivory',
  children,
}) => <span className={`kv-frame-pill kv-frame-pill--${tone} tabular-nums ${className}`}>{children}</span>;

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
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const mobileSearchRef = useRef<HTMLInputElement | null>(null);
  const sidebarRef = useRef<HTMLElement | null>(null);

  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const isWide = useMediaQuery('(min-width: 1440px)');
  const isPhone = !useMediaQuery('(min-width: 640px)');

  // "/" focuses search: the header field on desktop, the drop-down search row on mobile.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
        if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') {
          e.preventDefault();
          if (window.matchMedia('(min-width: 1024px)').matches) {
            searchInputRef.current?.focus();
          } else {
            setMobileSearchOpen(true);
            requestAnimationFrame(() => mobileSearchRef.current?.focus());
          }
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Keep the mobile search row docked right under the sticky AppShell header.
  useEffect(() => {
    const header = document.querySelector<HTMLElement>('.astryx-app-shell-header');
    if (!header || typeof ResizeObserver === 'undefined') return;
    const sync = () =>
      document.documentElement.style.setProperty('--kv-header-h', `${Math.round(header.getBoundingClientRect().height)}px`);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(header);
    return () => ro.disconnect();
  }, [isDesktop]);

  useEffect(() => {
    if (isDesktop) setMobileSearchOpen(false);
  }, [isDesktop]);

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

  const sidebarTopList = useMemo(
    () =>
      (topWeekFilms.length > 0
        ? topWeekFilms
        : films.slice(0, 10).map((f, i) => ({ film: f, count: 120 - i * 9 }))
      ).slice(0, 10),
    [topWeekFilms, films]
  );

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

  const sortLabels: Record<(typeof SORT_KEYS)[number], string> = {
    new: 'Mới cập nhật',
    hot: 'Đang hot',
    topview: 'Nhiều lượt xem',
    random: 'Ngẫu nhiên',
    saved: `Đã lưu (${savedIds.size})`,
    history: 'Lịch sử xem',
  };

  const partyLabel = activePartyCode ? `Phòng ${activePartyCode}` : 'Xem Chung & TV';
  const sidebarLabel = sidebarOpen ? 'Ẩn Cột Bên' : 'Mở Cột Bên';

  const closeMenuThen = (fn: () => void) => () => {
    setMenuOpen(false);
    fn();
  };

  const showSidebarSection = () => {
    setSidebarOpen(true);
    requestAnimationFrame(() => sidebarRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  /* ------------------------------------------------------------------ header */

  const brand = (
    <button type="button" onClick={resetFilters} className="kv-brand" aria-label="KV-Cinema Sovereign: về trang chủ và xóa bộ lọc">
      <BrandMark />
      <span className="kv-brand-text">
        <span className="kv-brand-row">
          <span className="noir-display-title kv-brand-name">KV-CINEMA SOVEREIGN</span>
          <span className="kv-live-pill tabular-nums">
            <span className="kv-live-dot" aria-hidden="true" />
            {stats.online.toLocaleString('vi-VN')} đang xem
          </span>
        </span>
        <span className="kv-brand-sub tabular-nums">
          KV-PhimAI · Phòng Chiếu IMAX Noir · {stats.totalFilms.toLocaleString('vi-VN')} Phim AI Chọn Lọc
        </span>
      </span>
    </button>
  );

  const desktopActions = (
    <HStack gap={2} vAlign="center" className="kv-desktop-actions">
      <TextInput
        ref={searchInputRef}
        type="search"
        label="Tìm kiếm phim AI"
        isLabelHidden
        value={filters.query}
        onChange={(value) => setFilters({ query: value })}
        placeholder="Tìm tên phim, kênh, thể loại… (/)"
        startIcon={Search}
        hasClear
        enterKeyHint="search"
        containerClassName="kv-header-search"
      />
      <Button
        label="Trợ Lý AI"
        isIconOnly={!isWide}
        tooltip={isWide ? undefined : 'Trợ Lý AI'}
        icon={<Sparkles {...ICON} />}
        onClick={onOpenAskAssistant}
        className="kv-action kv-action--gold"
      />
      <Button
        label="Lướt Phim Dọc"
        isIconOnly={!isWide}
        tooltip={isWide ? undefined : 'Lướt Phim Dọc'}
        icon={<Smartphone {...ICON} />}
        onClick={() => onOpenSwipeFeed(currentHero)}
        className="kv-action"
      />
      <Button
        label={partyLabel}
        isIconOnly={!isWide}
        tooltip={isWide ? undefined : partyLabel}
        icon={<Users {...ICON} />}
        onClick={() => onOpenWatchParty(currentHero)}
        className={`kv-action tabular-nums ${activePartyCode ? 'kv-action--live' : 'kv-action--party'}`}
      />
      <Button
        label="KV-Tube"
        isIconOnly={!isWide}
        tooltip="Trạm phát gốc KV-Tube (u.khoavo.vndns.net)"
        icon={<ExternalLink {...ICON} />}
        href={KVTUBE_ORIGIN}
        target="_blank"
        rel="noopener noreferrer"
        className="kv-action kv-action--gold"
      />
      <ToggleButton
        label={sidebarLabel}
        isIconOnly
        tooltip="Đóng/mở bảng xếp hạng & cộng đồng"
        icon={<PanelRight {...ICON} />}
        isPressed={sidebarOpen}
        onPressedChange={(pressed) => setSidebarOpen(pressed)}
        className="kv-action"
      />
    </HStack>
  );

  const compactActions = (
    <HStack gap={1} vAlign="center">
      <IconButton
        label={mobileSearchOpen ? 'Đóng tìm kiếm' : 'Tìm kiếm phim'}
        icon={mobileSearchOpen ? <X {...ICON} /> : <Search {...ICON} />}
        variant="ghost"
        onClick={() => {
          setMobileSearchOpen((open) => {
            if (!open) requestAnimationFrame(() => mobileSearchRef.current?.focus());
            return !open;
          });
        }}
        className={filters.query && !mobileSearchOpen ? 'kv-search-trigger--active' : undefined}
      />
      <MobileNavToggle label="Mở menu phòng chiếu" />
    </HStack>
  );

  const mobileMenu = (
    <MobileNav header={<span className="noir-display-title kv-menu-title">PHÒNG CHIẾU</span>} width={320}>
      <VStack gap={2} className="kv-menu">
        <Button
          label="Trợ Lý AI"
          icon={<Sparkles {...ICON} />}
          width="100%"
          onClick={closeMenuThen(onOpenAskAssistant)}
          className="kv-menu-item kv-action--gold"
        />
        <Button
          label="Lướt Phim Dọc"
          icon={<Smartphone {...ICON} />}
          width="100%"
          onClick={closeMenuThen(() => onOpenSwipeFeed(currentHero))}
          className="kv-menu-item"
        />
        <Button
          label={partyLabel}
          icon={<Users {...ICON} />}
          width="100%"
          onClick={closeMenuThen(() => onOpenWatchParty(currentHero))}
          className={`kv-menu-item tabular-nums ${activePartyCode ? 'kv-action--live' : 'kv-action--party'}`}
        />
        <Button
          label="Xếp Hạng & Cộng Đồng"
          icon={<Trophy {...ICON} />}
          width="100%"
          onClick={closeMenuThen(showSidebarSection)}
          className="kv-menu-item"
        />
        <Button
          label="Mở KV-Tube"
          tooltip="u.khoavo.vndns.net"
          icon={<ExternalLink {...ICON} />}
          width="100%"
          href={KVTUBE_ORIGIN}
          target="_blank"
          rel="noopener noreferrer"
          className="kv-menu-item kv-action--gold"
        />
        <Divider />
        <VStack gap={1} className="kv-menu-stats tabular-nums">
          <span>
            Trực tuyến: <strong className="text-[#ffd875]">{stats.online.toLocaleString('vi-VN')}</strong>
          </span>
          <span>
            Lượt phát: <strong className="text-[#f4f4f6]">{stats.plays.toLocaleString('vi-VN')}</strong>
          </span>
          <span>
            Kho phim: <strong className="text-[#f4f4f6]">{stats.totalFilms.toLocaleString('vi-VN')}</strong>
          </span>
        </VStack>
      </VStack>
    </MobileNav>
  );

  const topNav = (
    <TopNav
      label="Điều hướng phòng chiếu"
      heading={brand}
      endContent={isDesktop ? desktopActions : compactActions}
    />
  );

  /* -------------------------------------------------------------- page body */

  return (
    <div className="world-noir" data-ui-world="1">
      <AppShell
        height="auto"
        variant="section"
        contentPadding={0}
        topNav={topNav}
        mobileNav={{
          breakpoint: 'lg',
          hasToggle: false,
          isOpen: menuOpen,
          onOpenChange: setMenuOpen,
          content: mobileMenu,
        }}
      >
        {mobileSearchOpen && !isDesktop && (
          <div className="kv-mobile-search">
            <TextInput
              ref={mobileSearchRef}
              type="search"
              label="Tìm kiếm phim AI"
              isLabelHidden
              value={filters.query}
              onChange={(value) => setFilters({ query: value })}
              placeholder="Tìm tên phim, kênh, thể loại…"
              startIcon={Search}
              hasClear
              enterKeyHint="search"
              onEnter={() => setMobileSearchOpen(false)}
              width="100%"
            />
          </div>
        )}

        <div className="kv-page">
          {/* Widescreen IMAX hero stage */}
          {currentHero && (
            <section aria-label="Tiêu điểm phòng chiếu IMAX" className="noir-hero-stage kv-hero">
              <div className="kv-hero-grid">
                <div className="kv-hero-copy">
                  <div>
                    <Heading level={1} className="noir-display-title kv-hero-title">
                      {currentHero.title}
                    </Heading>

                    <div className="kv-hero-meta tabular-nums">
                      <span className="kv-meta-chip kv-meta-chip--gold">
                        <Star size={14} strokeWidth={2} aria-hidden="true" />
                        {resolveAIToolBadge(currentHero)}
                      </span>
                      <span className="kv-meta-chip">#{currentHero.rank}</span>
                      <span className="kv-meta-chip kv-meta-chip--accent duration-pill">
                        {currentHero.dur || 'Bản đầy đủ'}
                      </span>
                      <span className="kv-meta-chip kv-meta-chip--muted">Kênh: {currentHero.channel}</span>
                      <span className="kv-meta-chip kv-meta-chip--muted">
                        {CATEGORY_LABELS[currentHero.cat] || currentHero.cat}
                      </span>
                      <span className="kv-meta-chip kv-meta-chip--muted">{currentHero.views} lượt xem</span>
                    </div>

                    <p className="prose-measure kv-hero-blurb">{currentHero.blurbLong || currentHero.blurb}</p>
                  </div>

                  {/* Hero CTAs: primary full width on phones, secondaries grouped */}
                  <div className="kv-hero-ctas">
                    <Button
                      label="Chiếu Ngay (IMAX Player)"
                      size="lg"
                      icon={<Play size={18} fill="currentColor" strokeWidth={0} />}
                      onClick={() => onOpenFilm(currentHero)}
                      className="kv-cta kv-cta--crimson kv-cta--primary"
                    />
                    <Button
                      label={isPhone ? 'Ngẫu Nhiên' : 'Chọn Ngẫu Nhiên'}
                      size={isPhone ? 'md' : 'lg'}
                      variant="primary"
                      icon={<Dices {...ICON} />}
                      onClick={onRandomFilm}
                      className="kv-cta"
                    />
                    <Button
                      label={savedIds.has(currentHero.id) ? (isPhone ? 'Đã Lưu' : 'Đã Lưu Tủ Phim') : 'Lưu Vào Tủ'}
                      size={isPhone ? 'md' : 'lg'}
                      icon={
                        <Bookmark
                          {...ICON}
                          className="text-[#ffd875]"
                          fill={savedIds.has(currentHero.id) ? 'currentColor' : 'none'}
                        />
                      }
                      onClick={() => toggleSave(currentHero.id)}
                      className="kv-cta kv-cta--outline"
                    />
                    <Button
                      label="Mở Trên KV-Tube"
                      size={isPhone ? 'md' : 'lg'}
                      variant="ghost"
                      icon={<ExternalLink {...ICON} />}
                      href={getKVTubeWatchUrl(currentHero.id)}
                      target="_blank"
                      rel="noreferrer"
                      tooltip="Mở trên u.khoavo.vndns.net"
                      className="kv-cta kv-cta--link"
                    />
                  </div>

                  {/* Hero carousel selector strip */}
                  {activeHeroList.length > 1 && (
                    <div className="kv-hero-strip noir-snap-row" role="group" aria-label="Chọn phim tiêu điểm">
                      {activeHeroList.map((item, idx) => {
                        const active = item.id === currentHero.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setHeroIndex(idx)}
                            aria-pressed={active}
                            className={`kv-hero-thumb ${active ? 'is-active' : ''}`}
                          >
                            <img src={getThumbUrl(item.id)} alt="" loading="lazy" />
                            <span>{item.title}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Widescreen projection frame */}
                <div className="kv-hero-frame">
                  <img
                    src={getThumbUrl(currentHero.id)}
                    alt={currentHero.title}
                    className="noir-hero-backdrop"
                  />
                  <div className="kv-hero-frame-shade" aria-hidden="true" />
                  <button
                    type="button"
                    onClick={() => onOpenFilm(currentHero)}
                    aria-label={`Phát ${currentHero.title}`}
                    className="kv-hero-play group"
                  >
                    <span>
                      <Play size={28} fill="currentColor" strokeWidth={0} className="ml-1" />
                    </span>
                  </button>
                </div>
              </div>

              {/* Pinned channel spotlight footer bar */}
              {pinnedChannels.length > 0 && (
                <div className="kv-hero-footer">
                  <div className="kv-hero-channels">
                    <span className="kv-hero-channels-label">Xưởng Phim Tiêu Điểm</span>
                    <div className="noir-snap-row kv-chip-row" role="group" aria-label="Xưởng phim tiêu điểm">
                      {pinnedChannels.map((ch) => {
                        const isSelected = filters.channel === ch.channel;
                        return (
                          <ToggleButton
                            key={ch.channel}
                            label={`${ch.channel} (${ch.count})`}
                            size="sm"
                            isPressed={isSelected}
                            onPressedChange={() => setFilters({ channel: isSelected ? '' : ch.channel })}
                            className="kv-chip tabular-nums"
                          >
                            {ch.channel} <span className="kv-chip-count">({ch.count})</span>
                          </ToggleButton>
                        );
                      })}
                    </div>
                  </div>
                  <div className="kv-hero-stats tabular-nums">
                    <span>
                      Trực tuyến: <strong className="text-[#ffd875]">{stats.online}</strong>
                    </span>
                    <span>
                      Lượt phát: <strong className="text-[#f4f4f6]">{stats.plays.toLocaleString('vi-VN')}</strong>
                    </span>
                    <a href={KVTUBE_ORIGIN} target="_blank" rel="noopener noreferrer" className="kv-text-link">
                      u.khoavo.vndns.net
                    </a>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Continue watching reel */}
          {continueFilms && continueFilms.length > 0 && (
            <section aria-label="Tiếp tục xem" className="kv-section">
              <div className="kv-section-head">
                <Heading level={2} className="noir-display-title kv-section-title">
                  TIẾP TỤC XEM DỞ
                </Heading>
                <button
                  type="button"
                  onClick={() => setFilters({ sort: 'history' })}
                  className="kv-text-link tabular-nums"
                >
                  Xem toàn bộ lịch sử ({continueFilms.length})
                </button>
              </div>
              <div className="noir-reel-strip">
                {continueFilms.slice(0, 8).map((film) => (
                  <article key={film.id} className="noir-card noir-reel-item kv-reel-card">
                    <button type="button" className="kv-thumb" onClick={() => onOpenFilm(film)} aria-label={`Chiếu tiếp ${film.title}`}>
                      <img src={getThumbUrl(film.id)} alt="" loading="lazy" />
                      <FramePill tone="gold" className="kv-pos-br duration-pill">
                        {film.dur}
                      </FramePill>
                    </button>
                    <div className="kv-reel-body">
                      <h3 className="kv-card-title line-clamp-1">{film.title}</h3>
                      <div className="kv-reel-foot">
                        <span className="truncate">{film.channel}</span>
                        <button type="button" onClick={() => onOpenFilm(film)} className="kv-text-link">
                          Chiếu tiếp
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* Top 10 weekly reel */}
          {topWeekFilms && topWeekFilms.length > 0 && (
            <section aria-label="Bảng xếp hạng Top 10 tuần" className="kv-section">
              <div className="kv-section-head">
                <Heading level={2} className="noir-display-title kv-section-title kv-section-title--lg">
                  TOP 10 PHIM AI THỊNH HÀNH TRONG TUẦN
                </Heading>
                <Text type="supporting" className="tabular-nums">
                  Cập nhật theo lượt xem thực tế qua KV-Tube
                </Text>
              </div>
              <div className="noir-reel-strip">
                {topWeekFilms.slice(0, 10).map(({ film, count }, index) => (
                  // Keyed by chart position: when live counts reorder the chart, the
                  // snapped card stays in place instead of the strip chasing a moved film.
                  <article key={`rank-${index}`} className="noir-card noir-reel-item group kv-top-card">
                    <div className="kv-top-rank">
                      <span className="noir-display-title rank-numeral">{String(index + 1).padStart(2, '0')}</span>
                      <span className="kv-top-count tabular-nums">{count} lượt</span>
                    </div>
                    <div className="kv-top-body">
                      <div>
                        <button type="button" className="kv-thumb kv-thumb--rounded" onClick={() => onOpenFilm(film)} aria-label={`Xem ${film.title}`}>
                          <img src={getThumbUrl(film.id)} alt="" loading="lazy" />
                          <FramePill tone="gold" className="kv-pos-tl">
                            {resolveAIToolBadge(film)}
                          </FramePill>
                          <FramePill className="kv-pos-br duration-pill">{film.dur}</FramePill>
                        </button>
                        <h3 className="kv-card-title line-clamp-2">{film.title}</h3>
                      </div>
                      <div className="kv-top-foot">
                        <span className="truncate">{film.channel}</span>
                        <button type="button" onClick={() => onOpenFilm(film)} className="kv-text-link kv-text-link--strong">
                          Xem ngay
                          <Play size={12} fill="currentColor" strokeWidth={0} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* Full-length marathon reel */}
          <section aria-label="Phim AI Trọn Bộ Marathon" className="kv-section">
            <div className="kv-section-head">
              <Heading level={2} className="noir-display-title kv-section-title kv-section-title--lg">
                SUẤT CHIẾU MARATHON TRỌN BỘ (NHIỀU GIỜ LIÊN TỤC)
              </Heading>
              <button type="button" onClick={() => setFilters({ fullOnly: !filters.fullOnly })} className="kv-text-link">
                {filters.fullOnly ? 'Đang lọc riêng phim trọn bộ' : 'Chỉ hiện phim trọn bộ'}
              </button>
            </div>
            <div className="noir-reel-strip">
              {marathonFilms.map((film) => (
                <article key={film.id} className="noir-card noir-reel-item kv-reel-card kv-reel-card--wide">
                  <button type="button" className="kv-thumb" onClick={() => onOpenFilm(film)} aria-label={`Phát ${film.title}`}>
                    <img src={getThumbUrl(film.id)} alt="" loading="lazy" />
                    <Badge label="MARATHON" variant="error" className="kv-pos-tl" />
                    <FramePill tone="gold" className="kv-pos-br duration-pill">
                      {film.dur}
                    </FramePill>
                  </button>
                  <div className="kv-reel-body">
                    <h3 className="kv-card-title line-clamp-2">{film.title}</h3>
                    <div className="kv-reel-foot">
                      <span className="truncate">{film.channel}</span>
                      <Button label="Phát" size="sm" variant="primary" onClick={() => onOpenFilm(film)} />
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          {/* Filter bar */}
          <section aria-label="Bộ lọc danh mục và thể loại" className="kv-filter">
            <div className="kv-filter-head">
              <Heading level={2} className="noir-display-title kv-section-title tabular-nums">
                BỘ LỌC PHÒNG CHIẾU ({totalFilms.toLocaleString('vi-VN')} PHIM)
              </Heading>
              {hasActiveFilters && (
                <Button
                  label="Xóa bộ lọc"
                  size="sm"
                  variant="destructive"
                  icon={<X {...ICON} />}
                  onClick={resetFilters}
                  className="kv-reset"
                />
              )}
            </div>

            <div className="kv-filter-row">
              <span className="kv-filter-label" id="kv-sort-label">
                Sắp xếp
              </span>
              <div className="noir-snap-row kv-chip-row" role="group" aria-labelledby="kv-sort-label">
                {SORT_KEYS.map((sortKey) => (
                  <ToggleButton
                    key={sortKey}
                    label={sortLabels[sortKey]}
                    size="sm"
                    isPressed={filters.sort === sortKey}
                    onPressedChange={() => setFilters({ sort: sortKey })}
                    className="kv-chip tabular-nums"
                  />
                ))}
              </div>
            </div>

            <div className="kv-filter-row">
              <span className="kv-filter-label" id="kv-cat-label">
                Danh mục
              </span>
              <div className="noir-snap-row kv-chip-row" role="group" aria-labelledby="kv-cat-label">
                <ToggleButton
                  label="Tất cả danh mục"
                  size="sm"
                  isPressed={!filters.cat || filters.cat === 'all'}
                  onPressedChange={() => setFilters({ cat: 'all' })}
                  className="kv-chip"
                />
                {Object.entries(categories).map(([catKey, count]) => {
                  const active = filters.cat === catKey;
                  return (
                    <ToggleButton
                      key={catKey}
                      label={`${CATEGORY_LABELS[catKey] || catKey} (${count})`}
                      size="sm"
                      isPressed={active}
                      onPressedChange={() => setFilters({ cat: active ? 'all' : catKey })}
                      className="kv-chip tabular-nums"
                    />
                  );
                })}
              </div>
            </div>

            <div className="kv-filter-row">
              <span className="kv-filter-label" id="kv-genre-label">
                Thể loại
              </span>
              <div className="noir-snap-row kv-chip-row kv-chip-row--genres" role="group" aria-labelledby="kv-genre-label">
                {Object.entries(genres).map(([genreKey, count]) => {
                  const active = filters.genre === genreKey;
                  return (
                    <ToggleButton
                      key={genreKey}
                      label={`#${genreKey} (${count})`}
                      size="sm"
                      isPressed={active}
                      onPressedChange={() => setFilters({ genre: active ? 'all' : genreKey })}
                      className="kv-chip kv-chip--genre tabular-nums"
                    />
                  );
                })}
              </div>
            </div>

            <div className="kv-filter-controls">
              <Selector
                label="Lọc theo tâm trạng"
                isLabelHidden
                options={MOOD_OPTIONS}
                value={filters.mood || 'all'}
                onChange={(value) => setFilters({ mood: value || 'all' })}
                presentation="adaptive"
                containerClassName="kv-select"
              />
              <Selector
                label="Lọc theo thời lượng"
                isLabelHidden
                options={TIME_OPTIONS}
                value={filters.time || 'all'}
                onChange={(value) => setFilters({ time: value || 'all' })}
                presentation="adaptive"
                containerClassName="kv-select"
              />
              <ToggleButton
                label="Trọn Bộ Dài Tập"
                isPressed={filters.fullOnly}
                onPressedChange={(pressed) => setFilters({ fullOnly: pressed })}
                className="kv-chip"
              />
              <ToggleButton
                label="Chế Độ Gia Đình (Ẩn 18+)"
                isPressed={filters.familyMode}
                onPressedChange={(pressed) => setFilters({ familyMode: pressed })}
                className="kv-chip"
              />
              {filters.channel && (
                <Button
                  label={`Kênh: ${filters.channel}`}
                  icon={<X {...ICON} />}
                  onClick={() => setFilters({ channel: '' })}
                  tooltip="Bỏ lọc theo kênh"
                  className="kv-action kv-action--gold kv-channel-chip"
                />
              )}
            </div>
          </section>

          {/* Screening grid + Top 10 / Community sidebar */}
          <div className={`kv-main-grid ${sidebarOpen ? 'has-sidebar' : ''}`}>
            <div className="kv-main-col">
              {films.length === 0 ? (
                <div className="kv-empty">
                  <Heading level={3} className="noir-display-title kv-section-title">
                    KHÔNG TÌM THẤY PHIM PHÙ HỢP
                  </Heading>
                  <Text as="p" color="secondary" className="kv-empty-copy">
                    Thử nới lỏng bộ lọc thể loại, thời lượng hoặc dùng Trợ Lý Chọn Phim để tìm câu chuyện phù hợp.
                  </Text>
                  <HStack gap={3} hAlign="center" wrap="wrap">
                    <Button label="Đặt lại toàn bộ lọc" variant="primary" onClick={resetFilters} />
                    <Button label="Hỏi Trợ Lý Phim AI" icon={<Sparkles {...ICON} />} onClick={onOpenAskAssistant} />
                  </HStack>
                </div>
              ) : (
                <>
                  <Grid columns={{ minWidth: 272, max: 4 }} gap={5}>
                    {films.map((film) => {
                      const ratingObj = ratings[film.id];
                      const avgRating =
                        ratingObj && ratingObj.n > 0 ? (ratingObj.s / ratingObj.n).toFixed(1) : null;
                      const comments = commentCounts[film.id] || 0;
                      const isSaved = savedIds.has(film.id);
                      const modelBadge = resolveAIToolBadge(film);

                      return (
                        <article key={film.id} className="noir-card group kv-film-card">
                          <div>
                            <div className="kv-film-frame">
                              <button
                                type="button"
                                className="kv-thumb kv-thumb--fill"
                                onClick={() => onOpenFilm(film)}
                                aria-label={`Chiếu ${film.title}`}
                                tabIndex={-1}
                              >
                                <img src={getThumbUrl(film.id)} alt="" loading="lazy" />
                              </button>
                              <div className="kv-film-frame-shade" aria-hidden="true" />

                              <div className="kv-pos-tl kv-pill-row tabular-nums">
                                <FramePill tone="solid">{modelBadge}</FramePill>
                                <FramePill>#{film.rank}</FramePill>
                                {film.adult && <Badge label="18+" variant="error" />}
                              </div>

                              <IconButton
                                label={isSaved ? 'Bỏ lưu phim' : 'Lưu phim'}
                                icon={<Bookmark {...ICON} fill={isSaved ? 'currentColor' : 'none'} />}
                                size="sm"
                                onClick={() => toggleSave(film.id)}
                                className="kv-save-btn kv-pos-tr"
                              />

                              <div className="kv-pos-bottom tabular-nums">
                                <FramePill tone="muted">{film.views} xem</FramePill>
                                <FramePill tone="gold" className="duration-pill">
                                  {film.dur || 'HD'}
                                </FramePill>
                              </div>
                            </div>

                            <div className="kv-film-body">
                              <h3 className="kv-film-title line-clamp-2">
                                <button type="button" onClick={() => onOpenFilm(film)}>
                                  {film.title}
                                </button>
                              </h3>

                              <div className="kv-film-meta tabular-nums">
                                <button
                                  type="button"
                                  onClick={() => setFilters({ channel: film.channel })}
                                  className="kv-text-link"
                                >
                                  {film.channel}
                                </button>
                                <span aria-hidden="true">·</span>
                                <span>{CATEGORY_LABELS[film.cat] || film.cat}</span>
                                {avgRating && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span className="kv-rating">
                                      <Star size={14} fill="currentColor" strokeWidth={0} aria-hidden="true" />
                                      {avgRating}
                                    </span>
                                  </>
                                )}
                                {comments > 0 && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span>{comments} bình luận</span>
                                  </>
                                )}
                              </div>

                              <p className="kv-film-blurb line-clamp-2">{film.blurb}</p>
                            </div>
                          </div>

                          <div className="kv-film-foot">
                            <Button
                              label="Chiếu Phim"
                              size="sm"
                              icon={<Play size={14} fill="currentColor" strokeWidth={0} />}
                              onClick={() => onOpenFilm(film)}
                              className="kv-cta--crimson"
                            />
                            <HStack gap={1.5} vAlign="center">
                              <IconButton
                                label="Xem chung: tạo phòng xem chung"
                                size="sm"
                                variant="ghost"
                                tooltip="Tạo phòng xem chung"
                                icon={<Users {...ICON} />}
                                onClick={() => onOpenWatchParty(film)}
                                className="kv-party-icon"
                              />
                              <Button
                                label="KV-Tube"
                                size="sm"
                                variant="ghost"
                                icon={<ExternalLink size={14} strokeWidth={1.75} />}
                                href={getKVTubeWatchUrl(film.id)}
                                target="_blank"
                                rel="noreferrer"
                                tooltip="Mở trên u.khoavo.vndns.net"
                                className="kv-text-gold"
                              />
                            </HStack>
                          </div>
                        </article>
                      );
                    })}
                  </Grid>

                  {hasMore && (
                    <div className="kv-load-more">
                      <Button
                        label={loading ? 'Đang tải cuộn phim...' : 'Tải Thêm Phim AI'}
                        size="lg"
                        isLoading={loading}
                        onClick={onLoadMore}
                        className="kv-cta kv-cta--outline-gold"
                      />
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Top 10 & Community: sticky column ≥lg, stacked section below */}
            {sidebarOpen && (
              <aside
                ref={sidebarRef}
                aria-label="Bảng xếp hạng và Cộng đồng"
                className="kv-sidebar"
              >
                <div className="kv-sidebar-panel">
                  <TabList
                    value={sidebarTab}
                    onChange={(value) => setSidebarTab(value as 'top10' | 'community')}
                    layout="fill"
                    role="tablist"
                    hasDivider
                  >
                    <Tab value="top10" label="Top 10 Tuần" panelId="kv-panel-top10" icon={<Trophy {...ICON} />} />
                    <Tab
                      value="community"
                      label="Cộng Đồng"
                      panelId="kv-panel-community"
                      icon={<Users {...ICON} />}
                    />
                  </TabList>

                  {sidebarTab === 'top10' ? (
                    <div id="kv-panel-top10" role="tabpanel" className="kv-sidebar-body">
                      <Heading level={2} className="noir-display-title kv-sidebar-title">
                        BẢNG XẾP HẠNG PHÒNG CHIẾU
                      </Heading>
                      <ol className="kv-rank-list">
                        {sidebarTopList.map(({ film, count }, idx) => (
                          <li key={film.id}>
                            <button type="button" onClick={() => onOpenFilm(film)} className="kv-rank-item">
                              <span className="noir-display-title rank-numeral">{idx + 1}</span>
                              <span className="kv-rank-text">
                                <span className="kv-rank-title">{film.title}</span>
                                <span className="kv-rank-sub tabular-nums">
                                  {film.channel} · {count} lượt phát
                                </span>
                              </span>
                            </button>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ) : (
                    <div id="kv-panel-community" role="tabpanel" className="kv-sidebar-body">
                      <Heading level={2} className="noir-display-title kv-sidebar-title">
                        SẢNH THẢO LUẬN KHÁN GIẢ
                      </Heading>
                      <form onSubmit={handleWallSubmit} className="kv-wall-form">
                        <TextInput
                          label="Biệt danh"
                          isLabelHidden
                          value={wallName}
                          onChange={(value) => setWallName(value)}
                          placeholder="Biệt danh của bạn..."
                          autoComplete="nickname"
                          width="100%"
                        />
                        <TextArea
                          label="Cảm nhận"
                          isLabelHidden
                          rows={2}
                          value={wallText}
                          onChange={(value) => setWallText(value)}
                          placeholder="Chia sẻ cảm nhận hoặc xin tên phim..."
                          width="100%"
                        />
                        <Button
                          type="submit"
                          label={postingWall ? 'Đang gửi...' : 'Gửi Lên Sảnh'}
                          variant="primary"
                          width="100%"
                          isLoading={postingWall}
                          isDisabled={!wallText.trim()}
                        />
                      </form>

                      <div className="kv-wall-list">
                        {wallPosts.map((post) => (
                          <div key={post.id} className="kv-wall-post">
                            <div className="kv-wall-post-head">
                              <strong>{post.name}</strong>
                              <button
                                type="button"
                                onClick={() => onLikeWall(post.id)}
                                className="kv-like tabular-nums"
                                aria-label={`Thích bình luận của ${post.name} (${post.likes})`}
                              >
                                <Heart size={14} strokeWidth={1.75} aria-hidden="true" />
                                <span>{post.likes}</span>
                              </button>
                            </div>
                            <p>{post.text}</p>
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
      </AppShell>
    </div>
  );
};
