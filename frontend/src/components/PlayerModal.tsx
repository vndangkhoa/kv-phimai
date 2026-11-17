import React, { useCallback, useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  Bookmark,
  BookmarkCheck,
  Check,
  ChevronRight,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Layers,
  MessageSquare,
  Play,
  Send,
  Share2,
  ShieldAlert,
  Smartphone,
  Sparkles,
  Star,
  Tv,
  Users,
} from 'lucide-react';
import { Dialog } from '@astryxdesign/core/Dialog';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Selector } from '@astryxdesign/core/Selector';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Badge } from '@astryxdesign/core/Badge';
import type { Film, KVTubeStreamInfo } from '../types/phimai';
import {
  CAT_LABEL,
  KVTUBE_ORIGIN,
  calculateAge,
  formatClock,
  formatViewsVN,
  getKVTubeEmbedUrl,
  getKVTubeStreamUrl,
  getKVTubeWatchUrl,
  getSeriesEpisodes,
  getThumbUrl,
  isAgeVerified,
  markAgeVerified,
} from '../utils/phimaiUtils';
import { FilmThumb } from './FilmThumb';
import { OverlayHeader } from './OverlayHeader';
import { drawShareCard } from './shareCard';
import { PHONE_QUERY, useMediaQuery } from './useMediaQuery';
import './overlays.css';

export interface PlayerModalProps {
  film: Film | null;
  allFilms: Film[];
  savedIds: Set<string>;
  onToggleSave: (id: string) => void;
  ratings: Record<string, { s: number; n: number }>;
  onRateFilm: (id: string, stars: number) => Promise<void>;
  onSelectFilm: (film: Film) => void;
  onClose: () => void;
  onOpenWatchParty: (film: Film) => void;
  onOpenSwipeFeed: (film: Film) => void;
  activePartyCode?: string | null;
  isPartyHost?: boolean;
}

interface CommentItem {
  id?: string;
  t: string;
  s?: number;
  d?: string;
  n?: string;
  m?: { n?: string; l?: string; p?: string };
}

const ICON = { className: 'h-4 w-4 shrink-0', strokeWidth: 1.75 } as const;
const SLEEP_OPTIONS = [0, 15, 30, 60];
const EMBED_VALUE = 'embed';

/**
 * Cinema player overlay. Astryx Dialog supplies the native modal (focus trap,
 * Escape, focus return); on phones it becomes a full-screen sheet with the
 * 16:9 player pinned to the top of the scrolling body.
 */
