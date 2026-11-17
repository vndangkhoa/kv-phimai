import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  X,
  ChevronUp,
  ChevronDown,
  Volume2,
  VolumeX,
  Bookmark,
  BookmarkCheck,
  ExternalLink,
  Maximize2,
  Sparkles,
  Play,
  Pause,
  Layers,
} from 'lucide-react';
import type { Film } from '../types/phimai';
import {
  CAT_LABEL,
  formatViewsVN,
  getKVTubeEmbedUrl,
  getKVTubeStreamUrl,
  getKVTubeWatchUrl,
  getThumbUrl,
  isAgeVerified,
} from '../utils/phimaiUtils';

export interface SwipeFeedModalProps {
  isOpen: boolean;
  startFilm: Film | null;
  films: Film[];
  savedIds: Set<string>;
  onToggleSave: (id: string) => void;
  onOpenFullPlayer: (film: Film) => void;
  onClose: () => void;
}

export const SwipeFeedModal: React.FC<SwipeFeedModalProps> = ({
  isOpen,
  startFilm,
  films,
  savedIds,
  onToggleSave,
  onOpenFullPlayer,
  onClose,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const touchStartY = useRef<number | null>(null);

  const [feedQueue, setFeedQueue] = useState<Film[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [muted, setMuted] = useState<boolean>(false);
  const [paused, setPaused] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [useEmbed, setUseEmbed] = useState<boolean>(false);

  // Build feed queue when modal opens
  useEffect(() => {
    if (!isOpen) return;
    const eligible = films.filter((f) => !f.adult || isAgeVerified());
    if (eligible.length === 0) return;

    const shuffled = [...eligible].sort(() => Math.random() - 0.5);
    if (startFilm) {
      const withoutStart = shuffled.filter((f) => f.id !== startFilm.id);
      setFeedQueue([startFilm, ...withoutStart]);
    } else {
      setFeedQueue(shuffled);
    }
    setCurrentIndex(0);
    setProgress(0);
    setPaused(false);
    setUseEmbed(false);
  }, [isOpen, startFilm, films]);

  const currentFilm = feedQueue[currentIndex] || null;

  const goNext = useCallback(() => {
    if (feedQueue.length === 0) return;
    setCurrentIndex((prev) => (prev + 1) % feedQueue.length);
    setProgress(0);
    setPaused(false);
  }, [feedQueue.length]);

  const goPrev = useCallback(() => {
    if (feedQueue.length === 0) return;
    setCurrentIndex((prev) => (prev - 1 + feedQueue.length) % feedQueue.length);
    setProgress(0);
    setPaused(false);
  }, [feedQueue.length]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        goPrev();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'm') {
        setMuted((v) => !v);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, goNext, goPrev, onClose]);

  // Record view and start playback when currentFilm changes
  useEffect(() => {
    if (!isOpen || !currentFilm) return;
    fetch('/api/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: currentFilm.id }),
    }).catch(() => {});

    const v = videoRef.current;
    if (v && !useEmbed) {
      v.currentTime = 0;
      v.play().catch(() => {
        // Auto-mute if browser blocks unmuted autoplay
        setMuted(true);
        v.muted = true;
        v.play().catch(() => {});
      });
    }
  }, [isOpen, currentFilm, useEmbed]);

  if (!isOpen || !currentFilm) return null;

  const isSaved = savedIds.has(currentFilm.id);
  const streamUrl = getKVTubeStreamUrl(currentFilm.id);
  const embedUrl = getKVTubeEmbedUrl(currentFilm.id);
  const watchUrl = getKVTubeWatchUrl(currentFilm.id);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    touchStartY.current = null;
    if (Math.abs(dy) > 65) {
      if (dy < 0) goNext();
      else goPrev();
    }
  };

  const togglePlayPause = () => {
    const v = videoRef.current;
    if (!v || useEmbed) return;
    if (v.paused) {
      v.play().catch(() => {});
      setPaused(false);
    } else {
      v.pause();
      setPaused(true);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#06070b]/95 backdrop-blur-xl"
      role="dialog"
      aria-modal="true"
      aria-label="Lướt dọc phim AI"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Top Floating Header */}
      <div className="absolute left-0 right-0 top-0 z-20 flex items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="rounded-md bg-[#ffd875] px-2.5 py-1 text-xs font-bold text-[#0d0e14] tabular-nums">
            Lướt dọc KV-Tube #{currentIndex + 1}/{feedQueue.length}
          </span>
          <span className="hidden text-xs text-[#c9cddc] sm:inline-block">
            Phím mũi tên Lên/Xuống hoặc vuốt dọc để đổi phim
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setUseEmbed((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#f4f4f6]/20 bg-black/60 px-3 py-1.5 text-xs font-medium text-[#f4f4f6] hover:bg-black/80"
          >
            <Layers className="h-3.5 w-3.5 text-[#ffd875]" strokeWidth={1.75} />
            <span>{useEmbed ? 'HTML5 Direct' : 'KV-Tube Embed'}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng chế độ lướt dọc"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#f4f4f6]/20 bg-black/60 text-[#f4f4f6] hover:bg-black/80"
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {/* Center Vertical Stage */}
      <div className="relative flex h-full w-full max-w-5xl items-center justify-center px-2 py-14 sm:px-12">
        <div className="relative flex h-full w-full flex-col justify-between overflow-hidden rounded-2xl border border-[#f4f4f6]/15 bg-black shadow-[0_24px_64px_rgba(0,0,0,0.9)]">
          {/* Video Element */}
          <div className="relative flex-1 bg-black" onClick={togglePlayPause}>
            {useEmbed ? (
              <iframe
                src={embedUrl}
                title={currentFilm.title}
                className="h-full w-full border-0"
                allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <video
                ref={videoRef}
                src={streamUrl}
                poster={getThumbUrl(currentFilm.id)}
                muted={muted}
                playsInline
                autoPlay
                onTimeUpdate={(e) => {
                  const v = e.currentTarget;
                  if (v.duration > 0) {
                    setProgress((v.currentTime / v.duration) * 100);
                  }
                }}
                onEnded={goNext}
                className="h-full w-full object-contain"
              />
            )}

            {paused && !useEmbed && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/35">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#ffd875]/90 text-[#0d0e14]">
                  <Play className="h-7 w-7 translate-x-0.5" strokeWidth={2} />
                </div>
              </div>
            )}
          </div>

          {/* Bottom Overlay Info & Progress Bar */}
          <div className="relative z-10 border-t border-[#f4f4f6]/10 bg-[#0d0e14]/95 p-4 sm:p-5">
            <div className="mb-3 h-1 w-full overflow-hidden rounded-full bg-[#f4f4f6]/15">
              <div
                className="h-full bg-[#ffd875] transition-all duration-200"
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              />
            </div>

            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2 text-xs tabular-nums">
                  <span className="rounded bg-[#ffd875] px-2 py-0.5 font-bold text-[#0d0e14]">
                    #{currentFilm.rank}
                  </span>
                  <span className="font-semibold text-[#ffd875]">{currentFilm.channel}</span>
                  <span className="text-[#b4b8c8]">• {formatViewsVN(currentFilm.views)}</span>
                  {currentFilm.dur && (
                    <span className="rounded bg-[#f4f4f6]/10 px-2 py-0.5 text-[#f4f4f6]">
                      {currentFilm.dur}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 rounded bg-[#f4f4f6]/10 px-2 py-0.5 text-[#c9cddc]">
                    <Sparkles className="h-3 w-3 text-[#ffd875]" strokeWidth={1.75} />
                    <span>{currentFilm.tool || 'AI'}</span>
                  </span>
                </div>

                <h3 className="line-clamp-2 text-base font-bold text-[#f4f4f6] sm:text-lg">
                  {currentFilm.title}
                </h3>

                <p className="line-clamp-2 text-xs text-[#c9cddc]">
                  {currentFilm.blurb}
                </p>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  <span className="rounded bg-[#ffd875]/15 px-2 py-0.5 text-[11px] font-medium text-[#ffd875]">
                    {CAT_LABEL[currentFilm.cat] || currentFilm.cat}
                  </span>
                  {(currentFilm.tags || []).slice(0, 3).map((t) => (
                    <span
                      key={t}
                      className="rounded border border-[#f4f4f6]/15 px-2 py-0.5 text-[11px] text-[#b4b8c8]"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>

              {/* Action Buttons Dock */}
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {!useEmbed && (
                  <>
                    <button
                      type="button"
                      onClick={togglePlayPause}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#f4f4f6]/15 bg-[#161822] px-3 py-2 text-xs font-semibold text-[#f4f4f6] hover:bg-[#f4f4f6]/10"
                    >
                      {paused ? (
                        <Play className="h-4 w-4 text-[#ffd875]" strokeWidth={1.75} />
                      ) : (
                        <Pause className="h-4 w-4 text-[#ffd875]" strokeWidth={1.75} />
                      )}
                      <span>{paused ? 'Phát' : 'Tạm dừng'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setMuted((v) => !v)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#f4f4f6]/15 bg-[#161822] px-3 py-2 text-xs font-semibold text-[#f4f4f6] hover:bg-[#f4f4f6]/10"
                    >
                      {muted ? (
                        <VolumeX className="h-4 w-4 text-[#ff6b6b]" strokeWidth={1.75} />
                      ) : (
                        <Volume2 className="h-4 w-4 text-[#10b981]" strokeWidth={1.75} />
                      )}
                      <span>{muted ? 'Bật tiếng' : 'Có tiếng'}</span>
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={() => onToggleSave(currentFilm.id)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
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
                  <span>{isSaved ? 'Đã lưu' : 'Lưu'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenFullPlayer(currentFilm);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#ffd875] px-3.5 py-2 text-xs font-bold text-[#0d0e14] hover:bg-[#ffe294]"
                >
                  <Maximize2 className="h-4 w-4" strokeWidth={1.75} />
                  <span>Mở rạp đầy đủ</span>
                </button>

                <a
                  href={watchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-[#f4f4f6]/15 bg-[#161822] px-3 py-2 text-xs font-medium text-[#c9cddc] hover:text-[#ffd875]"
                >
                  <span>KV-Tube</span>
                  <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.75} />
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side Vertical Prev/Next Arrows */}
        <div className="ml-3 hidden flex-col gap-3 sm:flex">
          <button
            type="button"
            onClick={goPrev}
            aria-label="Phim trước"
            className="flex h-12 w-12 items-center justify-center rounded-full border border-[#f4f4f6]/20 bg-[#161822] text-[#f4f4f6] transition-colors hover:border-[#ffd875] hover:text-[#ffd875]"
          >
            <ChevronUp className="h-6 w-6" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={goNext}
            aria-label="Phim tiếp theo"
            className="flex h-12 w-12 items-center justify-center rounded-full border border-[#f4f4f6]/20 bg-[#161822] text-[#f4f4f6] transition-colors hover:border-[#ffd875] hover:text-[#ffd875]"
          >
            <ChevronDown className="h-6 w-6" strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </div>
  );
};
