import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Avatar } from '@astryxdesign/core/Avatar';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Heading } from '@astryxdesign/core/Heading';
import { TextInput } from '@astryxdesign/core/TextInput';
import { ToggleButton } from '@astryxdesign/core/ToggleButton';
import {
  Star,
  Bookmark,
  Share2,
  Maximize2,
  BadgeCheck,
  Clock,
  Send,
  ArrowLeft,
  UserPlus,
  Check,
  RefreshCw,
} from 'lucide-react';
import type { Film, FilterState } from '../types/phimai';
import {
  CAT_LABEL,
  dedupeAndContiguousEpisodes,
  formatClock,
  formatViewsVN,
  getEpisodeInfo,
  getEpisodeNumber,
  getSeriesEpisodes,
  getThumbUrl,
  isBlockedEpisodeTitle,
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
  const [streamMeta, setStreamMeta] = useState<{ title?: string; channel?: string; viewCount?: number }>({});
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
    setStreamMeta({});
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
        if (res.film?.title || res.title || res.film?.channel || res.author) {
          setStreamMeta({
            title: res.film?.title || res.title,
            channel: res.film?.channel || res.author,
            viewCount: res.viewCount,
          });
        }
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
    for (const ep of apiSeries) {
      if (ep?.id && !isBlockedEpisodeTitle(ep.title)) byId.set(ep.id, ep);
    }
    for (const ep of localEps) {
      if (ep?.id && !byId.has(ep.id) && !isBlockedEpisodeTitle(ep.title)) byId.set(ep.id, ep);
    }
    if (!byId.has(film.id) && !isBlockedEpisodeTitle(film.title)) byId.set(film.id, film);

    const list = dedupeAndContiguousEpisodes(Array.from(byId.values()), film.id);
    if (list.length < 2 && getEpisodeNumber(film) === null) return [];
    return list;
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

  const displayTitle =
    film.title && film.title !== 'Đang tải phim AI...'
      ? film.title
      : streamMeta.title || film.title;
  const displayChannel =
    film.channel && film.channel !== 'PhimAI'
      ? film.channel
      : streamMeta.channel || film.channel;
  const displayViews =
    film.views && film.views !== '0'
      ? film.views
      : streamMeta.viewCount && streamMeta.viewCount > 0
        ? String(streamMeta.viewCount)
        : film.views;

  const channelFilmCount = useMemo(
    () => allFilms.filter((f) => f.channel === displayChannel).length,
    [allFilms, displayChannel]
  );

  const relatedList = useMemo(() => {
    const currentBaseKey = getEpisodeInfo(film.title, film.channel).baseKey;
    const sameSeriesIds = new Set<string>([film.id, ...seriesEpisodes.map((e) => e.id)]);
    const seen = new Set<string>(sameSeriesIds);
    const seenSeriesKeys = new Set<string>();
    const currentTags = new Set(film.tags || []);

    const tryAccept = (cand: Film, target: Film[]): boolean => {
      if (!cand?.id || seen.has(cand.id)) return false;
      if (isBlockedEpisodeTitle(cand.title)) return false;

      const candInfo = getEpisodeInfo(cand.title, cand.channel);
      if (currentBaseKey && candInfo.baseKey === currentBaseKey) return false;
      if (candInfo.baseKey && seenSeriesKeys.has(candInfo.baseKey)) return false;

      seen.add(cand.id);
      if (candInfo.baseKey) seenSeriesKeys.add(candInfo.baseKey);
      target.push(cand);
      return true;
    };

    const base: Film[] = [];
    for (const rel of apiRelated) {
      tryAccept(rel, base);
    }

    const hasSharedTag = (f: Film) =>
      Array.isArray(f.tags) && f.tags.some((t) => currentTags.has(t));

    for (const f of allFilms) {
      if (base.length >= 36) break;
      if (hasSharedTag(f)) {
        tryAccept(f, base);
      }
    }
    for (const f of allFilms) {
      if (base.length >= 36) break;
      if (f.cat === film.cat || f.channel === film.channel) {
        tryAccept(f, base);
      }
    }
    for (const f of allFilms) {
      if (base.length >= 40) break;
      tryAccept(f, base);
    }

    if (sideFilter === 'cat') {
      return base.filter((f) => f.cat === film.cat);
    }
    if (sideFilter === 'channel') {
      const sameChFromBase = base.filter((f) => f.channel === film.channel);
      const restSameCh: Film[] = [];
      for (const f of allFilms) {
        if (restSameCh.length >= 30) break;
        if (f.channel === film.channel) {
          tryAccept(f, restSameCh);
        }
      }
      const mergedCh = [...sameChFromBase, ...restSameCh];
      return mergedCh.length > 0 ? mergedCh : base;
    }
    if (sideFilter === 'full') {
      const fullFromBase = base.filter((f) => /full|trọn/i.test(f.dur || ''));
      if (fullFromBase.length >= 12) return fullFromBase;
      const extraFull: Film[] = [...fullFromBase];
      for (const f of allFilms) {
        if (extraFull.length >= 24) break;
        if (/full|trọn/i.test(f.dur || '')) {
          tryAccept(f, extraFull);
        }
      }
      return extraFull;
    }
    return base;
  }, [apiRelated, allFilms, film.id, film.title, film.cat, film.channel, film.tags, sideFilter, seriesEpisodes]);

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
    <div style={{ backgroundColor: 'var(--color-background-body, #0d0e14)', color: 'var(--color-text-primary, #f4f4f6)', minHeight: 'calc(100vh - 60px)' }}>
      {/* Theater Mode Top Wide Player Banner */}
      {wideMode && (
        <div style={{ width: '100%', backgroundColor: '#05060a', display: 'flex', justifyContent: 'center', borderBottom: '1px solid var(--yt-border)' }}>
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
            <div className="watch-player-frame">
              <div id="watch-player-slot" style={{ width: '100%', height: '100%' }} />
            </div>
          )}

          {/* Clean Navigation Back Row + Title (No eyebrow kickers above Heading) */}
          <div style={{ marginTop: '14px' }}>
            <div style={{ marginBottom: '10px' }}>
              <Button
                variant="ghost"
                size="sm"
                label="Danh sách phim"
                icon={<ArrowLeft size={14} strokeWidth={1.75} />}
                onClick={onBackHome}
              />
            </div>

            <Heading
              level={1}
              className="watch-title"
              weight="bold"
              style={{
                margin: '0 0 8px',
                fontSize: isMobile ? '17px' : '20px',
                fontFamily: 'var(--font-family-body, "Be Vietnam Pro", sans-serif)',
                lineHeight: 1.32,
              }}
            >
              {displayTitle}
            </Heading>

            {/* Metadata pills sit BELOW Heading per No-Kicker Rule */}
            {(film.rank > 0 || film.tool) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                {film.rank > 0 && (
                  <span
                    className="phimai-tabular"
                    style={{
                      fontFamily: 'var(--font-family-code, monospace)',
                      fontSize: '12px',
                      fontWeight: 700,
                      color: 'var(--color-accent, #ffd875)',
                      backgroundColor: 'rgba(255, 216, 117, 0.12)',
                      border: '1px solid rgba(255, 216, 117, 0.28)',
                      padding: '2px 8px',
                      borderRadius: '6px',
                    }}
                  >
                    #{film.rank}
                  </span>
                )}
                {film.tool && <Badge variant="neutral" label={film.tool} />}
              </div>
            )}
          </div>

          {/* Channel & Action Controls Row */}
          <div className="watch-meta-container">
            <div className="watch-channel-group">
              <div
                onClick={() => onOpenChannel(displayChannel)}
                className="watch-channel-link"
                style={{ cursor: 'pointer' }}
                title={`Mở trang kênh ${displayChannel}`}
              >
                <Avatar
                  size={40}
                  name={displayChannel || 'PhimAI'}
                  alt={displayChannel || 'PhimAI'}
                  tooltip={false}
                />
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      fontWeight: 600,
                      fontSize: '15px',
                      color: 'var(--color-text-primary)',
                    }}
                  >
                    <span>{displayChannel}</span>
                    <BadgeCheck size={14} strokeWidth={1.75} style={{ flexShrink: 0, color: 'var(--color-accent, #ffd875)' }} />
                  </div>
                  <div className="phimai-tabular" style={{ fontSize: '12px', color: 'var(--yt-text-muted, #989fb8)' }}>
                    {channelFilmCount} phim trong kho
                  </div>
                </div>
              </div>

              <div className="watch-channel-actions">
                <Button
                  variant={subscribed ? 'secondary' : 'primary'}
                  size="md"
                  label={subscribed ? 'Đã đăng ký' : 'Đăng ký'}
                  icon={subscribed ? <Check size={15} strokeWidth={1.75} /> : <UserPlus size={15} strokeWidth={1.75} />}
                  onClick={() => {
                    const res = toggleChannelSubscription({
                      name: displayChannel,
                      thumbnail: getThumbUrl(film.id),
                    });
                    setSubscribed(res.subscribed);
                  }}
                />

                <Button
                  variant="secondary"
                  size="md"
                  label="Trang kênh"
                  onClick={() => onOpenChannel(displayChannel)}
                />
              </div>
            </div>

            <div className="watch-actions-scroll-strip">
              {/* Interactive 5-Star Rating Pill */}
              <div
                className="phimai-tabular"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  height: '32px',
                  padding: '0 10px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--yt-surface, #161822)',
                  border: '1px solid var(--yt-border)',
                }}
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
                        <Star
                          size={14}
                          strokeWidth={1.75}
                          color={active ? '#ffd875' : '#989fb8'}
                          fill={active ? '#ffd875' : 'none'}
                        />
                      </button>
                    );
                  })}
                </div>
                <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#ffd875' }}>{avgStars}</span>
                {rating && rating.n > 0 && (
                  <span style={{ fontSize: '11px', color: 'var(--yt-text-muted)' }}>({rating.n})</span>
                )}
              </div>

              <ToggleButton
                size="md"
                label={saved ? 'Đã lưu' : 'Xem sau'}
                isPressed={saved}
                onPressedChange={() => onToggleSave(film.id)}
                icon={<Bookmark size={15} strokeWidth={1.75} />}
                pressedIcon={<Bookmark size={15} strokeWidth={1.75} fill="#ffd875" color="#ffd875" />}
              />

              {!isMobile && (
                <ToggleButton
                  size="md"
                  label={wideMode ? 'Mặc định' : 'Rạp phim'}
                  tooltip="Chế độ rạp chiếu (t)"
                  isPressed={wideMode}
                  onPressedChange={(pressed) => setWideMode(pressed)}
                  icon={<Maximize2 size={15} strokeWidth={1.75} />}
                />
              )}

              <Button
                variant="secondary"
                size="md"
                label={copiedToast ? 'Đã chép link!' : 'Chia sẻ'}
                icon={<Share2 size={15} strokeWidth={1.75} />}
                onClick={handleShare}
              />
            </div>
          </div>

          {/* Series Episodes Strip (when movie is multi-part or episodic) */}
          {(seriesEpisodes.length >= 2 || getEpisodeNumber(film) !== null) && (
            <div className="phimai-series-panel" data-testid="series-episodes-strip">
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
                  <span className="phimai-tabular" style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                    Các phần cùng bộ ({Math.max(seriesEpisodes.length, 1)} tập)
                  </span>
                  {nextSeriesEpisode && (
                    <Badge
                      variant="yellow"
                      label={`Tự động phát tiếp: Tập ${getEpisodeNumber(nextSeriesEpisode) ?? currentEpIdx + 2}`}
                    />
                  )}
                  {discoverMsg && (
                    <Badge variant="success" label={discoverMsg} />
                  )}
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  data-testid="discover-episodes-btn"
                  isLoading={discoveringEps}
                  icon={<RefreshCw size={13} strokeWidth={1.75} />}
                  label={discoveringEps ? 'Đang tìm tập...' : 'Tìm thêm tập'}
                  onClick={handleDiscoverMoreEpisodes}
                />
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
                    {ep.dur && (
                      <span style={{ opacity: ep.id === film.id ? 0.85 : 0.72, fontSize: '11px' }}>
                        ({ep.dur})
                      </span>
                    )}
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
            <div className="watch-description-stats phimai-tabular">
              <span>{formatViewsVN(displayViews)}</span>
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
                marginTop: '10px',
                background: 'none',
                border: 'none',
                padding: 0,
                color: 'var(--color-accent, #ffd875)',
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
            <Heading
              level={2}
              className="phimai-tabular"
              weight="bold"
              style={{
                fontSize: '17px',
                fontFamily: 'var(--font-family-body, "Be Vietnam Pro", sans-serif)',
                marginBottom: '14px',
              }}
            >
              Bình luận ({comments.length})
            </Heading>

            <form
              onSubmit={handlePostComment}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                backgroundColor: 'var(--yt-surface, #161822)',
                border: '1px solid var(--yt-border)',
                padding: '14px',
                borderRadius: '12px',
                marginBottom: '18px',
              }}
            >
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <TextInput
                  label="Tên hiển thị"
                  isLabelHidden
                  size="md"
                  placeholder="Tên hiển thị"
                  value={commentName}
                  onChange={(val) => setCommentName(val)}
                  containerStyle={{ flex: '0 1 180px' }}
                />
                <TextInput
                  label="Nội dung bình luận"
                  isLabelHidden
                  size="md"
                  placeholder="Chia sẻ cảm nhận hoặc đánh dấu tình tiết hay..."
                  value={commentText}
                  onChange={(val) => setCommentText(val)}
                  containerStyle={{ flex: '1 1 260px' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <ToggleButton
                  size="sm"
                  label={`Gắn mốc giờ (${formatClock(currentTimeSec)})`}
                  isPressed={attachTimestamp}
                  onPressedChange={(pressed) => setAttachTimestamp(pressed)}
                  icon={<Clock size={14} strokeWidth={1.75} />}
                />

                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  label="Gửi bình luận"
                  isLoading={postingComment}
                  isDisabled={!commentText.trim()}
                  icon={<Send size={14} strokeWidth={1.75} />}
                />
              </div>
            </form>

            {comments.length === 0 ? (
              <div style={{ color: 'var(--yt-text-muted, #989fb8)', fontSize: '13.5px' }}>
                Chưa có bình luận nào. Hãy là người đầu tiên chia sẻ cảm nhận!
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {comments.map((c) => (
                  <div
                    key={c.id}
                    style={{
                      display: 'flex',
                      gap: '12px',
                      alignItems: 'flex-start',
                      paddingBottom: '12px',
                      borderBottom: '1px solid var(--yt-border)',
                    }}
                  >
                    <Avatar size={36} name={c.name || 'Khán giả'} tooltip={false} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                          {c.name}
                        </span>
                        {c.s > 0 && (
                          <button
                            type="button"
                            onClick={() => onSeekToSec(c.s)}
                            className="phimai-tabular"
                            style={{
                              fontFamily: 'var(--font-family-code, monospace)',
                              background: 'rgba(255, 216, 117, 0.14)',
                              border: '1px solid rgba(255, 216, 117, 0.28)',
                              color: '#ffd875',
                              borderRadius: '5px',
                              padding: '1px 6px',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            {formatClock(c.s)}
                          </button>
                        )}
                        {c.d && (
                          <span style={{ fontSize: '11.5px', color: 'var(--yt-text-muted, #989fb8)' }}>{c.d}</span>
                        )}
                      </div>
                      <p style={{ margin: '4px 0 0', fontSize: '13.5px', lineHeight: 1.5, color: 'var(--yt-text-secondary)' }}>
                        {c.text}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Up-Next Related Panel */}
        <aside className="watch-secondary" style={{ minWidth: 0 }}>
          <Heading
            level={2}
            weight="bold"
            style={{
              fontSize: '15px',
              fontFamily: 'var(--font-family-body, "Be Vietnam Pro", sans-serif)',
              marginBottom: '10px',
            }}
          >
            Phim đề xuất tiếp theo
          </Heading>

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
                  <div className="yt-related-title">{rel.title}</div>
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
