import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bookmark,
  BookmarkCheck,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Layers,
  Maximize2,
  Pause,
  Play,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { Dialog } from '@astryxdesign/core/Dialog';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Badge } from '@astryxdesign/core/Badge';
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
import { PHONE_QUERY, useMediaQuery } from './useMediaQuery';
import './overlays.css';

export interface SwipeFeedModalProps {
  isOpen: boolean;
  startFilm: Film | null;
  films: Film[];
  savedIds: Set<string>;
  onToggleSave: (id: string) => void;
  onOpenFullPlayer: (film: Film) => void;
  onClose: () => void;
}

const ICON = { className: 'h-4 w-4 shrink-0', strokeWidth: 1.75 } as const;
const ICON_LG = { className: 'h-5 w-5 shrink-0', strokeWidth: 1.75 } as const;

/**
 * Vertical reels feed. Always a full-screen Astryx Dialog (native modal, focus
 * trap, Escape to close). Swipe up/down, Arrow keys or J/K change film; M mutes.
 */
export const SwipeFeedModal: React.FC<SwipeFeedModalProps> = ({
  isOpen,
  startFilm,
  films,
  savedIds,
  onToggleSave,
  onOpenFullPlayer,
  onClose,
}) => {
  const isPhone = useMediaQuery(PHONE_QUERY);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const touchStartY = useRef<number | null>(null);

  const [feedQueue, setFeedQueue] = useState<Film[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [muted, setMuted] = useState<boolean>(false);
  const [paused, setPaused] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [useEmbed, setUseEmbed] = useState<boolean>(false);

  // Build the feed queue when the overlay opens
  useEffect(() => {
    if (!isOpen) return;
    const eligible = films.filter((f) => !f.adult || isAgeVerified());
    if (eligible.length === 0) return;
    const shuffled = [...eligible].sort(() => Math.random() - 0.5);
    if (startFilm) {
      setFeedQueue([startFilm, ...shuffled.filter((f) => f.id !== startFilm.id)]);
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

  // Keyboard navigation (Escape is owned by the Dialog)
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        goPrev();
      } else if (e.key === 'm') {
        setMuted((v) => !v);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, goNext, goPrev]);

  // Record view and start playback when the current film changes
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
        // Browser blocked unmuted autoplay: retry muted
        setMuted(true);
        v.muted = true;
        v.play().catch(() => {});
      });
    }
  }, [isOpen, currentFilm, useEmbed]);

  const open = isOpen && currentFilm !== null;

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

  const renderBody = (film: Film) => {
    const isSaved = savedIds.has(film.id);
    const pct = Math.round(Math.min(100, Math.max(0, progress)));

    const saveToggle = (
      <Button
        label={isSaved ? 'Đã lưu' : 'Lưu'}
        variant={isSaved ? 'primary' : 'secondary'}
        aria-pressed={isSaved}
        onClick={() => onToggleSave(film.id)}
        icon={isSaved ? <BookmarkCheck {...ICON} aria-hidden="true" /> : <Bookmark {...ICON} aria-hidden="true" />}
        width={isPhone ? '100%' : undefined}
        className="kv-touch"
      />
    );
    const openFull = (
      <Button
        label="Mở rạp"
        variant="primary"
        icon={<Maximize2 {...ICON} aria-hidden="true" />}
        onClick={() => {
          onClose();
          onOpenFullPlayer(film);
        }}
        width={isPhone ? '100%' : undefined}
        className="kv-touch"
      />
    );
    const kvtubeLink = (
      <Button
        label="KV-Tube"
        icon={<ExternalLink {...ICON} aria-hidden="true" />}
        href={getKVTubeWatchUrl(film.id)}
        target="_blank"
        rel="noopener noreferrer"
        width={isPhone ? '100%' : undefined}
        className="kv-touch"
      />
    );
    const playBtn = (
      <IconButton
        label={paused ? 'Phát' : 'Tạm dừng'}
        icon={paused ? <Play {...ICON_LG} aria-hidden="true" /> : <Pause {...ICON_LG} aria-hidden="true" />}
        onClick={togglePlayPause}
        isDisabled={useEmbed}
        className="kv-touch-square"
      />
    );
    const muteBtn = (
      <IconButton
        label={muted ? 'Bật tiếng' : 'Tắt tiếng'}
        icon={muted ? <VolumeX {...ICON_LG} aria-hidden="true" /> : <Volume2 {...ICON_LG} aria-hidden="true" />}
        onClick={() => setMuted((v) => !v)}
        isDisabled={useEmbed}
        className="kv-touch-square"
      />
    );
    const prevBtn = (
      <IconButton
        label="Phim trước"
        icon={<ChevronUp {...ICON_LG} aria-hidden="true" />}
        onClick={goPrev}
        className="kv-touch-square"
      />
    );
    const nextBtn = (
      <IconButton
        label="Phim tiếp theo"
        icon={<ChevronDown {...ICON_LG} aria-hidden="true" />}
        onClick={goNext}
        className="kv-touch-square"
      />
    );

    return (
      <div className="kv-frame bg-[#06070b]">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-3 py-2 sm:px-6 sm:py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <h2 id="kv-swipe-title" className="sr-only">
              Lướt dọc phim AI
            </h2>
            <Badge variant="yellow" label={`${currentIndex + 1}/${feedQueue.length}`} />
            <span className="hidden text-xs text-[#c4c8d9] md:inline">
              Vuốt dọc, phím mũi tên hoặc J/K để đổi phim · M để tắt tiếng
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              label={useEmbed ? 'Đang nhúng KV-Tube' : 'Nhúng KV-Tube'}
              tooltip="Chuyển giữa luồng trực tiếp và trình phát nhúng KV-Tube"
              aria-pressed={useEmbed}
              onClick={() => setUseEmbed((v) => !v)}
              icon={<Layers {...ICON} aria-hidden="true" />}
              className="kv-touch"
            />
            <IconButton
              label="Đóng chế độ lướt dọc"
              icon={<X {...ICON_LG} aria-hidden="true" />}
              onClick={onClose}
              className="kv-touch-square"
            />
          </div>
        </div>

        {/* Stage */}
        <div
          className="flex min-h-0 flex-1 items-stretch justify-center gap-3 sm:px-6 sm:pb-6"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div className="relative flex min-h-0 w-full max-w-5xl flex-col overflow-hidden bg-black sm:rounded-2xl sm:border sm:border-[#f4f4f6]/15 sm:shadow-[0_24px_64px_-16px_rgba(0,0,0,0.85)]">
            <div className="relative min-h-0 flex-1 bg-black" onClick={togglePlayPause}>
              {useEmbed ? (
                <iframe
                  src={getKVTubeEmbedUrl(film.id)}
                  title={`KV-Tube: ${film.title}`}
                  className="h-full w-full border-0"
                  allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <video
                  ref={videoRef}
                  src={getKVTubeStreamUrl(film.id)}
                  poster={getThumbUrl(film.id)}
                  muted={muted}
                  playsInline
                  autoPlay
                  aria-label={`Đang phát: ${film.title}`}
                  onTimeUpdate={(e) => {
                    const v = e.currentTarget;
                    if (v.duration > 0) setProgress((v.currentTime / v.duration) * 100);
                  }}
                  onEnded={goNext}
                  className="h-full w-full object-contain"
                />
              )}
              {paused && !useEmbed && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/35">
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#ffd875] text-[#0d0e14]">
                    <Play className="h-7 w-7 translate-x-0.5" strokeWidth={2} aria-hidden="true" />
                  </span>
                </div>
              )}
            </div>

            {/* Info + actions */}
            <div className="kv-bottom-bar relative z-10 border-t border-[#f4f4f6]/10 bg-[#0d0e14] px-4 pt-3 sm:p-5">
              <div
                role="progressbar"
                aria-label="Tiến độ phát"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
                className="mb-3 h-1 w-full overflow-hidden rounded-full bg-[#f4f4f6]/15"
              >
                <div className="h-full bg-[#ffd875]" style={{ width: `${pct}%` }} />
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <h3 className="line-clamp-2 text-base font-bold leading-snug text-[#f4f4f6] sm:text-lg">
                    {film.title}
                  </h3>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs tabular-nums">
                    <Badge variant="yellow" label={`#${film.rank}`} />
                    <span className="font-semibold text-[#ffd875]">{film.channel}</span>
                    <span className="text-[#c4c8d9]">{formatViewsVN(film.views)}</span>
                    {film.dur && (
                      <span className="rounded-md bg-[#f4f4f6]/10 px-2 py-0.5 text-[#f4f4f6]">{film.dur}</span>
                    )}
                    <span className="inline-flex items-center gap-1 rounded-md bg-[#f4f4f6]/10 px-2 py-0.5 text-[#c4c8d9]">
                      <Sparkles className="h-3 w-3 text-[#ffd875]" strokeWidth={1.75} aria-hidden="true" />
                      {film.tool || 'AI'}
                    </span>
                  </div>
                  <p className="line-clamp-2 max-w-[70ch] text-xs text-[#c4c8d9]">{film.blurb}</p>
                  <div className="hidden flex-wrap gap-1.5 pt-1 sm:flex">
                    <span className="rounded-md bg-[#ffd875]/15 px-2 py-0.5 text-[11px] font-medium text-[#ffd875]">
                      {CAT_LABEL[film.cat] || film.cat}
                    </span>
                    {(film.tags || []).slice(0, 3).map((t) => (
                      <span key={t} className="rounded-md border border-[#f4f4f6]/15 px-2 py-0.5 text-[11px] text-[#c4c8d9]">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>

                {isPhone ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-5 gap-2" role="group" aria-label="Điều khiển phát">
                      {prevBtn}
                      {playBtn}
                      {muteBtn}
                      {nextBtn}
                      <IconButton
                        label="Xem trên KV-Tube"
                        icon={<ExternalLink {...ICON_LG} aria-hidden="true" />}
                        href={getKVTubeWatchUrl(film.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="kv-touch-square"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2" role="group" aria-label="Thao tác với phim">
                      {saveToggle}
                      {openFull}
                    </div>
                  </div>
                ) : (
                  <div className="flex shrink-0 flex-wrap items-center gap-2" role="group" aria-label="Thao tác với phim">
                    {playBtn}
                    {muteBtn}
                    {saveToggle}
                    {openFull}
                    {kvtubeLink}
                  </div>
                )}
              </div>
            </div>
          </div>

          {!isPhone && (
            <div className="hidden flex-col justify-center gap-3 sm:flex" role="group" aria-label="Chuyển phim">
              {prevBtn}
              {nextBtn}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <Dialog
      isOpen={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      variant="fullscreen"
      padding={0}
      aria-labelledby="kv-swipe-title"
      className="kv-overlay"
      data-testid="swipe-feed-modal"
    >
      {open && currentFilm ? renderBody(currentFilm) : null}
    </Dialog>
  );
};