export const PlayerModal: React.FC<PlayerModalProps> = (props) => {
  const isPhone = useMediaQuery(PHONE_QUERY);
  const { film, onClose } = props;

  return (
    <Dialog
      isOpen={film !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      variant={isPhone ? 'fullscreen' : 'standard'}
      width={1240}
      maxHeight="94dvh"
      padding={0}
      purpose="form"
      className="kv-overlay"
      data-testid="player-modal"
    >
      {film ? <PlayerBody {...props} film={film} isPhone={isPhone} /> : null}
    </Dialog>
  );
};

interface PlayerBodyProps extends PlayerModalProps {
  film: Film;
  isPhone: boolean;
}

const PlayerBody: React.FC<PlayerBodyProps> = ({
  film,
  allFilms,
  savedIds,
  onToggleSave,
  ratings,
  onRateFilm,
  onSelectFilm,
  onClose,
  onOpenWatchParty,
  onOpenSwipeFeed,
  activePartyCode,
  isPartyHost,
  isPhone,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const shareCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [streamInfo, setStreamInfo] = useState<KVTubeStreamInfo | null>(null);
  const [selectedSource, setSelectedSource] = useState<string>('');
  const [selectedQualityLabel, setSelectedQualityLabel] = useState<string>('360p MP4');
  const [useEmbedFallback, setUseEmbedFallback] = useState<boolean>(false);
  const [loadingStream, setLoadingStream] = useState<boolean>(false);
  const [fullBlurbFilm, setFullBlurbFilm] = useState<Film | null>(null);
  const [apiEpisodes, setApiEpisodes] = useState<Film[]>([]);

  // Age gate
  const [needsAgeGate, setNeedsAgeGate] = useState<boolean>(() => Boolean(film.adult && !isAgeVerified()));
  const [dobDay, setDobDay] = useState<string>('');
  const [dobMonth, setDobMonth] = useState<string>('');
  const [dobYear, setDobYear] = useState<string>('');
  const [ageError, setAgeError] = useState<string>('');

  // Sleep timer
  const [sleepMinutes, setSleepMinutes] = useState<number>(0);
  const [sleepRemainingSec, setSleepRemainingSec] = useState<number>(0);

  // Rating
  const [myRating, setMyRating] = useState<number>(0);
  const [ratingStatus, setRatingStatus] = useState<string>('');

  // Comments
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [loadingComments, setLoadingComments] = useState<boolean>(false);
  const [commentText, setCommentText] = useState<string>('');
  const [commentAuthor, setCommentAuthor] = useState<string>(() => {
    try {
      return localStorage.getItem('phimaihot_nick') || '';
    } catch {
      return '';
    }
  });
  const [attachedTimestamp, setAttachedTimestamp] = useState<number | null>(null);

  // Share card
  const [showShareCard, setShowShareCard] = useState<boolean>(false);
  const [shareCardStatus, setShareCardStatus] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  // Age gate check whenever the film changes
  useEffect(() => {
    if (film.adult && !isAgeVerified()) {
      setNeedsAgeGate(true);
      setAgeError('');
    } else {
      setNeedsAgeGate(false);
    }
  }, [film]);

  // Film details + KV-Tube stream metadata + comments
  useEffect(() => {
    if (needsAgeGate) return;

    const defaultDirectUrl = getKVTubeStreamUrl(film.id);
    setSelectedSource(defaultDirectUrl);
    setSelectedQualityLabel('360p MP4');
    setUseEmbedFallback(false);
    setStreamInfo(null);
    setFullBlurbFilm(film);
    setApiEpisodes([]);
    setAttachedTimestamp(null);
    setRatingStatus('');
    setShowShareCard(false);

    try {
      const ratedMap = JSON.parse(localStorage.getItem('phimaihot_rated') || '{}');
      setMyRating(ratedMap[film.id] || 0);
    } catch {
      setMyRating(0);
    }

    fetch('/api/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: film.id }),
    }).catch(() => {});

    let cancelled = false;
    setLoadingStream(true);

    fetch(`/api/kvtube/video/${encodeURIComponent(film.id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const info: KVTubeStreamInfo = {
          id: film.id,
          watchUrl: data.watchUrl || getKVTubeWatchUrl(film.id),
          embedUrl: data.embedUrl || getKVTubeEmbedUrl(film.id),
          channelUrl:
            data.channelUrl || `${KVTUBE_ORIGIN}/results?search_query=${encodeURIComponent(film.channel)}`,
          thumbnailUrl: data.thumbnailUrl || getThumbUrl(film.id),
          hlsUrl: data.hlsUrl,
          dashUrl: data.dashUrl,
          directStreamUrl: data.directStreamUrl || defaultDirectUrl,
          streams: Array.isArray(data.streams) ? data.streams : [],
          captions: Array.isArray(data.captions) ? data.captions : [],
        };
        setStreamInfo(info);
        if (info.streams.length > 0) {
          const preferred = info.streams.find((s) => /720p|1080p/i.test(s.quality)) || info.streams[0];
          if (preferred && preferred.url) {
            setSelectedSource(preferred.url);
            setSelectedQualityLabel(preferred.quality || 'HD MP4');
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingStream(false);
      });

    fetch(`/api/films/${encodeURIComponent(film.id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        if (data.film) {
          setFullBlurbFilm((prev) => ({ ...(prev || film), ...data.film }));
        } else if (data.blurbLong) {
          setFullBlurbFilm((prev) => ({ ...(prev || film), blurbLong: data.blurbLong }));
        }
        if (Array.isArray(data.episodes) && data.episodes.length > 0) {
          setApiEpisodes(data.episodes);
        } else if (Array.isArray(data.series) && data.series.length > 0) {
          setApiEpisodes(data.series);
        }
      })
      .catch(() => {});

    setLoadingComments(true);
    fetch(`/api/comments?id=${encodeURIComponent(film.id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        setComments(Array.isArray(data?.items) ? data.items : []);
      })
      .catch(() => {
        if (!cancelled) setComments([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingComments(false);
      });

    return () => {
      cancelled = true;
    };
  }, [film, needsAgeGate]);

  // Attach HLS or native src when the source changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !selectedSource || useEmbedFallback || needsAgeGate) return;

    let hls: Hls | null = null;
    const isHls =
      selectedSource.includes('.m3u8') ||
      selectedSource.includes('hls_variant') ||
      selectedSource.includes('hls_playlist');

    if (isHls && Hls.isSupported()) {
      hls = new Hls({ enableWorker: true, lowLatencyMode: false });
      hls.loadSource(selectedSource);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
      });
    } else {
      video.src = selectedSource;
      video.play().catch(() => {});
    }

    return () => {
      if (hls) hls.destroy();
    };
  }, [selectedSource, useEmbedFallback, needsAgeGate]);

  // Sleep timer countdown
  useEffect(() => {
    if (sleepMinutes <= 0) {
      setSleepRemainingSec(0);
      return;
    }
    setSleepRemainingSec(sleepMinutes * 60);
    const interval = setInterval(() => {
      setSleepRemainingSec((prev) => {
        if (prev <= 1) {
          videoRef.current?.pause();
          setSleepMinutes(0);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [sleepMinutes]);

  // Watch Party sync
  useEffect(() => {
    if (!activePartyCode || needsAgeGate) return;
    const interval = setInterval(async () => {
      const video = videoRef.current;
      if (!video) return;
      try {
        if (isPartyHost) {
          await fetch('/api/room-state', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              code: activePartyCode,
              filmId: film.id,
              t: Math.floor(video.currentTime || 0),
              playing: !video.paused,
            }),
          });
        } else {
          const r = await fetch(`/api/room?code=${encodeURIComponent(activePartyCode)}`);
          if (!r.ok) return;
          const j = await r.json();
          if (j.ok && j.filmId === film.id && typeof j.t === 'number') {
            const drift = Math.abs((video.currentTime || 0) - j.t);
            if (drift > 5) video.currentTime = j.t;
            if (j.playing && video.paused) {
              video.play().catch(() => {});
            } else if (!j.playing && !video.paused) {
              video.pause();
            }
          }
        }
      } catch {
        // ignore network errors during background sync
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [activePartyCode, isPartyHost, film, needsAgeGate]);

  const generateShareCard = useCallback(async () => {
    const canvas = shareCanvasRef.current;
    if (!canvas) return;
    setShareCardStatus('Đang kết xuất thẻ chia sẻ 1080×1920…');
    const ok = await drawShareCard(canvas, film);
    setShareCardStatus(
      ok ? 'Thẻ chia sẻ đã sẵn sàng. Bấm Tải ảnh PNG để lưu về máy.' : 'Trình duyệt không hỗ trợ vẽ canvas.'
    );
  }, [film]);

  useEffect(() => {
    if (showShareCard) generateShareCard();
  }, [showShareCard, generateShareCard]);

  const displayFilm = fullBlurbFilm || film;
  const seriesEpisodes = apiEpisodes.length >= 2 ? apiEpisodes : getSeriesEpisodes(displayFilm, allFilms);
  const relatedFilms = allFilms
    .filter((f) => f.id !== displayFilm.id && (f.cat === displayFilm.cat || f.channel === displayFilm.channel))
    .slice(0, 6);

  const ratingObj = ratings[displayFilm.id];
  const avgStars = ratingObj && ratingObj.n > 0 ? ratingObj.s / ratingObj.n : 0;
  const isSaved = savedIds.has(displayFilm.id);
  const kvtubeWatchUrl = streamInfo?.watchUrl || getKVTubeWatchUrl(displayFilm.id);
  const kvtubeEmbedUrl = streamInfo?.embedUrl || getKVTubeEmbedUrl(displayFilm.id);
  const directUrl = getKVTubeStreamUrl(displayFilm.id);

  // Quality options, de-duplicated by URL
  const qualityOptions: Array<{ value: string; label: string }> = [];
  const seen = new Set<string>();
  const pushOption = (value: string | undefined, label: string) => {
    if (!value || seen.has(value)) return;
    seen.add(value);
    qualityOptions.push({ value, label });
  };
  pushOption(directUrl, 'Luồng trực tiếp KV-Tube (360p MP4)');
  if (streamInfo?.hlsUrl) pushOption(streamInfo.hlsUrl, 'HLS thích ứng (u.khoavo.vndns.net)');
  streamInfo?.streams?.forEach((s) => pushOption(s.url, `${s.quality} · ${s.container || s.type || 'MP4'}`));
  if (selectedSource && !seen.has(selectedSource)) pushOption(selectedSource, selectedQualityLabel);
  pushOption(EMBED_VALUE, 'Trình phát nhúng KV-Tube (/embed)');

  const handleAgeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const age = calculateAge(parseInt(dobDay, 10), parseInt(dobMonth, 10), parseInt(dobYear, 10));
    if (age === null) {
      setAgeError('Ngày sinh chưa hợp lệ. Kiểm tra lại ngày, tháng và năm (VD: 05 / 09 / 1998).');
      return;
    }
    if (age < 18) {
      setAgeError('Bạn chưa đủ 18 tuổi nên không thể xem phim giới hạn độ tuổi này.');
      return;
    }
    markAgeVerified();
    setNeedsAgeGate(false);
  };

  const handleAttachCurrentTime = () => {
    if (attachedTimestamp !== null) {
      setAttachedTimestamp(null);
      return;
    }
    const sec = Math.floor(videoRef.current?.currentTime || 0);
    setAttachedTimestamp(sec > 0 ? sec : 0);
  };

  const appendLocalComment = (text: string) => {
    setComments((prev) => [
      { t: text, s: attachedTimestamp || 0, d: 'vừa xong', m: { n: commentAuthor.trim() || 'Khán giả' } },
      ...prev,
    ]);
    setCommentText('');
    setAttachedTimestamp(null);
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = commentText.trim();
    if (text.length < 2) return;
    if (commentAuthor.trim()) {
      try {
        localStorage.setItem('phimaihot_nick', commentAuthor.trim());
      } catch {
        // ignore
      }
    }
    try {
      const r = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: displayFilm.id,
          name: commentAuthor.trim() || 'Khán giả',
          text,
          s: attachedTimestamp || 0,
        }),
      });
      const j = await r.json().catch(() => ({ ok: false }));
      if (r.ok && j.ok !== false) appendLocalComment(text);
    } catch {
      appendLocalComment(text);
    }
  };

  const handleSeekTo = (sec: number) => {
    if (useEmbedFallback) setUseEmbedFallback(false);
    setTimeout(() => {
      if (videoRef.current) {
        videoRef.current.currentTime = sec;
        videoRef.current.play().catch(() => {});
      }
    }, 80);
  };

  const handleRate = async (stars: number) => {
    setMyRating(stars);
    try {
      const ratedMap = JSON.parse(localStorage.getItem('phimaihot_rated') || '{}');
      ratedMap[displayFilm.id] = stars;
      localStorage.setItem('phimaihot_rated', JSON.stringify(ratedMap));
    } catch {
      // ignore
    }
    await onRateFilm(displayFilm.id, stars);
    setRatingStatus(`Đã ghi nhận ${stars}/5 sao của bạn.`);
  };

  const handleDownloadShareCard = () => {
    const canvas = shareCanvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kv-phimai-${displayFilm.rank}-${displayFilm.id}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    });
  };

  const handleCopyWatchLink = async () => {
    try {
      await navigator.clipboard.writeText(kvtubeWatchUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2200);
    } catch {
      // ignore
    }
  };

  const fullWidth = isPhone ? '100%' : undefined;

  const header = (
    <OverlayHeader
      title={displayFilm.title}
      subtitle={
        <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-xs tabular-nums text-[#c4c8d9]">
          <Badge variant="yellow" label={`#${displayFilm.rank}`} />
          {displayFilm.adult && <Badge variant="error" label="18+" />}
          <span className="font-semibold text-[#ffd875]">{displayFilm.channel}</span>
          {displayFilm.dur && <span>{displayFilm.dur}</span>}
        </span>
      }
      onClose={onClose}
      closeLabel="Đóng trình phát"
    />
  );

  if (needsAgeGate) {
    return (
      <div className="kv-frame">
        {header}
        <div className="kv-body kv-scroll px-4 py-6 sm:px-6 sm:py-10">
          <form
            onSubmit={handleAgeSubmit}
            className="mx-auto w-full max-w-md rounded-2xl border border-[#e50914]/40 bg-[#161822] p-5 shadow-[0_14px_34px_-10px_rgba(4,5,10,0.72)] sm:p-6"
            aria-labelledby="kv-agegate-title"
            noValidate
          >
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#e50914]/20 text-[#ff6b72]">
                <ShieldAlert className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
              </span>
              <h3 id="kv-agegate-title" className="text-lg font-bold text-[#f4f4f6]">
                Xác minh độ tuổi 18+
              </h3>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-[#c4c8d9]">
              <strong className="text-[#f4f4f6]">{displayFilm.title}</strong> dành cho khán giả từ đủ 18 tuổi. Nhập
              ngày sinh để xác minh ngay trên thiết bị này, dữ liệu không gửi lên máy chủ.
            </p>
            <div className="mt-5 grid grid-cols-3 gap-2 tabular-nums">
              <TextInput
                label="Ngày"
                value={dobDay}
                onChange={(v) => setDobDay(v.replace(/\D/g, '').slice(0, 2))}
                inputMode="numeric"
                placeholder="DD"
                autoComplete="bday-day"
                isRequired
              />
              <TextInput
                label="Tháng"
                value={dobMonth}
                onChange={(v) => setDobMonth(v.replace(/\D/g, '').slice(0, 2))}
                inputMode="numeric"
                placeholder="MM"
                autoComplete="bday-month"
                isRequired
              />
              <TextInput
                label="Năm"
                value={dobYear}
                onChange={(v) => setDobYear(v.replace(/\D/g, '').slice(0, 4))}
                inputMode="numeric"
                placeholder="YYYY"
                autoComplete="bday-year"
                isRequired
              />
            </div>
            {ageError && (
              <p role="alert" className="mt-3 text-sm font-medium text-[#ff6b72]">
                {ageError}
              </p>
            )}
            <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
              <Button type="submit" variant="primary" label="Xác nhận đủ 18 tuổi" width="100%" />
              <Button label="Đóng" variant="secondary" onClick={onClose} width={fullWidth} />
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="kv-frame">
      {header}

      <div className="kv-body kv-scroll" data-testid="player-scroll">
        <div className="sm:p-5 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)] lg:gap-6 lg:p-6">
          {/* Player column */}
          <div className="min-w-0">
            <div className="kv-sticky-player relative aspect-video w-full overflow-hidden bg-black sm:rounded-xl sm:border sm:border-[#f4f4f6]/15">
              {useEmbedFallback ? (
                <iframe
                  src={kvtubeEmbedUrl}
                  title={`KV-Tube: ${displayFilm.title}`}
                  className="h-full w-full border-0"
                  allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                  allowFullScreen
                />
              ) : (
                <video
                  ref={videoRef}
                  controls
                  playsInline
                  aria-label={`Trình phát: ${displayFilm.title}`}
                  poster={getThumbUrl(displayFilm.id)}
                  className="h-full w-full bg-black object-contain"
                  onError={() => {
                    if (selectedSource !== directUrl) {
                      setSelectedSource(directUrl);
                      setSelectedQualityLabel('360p MP4 (dự phòng)');
                    }
                  }}
                >
                  {streamInfo?.captions?.map((cap) => (
                    <track
                      key={cap.languageCode + cap.label}
                      kind="subtitles"
                      srcLang={cap.languageCode}
                      label={cap.label}
                      src={cap.url}
                    />
                  ))}
                </video>
              )}
            </div>

            <div className="space-y-4 px-4 pt-4 sm:px-0">
              {/* Stream controls: source, embed fallback, sleep timer */}
              <section
                aria-label="Nguồn phát và hẹn giờ"
                className="space-y-3 rounded-xl border border-[#f4f4f6]/10 bg-[#161822] p-3 sm:p-4"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="min-w-0 flex-1">
                    <Selector
                      label="Nguồn phát KV-Tube"
                      options={qualityOptions}
                      value={useEmbedFallback ? EMBED_VALUE : selectedSource}
                      onChange={(val) => {
                        if (val === EMBED_VALUE) {
                          setUseEmbedFallback(true);
                          return;
                        }
                        setUseEmbedFallback(false);
                        setSelectedSource(val);
                        const found = streamInfo?.streams.find((s) => s.url === val);
                        setSelectedQualityLabel(found ? found.quality : 'MP4');
                      }}
                      startIcon={<Tv {...ICON} aria-hidden="true" />}
                      presentation="adaptive"
                      isLoading={loadingStream}
                      width="100%"
                    />
                  </div>
                  <Button
                    label={useEmbedFallback ? 'Đang dùng trình phát nhúng' : 'Dùng trình phát nhúng'}
                    variant={useEmbedFallback ? 'primary' : 'secondary'}
                    aria-pressed={useEmbedFallback}
                    onClick={() => setUseEmbedFallback((v) => !v)}
                    icon={<Layers {...ICON} aria-hidden="true" />}
                    width={fullWidth}
                    className="kv-touch"
                  />
                </div>
                {loadingStream && (
                  <p role="status" className="text-xs text-[#c4c8d9]">
                    Đang lấy danh sách luồng từ KV-Tube…
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span id="kv-sleep-label" className="inline-flex items-center gap-1.5 text-xs font-medium text-[#c4c8d9]">
                    <Clock className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                    Hẹn giờ tắt
                  </span>
                  <SegmentedControl
                    label="Hẹn giờ tắt phim"
                    value={String(sleepMinutes)}
                    onChange={(v) => setSleepMinutes(Number(v))}
                    size="sm"
                    layout={isPhone ? 'fill' : 'hug'}
                    className="kv-seg-touch w-full tabular-nums sm:w-auto"
                  >
                    {SLEEP_OPTIONS.map((min) => (
                      <SegmentedControlItem key={min} value={String(min)} label={min === 0 ? 'Tắt' : `${min} phút`} />
                    ))}
                  </SegmentedControl>
                  {sleepRemainingSec > 0 && (
                    <span className="rounded-md bg-[#10b981]/15 px-2 py-1 text-xs font-semibold text-[#34d399] tabular-nums">
                      Tắt sau {formatClock(sleepRemainingSec)}
                    </span>
                  )}
                </div>
              </section>

              {/* Primary actions: 2-column grid on phones, wrapping row above */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="group" aria-label="Thao tác với phim">
                <Button
                  label={isSaved ? 'Đã lưu' : 'Lưu xem sau'}
                  variant={isSaved ? 'primary' : 'secondary'}
                  aria-pressed={isSaved}
                  onClick={() => onToggleSave(displayFilm.id)}
                  icon={
                    isSaved ? <BookmarkCheck {...ICON} aria-hidden="true" /> : <Bookmark {...ICON} aria-hidden="true" />
                  }
                  width="100%"
                  className="kv-touch"
                />
                <Button
                  label={activePartyCode ? `Phòng ${activePartyCode}` : 'Xem chung'}
                  icon={<Users {...ICON} aria-hidden="true" />}
                  onClick={() => onOpenWatchParty(displayFilm)}
                  width="100%"
                  className="kv-touch tabular-nums"
                />
                <Button
                  label="Lướt dọc"
                  icon={<Smartphone {...ICON} aria-hidden="true" />}
                  onClick={() => {
                    onClose();
                    onOpenSwipeFeed(displayFilm);
                  }}
                  width="100%"
                  className="kv-touch"
                />
                <Button
                  label="Thẻ chia sẻ"
                  aria-pressed={showShareCard}
                  aria-controls="kv-share-card"
                  onClick={() => setShowShareCard((v) => !v)}
                  icon={<Share2 {...ICON} aria-hidden="true" />}
                  width="100%"
                  className="kv-touch"
                />
                <Button
                  label={copiedLink ? 'Đã chép link' : 'Chép link'}
                  icon={copiedLink ? <Check {...ICON} aria-hidden="true" /> : <Copy {...ICON} aria-hidden="true" />}
                  onClick={handleCopyWatchLink}
                  width="100%"
                  className="kv-touch"
                />
                <Button
                  label="Mở KV-Tube"
                  tooltip="Xem trên KV-Tube (u.khoavo.vndns.net)"
                  icon={<ExternalLink {...ICON} aria-hidden="true" />}
                  href={kvtubeWatchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  width="100%"
                  className="kv-touch"
                />
              </div>
              <span className="sr-only" role="status">
                {copiedLink ? 'Đã chép link KV-Tube vào bộ nhớ tạm.' : ''}
              </span>

              {/* Synopsis & metadata */}
              <section aria-label="Thông tin phim" className="rounded-xl border border-[#f4f4f6]/10 bg-[#161822] p-4">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#c4c8d9] tabular-nums">
                  <span className="font-semibold text-[#ffd875]">{displayFilm.channel}</span>
                  <span aria-hidden="true">·</span>
                  <span>{formatViewsVN(displayFilm.views)}</span>
                  {displayFilm.dur && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>Thời lượng {displayFilm.dur}</span>
                    </>
                  )}
                  <span className="inline-flex items-center gap-1 rounded-md bg-[#f4f4f6]/10 px-2 py-0.5 text-[#f4f4f6]">
                    <Sparkles className="h-3 w-3 text-[#ffd875]" strokeWidth={1.75} aria-hidden="true" />
                    {displayFilm.tool || 'AI Studio'}
                  </span>
                </div>
                <p className="mt-3 max-w-[70ch] text-sm leading-relaxed text-[#e2e4ed]">
                  {displayFilm.blurbLong || displayFilm.blurb}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span className="rounded-md bg-[#ffd875]/15 px-2.5 py-0.5 text-xs font-medium text-[#ffd875]">
                    {CAT_LABEL[displayFilm.cat] || displayFilm.cat}
                  </span>
                  {(displayFilm.tags || []).map((tag) => (
                    <span
                      key={tag}
                      className="rounded-md border border-[#f4f4f6]/15 bg-[#0d0e14] px-2.5 py-0.5 text-xs text-[#c4c8d9]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </section>

              {/* Share card generator */}
              {showShareCard && (
                <section
                  id="kv-share-card"
                  aria-labelledby="kv-share-title"
                  className="rounded-xl border border-[#ffd875]/30 bg-[#161822] p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <h3 id="kv-share-title" className="text-sm font-bold text-[#f4f4f6] tabular-nums">
                      Thẻ chia sẻ khổ Story 1080×1920
                    </h3>
                    <div className="grid grid-cols-2 gap-2 sm:flex">
                      <Button
                        label="Tải ảnh PNG"
                        variant="primary"
                        icon={<Download {...ICON} aria-hidden="true" />}
                        onClick={handleDownloadShareCard}
                        width={fullWidth}
                        className="kv-touch"
                      />
                      <Button
                        label="Thu gọn"
                        variant="ghost"
                        onClick={() => setShowShareCard(false)}
                        width={fullWidth}
                        className="kv-touch"
                      />
                    </div>
                  </div>
                  <p role="status" className="mt-2 text-xs text-[#c4c8d9]">
                    {shareCardStatus}
                  </p>
                  <div className="mt-3 flex justify-center">
                    <canvas
                      ref={shareCanvasRef}
                      width={1080}
                      height={1920}
                      role="img"
                      aria-label={`Thẻ chia sẻ phim ${displayFilm.title}`}
                      className="h-auto max-h-80 w-auto max-w-full rounded-lg border border-[#f4f4f6]/15 shadow-[0_14px_34px_-10px_rgba(4,5,10,0.72)]"
                    />
                  </div>
                </section>
              )}

              {/* Series strip */}
              {seriesEpisodes.length >= 2 && (
                <section aria-labelledby="kv-series-title" className="rounded-xl border border-[#f4f4f6]/10 bg-[#161822] p-4">
                  <h3 id="kv-series-title" className="text-sm font-bold text-[#f4f4f6] tabular-nums">
                    Các tập cùng bộ ({seriesEpisodes.length} phần)
                  </h3>
                  <ol className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {seriesEpisodes.map((ep) => {
                      const isCurrent = ep.id === displayFilm.id;
                      return (
                        <li key={ep.id} className="min-w-0">
                          <button
                            type="button"
                            onClick={() => onSelectFilm(ep)}
                            aria-current={isCurrent ? 'true' : undefined}
                            className={`flex min-h-[56px] w-full items-center gap-2.5 rounded-lg border p-2 text-left transition-colors ${
                              isCurrent
                                ? 'border-[#ffd875] bg-[#ffd875]/15 text-[#ffd875]'
                                : 'border-[#f4f4f6]/10 bg-[#0d0e14] text-[#f4f4f6] hover:border-[#f4f4f6]/30'
                            }`}
                          >
                            <FilmThumb id={ep.id} alt="" className="h-12 w-20 shrink-0 rounded-md object-cover" />
                            <span className="min-w-0 flex-1">
                              <span className="line-clamp-2 text-xs font-semibold leading-snug">{ep.title}</span>
                              <span className="mt-0.5 block text-[11px] text-[#c4c8d9] tabular-nums">
                                {ep.dur || 'HD'}
                                {isCurrent ? ' · Đang phát' : ''}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              )}
            </div>
          </div>

          {/* Side panel: rating + timestamped comments */}
          <aside aria-label="Đánh giá và bình luận" className="mt-4 space-y-4 px-4 sm:px-0 lg:mt-0">
            <section aria-labelledby="kv-rate-title" className="rounded-xl border border-[#f4f4f6]/10 bg-[#161822] p-4">
              <h3 id="kv-rate-title" className="text-sm font-bold text-[#f4f4f6]">
                Chấm điểm bộ phim
              </h3>
              <div className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-2">
                <div role="group" aria-label="Chọn số sao" className="flex items-center">
                  {[1, 2, 3, 4, 5].map((star) => {
                    const active = (myRating || Math.round(avgStars)) >= star;
                    return (
                      <IconButton
                        key={star}
                        label={`Chấm ${star} sao`}
                        variant="ghost"
                        aria-pressed={myRating === star}
                        onClick={() => handleRate(star)}
                        className="kv-touch-square"
                        icon={
                          <Star
                            className={`h-5 w-5 ${active ? 'text-[#ffd875]' : 'text-[#6b7186]'}`}
                            strokeWidth={1.75}
                            fill={active ? 'currentColor' : 'none'}
                            aria-hidden="true"
                          />
                        }
                      />
                    );
                  })}
                </div>
                <span className="ml-1 text-sm font-semibold text-[#ffd875] tabular-nums">
                  {avgStars > 0 ? `${avgStars.toFixed(1)} / 5` : 'Chưa có điểm'}
                </span>
              </div>
              <p role="status" className="mt-1.5 text-xs text-[#c4c8d9] tabular-nums">
                {ratingStatus ||
                  (ratingObj && ratingObj.n > 0
                    ? `Trung bình từ ${ratingObj.n.toLocaleString('vi-VN')} lượt đánh giá.`
                    : 'Hãy là người đầu tiên chấm điểm phim này.')}
              </p>
            </section>

            <section aria-labelledby="kv-comments-title" className="rounded-xl border border-[#f4f4f6]/10 bg-[#161822] p-4">
              <h3
                id="kv-comments-title"
                className="inline-flex items-center gap-1.5 text-sm font-bold text-[#f4f4f6] tabular-nums"
              >
                <MessageSquare className="h-4 w-4 text-[#ffd875]" strokeWidth={1.75} aria-hidden="true" />
                Bình luận theo mốc giờ ({comments.length})
              </h3>

              <form onSubmit={handlePostComment} className="mt-3 space-y-2">
                <TextInput
                  label="Tên hiển thị"
                  isLabelHidden
                  value={commentAuthor}
                  onChange={(v) => setCommentAuthor(v.slice(0, 32))}
                  placeholder="Tên hiển thị"
                  autoComplete="nickname"
                  width="100%"
                />
                <TextInput
                  label="Nội dung bình luận"
                  isLabelHidden
                  value={commentText}
                  onChange={(v) => setCommentText(v.slice(0, 300))}
                  placeholder="Cảm nhận hoặc tình tiết đáng nhớ…"
                  enterKeyHint="send"
                  width="100%"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    label={attachedTimestamp !== null ? `Bỏ mốc ${formatClock(attachedTimestamp)}` : 'Gắn mốc giờ'}
                    tooltip="Gắn thời điểm đang phát vào bình luận"
                    aria-pressed={attachedTimestamp !== null}
                    onClick={handleAttachCurrentTime}
                    icon={<Clock {...ICON} aria-hidden="true" />}
                    width="100%"
                    className="kv-touch tabular-nums"
                  />
                  <Button
                    type="submit"
                    variant="primary"
                    label="Gửi bình luận"
                    icon={<Send {...ICON} aria-hidden="true" />}
                    isDisabled={commentText.trim().length < 2}
                    width="100%"
                    className="kv-touch"
                  />
                </div>
              </form>

              <ul className="kv-scroll mt-3 max-h-72 space-y-2 pr-1 lg:max-h-[420px]" aria-live="polite">
                {loadingComments ? (
                  <li className="text-xs text-[#c4c8d9]">Đang tải bình luận…</li>
                ) : comments.length === 0 ? (
                  <li className="text-xs text-[#c4c8d9]">Chưa có bình luận nào. Viết cảm nhận đầu tiên ở trên.</li>
                ) : (
                  comments.map((cmt, idx) => (
                    <li
                      key={cmt.id || idx}
                      className="rounded-lg border border-[#f4f4f6]/10 bg-[#0d0e14] p-2.5 text-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-[#f4f4f6]">{cmt.m?.n || cmt.n || 'Khán giả'}</span>
                        <span className="flex items-center gap-1.5">
                          {typeof cmt.s === 'number' && cmt.s > 0 && (
                            <Button
                              label={`Tua tới ${formatClock(cmt.s)}`}
                              size="sm"
                              variant="ghost"
                              icon={<Play className="h-3 w-3" strokeWidth={2} aria-hidden="true" />}
                              onClick={() => handleSeekTo(cmt.s!)}
                              className="kv-touch text-[#ffd875] tabular-nums"
                            >
                              {formatClock(cmt.s)}
                            </Button>
                          )}
                          {cmt.d && <span className="text-[11px] text-[#9da3b8] tabular-nums">{cmt.d}</span>}
                        </span>
                      </div>
                      <p className="mt-1 break-words text-[#d5d8e6]">{cmt.t}</p>
                    </li>
                  ))
                )}
              </ul>
            </section>
          </aside>
        </div>

        {/* Related films */}
        {relatedFilms.length > 0 && (
          <section aria-labelledby="kv-related-title" className="mt-6 border-t border-[#f4f4f6]/10 px-4 pt-5 sm:px-5 lg:px-6">
            <h3 id="kv-related-title" className="text-sm font-bold text-[#f4f4f6]">
              Cùng chuyên mục và kênh
            </h3>
            <ul className="kv-scroll-x -mx-4 mt-3 flex gap-3 px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:px-0 lg:grid-cols-6">
              {relatedFilms.map((rf) => (
                <li key={rf.id} className="w-[44%] shrink-0 sm:w-auto">
                  <button
                    type="button"
                    onClick={() => onSelectFilm(rf)}
                    className="kv-lift kv-thumb-zoom group flex h-full w-full flex-col overflow-hidden rounded-xl border border-[#f4f4f6]/10 bg-[#161822] text-left hover:border-[#ffd875]/50"
                  >
                    <span className="relative block aspect-video w-full overflow-hidden bg-black">
                      <FilmThumb id={rf.id} alt="" className="h-full w-full object-cover" />
                      <span className="absolute bottom-1 right-1 rounded-md bg-black/80 px-1.5 py-0.5 text-[10px] font-semibold text-[#f4f4f6] tabular-nums">
                        {rf.dur || 'HD'}
                      </span>
                    </span>
                    <span className="block p-2">
                      <span className="line-clamp-2 text-xs font-semibold text-[#f4f4f6] group-hover:text-[#ffd875]">
                        {rf.title}
                      </span>
                      <span className="mt-1 flex items-center justify-between gap-1 text-[11px] text-[#c4c8d9]">
                        <span className="truncate">{rf.channel}</span>
                        <ChevronRight className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
};
