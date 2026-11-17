import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import {
  X,
  ExternalLink,
  Bookmark,
  BookmarkCheck,
  Star,
  Clock,
  Share2,
  Download,
  Users,
  MessageSquare,
  Layers,
  Play,
  ShieldAlert,
  Sparkles,
  Tv,
  Film as FilmIcon,
  Check,
  Copy,
  Smartphone,
  ChevronRight,
} from 'lucide-react';
import type { Film, KVTubeStreamInfo } from '../types/phimai';
import {
  CAT_LABEL,
  KVTUBE_ORIGIN,
  calculateAge,
  formatClock,
  formatViewsVN,
  getFallbackThumbUrl,
  getKVTubeEmbedUrl,
  getKVTubeStreamUrl,
  getKVTubeWatchUrl,
  getSeriesEpisodes,
  getThumbUrl,
  isAgeVerified,
  markAgeVerified,
} from '../utils/phimaiUtils';

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

export const PlayerModal: React.FC<PlayerModalProps> = ({
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
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const shareCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [streamInfo, setStreamInfo] = useState<KVTubeStreamInfo | null>(null);
  const [selectedSource, setSelectedSource] = useState<string>('');
  const [selectedQualityLabel, setSelectedQualityLabel] = useState<string>('360p MP4 (Mặc định)');
  const [useEmbedFallback, setUseEmbedFallback] = useState<boolean>(false);
  const [loadingStream, setLoadingStream] = useState<boolean>(false);
  const [fullBlurbFilm, setFullBlurbFilm] = useState<Film | null>(null);
  const [apiEpisodes, setApiEpisodes] = useState<Film[]>([]);

  // Age gate state
  const [needsAgeGate, setNeedsAgeGate] = useState<boolean>(false);
  const [dobDay, setDobDay] = useState<string>('');
  const [dobMonth, setDobMonth] = useState<string>('');
  const [dobYear, setDobYear] = useState<string>('');
  const [ageError, setAgeError] = useState<string>('');

  // Sleep timer state
  const [sleepMinutes, setSleepMinutes] = useState<number>(0);
  const [sleepRemainingSec, setSleepRemainingSec] = useState<number>(0);

  // Rating state
  const [myRating, setMyRating] = useState<number>(0);
  const [ratingStatus, setRatingStatus] = useState<string>('');

  // Comments state
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

  // Share Card state
  const [showShareCard, setShowShareCard] = useState<boolean>(false);
  const [shareCardStatus, setShareCardStatus] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  // Check age gate whenever film changes
  useEffect(() => {
    if (!film) return;
    if (film.adult && !isAgeVerified()) {
      setNeedsAgeGate(true);
      setAgeError('');
    } else {
      setNeedsAgeGate(false);
    }
  }, [film]);

  // Load film details + KV-Tube stream metadata + comments
  useEffect(() => {
    if (!film || needsAgeGate) return;

    const defaultDirectUrl = getKVTubeStreamUrl(film.id);
    setSelectedSource(defaultDirectUrl);
    setSelectedQualityLabel('360p MP4 (KV-Tube Direct)');
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

    // Record view
    fetch('/api/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: film.id }),
    }).catch(() => {});

    let cancelled = false;
    setLoadingStream(true);

    // Fetch KV-Tube video stream info
    fetch(`/api/kvtube/video/${encodeURIComponent(film.id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const info: KVTubeStreamInfo = {
          id: film.id,
          watchUrl: data.watchUrl || getKVTubeWatchUrl(film.id),
          embedUrl: data.embedUrl || getKVTubeEmbedUrl(film.id),
          channelUrl: data.channelUrl || `${KVTUBE_ORIGIN}/results?search_query=${encodeURIComponent(film.channel)}`,
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

    // Fetch extended film details + series episodes from backend
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

    // Fetch comments
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

  // Attach HLS or native src when selectedSource changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !selectedSource || useEmbedFallback || needsAgeGate) return;

    let hls: Hls | null = null;
    const isHls = selectedSource.includes('.m3u8') || selectedSource.includes('hls_variant') || selectedSource.includes('hls_playlist');

    if (isHls && Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
      });
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
      if (hls) {
        hls.destroy();
      }
    };
  }, [selectedSource, useEmbedFallback, needsAgeGate]);

  // Sleep timer countdown effect
  useEffect(() => {
    if (sleepMinutes <= 0) {
      setSleepRemainingSec(0);
      return;
    }
    setSleepRemainingSec(sleepMinutes * 60);
    const interval = setInterval(() => {
      setSleepRemainingSec((prev) => {
        if (prev <= 1) {
          if (videoRef.current) {
            videoRef.current.pause();
          }
          setSleepMinutes(0);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [sleepMinutes]);

  // Watch party sync effect
  useEffect(() => {
    if (!activePartyCode || !film || needsAgeGate) return;
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
            if (drift > 5) {
              video.currentTime = j.t;
            }
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

  // Escape key to close
  useEffect(() => {
    if (!film) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [film, onClose]);

  const generateShareCard = useCallback(async () => {
    if (!film || !shareCanvasRef.current) return;
    const canvas = shareCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setShareCardStatus('Đang kết xuất thẻ chia sẻ 1080×1920...');

    // Background
    ctx.fillStyle = '#0d0e14';
    ctx.fillRect(0, 0, 1080, 1920);

    // Draw thumbnail
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const loaded = await new Promise<boolean>((resolve) => {
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = getThumbUrl(film.id);
    });

    if (loaded) {
      try {
        const scale = Math.max(1080 / img.width, 640 / img.height);
        const sw = 1080 / scale;
        const sh = 640 / scale;
        const sx = (img.width - sw) / 2;
        const sy = (img.height - sh) / 2;
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, 1080, 640);
      } catch {
        ctx.fillStyle = '#161822';
        ctx.fillRect(0, 0, 1080, 640);
      }
    } else {
      ctx.fillStyle = '#161822';
      ctx.fillRect(0, 0, 1080, 640);
    }

    // Accent bar
    ctx.fillStyle = '#ffd875';
    ctx.fillRect(64, 690, 140, 8);

    // Rank & Category
    ctx.fillStyle = '#ffd875';
    ctx.font = 'bold 48px sans-serif';
    ctx.fillText(`#${film.rank} • ${CAT_LABEL[film.cat] || 'Phim AI'}`, 64, 770);

    // Title
    ctx.fillStyle = '#f4f4f6';
    ctx.font = 'bold 60px sans-serif';
    const words = (film.title || '').split(/\s+/);
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w;
      if (ctx.measureText(test).width > 950 && cur) {
        lines.push(cur);
        cur = w;
      } else {
        cur = test;
      }
    }
    if (cur) lines.push(cur);

    let y = 865;
    lines.slice(0, 3).forEach((ln) => {
      ctx.fillText(ln, 64, y);
      y += 78;
    });

    // Blurb
    ctx.fillStyle = '#b4b8c8';
    ctx.font = '38px sans-serif';
    y += 24;
    const blurbWords = (film.blurb || '').split(/\s+/);
    const blurbLines: string[] = [];
    let bCur = '';
    for (const w of blurbWords) {
      const test = bCur ? `${bCur} ${w}` : w;
      if (ctx.measureText(test).width > 950 && bCur) {
        blurbLines.push(bCur);
        bCur = w;
      } else {
        bCur = test;
      }
    }
    if (bCur) blurbLines.push(bCur);
    blurbLines.slice(0, 3).forEach((ln) => {
      ctx.fillText(ln, 64, y);
      y += 54;
    });

    // Tool & Channel metadata box
    y += 40;
    ctx.fillStyle = '#161822';
    ctx.fillRect(64, y, 952, 190);
    ctx.strokeStyle = 'rgba(255, 216, 117, 0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(64, y, 952, 190);

    ctx.fillStyle = '#ffd875';
    ctx.font = 'bold 38px sans-serif';
    ctx.fillText(`Công nghệ AI: ${film.tool || 'AI Studio'}`, 100, y + 75);

    ctx.fillStyle = '#f4f4f6';
    ctx.font = '34px sans-serif';
    ctx.fillText(`Kênh: ${film.channel || 'KV-PhimAI'} • Thời lượng: ${film.dur || 'HD'}`, 100, y + 138);

    // Footer Sovereign URL
    ctx.fillStyle = '#ffd875';
    ctx.font = 'bold 44px sans-serif';
    ctx.fillText('KV-PhimAI • u.khoavo.vndns.net', 64, 1740);

    ctx.fillStyle = '#b4b8c8';
    ctx.font = '32px monospace';
    ctx.fillText(getKVTubeWatchUrl(film.id), 64, 1805);

    setShareCardStatus('Thẻ chia sẻ đã sẵn sàng — bấm Tải ảnh PNG để lưu về máy.');
  }, [film]);

  useEffect(() => {
    if (showShareCard && film) {
      generateShareCard();
    }
  }, [showShareCard, film, generateShareCard]);

  if (!film) return null;

  const displayFilm = fullBlurbFilm || film;
  const seriesEpisodes =
    apiEpisodes.length >= 2 ? apiEpisodes : getSeriesEpisodes(displayFilm, allFilms);

  const relatedFilms = allFilms
    .filter((f) => f.id !== displayFilm.id && (f.cat === displayFilm.cat || f.channel === displayFilm.channel))
    .slice(0, 6);

  const ratingObj = ratings[displayFilm.id];
  const avgStars = ratingObj && ratingObj.n > 0 ? ratingObj.s / ratingObj.n : 0;
  const isSaved = savedIds.has(displayFilm.id);
  const kvtubeWatchUrl = streamInfo?.watchUrl || getKVTubeWatchUrl(displayFilm.id);
  const kvtubeEmbedUrl = streamInfo?.embedUrl || getKVTubeEmbedUrl(displayFilm.id);

  const handleAgeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const d = parseInt(dobDay, 10);
    const m = parseInt(dobMonth, 10);
    const y = parseInt(dobYear, 10);
    const age = calculateAge(d, m, y);
    if (age === null) {
      setAgeError('Ngày tháng năm sinh chưa hợp lệ. Vui lòng kiểm tra lại.');
      return;
    }
    if (age < 18) {
      setAgeError('Bạn chưa đủ 18 tuổi để xem nội dung giới hạn độ tuổi này.');
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
      if (r.ok && j.ok !== false) {
        const newComment: CommentItem = {
          t: text,
          s: attachedTimestamp || 0,
          d: 'vừa xong',
          m: { n: commentAuthor.trim() || 'Khán giả' },
        };
        setComments((prev) => [newComment, ...prev]);
        setCommentText('');
        setAttachedTimestamp(null);
      }
    } catch {
      // fallback optimistic append
      setComments((prev) => [
        {
          t: text,
          s: attachedTimestamp || 0,
          d: 'vừa xong',
          m: { n: commentAuthor.trim() || 'Khán giả' },
        },
        ...prev,
      ]);
      setCommentText('');
      setAttachedTimestamp(null);
    }
  };

  const handleSeekTo = (sec: number) => {
    if (useEmbedFallback) {
      setUseEmbedFallback(false);
    }
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
    setRatingStatus(`Đã ghi nhận đánh giá ${stars}/5 sao của bạn.`);
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/85 p-2 backdrop-blur-md sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label={`Phát phim ${displayFilm.title}`}
    >
      <div className="relative my-auto flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-[#f4f4f6]/15 bg-[#0d0e14] text-[#f4f4f6] shadow-[0_24px_64px_rgba(0,0,0,0.85)]">
        {/* Top Modal Bar */}
        <div className="flex items-center justify-between gap-3 border-b border-[#f4f4f6]/10 bg-[#141722] px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="rounded bg-[#ffd875] px-2 py-0.5 text-xs font-bold text-[#0d0e14] tabular-nums">
              #{displayFilm.rank}
            </span>
            {displayFilm.adult && (
              <span className="rounded bg-[#e50914] px-2 py-0.5 text-xs font-bold text-white tabular-nums">
                18+
              </span>
            )}
            <h2 className="truncate text-base font-bold text-[#f4f4f6] sm:text-lg">
              {displayFilm.title}
            </h2>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <a
              href={kvtubeWatchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#ffd875]/40 bg-[#ffd875]/10 px-3 py-1.5 text-xs font-semibold text-[#ffd875] transition-colors hover:bg-[#ffd875]/20"
            >
              <span>Xem trên KV-Tube (u.khoavo.vndns.net)</span>
              <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} />
            </a>

            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng trình phát"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#f4f4f6]/15 bg-[#f4f4f6]/5 text-[#f4f4f6] transition-colors hover:bg-[#f4f4f6]/15"
            >
              <X className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="overflow-y-auto p-4 sm:p-6">
          {needsAgeGate ? (
            /* 18+ Age Verification Gate */
            <div className="mx-auto my-8 max-w-md rounded-xl border border-[#e50914]/40 bg-[#161822] p-6 text-center shadow-[0_12px_32px_rgba(0,0,0,0.5)]">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#e50914]/20 text-[#e50914]">
                <ShieldAlert className="h-6 w-6" strokeWidth={1.75} />
              </div>
              <h3 className="text-lg font-bold text-[#f4f4f6]">
                Xác minh độ tuổi (18+)
              </h3>
              <p className="mt-2 text-sm text-[#c9cddc]">
                Bộ phim <strong>{displayFilm.title}</strong> có nội dung dành cho khán giả từ đủ 18 tuổi trở lên. Vui lòng nhập ngày sinh để xác minh trên thiết bị của bạn (không lưu lên máy chủ).
              </p>

              <form onSubmit={handleAgeSubmit} className="mt-5 space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="number"
                    min={1}
                    max={31}
                    placeholder="Ngày (DD)"
                    value={dobDay}
                    onChange={(e) => setDobDay(e.target.value)}
                    className="rounded-lg border border-[#f4f4f6]/20 bg-[#0d0e14] px-3 py-2 text-center text-sm text-[#f4f4f6] tabular-nums focus:border-[#ffd875] focus:outline-none"
                    required
                  />
                  <input
                    type="number"
                    min={1}
                    max={12}
                    placeholder="Tháng (MM)"
                    value={dobMonth}
                    onChange={(e) => setDobMonth(e.target.value)}
                    className="rounded-lg border border-[#f4f4f6]/20 bg-[#0d0e14] px-3 py-2 text-center text-sm text-[#f4f4f6] tabular-nums focus:border-[#ffd875] focus:outline-none"
                    required
                  />
                  <input
                    type="number"
                    min={1920}
                    max={new Date().getFullYear()}
                    placeholder="Năm (YYYY)"
                    value={dobYear}
                    onChange={(e) => setDobYear(e.target.value)}
                    className="rounded-lg border border-[#f4f4f6]/20 bg-[#0d0e14] px-3 py-2 text-center text-sm text-[#f4f4f6] tabular-nums focus:border-[#ffd875] focus:outline-none"
                    required
                  />
                </div>

                {ageError && (
                  <p className="text-xs font-medium text-[#ff6b6b]">{ageError}</p>
                )}

                <div className="flex items-center justify-center gap-3 pt-2">
                  <button
                    type="submit"
                    className="rounded-lg bg-[#ffd875] px-5 py-2 text-sm font-bold text-[#0d0e14] transition-colors hover:bg-[#ffe294]"
                  >
                    Xác nhận đủ 18 tuổi & Xem phim
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg border border-[#f4f4f6]/20 px-4 py-2 text-sm text-[#c9cddc] hover:bg-[#f4f4f6]/10"
                  >
                    Đóng
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <>
              {/* Video Stage */}
              <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-[#f4f4f6]/15 bg-black">
                {useEmbedFallback ? (
                  <iframe
                    src={kvtubeEmbedUrl}
                    title={displayFilm.title}
                    className="h-full w-full border-0"
                    allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                    allowFullScreen
                  />
                ) : (
                  <video
                    ref={videoRef}
                    controls
                    playsInline
                    poster={getThumbUrl(displayFilm.id)}
                    className="h-full w-full bg-black object-contain"
                    onError={() => {
                      // Try fallback direct stream if custom quality failed, else keep option to toggle KV-Tube embed
                      const direct = getKVTubeStreamUrl(displayFilm.id);
                      if (selectedSource !== direct) {
                        setSelectedSource(direct);
                        setSelectedQualityLabel('360p MP4 (Dự phòng KV-Tube)');
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

              {/* Stream Control Strip: Quality Selector, KV-Tube Embed Toggle, Sleep Timer, Watch Party */}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#f4f4f6]/10 bg-[#161822] px-3.5 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#ffd875]">
                    <Tv className="h-3.5 w-3.5" strokeWidth={1.75} />
                    <span>Nguồn phát KV-Tube:</span>
                  </span>

                  {/* Native HTML5 Quality Selector */}
                  <select
                    aria-label="Chọn chất lượng luồng phát KV-Tube"
                    value={useEmbedFallback ? 'embed' : selectedSource}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === 'embed') {
                        setUseEmbedFallback(true);
                      } else {
                        setUseEmbedFallback(false);
                        setSelectedSource(val);
                        const found = streamInfo?.streams.find((s) => s.url === val);
                        setSelectedQualityLabel(found ? found.quality : 'MP4 Direct');
                      }
                    }}
                    className="rounded-md border border-[#f4f4f6]/20 bg-[#0d0e14] px-2.5 py-1 text-xs font-medium text-[#f4f4f6] tabular-nums focus:border-[#ffd875] focus:outline-none"
                  >
                    <option value={getKVTubeStreamUrl(displayFilm.id)}>
                      Luồng trực tiếp /api/kvtube/stream ({selectedQualityLabel})
                    </option>
                    {streamInfo?.hlsUrl && (
                      <option value={streamInfo.hlsUrl}>
                        HLS Adaptive (u.khoavo.vndns.net)
                      </option>
                    )}
                    {streamInfo?.streams?.map((s, idx) => (
                      <option key={`${s.quality}-${idx}`} value={s.url}>
                        {s.quality} ({s.container || s.type || 'MP4'})
                      </option>
                    ))}
                    <option value="embed">
                      Nhúng KV-Tube Player (u.khoavo.vndns.net/embed)
                    </option>
                  </select>

                  <button
                    type="button"
                    onClick={() => setUseEmbedFallback((v) => !v)}
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                      useEmbedFallback
                        ? 'border-[#ffd875] bg-[#ffd875] text-[#0d0e14]'
                        : 'border-[#f4f4f6]/15 bg-[#0d0e14] text-[#c9cddc] hover:text-[#f4f4f6]'
                    }`}
                  >
                    <Layers className="h-3.5 w-3.5" strokeWidth={1.75} />
                    <span>{useEmbedFallback ? 'Đang dùng KV-Tube Embed' : 'Đổi sang KV-Tube Embed'}</span>
                  </button>

                  {loadingStream && (
                    <span className="text-xs text-[#b4b8c8]">
                      Đang đồng bộ luồng Invidious...
                    </span>
                  )}
                </div>

                {/* Sleep Timer Controls */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-[#b4b8c8]" strokeWidth={1.75} />
                  <span className="text-xs text-[#b4b8c8]">Hẹn giờ tắt:</span>
                  {[15, 30, 60].map((min) => (
                    <button
                      key={min}
                      type="button"
                      onClick={() => setSleepMinutes(sleepMinutes === min ? 0 : min)}
                      className={`rounded px-2 py-0.5 text-xs font-medium tabular-nums transition-colors ${
                        sleepMinutes === min
                          ? 'bg-[#ffd875] text-[#0d0e14] font-semibold'
                          : 'bg-[#0d0e14] text-[#c9cddc] hover:bg-[#f4f4f6]/10'
                      }`}
                    >
                      {min}p
                    </button>
                  ))}
                  {sleepRemainingSec > 0 && (
                    <span className="ml-1 rounded bg-[#10b981]/20 px-2 py-0.5 text-xs font-semibold text-[#10b981] tabular-nums">
                      Tắt sau {formatClock(sleepRemainingSec)}
                    </span>
                  )}
                </div>
              </div>

              {/* Action Toolbar & Film Metadata */}
              <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="space-y-4 lg:col-span-2">
                  {/* Primary Actions */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onToggleSave(displayFilm.id)}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
                        isSaved
                          ? 'bg-[#ffd875] text-[#0d0e14]'
                          : 'border border-[#f4f4f6]/15 bg-[#161822] text-[#f4f4f6] hover:bg-[#f4f4f6]/10'
                      }`}
                    >
                      {isSaved ? (
                        <BookmarkCheck className="h-4 w-4" strokeWidth={1.75} />
                      ) : (
                        <Bookmark className="h-4 w-4" strokeWidth={1.75} />
                      )}
                      <span>{isSaved ? 'Đã lưu vào kho cá nhân' : 'Lưu xem sau'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onOpenWatchParty(displayFilm)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#10b981]/40 bg-[#10b981]/10 px-3.5 py-2 text-xs font-semibold text-[#10b981] transition-colors hover:bg-[#10b981]/20 tabular-nums"
                    >
                      <Users className="h-4 w-4" strokeWidth={1.75} />
                      <span>
                        {activePartyCode ? `Phòng xem chung: ${activePartyCode}` : 'Xem chung & Ghép đôi TV'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenSwipeFeed(displayFilm);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#f4f4f6]/15 bg-[#161822] px-3.5 py-2 text-xs font-semibold text-[#f4f4f6] transition-colors hover:bg-[#f4f4f6]/10"
                    >
                      <Smartphone className="h-4 w-4" strokeWidth={1.75} />
                      <span>Chế độ lướt dọc</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowShareCard((v) => !v)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#f4f4f6]/15 bg-[#161822] px-3.5 py-2 text-xs font-semibold text-[#f4f4f6] transition-colors hover:bg-[#f4f4f6]/10"
                    >
                      <Share2 className="h-4 w-4" strokeWidth={1.75} />
                      <span>Tạo thẻ chia sẻ QR</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleCopyWatchLink}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#f4f4f6]/15 bg-[#161822] px-3 py-2 text-xs font-medium text-[#c9cddc] transition-colors hover:text-[#f4f4f6]"
                    >
                      {copiedLink ? (
                        <Check className="h-3.5 w-3.5 text-[#10b981]" strokeWidth={1.75} />
                      ) : (
                        <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
                      )}
                      <span>{copiedLink ? 'Đã chép link KV-Tube' : 'Chép link'}</span>
                    </button>
                  </div>

                  {/* Metadata Summary */}
                  <div className="rounded-xl border border-[#f4f4f6]/10 bg-[#161822] p-4">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[#c9cddc] tabular-nums">
                      <span className="font-semibold text-[#ffd875]">{displayFilm.channel}</span>
                      <span>•</span>
                      <span>{formatViewsVN(displayFilm.views)}</span>
                      {displayFilm.dur && (
                        <>
                          <span>•</span>
                          <span>Thời lượng: {displayFilm.dur}</span>
                        </>
                      )}
                      <span>•</span>
                      <span className="inline-flex items-center gap-1 rounded bg-[#f4f4f6]/10 px-2 py-0.5 text-[#f4f4f6]">
                        <Sparkles className="h-3 w-3 text-[#ffd875]" strokeWidth={1.75} />
                        <span>Công cụ AI: {displayFilm.tool || 'AI Studio'}</span>
                      </span>
                    </div>

                    <p className="mt-3 text-sm leading-relaxed text-[#e2e4ed]">
                      {displayFilm.blurbLong || displayFilm.blurb}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <span className="rounded bg-[#ffd875]/15 px-2.5 py-0.5 text-xs font-medium text-[#ffd875]">
                        {CAT_LABEL[displayFilm.cat] || displayFilm.cat}
                      </span>
                      {(displayFilm.tags || []).map((tag) => (
                        <span
                          key={tag}
                          className="rounded border border-[#f4f4f6]/15 bg-[#0d0e14] px-2.5 py-0.5 text-xs text-[#c9cddc]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Share Card Generator Panel */}
                  {showShareCard && (
                    <div className="rounded-xl border border-[#ffd875]/30 bg-[#161822] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-sm font-bold text-[#f4f4f6]">
                          Thẻ chia sẻ phim chuẩn Story (1080×1920)
                        </h3>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleDownloadShareCard}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-[#ffd875] px-3 py-1.5 text-xs font-bold text-[#0d0e14] hover:bg-[#ffe294]"
                          >
                            <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
                            <span>Tải ảnh PNG</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowShareCard(false)}
                            className="rounded-lg border border-[#f4f4f6]/15 px-2.5 py-1.5 text-xs text-[#c9cddc] hover:text-[#f4f4f6]"
                          >
                            Thu gọn
                          </button>
                        </div>
                      </div>
                      <p className="mt-1 text-xs text-[#b4b8c8]">{shareCardStatus}</p>
                      <div className="mt-3 flex justify-center">
                        <canvas
                          ref={shareCanvasRef}
                          width={1080}
                          height={1920}
                          className="max-h-80 w-auto rounded-lg border border-[#f4f4f6]/15 shadow-lg"
                        />
                      </div>
                    </div>
                  )}

                  {/* Series Episodes Strip */}
                  {seriesEpisodes.length >= 2 && (
                    <div className="rounded-xl border border-[#f4f4f6]/10 bg-[#161822] p-4">
                      <h3 className="text-sm font-bold text-[#f4f4f6] tabular-nums">
                        Chuỗi tập cùng bộ ({seriesEpisodes.length} phần)
                      </h3>
                      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
                        {seriesEpisodes.map((ep) => {
                          const isCurrent = ep.id === displayFilm.id;
                          return (
                            <button
                              key={ep.id}
                              type="button"
                              onClick={() => onSelectFilm(ep)}
                              className={`flex items-center gap-2.5 rounded-lg border p-2 text-left transition-colors ${
                                isCurrent
                                  ? 'border-[#ffd875] bg-[#ffd875]/15 text-[#ffd875]'
                                  : 'border-[#f4f4f6]/10 bg-[#0d0e14] text-[#f4f4f6] hover:border-[#f4f4f6]/30'
                              }`}
                            >
                              <img
                                src={getThumbUrl(ep.id)}
                                onError={(e) => {
                                  const t = e.currentTarget;
                                  if (!t.dataset.fallback) {
                                    t.dataset.fallback = '1';
                                    t.src = getFallbackThumbUrl(ep.id);
                                  }
                                }}
                                alt={ep.title}
                                className="h-12 w-20 shrink-0 rounded object-cover"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="line-clamp-2 text-xs font-semibold leading-snug">
                                  {ep.title}
                                </div>
                                <div className="mt-0.5 text-[11px] text-[#b4b8c8] tabular-nums">
                                  {ep.dur || 'HD'} {isCurrent ? '• Đang phát' : ''}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right Column: 5-Star Rating & Timestamped Comments */}
                <div className="space-y-4">
                  {/* 5-Star Rating Box */}
                  <div className="rounded-xl border border-[#f4f4f6]/10 bg-[#161822] p-4">
                    <h3 className="text-sm font-bold text-[#f4f4f6]">
                      Chấm điểm bộ phim
                    </h3>
                    <div className="mt-2.5 flex items-center gap-1.5">
                      {[1, 2, 3, 4, 5].map((star) => {
                        const active = (myRating || Math.round(avgStars)) >= star;
                        return (
                          <button
                            key={star}
                            type="button"
                            onClick={() => handleRate(star)}
                            aria-label={`Chấm ${star} sao`}
                            className={`rounded-md p-1.5 transition-transform hover:scale-110 ${
                              active ? 'text-[#ffd875]' : 'text-[#5a6075] hover:text-[#ffd875]/70'
                            }`}
                          >
                            <Star
                              className="h-5 w-5"
                              strokeWidth={1.75}
                              fill={active ? 'currentColor' : 'none'}
                            />
                          </button>
                        );
                      })}
                      <span className="ml-2 text-xs font-semibold text-[#ffd875] tabular-nums">
                        {avgStars > 0 ? `${avgStars.toFixed(1)} / 5.0` : 'Chưa có điểm'}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs text-[#b4b8c8] tabular-nums">
                      {ratingStatus ||
                        (ratingObj && ratingObj.n > 0
                          ? `Trung bình từ ${ratingObj.n} lượt đánh giá của khán giả.`
                          : 'Hãy là khán giả đầu tiên chấm điểm cho bộ phim này.')}
                    </p>
                  </div>

                  {/* Timestamped Comments Box */}
                  <div className="rounded-xl border border-[#f4f4f6]/10 bg-[#161822] p-4">
                    <div className="flex items-center justify-between">
                      <h3 className="inline-flex items-center gap-1.5 text-sm font-bold text-[#f4f4f6] tabular-nums">
                        <MessageSquare className="h-4 w-4 text-[#ffd875]" strokeWidth={1.75} />
                        <span>Bình luận theo mốc giờ ({comments.length})</span>
                      </h3>
                    </div>

                    <form onSubmit={handlePostComment} className="mt-3 space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Tên hiển thị..."
                          value={commentAuthor}
                          onChange={(e) => setCommentAuthor(e.target.value)}
                          maxLength={32}
                          className="w-1/3 rounded-lg border border-[#f4f4f6]/15 bg-[#0d0e14] px-2.5 py-1.5 text-xs text-[#f4f4f6] focus:border-[#ffd875] focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={handleAttachCurrentTime}
                          className={`inline-flex flex-1 items-center justify-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium tabular-nums transition-colors ${
                            attachedTimestamp !== null
                              ? 'border-[#ffd875] bg-[#ffd875]/20 text-[#ffd875]'
                              : 'border-[#f4f4f6]/15 bg-[#0d0e14] text-[#c9cddc] hover:text-[#f4f4f6]'
                          }`}
                        >
                          <Clock className="h-3.5 w-3.5" strokeWidth={1.75} />
                          <span>
                            {attachedTimestamp !== null
                              ? `Mốc ${formatClock(attachedTimestamp)} (Bỏ gắn)`
                              : 'Gắn mốc đang phát'}
                          </span>
                        </button>
                      </div>

                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Viết cảm nhận hoặc mốc tình tiết hay..."
                          value={commentText}
                          onChange={(e) => setCommentText(e.target.value)}
                          maxLength={300}
                          className="flex-1 rounded-lg border border-[#f4f4f6]/15 bg-[#0d0e14] px-3 py-1.5 text-xs text-[#f4f4f6] focus:border-[#ffd875] focus:outline-none"
                        />
                        <button
                          type="submit"
                          className="rounded-lg bg-[#ffd875] px-3.5 py-1.5 text-xs font-bold text-[#0d0e14] transition-colors hover:bg-[#ffe294]"
                        >
                          Gửi
                        </button>
                      </div>
                    </form>

                    <div className="mt-3 max-h-60 space-y-2 overflow-y-auto pr-1">
                      {loadingComments ? (
                        <p className="text-xs text-[#b4b8c8]">Đang tải bình luận...</p>
                      ) : comments.length === 0 ? (
                        <p className="text-xs text-[#b4b8c8]">
                          Chưa có bình luận nào cho phim này.
                        </p>
                      ) : (
                        comments.map((cmt, idx) => (
                          <div
                            key={cmt.id || idx}
                            className="rounded-lg border border-[#f4f4f6]/10 bg-[#0d0e14] p-2.5 text-xs"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-[#f4f4f6]">
                                {cmt.m?.n || cmt.n || 'Khán giả'}
                              </span>
                              <div className="flex items-center gap-1.5">
                                {typeof cmt.s === 'number' && cmt.s > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => handleSeekTo(cmt.s!)}
                                    className="inline-flex items-center gap-1 rounded bg-[#ffd875]/15 px-1.5 py-0.5 text-[11px] font-semibold text-[#ffd875] tabular-nums hover:bg-[#ffd875]/25"
                                  >
                                    <Play className="h-2.5 w-2.5" strokeWidth={2} />
                                    <span>{formatClock(cmt.s)}</span>
                                  </button>
                                )}
                                {cmt.d && (
                                  <span className="text-[11px] text-[#8f95ab]">{cmt.d}</span>
                                )}
                              </div>
                            </div>
                            <p className="mt-1 text-[#d5d8e6]">{cmt.t}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Related Films Strip */}
              {relatedFilms.length > 0 && (
                <div className="mt-6 border-t border-[#f4f4f6]/10 pt-5">
                  <h3 className="text-sm font-bold text-[#f4f4f6]">
                    Phim AI cùng chuyên mục & kênh liên quan
                  </h3>
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
                    {relatedFilms.map((rf) => (
                      <button
                        key={rf.id}
                        type="button"
                        onClick={() => onSelectFilm(rf)}
                        className="group flex flex-col overflow-hidden rounded-lg border border-[#f4f4f6]/10 bg-[#161822] text-left transition-all hover:border-[#ffd875]/50"
                      >
                        <div className="relative aspect-video w-full overflow-hidden bg-black">
                          <img
                            src={getThumbUrl(rf.id)}
                            onError={(e) => {
                              const t = e.currentTarget;
                              if (!t.dataset.fallback) {
                                t.dataset.fallback = '1';
                                t.src = getFallbackThumbUrl(rf.id);
                              }
                            }}
                            alt={rf.title}
                            loading="lazy"
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                          <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1.5 py-0.5 text-[10px] font-semibold text-[#f4f4f6] tabular-nums">
                            {rf.dur || 'HD'}
                          </span>
                        </div>
                        <div className="p-2">
                          <div className="line-clamp-2 text-xs font-semibold text-[#f4f4f6] group-hover:text-[#ffd875]">
                            {rf.title}
                          </div>
                          <div className="mt-1 flex items-center justify-between text-[11px] text-[#b4b8c8] tabular-nums">
                            <span className="truncate">{rf.channel}</span>
                            <ChevronRight className="h-3 w-3 shrink-0" strokeWidth={1.75} />
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
