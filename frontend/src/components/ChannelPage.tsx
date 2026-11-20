import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Avatar } from '@astryxdesign/core/Avatar';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Heading } from '@astryxdesign/core/Heading';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { TextInput } from '@astryxdesign/core/TextInput';
import {
  Film as FilmIcon,
  CheckCircle2,
  ListVideo,
  Info,
  BadgeCheck,
  UserPlus,
  Check,
  Share2,
  ArrowLeft,
  Play,
} from 'lucide-react';
import type { ChannelDetailResponse, Film } from '../types/phimai';
import {
  fetchChannelDetail,
  isChannelSubscribed,
  toggleChannelSubscription,
  SUBSCRIPTIONS_EVENT,
} from '../services/streamService';
import { VideoCard } from './VideoCard';
import { CAT_LABEL, formatViewsVN, getThumbUrl } from '../utils/phimaiUtils';

type ChannelTab = 'videos' | 'full' | 'playlists' | 'about' | 'search';
type ChannelSort = 'newest' | 'popular' | 'oldest';

interface ChannelPageProps {
  channelId: string;
  allFilms: Film[];
  savedIds: Set<string>;
  onToggleSave: (id: string) => void;
  onOpenFilm: (film: Film) => void;
  onOpenChannel: (channelName: string) => void;
  onBackHome: () => void;
  onOpenDirectory: () => void;
}

function formatSubscribers(count?: number): string {
  if (!count || count <= 0) return '';
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(2)} Tr người đăng ký`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)} N người đăng ký`;
  return `${count} người đăng ký`;
}

