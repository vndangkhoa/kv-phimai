import { useLayoutEffect, useEffect, useState, useCallback } from 'react';
import { MaterialiousPlayer } from './MaterialiousPlayer';
import type { Film } from '../types/phimai';
import { getThumbUrl } from '../utils/phimaiUtils';

interface PersistentPlayerProps {
  activeFilm: Film | null;
  isWatchPage: boolean;
  initialTimeSec?: number;
  sleepMinutes: number;
  onSelectSleepMinutes: (m: number) => void;
  onNext?: () => void;
  onPrev?: () => void;
  onVideoEnd?: () => void;
  onTimeUpdate?: (sec: number) => void;
  onExpandToWatch: (film: Film, currentTime: number) => void;
  onCloseMiniPlayer: () => void;
  externalSeekSec?: { sec: number; nonce: number } | null;
}

/**
 * PersistentPlayer mounts ONE <MaterialiousPlayer /> permanently at the app root
 * and smoothly attaches its viewport over `#watch-player-slot` on `/watch?v=...`,
 * or docks into a floating mini-player when the user navigates back to `/` without
 * restarting the video or losing buffer.
 */
export function PersistentPlayer({
  activeFilm,
  isWatchPage,
  initialTimeSec = 0,
  sleepMinutes,
  onSelectSleepMinutes,
  onNext,
  onPrev,
  onVideoEnd,
  onTimeUpdate,
  onExpandToWatch,
  onCloseMiniPlayer,
  externalSeekSec,
}: PersistentPlayerProps) {
  const [slotRect, setSlotRect] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);
  const [isCssFullscreen, setIsCssFullscreen] = useState(false);

  const showFull = isWatchPage && Boolean(activeFilm);
  const showMini = !isWatchPage && Boolean(activeFilm);

  useEffect(() => {
    const onFullscreenEvent = (e: Event) => {
      const detail = (e as CustomEvent<{ isFullscreen?: boolean }>).detail;
      setIsCssFullscreen(Boolean(detail?.isFullscreen));
    };
    window.addEventListener('phimai-player-fullscreen', onFullscreenEvent);
    return () => {
      window.removeEventListener('phimai-player-fullscreen', onFullscreenEvent);
    };
  }, []);

  useEffect(() => {
    if (!showFull && isCssFullscreen) {
      setIsCssFullscreen(false);
    }
  }, [showFull, isCssFullscreen]);

  useEffect(() => {
    if (!(showFull && isCssFullscreen)) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [showFull, isCssFullscreen]);

  const updateSlotRect = useCallback(() => {
    if (!showFull) {
      setSlotRect(null);
      return;
    }
    const slot = document.getElementById('watch-player-slot');
    if (slot) {
      const rect = slot.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const next = {
          top: Math.round(rect.top + window.scrollY),
          left: Math.round(rect.left + window.scrollX),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
        setSlotRect((prev) => {
          if (
            prev &&
            prev.top === next.top &&
            prev.left === next.left &&
            prev.width === next.width &&
            prev.height === next.height
          ) {
            return prev;
          }
          return next;
        });
      }
    }
  }, [showFull]);

  useLayoutEffect(() => {
    if (!showFull) {
      setSlotRect(null);
      return;
    }
    updateSlotRect();
    let count = 0;
    let rafId = 0;
    const track = () => {
      updateSlotRect();
      count++;
      if (count < 36) {
        rafId = requestAnimationFrame(track);
      }
    };
    rafId = requestAnimationFrame(track);
    return () => cancelAnimationFrame(rafId);
  }, [showFull, activeFilm?.id, updateSlotRect]);

  useEffect(() => {
    if (!showFull) return;
    window.addEventListener('resize', updateSlotRect);
    window.addEventListener('orientationchange', updateSlotRect);
    window.addEventListener('scroll', updateSlotRect, { passive: true });

    const slot = document.getElementById('watch-player-slot');
    let ro: ResizeObserver | null = null;
    if (slot && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => updateSlotRect());
      ro.observe(slot);
    }
    // Re-check periodically during dynamic layout shifts (theater toggle / drawer toggle)
    const mo = new MutationObserver(() => updateSlotRect());
    mo.observe(document.body, { attributes: true, childList: true, subtree: false });

    return () => {
      window.removeEventListener('resize', updateSlotRect);
      window.removeEventListener('orientationchange', updateSlotRect);
      window.removeEventListener('scroll', updateSlotRect);
      ro?.disconnect();
      mo.disconnect();
    };
  }, [showFull, updateSlotRect]);

  if (!activeFilm) return null;

  const getHostStyle = (): React.CSSProperties => {
    if (showFull && isCssFullscreen) {
      return {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100dvh',
        zIndex: 99999,
        pointerEvents: 'auto',
        visibility: 'visible',
        opacity: 1,
        borderRadius: 0,
        backgroundColor: '#000000',
        overflow: 'hidden',
      };
    }
    if (showFull && slotRect && slotRect.width > 0) {
      return {
        position: 'absolute',
        top: `${slotRect.top}px`,
        left: `${slotRect.left}px`,
        width: `${slotRect.width}px`,
        height: `${slotRect.height}px`,
        zIndex: 50,
        pointerEvents: 'auto',
        visibility: 'visible',
        opacity: 1,
        borderRadius: '14px',
        overflow: 'hidden',
        transition: 'opacity 0.12s ease',
      };
    }
    if (showFull) {
      return {
        position: 'absolute',
        top: '76px',
        left: '24px',
        width: '0px',
        height: '0px',
        zIndex: -1,
        visibility: 'hidden',
        opacity: 0,
        pointerEvents: 'none',
      };
    }
    if (showMini) {
      return {
        position: 'fixed',
        zIndex: 1200,
        pointerEvents: 'auto',
        visibility: 'visible',
      };
    }
    return {
      position: 'absolute',
      left: '-99999px',
      top: '-99999px',
      width: '0px',
      height: '0px',
      visibility: 'hidden',
      pointerEvents: 'none',
    };
  };

  return (
    <div id="persistent-player-host" style={getHostStyle()}>
      <MaterialiousPlayer
        videoId={activeFilm.id}
        title={activeFilm.title}
        uploader={activeFilm.channel}
        thumbnail={getThumbUrl(activeFilm.id)}
        autoplay={true}
        compact={showMini}
        initialTimeSec={initialTimeSec}
        sleepMinutes={sleepMinutes}
        onSelectSleepMinutes={onSelectSleepMinutes}
        onNext={onNext}
        onPrev={onPrev}
        onVideoEnd={onVideoEnd}
        onTimeUpdate={onTimeUpdate}
        onExpand={(curTime) => onExpandToWatch(activeFilm, curTime)}
        onCloseMiniPlayer={onCloseMiniPlayer}
        externalSeekSec={externalSeekSec}
      />
    </div>
  );
}
