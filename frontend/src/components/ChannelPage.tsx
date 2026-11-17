import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  IoVideocamOutline,
  IoCheckmarkDoneCircleOutline,
  IoListOutline,
  IoInformationCircleOutline,
  IoSearchOutline,
  IoCheckmarkCircle,
  IoPersonAddOutline,
  IoCheckmark,
  IoShareSocialOutline,
  IoArrowBack,
  IoPlay,
  IoFilmOutline,
  IoCloseOutline,
} from 'react-icons/io5';
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
    'linear-gradient(135deg, #e11d48, #9f1239)',
    'linear-gradient(135deg, #2563eb, #1d4ed8)',
    'linear-gradient(135deg, #7c3aed, #5b21b6)',
    'linear-gradient(135deg, #059669, #065f46)',
    'linear-gradient(135deg, #d97706, #b45309)',
    'linear-gradient(135deg, #0891b2, #155e75)',
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

  // Fallback instant films from client catalog while API resolves or if authorId matches
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

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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
        <div className="skeleton" style={{ width: '100%', height: '180px', borderRadius: '16px', marginBottom: '20px' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
          <div className="skeleton" style={{ width: '80px', height: '80px', borderRadius: '50%' }} />
          <div style={{ flex: 1 }}>
            <div className="skeleton" style={{ width: '240px', height: '24px', borderRadius: '6px', marginBottom: '8px' }} />
            <div className="skeleton" style={{ width: '180px', height: '14px', borderRadius: '6px' }} />
          </div>
        </div>
        <div className="yt-home-video-grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ aspectRatio: '16/9', borderRadius: '12px' }} />
          ))}
        </div>
      </div>
    );
  }

  if (!loading && !channel && fallbackFilms.length === 0) {
    return (
      <div style={{ padding: '72px 24px', textAlign: 'center', color: 'var(--yt-text-secondary)' }}>
        <IoFilmOutline size={48} style={{ opacity: 0.4, marginBottom: '12px' }} />
        <h2 style={{ color: 'var(--yt-text-primary)', marginBottom: '8px' }}>Không tìm thấy kênh "{decodedId}"</h2>
        <p style={{ marginBottom: '20px' }}>Kênh này chưa có trong kho PhimAI hoặc đã thay đổi tên.</p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button type="button" onClick={onOpenDirectory} className="watch-sub-btn unsubscribed">
            Khám phá tất cả kênh
          </button>
          <button type="button" onClick={onBackHome} className="watch-action-pill">
            Về trang chủ
          </button>
        </div>
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
        <button
          type="button"
          onClick={onBackHome}
          className="watch-action-pill"
          style={{ height: '30px', padding: '0 12px', fontSize: '12.5px' }}
        >
          <IoArrowBack size={14} />
          <span>Trang chủ</span>
        </button>
        <button
          type="button"
          onClick={onOpenDirectory}
          className="watch-action-pill"
          style={{ height: '30px', padding: '0 12px', fontSize: '12.5px' }}
        >
          <span>Tất cả kênh Phim AI</span>
        </button>
      </div>

      {/* Channel Hero Banner (kv-tube pattern) */}
      <div style={{ padding: isMobile ? '6px 14px 0' : '8px 24px 0' }}>
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: isMobile ? '124px' : 'clamp(140px, 16vw, 210px)',
            borderRadius: '16px',
            overflow: 'hidden',
            backgroundColor: 'var(--yt-surface)',
            background: hashChannelColor(displayName),
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
                filter: 'brightness(0.75)',
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
              background: 'linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(15,15,15,0.72) 100%)',
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
                <span
                  key={cat}
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    padding: '3px 9px',
                    borderRadius: '999px',
                    backgroundColor: 'rgba(15,15,15,0.78)',
                    color: '#f1f1f1',
                    border: '1px solid rgba(255,255,255,0.16)',
                  }}
                >
                  {CAT_LABEL[cat] || cat}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Channel Header Info */}
      <div style={{ padding: isMobile ? '16px 14px 12px' : '22px 24px 16px' }}>
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
            <div
              style={{
                width: isMobile ? '64px' : '84px',
                height: isMobile ? '64px' : '84px',
                borderRadius: '50%',
                background: hashChannelColor(displayName),
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: isMobile ? '24px' : '32px',
                overflow: 'hidden',
                boxShadow: '0 4px 16px rgba(0,0,0,0.45)',
                position: 'relative',
                flexShrink: 0,
                border: '2px solid rgba(255,255,255,0.14)',
              }}
            >
              <span>{displayName.charAt(0).toUpperCase()}</span>
              {avatarImage && (
                <img
                  src={avatarImage}
                  alt={displayName}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    borderRadius: '50%',
                  }}
                />
              )}
            </div>

            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h1
                  style={{
                    fontSize: isMobile ? '20px' : '26px',
                    fontWeight: 800,
                    color: 'var(--yt-text-primary)',
                    margin: 0,
                    wordBreak: 'break-word',
                  }}
                >
                  {displayName}
                </h1>
                <IoCheckmarkCircle size={18} color="var(--yt-blue, #3ea6ff)" title="Kênh chính thức" />
              </div>

              <div
                style={{
                  fontSize: '13px',
                  color: 'var(--yt-text-secondary)',
                  display: 'flex',
                  gap: '8px',
                  flexWrap: 'wrap',
                  marginTop: '4px',
                }}
              >
                {channel?.subCount ? <span>{formatSubscribers(channel.subCount)} •</span> : null}
                <span>
                  <strong style={{ color: 'var(--yt-text-primary)' }}>{channel?.count || displayFilms.length}</strong> bộ phim
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
                    fontSize: '12.5px',
                    color: 'var(--yt-text-secondary)',
                    marginTop: '6px',
                    maxWidth: '720px',
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
            <button
              type="button"
              onClick={handleToggleSub}
              className={`watch-sub-btn ${subscribed ? 'subscribed' : 'unsubscribed'}`}
              style={{
                height: '38px',
                padding: '0 20px',
                borderRadius: '20px',
                fontSize: '13.5px',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
              }}
            >
              {subscribed ? (
                <>
                  <IoCheckmark size={17} />
                  <span>Đã đăng ký</span>
                </>
              ) : (
                <>
                  <IoPersonAddOutline size={16} />
                  <span>Đăng ký kênh</span>
                </>
              )}
            </button>

            <button type="button" onClick={handleShare} className="watch-action-pill">
              <IoShareSocialOutline size={17} />
              <span>{copiedToast ? 'Đã chép link!' : 'Chia sẻ'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tabs Navigation Rail (Videos, FULL, Playlists, About, Channel Search) */}
      <div
        style={{
          borderBottom: '1px solid var(--yt-border)',
          padding: isMobile ? '0 14px' : '0 24px',
          display: 'flex',
          gap: '12px',
          overflowX: 'auto',
          scrollbarWidth: 'none',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: isMobile ? 'wrap' : 'nowrap',
        }}
      >
        <div style={{ display: 'flex', gap: '4px', overflowX: 'auto', scrollbarWidth: 'none' }}>
          {[
            { id: 'videos' as ChannelTab, label: 'Phim đã đăng', icon: <IoVideocamOutline size={18} />, count: channel?.count },
            { id: 'full' as ChannelTab, label: 'Trọn bộ FULL', icon: <IoCheckmarkDoneCircleOutline size={18} />, count: channel?.fullCount },
            { id: 'playlists' as ChannelTab, label: 'Bộ sưu tập', icon: <IoListOutline size={18} />, count: playlists.length },
            { id: 'about' as ChannelTab, label: 'Giới thiệu', icon: <IoInformationCircleOutline size={18} /> },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                type="button"
                key={tab.id}
                onClick={() => {
                  setExpandedPlaylistId(null);
                  setActiveTab(tab.id);
                }}
                style={{
                  padding: isMobile ? '10px 12px' : '12px 16px',
                  background: 'none',
                  border: 'none',
                  borderBottom: isActive ? '3px solid var(--yt-text-primary)' : '3px solid transparent',
                  color: isActive ? 'var(--yt-text-primary)' : 'var(--yt-text-secondary)',
                  fontWeight: 600,
                  fontSize: isMobile ? '13px' : '14px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  whiteSpace: 'nowrap',
                }}
              >
                {tab.icon}
                <span>{tab.label}</span>
                {typeof tab.count === 'number' && tab.count > 0 && (
                  <span style={{ fontSize: '11.5px', opacity: 0.72 }}>({tab.count})</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Inline Search in Channel */}
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', alignItems: 'center', paddingBottom: isMobile ? '8px' : '0' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: 'var(--yt-surface)',
              border: '1px solid var(--yt-border)',
              borderRadius: '20px',
              padding: '5px 12px',
            }}
          >
            <IoSearchOutline size={15} color="var(--yt-text-secondary)" />
            <input
              type="text"
              placeholder="Tìm trong kênh..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              style={{
                background: 'none',
                border: 'none',
                outline: 'none',
                color: 'var(--yt-text-primary)',
                fontSize: '13px',
                width: isMobile ? '150px' : '180px',
              }}
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput('');
                  setSubmittedSearch('');
                  if (activeTab === 'search') setActiveTab('videos');
                }}
                style={{ background: 'none', border: 'none', color: 'var(--yt-text-secondary)', cursor: 'pointer', display: 'flex' }}
              >
                <IoCloseOutline size={15} />
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Tab Content Area */}
      <div style={{ padding: isMobile ? '14px' : '20px 24px' }}>
        {(activeTab === 'videos' || activeTab === 'full' || activeTab === 'search') && (
          <>
            {/* Sort Pills Row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {[
                  { id: 'newest' as ChannelSort, label: 'Mới nhất' },
                  { id: 'popular' as ChannelSort, label: 'Phổ biến nhất' },
                  { id: 'oldest' as ChannelSort, label: 'Cũ nhất' },
                ].map((opt) => (
                  <button
                    type="button"
                    key={opt.id}
                    onClick={() => setSortBy(opt.id)}
                    className={`yt-filter-chip ${sortBy === opt.id ? 'active' : ''}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {activeTab === 'search' && submittedSearch && (
                <div style={{ fontSize: '13px', color: 'var(--yt-text-secondary)' }}>
                  Kết quả cho "<strong style={{ color: 'var(--yt-text-primary)' }}>{submittedSearch}</strong>": {displayFilms.length} phim
                </div>
              )}
            </div>

            {displayFilms.length === 0 ? (
              <div style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--yt-text-secondary)' }}>
                Không có phim nào khớp bộ lọc trong kênh này.
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
              <div style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--yt-text-secondary)' }}>
                Kênh này hiện chưa có bộ sưu tập nhiều tập.
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
                        style={{
                          cursor: 'pointer',
                          borderRadius: '14px',
                          overflow: 'hidden',
                          backgroundColor: 'var(--yt-surface)',
                          border: isExpanded ? '1px solid var(--yt-blue)' : '1px solid var(--yt-border)',
                          transition: 'transform 0.15s ease',
                        }}
                      >
                        <div style={{ position: 'relative', aspectRatio: '16/9', backgroundColor: '#111' }}>
                          <img
                            src={pl.thumbnail}
                            alt={pl.title}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                          <div
                            style={{
                              position: 'absolute',
                              right: 0,
                              top: 0,
                              bottom: 0,
                              width: '38%',
                              backgroundColor: 'rgba(15,15,15,0.78)',
                              backdropFilter: 'blur(4px)',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '4px',
                              color: '#fff',
                            }}
                          >
                            <span style={{ fontSize: '18px', fontWeight: 800 }}>{pl.count}</span>
                            <span style={{ fontSize: '11px' }}>tập phim</span>
                            <IoListOutline size={18} />
                          </div>
                        </div>
                        <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--yt-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {pl.title}
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--yt-text-secondary)', marginTop: '3px' }}>
                              Nhấn để xem danh sách ({pl.count} tập)
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (pl.films[0]) onOpenFilm(pl.films[0]);
                            }}
                            className="watch-sub-btn unsubscribed"
                            style={{ height: '32px', padding: '0 12px', fontSize: '12px', flexShrink: 0 }}
                          >
                            <IoPlay size={13} />
                            <span>Phát</span>
                          </button>
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
                      <h3 style={{ margin: '0 0 14px', fontSize: '16px', fontWeight: 700 }}>
                        Danh sách tập: {chosen.title}
                      </h3>
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
              backgroundColor: 'var(--yt-surface)',
              border: '1px solid var(--yt-border)',
              borderRadius: '14px',
              padding: '20px 24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700 }}>Thông tin kênh {displayName}</h3>
            <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.6, color: 'var(--yt-text-secondary)', whiteSpace: 'pre-line' }}>
              {channel?.description ||
                `Kênh sáng tạo Phim AI "${displayName}" trên hệ thống PhimAI với ${channel?.count || displayFilms.length} tác phẩm chọn lọc (${formatTotalViewsCount(channel?.totalViews)}).`}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginTop: '6px' }}>
              <div style={{ padding: '12px', borderRadius: '10px', backgroundColor: 'var(--yt-hover)' }}>
                <div style={{ fontSize: '11.5px', color: 'var(--yt-text-secondary)' }}>Tổng số phim</div>
                <div style={{ fontSize: '18px', fontWeight: 800, marginTop: '2px' }}>{channel?.count || displayFilms.length}</div>
              </div>
              <div style={{ padding: '12px', borderRadius: '10px', backgroundColor: 'var(--yt-hover)' }}>
                <div style={{ fontSize: '11.5px', color: 'var(--yt-text-secondary)' }}>Tổng lượt xem</div>
                <div style={{ fontSize: '18px', fontWeight: 800, marginTop: '2px' }}>{formatTotalViewsCount(channel?.totalViews)}</div>
              </div>
              <div style={{ padding: '12px', borderRadius: '10px', backgroundColor: 'var(--yt-hover)' }}>
                <div style={{ fontSize: '11.5px', color: 'var(--yt-text-secondary)' }}>Phim trọn bộ FULL</div>
                <div style={{ fontSize: '18px', fontWeight: 800, marginTop: '2px' }}>{channel?.fullCount || 0}</div>
              </div>
              {channel?.authorId && (
                <div style={{ padding: '12px', borderRadius: '10px', backgroundColor: 'var(--yt-hover)' }}>
                  <div style={{ fontSize: '11.5px', color: 'var(--yt-text-secondary)' }}>Mã kênh gốc</div>
                  <div style={{ fontSize: '12.5px', fontWeight: 600, marginTop: '4px', wordBreak: 'break-all' }}>{channel.authorId}</div>
                </div>
              )}
            </div>
            {displayFilms[0] && (
              <div style={{ fontSize: '12.5px', color: 'var(--yt-text-secondary)' }}>
                Phim nổi bật nhất: <strong style={{ color: 'var(--yt-text-primary)' }}>{displayFilms[0].title}</strong> ({formatViewsVN(displayFilms[0].views)})
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