function formatTotalViewsCount(n?: number): string {
  if (!n || n <= 0) return '0 lượt xem';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} Tr lượt xem`;
  if (n >= 1_000) return `${Math.round(n / 1_000).toLocaleString()} N lượt xem`;
  return `${n.toLocaleString()} lượt xem`;
}

function hashChannelColor(name: string): string {
  const palette = [
    'linear-gradient(135deg, #9e0610, #161822)',
    'linear-gradient(135deg, #243b6b, #0d0e14)',
    'linear-gradient(135deg, #43286b, #161822)',
    'linear-gradient(135deg, #0d5c46, #0d0e14)',
    'linear-gradient(135deg, #6b4c14, #161822)',
    'linear-gradient(135deg, #164863, #0d0e14)',
  ];
  let sum = 0;
  for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
  return palette[sum % palette.length];
}

export function ChannelPage({
  channelId,
  allFilms,
  savedIds,
  onToggleSave,
  onOpenFilm,
  onOpenChannel,
  onBackHome,
  onOpenDirectory,
}: ChannelPageProps) {
  const decodedId = useMemo(() => {
    try {
      return decodeURIComponent(channelId);
    } catch {
      return channelId;
    }
  }, [channelId]);

  const [channel, setChannel] = useState<ChannelDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ChannelTab>('videos');
  const [sortBy, setSortBy] = useState<ChannelSort>('newest');
  const [searchInput, setSearchInput] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [subscribed, setSubscribed] = useState(false);
  const [copiedToast, setCopiedToast] = useState(false);
  const [expandedPlaylistId, setExpandedPlaylistId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Reset state when switching channels
  useEffect(() => {
    setActiveTab('videos');
    setSortBy('newest');
    setSearchInput('');
    setSubmittedSearch('');
    setExpandedPlaylistId(null);
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [decodedId]);

  const loadChannel = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchChannelDetail(decodedId, {
        sort: sortBy,
        tab: activeTab === 'full' ? 'full' : 'videos',
        q: activeTab === 'search' ? submittedSearch : '',
      });
      if (data) {
        setChannel(data);
        setSubscribed(isChannelSubscribed(data.name));
      } else {
        setChannel(null);
      }
    } catch {
      setChannel(null);
    } finally {
      setLoading(false);
    }
  }, [decodedId, sortBy, activeTab, submittedSearch]);

  useEffect(() => {
    void loadChannel();
  }, [loadChannel]);

  useEffect(() => {
    const syncSub = () => {
      const name = channel?.name || decodedId;
      setSubscribed(isChannelSubscribed(name));
    };
    window.addEventListener(SUBSCRIPTIONS_EVENT, syncSub);
    return () => window.removeEventListener(SUBSCRIPTIONS_EVENT, syncSub);
  }, [channel?.name, decodedId]);

  const fallbackFilms = useMemo(() => {
    const targetLower = decodedId.toLowerCase();
    return allFilms.filter((f) => f.channel?.toLowerCase() === targetLower);
  }, [allFilms, decodedId]);

  const displayName = channel?.name || fallbackFilms[0]?.channel || decodedId;
  const displayFilms = channel?.films || fallbackFilms;
  const bannerImage = channel?.bannerUrl || channel?.banner || (displayFilms[0] ? getThumbUrl(displayFilms[0].id) : '');
  const avatarImage = channel?.avatarUrl || '';
  const playlists = channel?.playlists || [];

  const handleToggleSub = () => {
    const res = toggleChannelSubscription({
      name: displayName,
      authorId: channel?.authorId,
      thumbnail: channel?.avatarUrl || channel?.thumbnail,
    });
    setSubscribed(res.subscribed);
  };

  const handleSearchSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = searchInput.trim();
    if (!q) {
      setSubmittedSearch('');
      if (activeTab === 'search') setActiveTab('videos');
      return;
    }
    setSubmittedSearch(q);
    setActiveTab('search');
  };

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/channel/${encodeURIComponent(displayName)}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedToast(true);
      setTimeout(() => setCopiedToast(false), 2000);
    } catch {
      // ignore
    }
  };

  if (loading && !channel && fallbackFilms.length === 0) {
    return (
      <div style={{ maxWidth: '1750px', margin: '0 auto', padding: '24px' }}>
        <Skeleton width="100%" height={180} radius={3} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', margin: '20px 0 24px' }}>
          <Skeleton width={72} height={72} radius="rounded" />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <Skeleton width={240} height={24} radius={1} />
            <Skeleton width={180} height={14} radius={1} />
          </div>
        </div>
        <div className="yt-home-video-grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="yt-video-card-container">
              <Skeleton width="100%" height={176} radius={2} index={i} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!loading && !channel && fallbackFilms.length === 0) {
    return (
      <div style={{ padding: '72px 24px' }}>
        <EmptyState
          icon={<FilmIcon size={40} strokeWidth={1.75} />}
          title={`Không tìm thấy kênh "${decodedId}"`}
          description="Kênh này chưa có trong kho PhimAI hoặc đã thay đổi tên."
          actions={
            <>
              <Button variant="primary" label="Khám phá tất cả kênh" onClick={onOpenDirectory} />
              <Button variant="secondary" label="Về trang chủ" onClick={onBackHome} />
            </>
          }
        />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1750px', margin: '0 auto', paddingBottom: '72px' }}>
      {/* Breadcrumb Strip */}
      <div
        style={{
          padding: isMobile ? '10px 14px 4px' : '14px 24px 8px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexWrap: 'wrap',
        }}
      >
        <Button
          variant="ghost"
          size="sm"
          label="Trang chủ"
          icon={<ArrowLeft size={14} strokeWidth={1.75} />}
          onClick={onBackHome}
        />
        <Button
          variant="secondary"
          size="sm"
          label="Tất cả kênh Phim AI"
          onClick={onOpenDirectory}
        />
      </div>

      {/* Channel Hero Banner */}
      <div style={{ padding: isMobile ? '6px 14px 0' : '8px 24px 0' }}>
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: isMobile ? '128px' : 'clamp(146px, 16vw, 210px)',
            borderRadius: '14px',
            overflow: 'hidden',
            backgroundColor: 'var(--yt-surface, #161822)',
            background: hashChannelColor(displayName),
            border: '1px solid var(--yt-border)',
          }}
        >
          {bannerImage && (
            <img
              src={bannerImage}
              alt={displayName}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                filter: 'brightness(0.72)',
                display: 'block',
              }}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          )}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(180deg, rgba(13, 14, 20, 0.1) 0%, rgba(13, 14, 20, 0.86) 100%)',
            }}
          />
          {channel?.categories && channel.categories.length > 0 && (
            <div
              style={{
                position: 'absolute',
                right: '14px',
                bottom: '12px',
                display: 'flex',
                gap: '6px',
                flexWrap: 'wrap',
              }}
            >
              {channel.categories.map((cat) => (
                <Badge key={cat} variant="neutral" label={CAT_LABEL[cat] || cat} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Channel Header Info */}
      <div style={{ padding: isMobile ? '16px 14px 14px' : '22px 24px 16px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: isMobile ? 'flex-start' : 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '14px' : '20px', minWidth: 0 }}>
            <Avatar
              size={isMobile ? 64 : 72}
              src={avatarImage || undefined}
              name={displayName}
              alt={displayName}
              tooltip={false}
            />

            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <Heading
                  level={1}
                  className="phimai-display-heading"
                  weight="bold"
                  style={{
                    fontSize: isMobile ? '24px' : '32px',
                    lineHeight: 1.08,
                    margin: 0,
                    wordBreak: 'break-word',
                  }}
                >
                  {displayName}
                </Heading>
                <BadgeCheck size={19} strokeWidth={1.75} style={{ color: 'var(--color-accent, #ffd875)' }} />
              </div>

              <div
                className="phimai-tabular"
                style={{
                  fontSize: '13px',
                  color: 'var(--yt-text-secondary)',
                  display: 'flex',
                  gap: '8px',
                  flexWrap: 'wrap',
                  marginTop: '6px',
                }}
              >
                {channel?.subCount ? <span>{formatSubscribers(channel.subCount)} •</span> : null}
                <span>
                  <strong style={{ color: 'var(--color-text-primary)' }}>{channel?.count || displayFilms.length}</strong> bộ phim
                </span>
                <span>•</span>
                <span>{formatTotalViewsCount(channel?.totalViews)}</span>
                {channel?.fullCount ? (
                  <>
                    <span>•</span>
                    <span>{channel.fullCount} phim FULL</span>
                  </>
                ) : null}
              </div>

              {channel?.description && (
                <p
                  style={{
                    fontSize: '13px',
                    color: 'var(--yt-text-muted, #989fb8)',
                    marginTop: '6px',
                    maxWidth: '68ch',
                    marginBottom: 0,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {channel.description}
                </p>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <Button
              variant={subscribed ? 'secondary' : 'primary'}
              size="md"
              label={subscribed ? 'Đã đăng ký' : 'Đăng ký kênh'}
              icon={subscribed ? <Check size={16} strokeWidth={1.75} /> : <UserPlus size={15} strokeWidth={1.75} />}
              onClick={handleToggleSub}
            />

            <Button
              variant="secondary"
              size="md"
              label={copiedToast ? 'Đã chép link!' : 'Chia sẻ'}
              icon={<Share2 size={15} strokeWidth={1.75} />}
              onClick={handleShare}
            />
          </div>
        </div>
      </div>

      {/* Tabs Navigation Rail (Astryx TabList + Channel Search) */}
      <div
        style={{
          padding: isMobile ? '0 14px' : '0 24px',
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: isMobile ? 'wrap' : 'nowrap',
          borderBottom: '1px solid var(--yt-border)',
        }}
      >
        <TabList
          value={activeTab === 'search' ? 'videos' : activeTab}
          onChange={(nextTab) => {
            setExpandedPlaylistId(null);
            setActiveTab(nextTab as ChannelTab);
          }}
          size="md"
          overflow="scroll"
        >
          <Tab
            value="videos"
            label="Phim đã đăng"
            icon={<FilmIcon size={16} strokeWidth={1.75} />}
            endContent={channel?.count ? <Badge variant="neutral" label={channel.count} /> : undefined}
          />
          <Tab
            value="full"
            label="Trọn bộ FULL"
            icon={<CheckCircle2 size={16} strokeWidth={1.75} />}
            endContent={channel?.fullCount ? <Badge variant="neutral" label={channel.fullCount} /> : undefined}
          />
          <Tab
            value="playlists"
            label="Bộ sưu tập"
            icon={<ListVideo size={16} strokeWidth={1.75} />}
            endContent={playlists.length > 0 ? <Badge variant="neutral" label={playlists.length} /> : undefined}
          />
          <Tab
            value="about"
            label="Giới thiệu"
            icon={<Info size={16} strokeWidth={1.75} />}
          />
        </TabList>

        {/* Inline Search in Channel */}
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', alignItems: 'center', paddingBottom: isMobile ? '10px' : '6px' }}>
          <TextInput
            type="search"
            enterKeyHint="search"
            size="md"
            label="Tìm trong kênh"
            isLabelHidden
            startIcon="search"
            hasClear
            width={isMobile ? '220px' : '240px'}
            placeholder="Tìm trong kênh..."
            value={searchInput}
            onChange={(val) => {
              setSearchInput(val);
              if (!val && activeTab === 'search') {
                setSubmittedSearch('');
                setActiveTab('videos');
              }
            }}
            onEnter={() => handleSearchSubmit()}
          />
        </form>
      </div>

      {/* Tab Content Area */}
      <div style={{ padding: isMobile ? '14px' : '20px 24px' }}>
        {(activeTab === 'videos' || activeTab === 'full' || activeTab === 'search') && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '18px' }}>
              <SegmentedControl
                size="sm"
                label="Sắp xếp phim trong kênh"
                value={sortBy}
                onChange={(val) => setSortBy(val as ChannelSort)}
              >
                <SegmentedControlItem value="newest" label="Mới nhất" />
                <SegmentedControlItem value="popular" label="Phổ biến nhất" />
                <SegmentedControlItem value="oldest" label="Cũ nhất" />
              </SegmentedControl>

              {activeTab === 'search' && submittedSearch && (
                <div className="phimai-tabular" style={{ fontSize: '13px', color: 'var(--yt-text-secondary)' }}>
                  Kết quả cho &ldquo;<strong style={{ color: 'var(--color-text-primary)' }}>{submittedSearch}</strong>&rdquo;: {displayFilms.length} phim
                </div>
              )}
            </div>

            {displayFilms.length === 0 ? (
              <div style={{ padding: '48px 16px' }}>
                <EmptyState
                  icon={<FilmIcon size={32} strokeWidth={1.75} />}
                  title="Không có phim khớp bộ lọc"
                  description="Thử xóa từ khóa hoặc chuyển sang tab khác trong kênh."
                />
              </div>
            ) : (
              <div className="yt-home-video-grid">
                {displayFilms.map((film) => (
                  <VideoCard
                    key={film.id}
                    film={film}
                    saved={savedIds.has(film.id)}
                    onToggleSave={onToggleSave}
                    onOpenFilm={onOpenFilm}
                    onFilterChannel={onOpenChannel}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'playlists' && (
          <>
            {playlists.length === 0 ? (
              <div style={{ padding: '48px 16px' }}>
                <EmptyState
                  icon={<ListVideo size={32} strokeWidth={1.75} />}
                  title="Chưa có bộ sưu tập"
                  description="Kênh này hiện chưa có bộ sưu tập nhiều tập."
                />
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                    gap: '16px',
                  }}
                >
                  {playlists.map((pl) => {
                    const isExpanded = expandedPlaylistId === pl.id;
                    return (
                      <div
                        key={pl.id}
                        onClick={() => setExpandedPlaylistId(isExpanded ? null : pl.id)}
                        className={`phimai-playlist-card ${isExpanded ? 'active' : ''}`}
                      >
                        <div style={{ position: 'relative', aspectRatio: '16/9', backgroundColor: '#08090d' }}>
                          <img
                            src={pl.thumbnail}
                            alt={pl.title}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                          <div
                            className="phimai-tabular"
                            style={{
                              position: 'absolute',
                              right: 0,
                              top: 0,
                              bottom: 0,
                              width: '38%',
                              backgroundColor: 'rgba(13, 14, 20, 0.84)',
                              backdropFilter: 'blur(6px)',
                              borderLeft: '1px solid var(--yt-border)',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '4px',
                              color: '#ffd875',
                            }}
                          >
                            <span style={{ fontSize: '20px', fontWeight: 800, fontFamily: 'var(--font-family-code, monospace)' }}>
                              {pl.count}
                            </span>
                            <span style={{ fontSize: '11px', color: 'var(--yt-text-secondary)' }}>tập phim</span>
                            <ListVideo size={17} strokeWidth={1.75} />
                          </div>
                        </div>
                        <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {pl.title}
                            </div>
                            <div className="phimai-tabular" style={{ fontSize: '12px', color: 'var(--yt-text-muted)', marginTop: '3px' }}>
                              Nhấn để xem danh sách ({pl.count} tập)
                            </div>
                          </div>
                          <Button
                            variant="primary"
                            size="sm"
                            label="Phát"
                            icon={<Play size={13} strokeWidth={1.75} />}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (pl.films[0]) onOpenFilm(pl.films[0]);
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {expandedPlaylistId && (() => {
                  const chosen = playlists.find((p) => p.id === expandedPlaylistId);
                  if (!chosen) return null;
                  return (
                    <div style={{ borderTop: '1px solid var(--yt-border)', paddingTop: '18px' }}>
                      <Heading
                        level={3}
                        weight="bold"
                        style={{
                          margin: '0 0 14px',
                          fontSize: '16px',
                          fontFamily: 'var(--font-family-body, "Be Vietnam Pro", sans-serif)',
                        }}
                      >
                        Danh sách tập: {chosen.title}
                      </Heading>
                      <div className="yt-home-video-grid">
                        {chosen.films.map((film) => (
                          <VideoCard
                            key={film.id}
                            film={film}
                            saved={savedIds.has(film.id)}
                            onToggleSave={onToggleSave}
                            onOpenFilm={onOpenFilm}
                            onFilterChannel={onOpenChannel}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </>
        )}

        {activeTab === 'about' && (
          <div
            style={{
              maxWidth: '820px',
              backgroundColor: 'var(--yt-surface, #161822)',
              border: '1px solid var(--yt-border)',
              borderRadius: '12px',
              padding: '20px 24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <Heading
              level={3}
              weight="bold"
              style={{
                margin: 0,
                fontSize: '17px',
                fontFamily: 'var(--font-family-body, "Be Vietnam Pro", sans-serif)',
              }}
            >
              Thông tin kênh {displayName}
            </Heading>
            <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.6, color: 'var(--yt-text-secondary)', whiteSpace: 'pre-line', maxWidth: '68ch' }}>
              {channel?.description ||
                `Kênh sáng tạo Phim AI "${displayName}" trên hệ thống PhimAI với ${channel?.count || displayFilms.length} tác phẩm chọn lọc (${formatTotalViewsCount(channel?.totalViews)}).`}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginTop: '6px' }}>
              <div style={{ padding: '12px', borderRadius: '10px', backgroundColor: 'var(--yt-hover, #1e2130)', border: '1px solid var(--yt-border)' }}>
                <div style={{ fontSize: '11.5px', color: 'var(--yt-text-muted)' }}>Tổng số phim</div>
                <div className="phimai-tabular" style={{ fontSize: '18px', fontWeight: 800, marginTop: '2px', color: '#ffd875' }}>
                  {channel?.count || displayFilms.length}
                </div>
              </div>
              <div style={{ padding: '12px', borderRadius: '10px', backgroundColor: 'var(--yt-hover, #1e2130)', border: '1px solid var(--yt-border)' }}>
                <div style={{ fontSize: '11.5px', color: 'var(--yt-text-muted)' }}>Tổng lượt xem</div>
                <div className="phimai-tabular" style={{ fontSize: '18px', fontWeight: 800, marginTop: '2px' }}>
                  {formatTotalViewsCount(channel?.totalViews)}
                </div>
              </div>
              <div style={{ padding: '12px', borderRadius: '10px', backgroundColor: 'var(--yt-hover, #1e2130)', border: '1px solid var(--yt-border)' }}>
                <div style={{ fontSize: '11.5px', color: 'var(--yt-text-muted)' }}>Phim trọn bộ FULL</div>
                <div className="phimai-tabular" style={{ fontSize: '18px', fontWeight: 800, marginTop: '2px' }}>
                  {channel?.fullCount || 0}
                </div>
              </div>
              {channel?.authorId && (
                <div style={{ padding: '12px', borderRadius: '10px', backgroundColor: 'var(--yt-hover, #1e2130)', border: '1px solid var(--yt-border)' }}>
                  <div style={{ fontSize: '11.5px', color: 'var(--yt-text-muted)' }}>Mã kênh gốc</div>
                  <div style={{ fontSize: '12px', fontWeight: 600, marginTop: '4px', wordBreak: 'break-all', fontFamily: 'var(--font-family-code, monospace)' }}>
                    {channel.authorId}
                  </div>
                </div>
              )}
            </div>
            {displayFilms[0] && (
              <div style={{ fontSize: '12.5px', color: 'var(--yt-text-secondary)' }}>
                Phim nổi bật nhất: <strong style={{ color: 'var(--color-text-primary)' }}>{displayFilms[0].title}</strong> ({formatViewsVN(displayFilms[0].views)})
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
