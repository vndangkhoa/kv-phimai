import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  IoStar,
  IoStarOutline,
  IoBookmark,
  IoBookmarkOutline,
  IoShareSocialOutline,
  IoExpandOutline,
  IoCheckmarkCircle,
  IoTimeOutline,
  IoSendOutline,
  IoArrowBack,
  IoPersonAddOutline,
  IoCheckmark,
  IoRefreshOutline,
} from 'react-icons/io5';
import type { Film, FilterState } from '../types/phimai';
import {
  CAT_LABEL,
  formatClock,
  formatViewsVN,
  getEpisodeNumber,
  getSeriesEpisodes,
  getThumbUrl,
} from '../utils/phimaiUtils';
import {
  fetchVideoStream,
  isChannelSubscribed,
  toggleChannelSubscription,
  SUBSCRIPTIONS_EVENT,
} from '../services/streamService';

interface CommentItem {
  id: string | number;
  name: string;
  text: string;
  s: number;
  d: string;
}

interface WatchPageProps {
  film: Film;
  allFilms: Film[];
  currentTimeSec: number;
  saved: boolean;
  rating?: { s: number; n: number };
  onToggleSave: (id: string) => void;
  onSelectFilm: (film: Film) => void;
  onOpenChannel: (channelName: string) => void;
  onBackHome: () => void;
  onFilterByPatch: (patch: Partial<FilterState>) => void;
  onSeekToSec: (sec: number) => void;
  onRateSuccess: (id: string, rating: { s: number; n: number }) => void;
  onMergeFilms?: (films: Film[]) => void;
}

