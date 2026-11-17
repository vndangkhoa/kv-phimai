import { useEffect, useRef } from 'react';

export interface UseMediaSessionOptions {
  videoId: string;
  title?: string;
  uploader?: string;
  thumbnail?: string;
  getVideo: () => HTMLVideoElement | null;
  getAudio: () => HTMLAudioElement | null;
  onNext?: () => void;
  onPrev?: () => void;
}

const SEEK_STEP_SECONDS = 10;

function mediaSessionAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'mediaSession' in navigator;
}

function toAbsoluteUrl(raw?: string): string {
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${raw.startsWith('/') ? raw : `/${raw}`}`;
  }
  return raw;
}

function buildArtwork(videoId: string, thumbnail?: string): MediaImage[] {
  const origin =
    typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
  const thumbBase = thumbnail
    ? toAbsoluteUrl(thumbnail)
    : `${origin}/api/kvtube/thumb/${encodeURIComponent(videoId)}`;
  const hq = `${origin}/api/kvtube/thumb/${encodeURIComponent(videoId)}?q=hqdefault`;
  const maxres = `${origin}/api/kvtube/thumb/${encodeURIComponent(videoId)}?q=maxresdefault`;
  const mq = `${origin}/api/kvtube/thumb/${encodeURIComponent(videoId)}?q=mqdefault`;
  const appIcon512 = `${origin}/icons/icon-512x512.png`;

  return [
    { src: thumbBase || appIcon512, sizes: '96x96', type: 'image/jpeg' },
    { src: thumbBase || appIcon512, sizes: '128x128', type: 'image/jpeg' },
    { src: hq, sizes: '192x192', type: 'image/jpeg' },
    { src: hq, sizes: '256x256', type: 'image/jpeg' },
    { src: mq, sizes: '320x180', type: 'image/jpeg' },
    { src: hq, sizes: '480x360', type: 'image/jpeg' },
    { src: hq, sizes: '512x512', type: 'image/jpeg' },
    { src: maxres, sizes: '1280x720', type: 'image/jpeg' },
  ];
}

function activeMedia(
  getVideo: () => HTMLVideoElement | null,
  getAudio: () => HTMLAudioElement | null
): HTMLVideoElement | HTMLAudioElement | null {
  const video = getVideo();
  const audio = getAudio();
  const hidden = typeof document !== 'undefined' && document.hidden;
  if (hidden && audio && !audio.paused && !audio.ended) return audio;
  return video || audio;
}

export function useMediaSession(opts: UseMediaSessionOptions) {
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  });

  // Refresh OS Media Control Card metadata whenever film or channel info arrives
  useEffect(() => {
    if (!mediaSessionAvailable() || typeof MediaMetadata === 'undefined') return;
    const { videoId, title, uploader, thumbnail } = optsRef.current;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: title || 'PhimAI Cinema',
        artist: uploader || 'PhimAI',
        album: 'PhimAI — Rạp Phim AI 4K',
        artwork: buildArtwork(videoId, thumbnail),
      });
    } catch {
      // ignore on browsers without full MediaMetadata support
    }
  }, [opts.videoId, opts.title, opts.uploader, opts.thumbnail]);

  // Register transport control handlers (play, pause, ±10s seek, seekto, prev, next)
  useEffect(() => {
    if (!mediaSessionAvailable()) return;
    const ms = navigator.mediaSession;

    const play = () => {
      const el = activeMedia(optsRef.current.getVideo, optsRef.current.getAudio);
      if (el) {
        el.play().catch(() => {});
        setMediaSessionPlaybackState('playing');
        if (el.duration > 0) {
          updateMediaSessionPosition(el.duration, el.playbackRate || 1, el.currentTime);
        }
      }
    };

    const pause = () => {
      const el = activeMedia(optsRef.current.getVideo, optsRef.current.getAudio);
      if (el) {
        el.pause();
        setMediaSessionPlaybackState('paused');
        if (el.duration > 0) {
          updateMediaSessionPosition(el.duration, el.playbackRate || 1, el.currentTime);
        }
      }
    };

    const seekBy = (delta: number) => {
      const el = activeMedia(optsRef.current.getVideo, optsRef.current.getAudio);
      if (!el) return;
      const dur = Number.isFinite(el.duration) ? el.duration : 0;
      const t = Math.max(0, Math.min(dur || el.currentTime + delta, el.currentTime + delta));
      el.currentTime = t;
      const video = optsRef.current.getVideo();
      const audio = optsRef.current.getAudio();
      if (el !== video && video) video.currentTime = t;
      if (el !== audio && audio) audio.currentTime = t;
      updateMediaSessionPosition(dur || t, el.playbackRate || 1, t);
    };

    const seekTo = (time: number) => {
      const el = activeMedia(optsRef.current.getVideo, optsRef.current.getAudio);
      if (!el) return;
      const dur = Number.isFinite(el.duration) ? el.duration : 0;
      const t = Number.isFinite(time) ? Math.max(0, Math.min(dur || time, time)) : 0;
      el.currentTime = t;
      const video = optsRef.current.getVideo();
      const audio = optsRef.current.getAudio();
      if (el !== video && video) video.currentTime = t;
      if (el !== audio && audio) audio.currentTime = t;
      updateMediaSessionPosition(dur || t, el.playbackRate || 1, t);
    };

    const next = () => optsRef.current.onNext?.();
    const prev = () => optsRef.current.onPrev?.();

    const safeSet = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try {
        ms.setActionHandler(action, handler);
      } catch {
        // ignore unsupported action on older browsers
      }
    };

    safeSet('play', play);
    safeSet('pause', pause);
    safeSet('seekbackward', () => seekBy(-SEEK_STEP_SECONDS));
    safeSet('seekforward', () => seekBy(SEEK_STEP_SECONDS));
    safeSet('seekto', (details) => seekTo(details.seekTime ?? 0));
    safeSet('previoustrack', prev);
    safeSet('nexttrack', next);
    safeSet('stop', pause);

    return () => {
      safeSet('play', null);
      safeSet('pause', null);
      safeSet('seekbackward', null);
      safeSet('seekforward', null);
      safeSet('seekto', null);
      safeSet('previoustrack', null);
      safeSet('nexttrack', null);
      safeSet('stop', null);
    };
  }, []);
}

export function setMediaSessionPlaybackState(state: 'playing' | 'paused' | 'none') {
  if (!mediaSessionAvailable()) return;
  try {
    navigator.mediaSession.playbackState = state;
  } catch {
    // ignore
  }
}

export function updateMediaSessionPosition(
  duration: number,
  playbackRate: number,
  position: number
) {
  if (!mediaSessionAvailable()) return;
  try {
    if (typeof navigator.mediaSession.setPositionState !== 'function') return;
    const validDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
    const validPosition =
      Number.isFinite(position) && position >= 0
        ? Math.min(position, validDuration || position)
        : 0;
    const validRate = Number.isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 1;

    if (validDuration > 0) {
      navigator.mediaSession.setPositionState({
        duration: validDuration,
        playbackRate: validRate,
        position: validPosition,
      });
    }
  } catch {
    // ignore invalid transient durations
  }
}