export function WatchPage({
  film,
  allFilms,
  currentTimeSec,
  saved,
  rating,
  onToggleSave,
  onSelectFilm,
  onOpenChannel,
  onBackHome,
  onFilterByPatch,
  onSeekToSec,
  onRateSuccess,
  onMergeFilms,
}: WatchPageProps) {
  const [expandedDesc, setExpandedDesc] = useState(false);
  const [wideMode, setWideMode] = useState(false);
  const [copiedToast, setCopiedToast] = useState(false);
  const [sideFilter, setSideFilter] = useState<'all' | 'cat' | 'channel' | 'full'>('all');

  // Rich detail & comments state
  const [richBlurbLong, setRichBlurbLong] = useState<string>(film.blurbLong || '');
  const [apiRelated, setApiRelated] = useState<Film[]>([]);
  const [apiSeries, setApiSeries] = useState<Film[]>([]);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [commentName, setCommentName] = useState('');
  const [commentText, setCommentText] = useState('');
  const [attachTimestamp, setAttachTimestamp] = useState(true);
  const [postingComment, setPostingComment] = useState(false);
  const [hoverStar, setHoverStar] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [subscribed, setSubscribed] = useState(() => isChannelSubscribed(film.channel));
  const [discoveringEps, setDiscoveringEps] = useState(false);
  const [discoverMsg, setDiscoverMsg] = useState<string | null>(null);
  const chipBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSubscribed(isChannelSubscribed(film.channel));
    const sync = () => setSubscribed(isChannelSubscribed(film.channel));
    window.addEventListener(SUBSCRIPTIONS_EVENT, sync);
    return () => window.removeEventListener(SUBSCRIPTIONS_EVENT, sync);
  }, [film.channel]);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 1024);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Keyboard shortcut 't' for Theater Mode
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
      if (e.key.toLowerCase() === 't') {
        e.preventDefault();
        setWideMode((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Scroll top & reset description when switching film
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    setExpandedDesc(false);
    setRichBlurbLong(film.blurbLong || '');
    setDiscoverMsg(null);
  }, [film.id, film.blurbLong]);

  // Fetch film detail + comments + record view
  useEffect(() => {
    let cancelled = false;
    setComments([]);
    setApiRelated([]);
    setApiSeries([]);

    fetch('/api/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: film.id }),
    }).catch(() => {});

    fetchVideoStream(film.id)
      .then((res) => {
        if (cancelled || !res) return;
        if (res.film?.blurbLong) setRichBlurbLong(res.film.blurbLong);
        if (Array.isArray(res.related) && res.related.length > 0) setApiRelated(res.related);
        if (Array.isArray(res.series) && res.series.length > 0) {
          setApiSeries(res.series);
          onMergeFilms?.(res.series);
        }
      })
      .catch(() => {});

    fetch(`/api/comments?id=${encodeURIComponent(film.id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data && Array.isArray(data.items)) {
          setComments(
            data.items.map((c: any) => ({
              id: c.id || Math.random(),
              name: c.name || c.n || 'Khán giả',
              text: c.text || c.t || '',
              s: Number(c.s || 0),
              d: c.d || '',
            }))
          );
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [film.id]);

  // Compute merged series episodes sorted strictly by episode order (Tập 1, Tập 2, Tập 3...)
  const seriesEpisodes = useMemo(() => {
    const localEps = getSeriesEpisodes(film, allFilms);
    const byId = new Map<string, Film>();
    for (const ep of apiSeries) if (ep?.id) byId.set(ep.id, ep);
    for (const ep of localEps) if (ep?.id && !byId.has(ep.id)) byId.set(ep.id, ep);
    if (!byId.has(film.id)) byId.set(film.id, film);

    const list = Array.from(byId.values());
    if (list.length < 2 && getEpisodeNumber(film) === null) return [];
    return list.sort((a, b) => {
      const ordA = getEpisodeNumber(a) ?? 9999;
      const ordB = getEpisodeNumber(b) ?? 9999;
      return ordA - ordB || a.rank - b.rank;
    });
  }, [apiSeries, film, allFilms]);

  const currentEpIdx = useMemo(
    () => seriesEpisodes.findIndex((ep) => ep.id === film.id),
    [seriesEpisodes, film.id]
  );

  const nextSeriesEpisode = useMemo(
    () =>
      currentEpIdx >= 0 && currentEpIdx + 1 < seriesEpisodes.length
        ? seriesEpisodes[currentEpIdx + 1]
        : null,
    [seriesEpisodes, currentEpIdx]
  );

  const handleDiscoverMoreEpisodes = async () => {
    if (discoveringEps) return;
    setDiscoveringEps(true);
    setDiscoverMsg(null);
    try {
      const res = await fetch(`/api/films/${encodeURIComponent(film.id)}/episodes?force=1`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.episodes) && data.episodes.length > 0) {
          setApiSeries(data.episodes as Film[]);
          onMergeFilms?.(data.episodes as Film[]);
        }
        const added = Number(data?.added || 0);
        setDiscoverMsg(added > 0 ? `Đã thêm ${added} tập mới!` : 'Đã cập nhật đủ tập mới nhất');
      }
    } catch {
      setDiscoverMsg('Không thể tìm thêm tập lúc này');
    } finally {
      setDiscoveringEps(false);
    }
  };

  const channelFilmCount = useMemo(
    () => allFilms.filter((f) => f.channel === film.channel).length,
    [allFilms, film.channel]
  );

  const relatedList = useMemo(() => {
    const base: Film[] = [];
    const seen = new Set<string>([film.id]);

    // Prioritize upcoming episodes of the same movie at the top of the Up Next sidebar
    if ((sideFilter === 'all' || sideFilter === 'channel') && seriesEpisodes.length > 1) {
      const upcoming =
        currentEpIdx >= 0
          ? seriesEpisodes.slice(currentEpIdx + 1)
          : seriesEpisodes.filter((e) => e.id !== film.id);
      for (const ep of upcoming) {
        if (!seen.has(ep.id)) {
          seen.add(ep.id);
          base.push(ep);
        }
      }
    }

    for (const rel of apiRelated) {
      if (rel?.id && !seen.has(rel.id)) {
        seen.add(rel.id);
        base.push(rel);
      }
    }
    for (const f of allFilms) {
      if (base.length >= 36) break;
      if (seen.has(f.id)) continue;
      if (f.cat === film.cat || f.channel === film.channel) {
        seen.add(f.id);
        base.push(f);
      }
    }
    for (const f of allFilms) {
      if (base.length >= 40) break;
      if (!seen.has(f.id)) {
        seen.add(f.id);
        base.push(f);
      }
    }

    if (sideFilter === 'cat') {
      return base.filter((f) => f.cat === film.cat);
    }
    if (sideFilter === 'channel') {
      const restSameCh = allFilms.filter((f) => !seen.has(f.id) && f.channel === film.channel);
      const mergedCh = [...base.filter((f) => f.channel === film.channel), ...restSameCh];
      return mergedCh.length > 0 ? mergedCh : base;
    }
    if (sideFilter === 'full') {
      return base.filter((f) => /full|trọn/i.test(f.dur || ''));
    }
    return base;
  }, [apiRelated, allFilms, film.id, film.cat, film.channel, sideFilter, seriesEpisodes, currentEpIdx]);

  const avgStars =
    rating && rating.n > 0 ? (rating.s / rating.n).toFixed(1) : '5.0';

  const handleRate = async (stars: number) => {
    try {
      const res = await fetch('/api/rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: film.id, stars }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.rating) onRateSuccess(film.id, json.rating);
      }
    } catch {
      // ignore
    }
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || postingComment) return;
    setPostingComment(true);
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: film.id,
          name: commentName.trim() || 'Khán giả PhimAI',
          text: commentText.trim(),
          s: attachTimestamp ? Math.floor(currentTimeSec) : 0,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.item) {
          setComments((prev) => [
            {
              id: json.item.id || Date.now(),
              name: json.item.name || commentName.trim() || 'Khán giả PhimAI',
              text: json.item.text || commentText.trim(),
              s: Number(json.item.s || 0),
              d: json.item.d || 'Vừa xong',
            },
            ...prev,
          ]);
        }
        setCommentText('');
      }
    } catch {
      // ignore
    } finally {
      setPostingComment(false);
    }
  };

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/watch?v=${encodeURIComponent(film.id)}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: film.title, url: shareUrl });
        return;
      }
    } catch {
      // fallback copy
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedToast(true);
      setTimeout(() => setCopiedToast(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div style={{ backgroundColor: 'var(--yt-background)', color: 'var(--yt-text-primary)', minHeight: 'calc(100vh - 56px)' }}>
      {/* Theater Mode Top Wide Player Banner */}
      {wideMode && (
        <div style={{ width: '100%', backgroundColor: '#000000', display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: '100%', maxWidth: '1750px', aspectRatio: '16/9', maxHeight: 'calc(100vh - 150px)', position: 'relative' }}>
            <div id="watch-player-slot" style={{ width: '100%', height: '100%' }} />
          </div>
        </div>
      )}

      <div
        className="watch-page-container"
        style={{
          maxWidth: '1760px',
          width: '100%',
          margin: '0 auto',
          padding: isMobile ? '10px 12px 64px' : '20px 24px 48px',
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) 400px',
          gap: '24px',
          boxSizing: 'border-box',
        }}
      >
        {/* Left / Main Column */}
        <div className="watch-main" style={{ minWidth: 0, width: '100%' }}>
          {!wideMode && (
            <div
              style={{
                position: 'relative',
                width: '100%',
                aspectRatio: '16/9',
                backgroundColor: '#000000',
                borderRadius: '14px',
                overflow: 'hidden',
              }}
            >
              <div id="watch-player-slot" style={{ width: '100%', height: '100%' }} />
            </div>
          )}

          {/* Back to catalog breadcrumb + Title */}
          <div style={{ marginTop: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <button
                type="button"
                onClick={onBackHome}
                className="watch-action-pill"
                style={{ height: '28px', padding: '0 10px', fontSize: '12px' }}
              >
                <IoArrowBack size={14} />
                <span>Danh sách phim</span>
              </button>
              {film.rank > 0 && (
                <span style={{ fontSize: '12px', color: 'var(--yt-blue)', fontWeight: 700 }}>
                  #{film.rank}
                </span>
              )}
              {film.tool && (
                <span
                  style={{
                    fontSize: '11.5px',
                    color: 'var(--yt-text-secondary)',
                    backgroundColor: 'var(--yt-hover)',
                    padding: '2px 8px',
                    borderRadius: '6px',
                  }}
                >
                  {film.tool}
                </span>
              )}
            </div>

            <h1 className="watch-title" style={{ margin: '0 0 12px', fontSize: isMobile ? '17px' : '20px' }}>
              {film.title}
            </h1>
          </div>

          {/* Channel & Action Pills Row */}
          <div className="watch-meta-container">
            <div className="watch-channel-group">
              <div
                onClick={() => onOpenChannel(film.channel)}
                className="watch-channel-link"
                style={{ cursor: 'pointer' }}
                title={`Mở trang kênh ${film.channel}`}
              >
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--yt-hover)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '16px',
                    flexShrink: 0,
                  }}
                >
                  {(film.channel || 'P').charAt(0).toUpperCase()}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      fontWeight: 600,
                      fontSize: '15px',
                      color: 'var(--yt-text-primary)',
                    }}
                  >
                    <span>{film.channel}</span>
                    <IoCheckmarkCircle size={14} color="var(--yt-text-secondary)" />
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--yt-text-secondary)' }}>
                    {channelFilmCount} phim trong kho
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  const res = toggleChannelSubscription({
                    name: film.channel,
                    thumbnail: getThumbUrl(film.id),
                  });
                  setSubscribed(res.subscribed);
                }}
                className={`watch-sub-btn ${subscribed ? 'subscribed' : 'unsubscribed'}`}
                style={{ height: '36px', fontSize: '13px', padding: '0 14px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
              >
                {subscribed ? <IoCheckmark size={15} /> : <IoPersonAddOutline size={14} />}
                <span>{subscribed ? 'Đã đăng ký' : 'Đăng ký'}</span>
              </button>

              <button
                type="button"
                onClick={() => onOpenChannel(film.channel)}
                className="watch-action-pill"
                style={{ height: '36px', fontSize: '12.5px', padding: '0 12px' }}
              >
                <span>Trang kênh</span>
              </button>
            </div>

            <div className="watch-actions-scroll-strip">
              {/* Interactive 5-Star Rating Pill */}
              <div
                className="watch-action-pill"
                style={{ gap: '6px', cursor: 'default' }}
                title="Chấm điểm bộ phim"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '1px' }}>
                  {[1, 2, 3, 4, 5].map((star) => {
                    const active = (hoverStar || Math.round(Number(avgStars))) >= star;
                    return (
                      <button
                        type="button"
                        key={star}
                        className="phimai-star-btn"
                        onMouseEnter={() => setHoverStar(star)}
                        onMouseLeave={() => setHoverStar(0)}
                        onClick={() => handleRate(star)}
                        aria-label={`Đánh giá ${star} sao`}
                      >
                        {active ? (
                          <IoStar size={15} color="#f59e0b" />
                        ) : (
                          <IoStarOutline size={15} color="var(--yt-text-secondary)" />
                        )}
                      </button>
                    );
                  })}
                </div>
                <span style={{ fontSize: '12.5px', fontWeight: 700 }}>{avgStars}</span>
                {rating && rating.n > 0 && (
                  <span style={{ fontSize: '11px', color: 'var(--yt-text-secondary)' }}>({rating.n})</span>
                )}
              </div>

              <button
                type="button"
                onClick={() => onToggleSave(film.id)}
                className={`watch-action-pill ${saved ? 'active' : ''}`}
              >
                {saved ? <IoBookmark size={17} color="#ff0033" /> : <IoBookmarkOutline size={17} />}
                <span>{saved ? 'Đã lưu' : 'Xem sau'}</span>
              </button>

              {!isMobile && (
                <button
                  type="button"
                  onClick={() => setWideMode(!wideMode)}
                  className={`watch-action-pill ${wideMode ? 'active' : ''}`}
                  title="Chế độ rạp chiếu (t)"
                >
                  <IoExpandOutline size={17} />
                  <span>{wideMode ? 'Mặc định' : 'Rạp phim'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleShare}
                className="watch-action-pill"
              >
                <IoShareSocialOutline size={17} />
                <span>{copiedToast ? 'Đã chép link!' : 'Chia sẻ'}</span>
              </button>
            </div>
          </div>

          {/* Series Episodes Strip (when movie is multi-part or episodic) */}
          {(seriesEpisodes.length >= 2 || getEpisodeNumber(film) !== null) && (
            <div
              data-testid="series-episodes-strip"
              style={{
                marginTop: '14px',
                padding: '12px 14px',
                borderRadius: '12px',
                backgroundColor: 'var(--yt-hover)',
                border: '1px solid var(--yt-border)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '8px',
                  marginBottom: '10px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700 }}>
                    Các phần cùng bộ ({Math.max(seriesEpisodes.length, 1)} tập)
                  </span>
                  {nextSeriesEpisode && (
                    <span
                      style={{
                        fontSize: '11.5px',
                        fontWeight: 600,
                        color: 'var(--yt-blue)',
                        backgroundColor: 'rgba(62, 166, 255, 0.14)',
                        padding: '2px 8px',
                        borderRadius: '999px',
                      }}
                    >
                      Tự động phát tiếp: Tập {getEpisodeNumber(nextSeriesEpisode) ?? currentEpIdx + 2}
                    </span>
                  )}
                  {discoverMsg && (
                    <span style={{ fontSize: '11.5px', color: '#4ade80', fontWeight: 600 }}>
                      {discoverMsg}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  data-testid="discover-episodes-btn"
                  onClick={handleDiscoverMoreEpisodes}
                  disabled={discoveringEps}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '4px 10px',
                    borderRadius: '14px',
                    border: '1px solid var(--yt-border)',
                    backgroundColor: 'var(--yt-background)',
                    color: 'var(--yt-text-primary)',
                    fontSize: '11.5px',
                    fontWeight: 600,
                    cursor: discoveringEps ? 'wait' : 'pointer',
                    opacity: discoveringEps ? 0.7 : 1,
                  }}
                >
                  <IoRefreshOutline size={13} />
                  <span>{discoveringEps ? 'Đang tìm tập...' : 'Tìm thêm tập'}</span>
                </button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {(seriesEpisodes.length > 0 ? seriesEpisodes : [film]).map((ep, idx) => (
                  <button
                    type="button"
                    key={ep.id}
                    data-testid={`series-ep-${idx + 1}`}
                    onClick={() => onSelectFilm(ep)}
                    className={`phimai-ep-chip ${ep.id === film.id ? 'active' : ''}`}
                  >
                    <span>Tập {getEpisodeNumber(ep) ?? idx + 1}</span>
                    {ep.dur && <span style={{ opacity: 0.72, fontSize: '11px' }}>({ep.dur})</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Description Box */}
          <div
            className="watch-description-box"
            onClick={() => !expandedDesc && setExpandedDesc(true)}
            style={{ marginTop: '14px', cursor: expandedDesc ? 'default' : 'pointer' }}
          >
            <div className="watch-description-stats">
              <span>{formatViewsVN(film.views)}</span>
              {film.dur && <span>• {film.dur}</span>}
              <span>• {CAT_LABEL[film.cat] || film.cat}</span>
              {film.tool && <span>• {film.tool}</span>}
            </div>

            <div
              className="watch-description-text"
              style={{
                marginTop: '6px',
                display: expandedDesc ? 'block' : '-webkit-box',
                WebkitLineClamp: expandedDesc ? 'unset' : 3,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {richBlurbLong || film.blurb || 'Phim AI chọn lọc chất lượng cao.'}
            </div>

            {Array.isArray(film.tags) && film.tags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
                {film.tags.map((tag) => (
                  <button
                    type="button"
                    key={tag}
                    className="phimai-tag-pill"
                    onClick={(e) => {
                      e.stopPropagation();
                      onFilterByPatch({ query: tag });
                    }}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setExpandedDesc((v) => !v);
              }}
              style={{
                marginTop: '8px',
                background: 'none',
                border: 'none',
                padding: 0,
                color: 'var(--yt-text-primary)',
                fontWeight: 700,
                fontSize: '12.5px',
                cursor: 'pointer',
              }}
            >
              {expandedDesc ? 'Thu gọn mô tả' : 'Xem thêm mô tả...'}
            </button>
          </div>

          {/* Timestamped Comments Section */}
          <div className="comments-section" style={{ marginTop: '24px' }}>
            <h2 style={{ fontSize: '17px', fontWeight: 700, marginBottom: '14px' }}>
              Bình luận ({comments.length})
            </h2>

            <form
              onSubmit={handlePostComment}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                backgroundColor: 'var(--yt-hover)',
                padding: '12px',
                borderRadius: '12px',
                marginBottom: '18px',
              }}
            >
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  placeholder="Tên hiển thị"
                  value={commentName}
                  onChange={(e) => setCommentName(e.target.value)}
                  style={{
                    flex: '0 1 180px',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: '1px solid var(--yt-border)',
                    backgroundColor: 'var(--yt-background)',
                    color: 'var(--yt-text-primary)',
                    fontSize: '13px',
                  }}
                />
                <input
                  type="text"
                  placeholder="Chia sẻ cảm nhận hoặc đánh dấu tình tiết hay..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  style={{
                    flex: '1 1 260px',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--yt-border)',
                    backgroundColor: 'var(--yt-background)',
                    color: 'var(--yt-text-primary)',
                    fontSize: '13px',
                  }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setAttachTimestamp((v) => !v)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    background: attachTimestamp ? 'rgba(62,166,255,0.16)' : 'transparent',
                    color: attachTimestamp ? 'var(--yt-blue)' : 'var(--yt-text-secondary)',
                    border: '1px solid var(--yt-border)',
                    borderRadius: '999px',
                    padding: '4px 10px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <IoTimeOutline size={14} />
                  <span>Gắn mốc giờ ({formatClock(currentTimeSec)})</span>
                </button>

                <button
                  type="submit"
                  disabled={!commentText.trim() || postingComment}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 14px',
                    borderRadius: '18px',
                    border: 'none',
                    backgroundColor: commentText.trim() ? 'var(--yt-blue)' : 'var(--yt-active)',
                    color: commentText.trim() ? '#000' : 'var(--yt-text-secondary)',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: commentText.trim() ? 'pointer' : 'not-allowed',
                  }}
                >
                  <IoSendOutline size={14} />
                  <span>Gửi bình luận</span>
                </button>
              </div>
            </form>

            {comments.length === 0 ? (
              <div style={{ color: 'var(--yt-text-secondary)', fontSize: '13px' }}>
                Chưa có bình luận nào. Hãy là người đầu tiên chia sẻ cảm nhận!
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {comments.map((c) => (
                  <div
                    key={c.id}
                    style={{
                      display: 'flex',
                      gap: '10px',
                      alignItems: 'flex-start',
                      paddingBottom: '10px',
                      borderBottom: '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    <div
                      style={{
                        width: '34px',
                        height: '34px',
                        borderRadius: '50%',
                        backgroundColor: 'var(--yt-hover)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '13px',
                        flexShrink: 0,
                      }}
                    >
                      {(c.name || 'K').charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '13px', fontWeight: 700 }}>{c.name}</span>
                        {c.s > 0 && (
                          <button
                            type="button"
                            onClick={() => onSeekToSec(c.s)}
                            style={{
                              background: 'rgba(62,166,255,0.16)',
                              color: 'var(--yt-blue)',
                              border: 'none',
                              borderRadius: '4px',
                              padding: '1px 6px',
                              fontSize: '11.5px',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            {formatClock(c.s)}
                          </button>
                        )}
                        {c.d && (
                          <span style={{ fontSize: '11px', color: 'var(--yt-text-secondary)' }}>{c.d}</span>
                        )}
                      </div>
                      <p style={{ margin: '4px 0 0', fontSize: '13.5px', lineHeight: 1.45, color: 'var(--yt-text-primary)' }}>
                        {c.text}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: kv-tube Up-Next Related Panel */}
        <aside className="watch-secondary" style={{ minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '10px' }}>
            Phim đề xuất tiếp theo
          </div>

          <div ref={chipBarRef} className="yt-chip-bar" style={{ marginBottom: '12px' }}>
            {[
              { id: 'all', label: 'Tất cả' },
              { id: 'cat', label: 'Cùng chuyên mục' },
              { id: 'channel', label: 'Cùng kênh' },
              { id: 'full', label: 'Trọn bộ' },
            ].map((chip) => (
              <button
                type="button"
                key={chip.id}
                onClick={() => setSideFilter(chip.id as any)}
                className={`yt-filter-chip ${sideFilter === chip.id ? 'active' : ''}`}
              >
                {chip.label}
              </button>
            ))}
          </div>

          <div className="yt-related-list">
            {relatedList.map((rel) => (
              <a
                key={rel.id}
                href={`/watch?v=${encodeURIComponent(rel.id)}`}
                onClick={(e) => {
                  e.preventDefault();
                  onSelectFilm(rel);
                }}
                className="yt-related-card"
              >
                <div className="yt-related-thumb-container">
                  <img src={getThumbUrl(rel.id)} alt={rel.title} loading="lazy" />
                  {rel.dur && <span className="yt-related-duration">{rel.dur}</span>}
                </div>
                <div className="yt-related-info">
                  <div className="yt-related-title">
                    {nextSeriesEpisode && rel.id === nextSeriesEpisode.id && (
                      <span
                        style={{
                          display: 'inline-block',
                          backgroundColor: '#ff0033',
                          color: '#fff',
                          fontSize: '10px',
                          fontWeight: 700,
                          padding: '1px 5px',
                          borderRadius: '4px',
                          marginRight: '5px',
                          verticalAlign: 'middle',
                        }}
                      >
                        Tập tiếp theo
                      </span>
                    )}
                    {rel.title}
                  </div>
                  <div className="yt-related-channel">{rel.channel}</div>
                  <div className="yt-related-meta">
                    {formatViewsVN(rel.views)} • {CAT_LABEL[rel.cat] || rel.cat}
                  </div>
                </div>
              </a>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
