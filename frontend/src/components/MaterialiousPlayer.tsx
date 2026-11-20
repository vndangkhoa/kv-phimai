import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  IoPlay,
  IoPause,
  IoPlaySkipForward,
  IoPlaySkipBack,
  IoVolumeHigh,
  IoVolumeMedium,
  IoVolumeLow,
  IoVolumeMute,
  IoSettingsOutline,
  IoExpand,
  IoExpandOutline,
  IoContract,
  IoRepeat,
  IoCheckmark,
  IoArrowBack,
  IoCloseOutline,
  IoTimerOutline,
} from 'react-icons/io5';
import { MdPictureInPictureAlt, MdReplay10, MdForward10, MdFitScreen } from 'react-icons/md';
import {
  useMediaSession,
  setMediaSessionPlaybackState,
  updateMediaSessionPosition,
} from '../hooks/useMediaSession';
import { Logo } from './Logo';
import {
  fetchVideoStream,
  buildQualityList,
  pickBestAutoQuality,
  proxySameOriginUrl,
  bandwidthMonitor,
  formatQualityLabel,
  type QualityOption,
  type VideoCaptionItem,
  type VideoStreamPayload,
} from '../services/streamService';

interface MaterialiousPlayerProps {
  videoId: string;
  title?: string;
  uploader?: string;
  thumbnail?: string;
  autoplay?: boolean;
  compact?: boolean;
  initialTimeSec?: number;
  sleepMinutes: number;
  onSelectSleepMinutes: (minutes: number) => void;
  onVideoEnd?: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  onTimeUpdate?: (sec: number) => void;
  onExpand?: (currentTime: number) => void;
  onCloseMiniPlayer?: () => void;
  externalSeekSec?: { sec: number; nonce: number } | null;
}

/** Same-origin URL that plays quality option `q` directly in a <video>. */
function qualityStreamUrl(q: QualityOption, videoId: string): string {
  if (q.url) return proxySameOriginUrl(q.url);
  const itag = q.itag || '18';
  return `/api/invidious/latest_version?id=${encodeURIComponent(videoId)}&itag=${encodeURIComponent(itag)}&local=true`;
}

/** Normalize portrait vs landscape resolution tier (short side on portrait videos). */
function normalizeVideoTier(width?: number, height?: number): number {
  const vw = width || 0;
  const vh = height || 0;
  if (vw > 0 && vh > 0) {
    return vh > vw ? vw : vh;
  }
  return vh || vw || 720;
}

/** Pre-stage a direct stream (and optional separate audio) off-screen before swapping the live player. */
function probeDirectStreamReady(
  videoUrl: string,
  audioUrl: string | null,
  seekSec: number,
  timeoutMs = 6500
): { promise: Promise<boolean>; cancel: () => void } {
  let done = false;
  let cleanupFn = () => {};

  const promise = new Promise<boolean>((resolve) => {
    const stageVid = document.createElement('video');
    stageVid.muted = true;
    stageVid.playsInline = true;
    stageVid.preload = 'auto';

    const stageAud = audioUrl ? document.createElement('audio') : null;
    if (stageAud) {
      stageAud.muted = true;
      stageAud.preload = 'auto';
    }

    let vidSeekApplied = seekSec <= 0.5;
    let audSeekApplied = !stageAud || seekSec <= 0.5;

    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      cleanupFn();
      resolve(ok);
    };

    const checkReady = () => {
      if (done) return;
      const vidOk =
        vidSeekApplied &&
        stageVid.readyState >= 2 &&
        stageVid.videoWidth > 0 &&
        !stageVid.seeking;
      const audOk =
        !stageAud || (audSeekApplied && stageAud.readyState >= 2 && !stageAud.seeking);
      if (vidOk && audOk) {
        finish(true);
      }
    };

    const applySeek = (el: HTMLMediaElement) => {
      if (seekSec <= 0.5) return;
      try {
        const dur = Number.isFinite(el.duration) && el.duration > 1 ? el.duration : 0;
        const target = dur > 0 ? Math.min(seekSec, dur - 1) : seekSec;
        if (Math.abs(el.currentTime - target) > 0.25) {
          el.currentTime = target;
        }
      } catch {
        // ignore seek errors before metadata stabilizes
      }
    };

    const onVidMeta = () => {
      vidSeekApplied = true;
      applySeek(stageVid);
      checkReady();
    };
    const onAudMeta = () => {
      if (!stageAud) return;
      audSeekApplied = true;
      applySeek(stageAud);
      checkReady();
    };
    const onErr = () => finish(false);

    const timer = setTimeout(() => finish(false), timeoutMs);

    stageVid.addEventListener('loadedmetadata', onVidMeta);
    stageVid.addEventListener('loadeddata', checkReady);
    stageVid.addEventListener('canplay', checkReady);
    stageVid.addEventListener('seeked', checkReady);
    stageVid.addEventListener('error', onErr);

    if (stageAud) {
      stageAud.addEventListener('loadedmetadata', onAudMeta);
      stageAud.addEventListener('loadeddata', checkReady);
      stageAud.addEventListener('canplay', checkReady);
      stageAud.addEventListener('seeked', checkReady);
      stageAud.addEventListener('error', onErr);
    }

    cleanupFn = () => {
      clearTimeout(timer);
      stageVid.removeEventListener('loadedmetadata', onVidMeta);
      stageVid.removeEventListener('loadeddata', checkReady);
      stageVid.removeEventListener('canplay', checkReady);
      stageVid.removeEventListener('seeked', checkReady);
      stageVid.removeEventListener('error', onErr);
      try {
        stageVid.pause();
        stageVid.removeAttribute('src');
        stageVid.load();
      } catch {
        // ignore
      }
      if (stageAud) {
        stageAud.removeEventListener('loadedmetadata', onAudMeta);
        stageAud.removeEventListener('loadeddata', checkReady);
        stageAud.removeEventListener('canplay', checkReady);
        stageAud.removeEventListener('seeked', checkReady);
        stageAud.removeEventListener('error', onErr);
        try {
          stageAud.pause();
          stageAud.removeAttribute('src');
          stageAud.load();
        } catch {
          // ignore
        }
      }
    };

    stageVid.src = videoUrl;
    stageVid.load();
    if (stageAud && audioUrl) {
      stageAud.src = audioUrl;
      stageAud.load();
    }
  });

  return {
    promise,
    cancel: () => {
      if (!done) {
        done = true;
        cleanupFn();
      }
    },
  };
}

/** Seconds of media buffered ahead of the playhead. */
function bufferedAhead(vid: HTMLVideoElement): number {
  const cur = vid.currentTime;
  for (let i = 0; i < vid.buffered.length; i++) {
    if (vid.buffered.start(i) <= cur && cur <= vid.buffered.end(i)) return vid.buffered.end(i) - cur;
  }
  return 0;
}

// Direct-stream auto upgrade: how often to check, and minimum gaps between probes / switches.
const UPGRADE_CHECK_MS = 3_000;
const UPGRADE_PROBE_GAP_MS = 45_000;
const UPGRADE_SWITCH_GAP_MS = 5_000;
const UPGRADE_STALL_QUIET_MS = 45_000;
// Start every video on the muxed progressive stream (single request) and upgrade quality in the background.
const START_PROGRESSIVE_FIRST = true;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  }
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export function MaterialiousPlayer({
  videoId,
  title,
  uploader,
  thumbnail,
  autoplay = true,
  compact = false,
  initialTimeSec = 0,
  sleepMinutes,
  onSelectSleepMinutes,
  onVideoEnd,
  onNext,
  onPrev,
  onTimeUpdate,
  onExpand,
  onCloseMiniPlayer,
  externalSeekSec,
}: MaterialiousPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const freezeCanvasRef = useRef<HTMLCanvasElement>(null);
  const shakaPlayerRef = useRef<any>(null);
  const videoDataRef = useRef<VideoStreamPayload | null>(null);
  const usingProgressiveRef = useRef(false);
  const playbackStartedRef = useRef(false);
  const isSwitchingQualityRef = useRef(false);
  const switchNonceRef = useRef(0);
  const activeQualityRef = useRef<QualityOption | null>(null);
  const activeAudioUrlRef = useRef<string>('');
  const failedDirectIdsRef = useRef<Set<string>>(new Set());
  const stagingCleanupRef = useRef<(() => void) | null>(null);
  const switchListenersCleanupRef = useRef<(() => void) | null>(null);
  const lastShakaTierRef = useRef<number>(0);
  const hideControlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef<{ time: number; x: number }>({ time: 0, x: 0 });
  const stallTimestampsRef = useRef<number[]>([]);
  const lastLoadedVideoIdRef = useRef<string>('');
  const startupWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekRippleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const qualityToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastQualitySwitchRef = useRef<number>(0);
  const lastProbeAtRef = useRef<number>(0);
  const timelineRef = useRef<HTMLDivElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const lastPreviewSeekRef = useRef<number>(0);
  const pendingPreviewTimeRef = useRef<number | null>(null);
  const lastScrubTimeRef = useRef<number | null>(null);
  const lastTouchTimeRef = useRef<number>(0);
  const isMouseDraggingRef = useRef<boolean>(false);
  const wasNativeFsRef = useRef<boolean>(false);

  const clearStartupWatchdog = useCallback(() => {
    if (startupWatchdogRef.current) {
      clearTimeout(startupWatchdogRef.current);
      startupWatchdogRef.current = null;
    }
  }, []);

  const [isPlaying, setIsPlaying] = useState(autoplay);
  const [currentTime, setCurrentTime] = useState(initialTimeSec > 0 ? initialTimeSec : 0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isBuffering, setIsBuffering] = useState(true);
  const [isSwitchingQuality, setIsSwitchingQuality] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isCssFullscreen, setIsCssFullscreen] = useState(false);
  const [verticalFillMode, setVerticalFillMode] = useState<'contain' | 'cover'>('contain');
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const [scrubPercent, setScrubPercent] = useState<number>(0);
  const [previewHasFrame, setPreviewHasFrame] = useState(false);
  const [previewEnabled, setPreviewEnabled] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isLooping, setIsLooping] = useState(false);

  const [needsSeparateAudio, setNeedsSeparateAudio] = useState(false);
  const [bestAudioUrl, setBestAudioUrl] = useState('');

  // Adaptive Quality & Bandwidth states
  const [qualities, setQualities] = useState<QualityOption[]>([]);
  const [qualityMode, setQualityMode] = useState<'auto' | 'manual'>('auto');
  const [selectedHeight, setSelectedHeight] = useState<number>(0);
  const [activeHeight, setActiveHeight] = useState<number>(1080);

  // Refs synced on render so async quality switch transitions never capture stale values
  const autoplayRef = useRef(autoplay);
  autoplayRef.current = autoplay;
  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const playbackRateRef = useRef(playbackRate);
  playbackRateRef.current = playbackRate;
  const needsSeparateAudioRef = useRef(needsSeparateAudio);
  needsSeparateAudioRef.current = needsSeparateAudio;
  const qualitiesRef = useRef(qualities);
  qualitiesRef.current = qualities;
  const qualityModeRef = useRef(qualityMode);
  qualityModeRef.current = qualityMode;
  const [estimatedMbps, setEstimatedMbps] = useState<number>(() =>
    Math.round(bandwidthMonitor.getEstimatedMbps() * 10) / 10
  );

  // Settings modal states
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'main' | 'quality' | 'speed' | 'sleep' | 'subtitles'>('main');
  const [captions, setCaptions] = useState<VideoCaptionItem[]>([]);
  const [currentCaption, setCurrentCaption] = useState<string>('off');
  const [activeCaptionUrl, setActiveCaptionUrl] = useState<string | null>(null);
  const [seekRipple, setSeekRipple] = useState<{ side: 'left' | 'right'; text: string } | null>(null);
  const [qualityToast, setQualityToast] = useState<string | null>(null);

  const showQualityToast = useCallback((text: string) => {
    setQualityToast(text);
    if (qualityToastTimerRef.current) clearTimeout(qualityToastTimerRef.current);
    qualityToastTimerRef.current = setTimeout(() => setQualityToast(null), 3000);
  }, []);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useMediaSession({
    videoId,
    title,
    uploader,
    thumbnail,
    getVideo: () => videoRef.current,
    getAudio: () => audioRef.current,
    onNext,
    onPrev,
  });

  useEffect(() => {
    return bandwidthMonitor.subscribe((mbps) => {
      setEstimatedMbps(Math.round(mbps * 10) / 10);
    });
  }, []);

  // Load initial position from localStorage if resuming
  const getSavedPosition = useCallback(
    (id: string): number => {
      if (initialTimeSec > 0) return initialTimeSec;
      try {
        const raw = localStorage.getItem(`phimai_pos_${id}`);
        const rawDur = localStorage.getItem(`phimai_dur_${id}`);
        const parsed = raw ? parseFloat(raw) : 0;
        const parsedDur = rawDur ? parseFloat(rawDur) : 0;
        if (parsedDur > 30 && parsed >= parsedDur - 15) return 0;
        return Number.isFinite(parsed) && parsed > 5 ? parsed : 0;
      } catch {
        return 0;
      }
    },
    [initialTimeSec]
  );

  const captureFreezeFrame = useCallback(() => {
    const curVid = videoRef.current;
    const canvas = freezeCanvasRef.current;
    if (!curVid || !canvas || curVid.videoWidth <= 0 || curVid.videoHeight <= 0) return false;
    try {
      canvas.width = curVid.videoWidth;
      canvas.height = curVid.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return false;
      ctx.drawImage(curVid, 0, 0, canvas.width, canvas.height);
      return true;
    } catch {
      return false;
    }
  }, []);

  // Direct stream attachment helper (handles both muxed MP4 and high-res video + separate audio)
  // Supports off-screen staging + frozen-frame canvas overlay + per-switch rollback on error/stall.
  const attachDirectQuality = useCallback(
    async (
      q: QualityOption,
      resumeAtSec?: number,
      dataOverride?: VideoStreamPayload | null,
      opts?: { seamless?: boolean; isRollback?: boolean }
    ): Promise<boolean> => {
      const vid = videoRef.current;
      const aud = audioRef.current;
      const vData = dataOverride || videoDataRef.current;
      if (!vid || !vData) return false;

      const myNonce = ++switchNonceRef.current;
      stagingCleanupRef.current?.();
      stagingCleanupRef.current = null;
      switchListenersCleanupRef.current?.();
      switchListenersCleanupRef.current = null;
      clearStartupWatchdog();

      const audioUrl = vData.bestAudioUrl
        ? proxySameOriginUrl(vData.bestAudioUrl)
        : `/api/invidious/latest_version?id=${encodeURIComponent(videoId)}&itag=140&local=true`;
      const streamSrc = qualityStreamUrl(q, videoId);

      const isMidPlaybackSwitch = Boolean(
        opts?.seamless && playbackStartedRef.current && vid.videoWidth > 0 && !opts?.isRollback
      );
      const reuseAudio =
        !q.hasAudio &&
        needsSeparateAudioRef.current &&
        activeAudioUrlRef.current === audioUrl &&
        Boolean(aud && aud.readyState >= 2);

      // 1. Pre-stage high-res / candidate streams off-screen while live playback continues uninterrupted
      if (isMidPlaybackSwitch) {
        const staging = probeDirectStreamReady(
          streamSrc,
          !q.hasAudio && !reuseAudio ? audioUrl : null,
          vid.currentTime,
          10000
        );
        stagingCleanupRef.current = staging.cancel;
        const stagedOk = await staging.promise;
        if (stagingCleanupRef.current === staging.cancel) {
          stagingCleanupRef.current = null;
        }
        if (switchNonceRef.current !== myNonce) {
          return false;
        }
        if (!stagedOk) {
          failedDirectIdsRef.current.add(q.id);
          failedDirectIdsRef.current.add(String(q.height));
          return false;
        }
      }

      const curVid = videoRef.current;
      const curAud = audioRef.current;
      if (!curVid || switchNonceRef.current !== myNonce) return false;

      const prevQuality = activeQualityRef.current;
      const wasPlaying = isMidPlaybackSwitch ? (!curVid.paused || isSwitchingQualityRef.current) : autoplayRef.current;
      const swapTime = isMidPlaybackSwitch
        ? curVid.currentTime || 0
        : resumeAtSec !== undefined
          ? resumeAtSec
          : curVid.currentTime || 0;

      // 2. Snapshot current video frame so there is zero black screen during load/seek
      if (isMidPlaybackSwitch) {
        captureFreezeFrame();
        isSwitchingQualityRef.current = true;
        setIsSwitchingQuality(true);
      } else {
        setIsBuffering(true);
      }

      // If transitioning out of Shaka DASH into direct playback, tear down Shaka only after staging succeeded
      if (shakaPlayerRef.current) {
        const oldShaka = shakaPlayerRef.current;
        shakaPlayerRef.current = null;
        await oldShaka.destroy().catch(() => {});
        if (switchNonceRef.current !== myNonce) {
          isSwitchingQualityRef.current = false;
          setIsSwitchingQuality(false);
          setIsBuffering(false);
          return false;
        }
      }

      lastQualitySwitchRef.current = Date.now();
      usingProgressiveRef.current = true;
      setActiveHeight(q.height || 360);
      setErrorMsg(null);

      const needsAudio = Boolean(!q.hasAudio && audioUrl);
      if (needsAudio) {
        needsSeparateAudioRef.current = true;
        setNeedsSeparateAudio(true);
        setBestAudioUrl(audioUrl);
        curVid.muted = true;
        if (curAud) {
          if (reuseAudio) {
            if (!curAud.paused) curAud.pause();
          } else {
            activeAudioUrlRef.current = audioUrl;
            curAud.src = audioUrl;
            curAud.volume = isMutedRef.current ? 0 : volumeRef.current;
            curAud.muted = isMutedRef.current;
            curAud.playbackRate = playbackRateRef.current;
            curAud.load();
          }
        }
      } else {
        needsSeparateAudioRef.current = false;
        setNeedsSeparateAudio(false);
        activeAudioUrlRef.current = '';
        curVid.muted = isMutedRef.current;
        curVid.volume = volumeRef.current;
        if (curAud) {
          curAud.pause();
          curAud.removeAttribute('src');
          curAud.load();
        }
      }

      return await new Promise<boolean>((resolve) => {
        let settled = false;
        let resumeStarted = false;
        let vidSeekApplied = swapTime <= 0.25;
        let audSeekApplied = !needsAudio || !curAud || reuseAudio || swapTime <= 0.25;
        let revealTimer: ReturnType<typeof setTimeout> | null = null;
        let rvfcId: number | null = null;

        const detachListeners = () => {
          if (revealTimer) {
            clearTimeout(revealTimer);
            revealTimer = null;
          }
          if (rvfcId !== null && typeof (curVid as any).cancelVideoFrameCallback === 'function') {
            try {
              (curVid as any).cancelVideoFrameCallback(rvfcId);
            } catch {
              // ignore
            }
            rvfcId = null;
          }
          curVid.removeEventListener('loadedmetadata', onVidMeta);
          curVid.removeEventListener('loadeddata', tryResumeAndReveal);
          curVid.removeEventListener('canplay', tryResumeAndReveal);
          curVid.removeEventListener('seeked', tryResumeAndReveal);
          curVid.removeEventListener('error', onTransitionError);
          if (curAud) {
            curAud.removeEventListener('loadedmetadata', onAudMeta);
            curAud.removeEventListener('loadeddata', tryResumeAndReveal);
            curAud.removeEventListener('canplay', tryResumeAndReveal);
            curAud.removeEventListener('seeked', tryResumeAndReveal);
            curAud.removeEventListener('error', onTransitionError);
          }
        };

        const finishTransition = (ok: boolean) => {
          if (settled) return;
          settled = true;
          detachListeners();
          if (switchListenersCleanupRef.current === abortListenerCleanup) {
            switchListenersCleanupRef.current = null;
          }
          clearStartupWatchdog();
          if (switchNonceRef.current === myNonce) {
            if (ok) {
              activeQualityRef.current = q;
              setDataLoaded(true);
            }
            isSwitchingQualityRef.current = false;
            setIsSwitchingQuality(false);
            setIsBuffering(false);
          }
          resolve(ok);
        };

        const abortListenerCleanup = () => {
          finishTransition(false);
        };
        switchListenersCleanupRef.current = abortListenerCleanup;

        const triggerRollback = (reason: string) => {
          if (settled || switchNonceRef.current !== myNonce) return;
          console.warn(`[PhimAI Player] Direct stream switch to ${q.height}p failed (${reason}); rolling back.`);
          failedDirectIdsRef.current.add(q.id);
          failedDirectIdsRef.current.add(String(q.height));
          finishTransition(false);

          const latestUrl = `/api/invidious/latest_version?id=${encodeURIComponent(videoId)}&itag=18&local=true`;
          const latest360: QualityOption = {
            id: 'latest_18',
            label: '360p',
            height: 360,
            itag: '18',
            url: latestUrl,
            hasAudio: true,
          };

          if (opts?.isRollback) {
            if (streamSrc !== latestUrl && !failedDirectIdsRef.current.has('latest_18')) {
              setActiveHeight(360);
              void attachDirectQuality(latest360, swapTime, vData, { isRollback: true });
              return;
            }
            if (!playbackStartedRef.current) {
              setIsBuffering(false);
              setErrorMsg('Luồng video gặp gián đoạn, vui lòng thử lại.');
            }
            return;
          }

          const listMuxedFallback = qualitiesRef.current.find(
            (opt) =>
              opt.hasAudio &&
              opt.id !== q.id &&
              !failedDirectIdsRef.current.has(opt.id) &&
              qualityStreamUrl(opt, videoId) !== streamSrc
          );

          const fallbackTarget =
            prevQuality &&
            prevQuality.id !== q.id &&
            !failedDirectIdsRef.current.has(prevQuality.id) &&
            qualityStreamUrl(prevQuality, videoId) !== streamSrc
              ? prevQuality
              : listMuxedFallback || (streamSrc !== latestUrl && !failedDirectIdsRef.current.has('latest_18') ? latest360 : null);

          if (!fallbackTarget) {
            if (!playbackStartedRef.current) {
              setIsBuffering(false);
              setErrorMsg('Luồng video gặp gián đoạn, vui lòng thử lại.');
            }
            return;
          }

          setActiveHeight(fallbackTarget.height || 360);
          if (qualityModeRef.current === 'manual') {
            setSelectedHeight(prevQuality ? prevQuality.height : 0);
          }
          void attachDirectQuality(fallbackTarget, swapTime, vData, { isRollback: true });
        };

        const seekMediaSafe = (el: HTMLMediaElement) => {
          if (swapTime <= 0.25) return;
          try {
            const dur = Number.isFinite(el.duration) && el.duration > 1 ? el.duration : 0;
            const target = dur > 0 ? Math.min(swapTime, dur - 1) : swapTime;
            if (Math.abs(el.currentTime - target) > 0.25) {
              el.currentTime = target;
            }
          } catch {
            // ignore
          }
        };

        const onVidMeta = () => {
          if (settled || switchNonceRef.current !== myNonce) return;
          vidSeekApplied = true;
          seekMediaSafe(curVid);
          tryResumeAndReveal();
        };

        const onAudMeta = () => {
          if (settled || switchNonceRef.current !== myNonce || !curAud) return;
          audSeekApplied = true;
          seekMediaSafe(curAud);
          tryResumeAndReveal();
        };

        const onTransitionError = () => {
          triggerRollback('media error');
        };

        const tryResumeAndReveal = () => {
          if (settled || resumeStarted || switchNonceRef.current !== myNonce) return;
          const vidReady = vidSeekApplied && curVid.readyState >= 2 && curVid.videoWidth > 0 && !curVid.seeking;
          const audReady =
            !needsAudio || !curAud || (audSeekApplied && curAud.readyState >= 2 && !curAud.seeking);
          if (!vidReady || !audReady) return;

          resumeStarted = true;
          if (needsAudio && curAud && Math.abs(curAud.currentTime - curVid.currentTime) > 0.15) {
            try {
              curAud.currentTime = curVid.currentTime;
            } catch {
              // ignore
            }
          }

          if (wasPlaying) {
            curVid.play().catch(() => {});
            if (needsAudio && curAud) curAud.play().catch(() => {});
            // Reveal live <video> as soon as its first frame paints (or after 300ms max) to avoid black flash
            if (typeof (curVid as any).requestVideoFrameCallback === 'function') {
              rvfcId = (curVid as any).requestVideoFrameCallback(() => finishTransition(true));
            }
            revealTimer = setTimeout(() => finishTransition(true), 300);
          } else {
            revealTimer = setTimeout(() => finishTransition(true), 80);
          }
        };

        curVid.addEventListener('loadedmetadata', onVidMeta);
        curVid.addEventListener('loadeddata', tryResumeAndReveal);
        curVid.addEventListener('canplay', tryResumeAndReveal);
        curVid.addEventListener('seeked', tryResumeAndReveal);
        curVid.addEventListener('error', onTransitionError);
        if (needsAudio && curAud && !reuseAudio) {
          curAud.addEventListener('loadedmetadata', onAudMeta);
          curAud.addEventListener('loadeddata', tryResumeAndReveal);
          curAud.addEventListener('canplay', tryResumeAndReveal);
          curAud.addEventListener('seeked', tryResumeAndReveal);
          curAud.addEventListener('error', onTransitionError);
        }

        curVid.src = streamSrc;
        curVid.playbackRate = playbackRateRef.current;
        curVid.load();

        // Guardrail on every direct transition: tolerate cold Companion handshakes on initial load,
        // and roll back cleanly if frames don't decode/resume within the deadline.
        const watchdogMs = isMidPlaybackSwitch ? 8000 : 14000;
        startupWatchdogRef.current = setTimeout(() => {
          if (!settled && switchNonceRef.current === myNonce) {
            triggerRollback(`timeout ${Math.round(watchdogMs / 1000)}s`);
          }
        }, watchdogMs);
      });
    },
    [videoId, captureFreezeFrame, clearStartupWatchdog]
  );

  // Main stream loader when videoId changes
  useEffect(() => {
    if (!videoId) return;
    if (lastLoadedVideoIdRef.current === videoId && (videoRef.current?.src || shakaPlayerRef.current)) {
      return;
    }
    lastLoadedVideoIdRef.current = videoId;

    let cancelled = false;
    const vid = videoRef.current;
    const aud = audioRef.current;
    if (!vid) return;

    usingProgressiveRef.current = false;
    playbackStartedRef.current = false;
    isSwitchingQualityRef.current = false;
    setIsSwitchingQuality(false);
    switchNonceRef.current += 1;
    stagingCleanupRef.current?.();
    stagingCleanupRef.current = null;
    switchListenersCleanupRef.current?.();
    switchListenersCleanupRef.current = null;
    activeQualityRef.current = null;
    activeAudioUrlRef.current = '';
    failedDirectIdsRef.current.clear();
    lastShakaTierRef.current = 0;
    stallTimestampsRef.current = [];
    setDataLoaded(false);
    setErrorMsg(null);
    setIsBuffering(true);
    setQualityMode('auto');
    setSelectedHeight(0);
    setPreviewHasFrame(false);
    setPreviewEnabled(false);
    setScrubTime(null);
    setIsScrubbing(false);
    lastProbeAtRef.current = 0;
    pendingPreviewTimeRef.current = null;
    lastScrubTimeRef.current = null;
    setCurrentTime(getSavedPosition(videoId));

    async function initStream(attempt = 1) {
      try {
        const videoData = await fetchVideoStream(videoId);
        if (cancelled) return;
        if (!videoData) {
          throw new Error('Không lấy được luồng phát');
        }
        if (videoData.unavailable) {
          clearStartupWatchdog();
          setIsBuffering(false);
          setErrorMsg(
            videoData.unavailableReason ||
              'Video gốc đã bị kênh chủ quản đặt riêng tư (Private) hoặc gỡ bỏ.'
          );
          return;
        }
        videoDataRef.current = videoData;
        if (videoData.lengthSeconds && videoData.lengthSeconds > 0) {
          setDuration(videoData.lengthSeconds);
        }

        if (Array.isArray(videoData.captions)) {
          setCaptions(
            videoData.captions.map((c) => ({
              label: c.label || c.languageCode || 'Phụ đề',
              languageCode: c.languageCode || 'vi',
              url: proxySameOriginUrl(c.url),
            }))
          );
        } else {
          setCaptions([]);
        }

        const audioUrl = videoData.bestAudioUrl
          ? proxySameOriginUrl(videoData.bestAudioUrl)
          : `/api/invidious/latest_version?id=${encodeURIComponent(videoId)}&itag=140&local=true`;
        setBestAudioUrl(audioUrl);

        const qualList = buildQualityList(videoData);
        setQualities(qualList);

        const vidEl = videoRef.current;
        if (!vidEl || cancelled) return;

        const resumePos = getSavedPosition(videoId);

        const canDecodeType = (mime?: string) => {
          if (!mime) return true;
          try {
            const res = vidEl.canPlayType(mime);
            return res === 'probably' || res === 'maybe';
          } catch {
            return true;
          }
        };

        // Determine target initial resolution from measured bandwidth (defaults up to 1080p/1440p/2160p on fast internet!)
        const recommendedMax = bandwidthMonitor.getScreenCapHeight();
        const bestInitial = pickBestAutoQuality(
          qualList,
          recommendedMax,
          canDecodeType,
          bandwidthMonitor.getEstimatedMbps()
        );

        // 1. Fast start: a muxed progressive stream needs ONE request to reach the first frame, whereas
        // DASH needs manifest + init segments + media segments in series (each one a slow round trip through
        // the video backend). Start with the muxed stream and let the auto-upgrade loop raise the resolution
        // from measured bandwidth. Shaka DASH/HLS is only used when explicitly preferred.
        const dashManifest = videoData.dashUrl ? proxySameOriginUrl(videoData.dashUrl) : '';
        const hlsManifest = videoData.hlsUrl ? proxySameOriginUrl(videoData.hlsUrl) : '';
        const hasMuxedStart = qualList.some((q) => q.hasAudio);

        if ((dashManifest || hlsManifest) && !(START_PROGRESSIVE_FIRST && hasMuxedStart)) {
          try {
            const shakaImport: any = await import('shaka-player');
            const shaka = shakaImport?.default || shakaImport;
            if (!cancelled && shaka?.Player?.isBrowserSupported()) {
              shaka.polyfill?.installAll?.();
              if (shakaPlayerRef.current) {
                await shakaPlayerRef.current.destroy().catch(() => {});
                shakaPlayerRef.current = null;
              }

              const player = new shaka.Player();
              await player.attach(vidEl);
              shakaPlayerRef.current = player;

              // Ensure every MPD segment / URI stays strictly same-origin /api/invidious/...
              player.getNetworkingEngine()?.registerRequestFilter((_type: any, request: any) => {
                if (Array.isArray(request?.uris)) {
                  request.uris = request.uris.map((u: string) => proxySameOriginUrl(u));
                }
              });

              player.getNetworkingEngine()?.registerResponseFilter((_type: any, response: any) => {
                if (response?.data?.byteLength && response.timeMs) {
                  bandwidthMonitor.recordTransfer(response.data.byteLength, response.timeMs);
                }
              });

              // Start Shaka's ABR from the measured (persisted) bandwidth without wiping startup buffers
              const estBps = Math.max(1_200_000, Math.round(bandwidthMonitor.getEstimatedMbps() * 1_000_000));
              player.configure({
                abr: {
                  enabled: true,
                  defaultBandwidthEstimate: estBps,
                  switchInterval: 6,
                  minTimeToSwitch: 6,
                  bandwidthUpgradeTarget: 0.78,
                  bandwidthDowngradeTarget: 0.9,
                  clearBufferSwitch: false,
                  advanced: {
                    minBytes: 128_000,
                    minTotalBytes: 300_000,
                  },
                },
                mediaSource: {
                  codecSwitchingStrategy: shaka.config?.CodecSwitchingStrategy?.SMOOTH || 'smooth',
                },
                streaming: {
                  rebufferingGoal: 1.5,
                  bufferingGoal: 20,
                  bufferBehind: 30,
                  retryParameters: {
                    maxAttempts: 2,
                    baseDelay: 350,
                    backoffFactor: 1.5,
                    timeout: 12000,
                  },
                },
              });

              const updateActiveVariantHeight = (fromAdaptation = false) => {
                try {
                  const tracks = player.getVariantTracks?.() || [];
                  const active = tracks.find((t: any) => t.active);
                  const tier = active
                    ? normalizeVideoTier(active.width, active.height)
                    : vidEl.videoHeight > 0
                      ? normalizeVideoTier(vidEl.videoWidth, vidEl.videoHeight)
                      : 0;
                  if (tier > 0) {
                    setActiveHeight(tier);
                    if (
                      fromAdaptation &&
                      playbackStartedRef.current &&
                      lastShakaTierRef.current > 0 &&
                      tier > lastShakaTierRef.current
                    ) {
                      showQualityToast(
                        `↑ Tự động nâng lên ${tier}p (~${Math.round(bandwidthMonitor.getEstimatedMbps())} Mbps)`
                      );
                    }
                    lastShakaTierRef.current = tier;
                  }
                } catch {
                  // ignore
                }
              };

              player.addEventListener('adaptation', () => updateActiveVariantHeight(true));
              player.addEventListener('variantchanged', () => updateActiveVariantHeight(false));
              player.addEventListener('error', async (ev: any) => {
                const detail = ev?.detail;
                // Shaka severity 2 = CRITICAL
                if (cancelled || detail?.severity !== 2 || shakaPlayerRef.current !== player) return;
                console.warn('[PhimAI Player] Shaka critical runtime error -> switching to direct progressive:', detail);
                const resumeAt = vidEl.currentTime || resumePos;
                shakaPlayerRef.current = null;
                await player.destroy().catch(() => {});
                const muxed =
                  qualList.find((q) => q.hasAudio && q.height >= 720) ||
                  qualList.find((q) => q.hasAudio) || {
                    id: '18',
                    label: '360p',
                    height: 360,
                    itag: '18',
                    url: `/api/invidious/latest_version?id=${encodeURIComponent(videoId)}&itag=18&local=true`,
                    hasAudio: true,
                  };
                void attachDirectQuality(muxed, resumeAt, videoData);
              });

              const manifestUrl = dashManifest || hlsManifest;
              await Promise.race([
                player.load(manifestUrl, resumePos > 0 ? resumePos : undefined),
                new Promise<never>((_, reject) =>
                  setTimeout(() => reject(new Error('Shaka manifest/segment timeout (14s)')), 14000)
                ),
              ]);
              if (cancelled) return;

              // Prefer non-dub original / Vietnamese audio track instead of arbitrary language
              try {
                const audioRoles = player.getAudioLanguagesAndRoles?.() || [];
                const origTrack =
                  audioRoles.find((a: any) => a.language === 'vi') ||
                  audioRoles.find((a: any) => Array.isArray(a.roles) && a.roles.includes('main')) ||
                  audioRoles.find((a: any) => a.language === 'en') ||
                  audioRoles[0];
                if (origTrack?.language) {
                  player.selectAudioLanguage(origTrack.language, origTrack.roles?.[0]);
                }
              } catch {
                // ignore
              }

              // Sync discovered Shaka variant tiers into Quality menu using normalized portrait/landscape tier
              const vTracks = player.getVariantTracks?.() || [];
              if (Array.isArray(vTracks) && vTracks.length > 0) {
                const mergedHeights = new Set(qualList.map((q) => q.height));
                for (const t of vTracks) {
                  const tier = normalizeVideoTier(t.width, t.height);
                  if (tier >= 144 && !mergedHeights.has(tier)) {
                    mergedHeights.add(tier);
                    qualList.push({
                      id: `shaka_${tier}`,
                      label: formatQualityLabel(tier, t.frameRate),
                      height: tier,
                      fps: t.frameRate,
                      bitrate: t.bandwidth,
                      hasAudio: true,
                    });
                  }
                }
                qualList.sort((a, b) => b.height - a.height || (b.bitrate || 0) - (a.bitrate || 0));
                setQualities([...qualList]);
              }

              usingProgressiveRef.current = false;
              setNeedsSeparateAudio(false);
              updateActiveVariantHeight(false);
              if (autoplay) {
                vidEl.play().catch(() => {});
              }
              setIsBuffering(false);

              // Verify Shaka actually decodes frames within 12s; otherwise drop to muxed MP4
              clearStartupWatchdog();
              startupWatchdogRef.current = setTimeout(async () => {
                if (cancelled || playbackStartedRef.current || vidEl.readyState >= 2) return;
                console.warn('[PhimAI Player] Shaka decoded-frame watchdog triggered -> switching to progressive MP4');
                if (shakaPlayerRef.current === player) {
                  shakaPlayerRef.current = null;
                }
                await player.destroy().catch(() => {});
                const muxed =
                  qualList.find((q) => q.hasAudio && q.height >= 720) ||
                  qualList.find((q) => q.hasAudio) || {
                    id: '18',
                    label: '360p',
                    height: 360,
                    itag: '18',
                    url: `/api/invidious/latest_version?id=${encodeURIComponent(videoId)}&itag=18&local=true`,
                    hasAudio: true,
                  };
                void attachDirectQuality(muxed, resumePos, videoData);
              }, 12000);
              return;
            }
          } catch (shakaErr) {
            console.warn('[PhimAI Player] Shaka ABR fallback to direct stream:', shakaErr);
            if (shakaPlayerRef.current) {
              await shakaPlayerRef.current.destroy().catch(() => {});
              shakaPlayerRef.current = null;
            }
          }
        }

        if (cancelled) return;

        // 2. If DASH timed out or failed, prefer a muxed progressive stream (fast start + guaranteed audio)
        // or highest playable quality with 4.5s watchdog protection
        const muxedFallback =
          qualList.find((q) => q.hasAudio && q.height >= 720) ||
          qualList.find((q) => q.hasAudio) ||
          bestInitial;
        if (muxedFallback) {
          attachDirectQuality(muxedFallback, resumePos, videoData);
          return;
        }

        // 3. Resilient MP4 Stream fallback
        attachDirectQuality(
          {
            id: '18',
            label: '360p',
            height: 360,
            itag: '18',
            url: `/api/invidious/latest_version?id=${encodeURIComponent(videoId)}&itag=18&local=true`,
            hasAudio: true,
          },
          resumePos,
          videoData
        );
      } catch {
        if (cancelled) return;
        if (attempt < 2) {
          setTimeout(() => {
            if (!cancelled) void initStream(attempt + 1);
          }, 900);
          return;
        }
        // Final emergency direct fallback even if JSON failed
        const vidEl = videoRef.current;
        if (vidEl) {
          usingProgressiveRef.current = true;
          setNeedsSeparateAudio(false);
          vidEl.src = `/api/invidious/latest_version?id=${encodeURIComponent(videoId)}&itag=18&local=true`;
          vidEl.load();
          if (autoplay) vidEl.play().catch(() => {});
          setIsBuffering(false);
        } else {
          setErrorMsg('Không thể tải luồng phát video.');
          setIsBuffering(false);
        }
      }
    }

    void initStream();

    return () => {
      cancelled = true;
      switchNonceRef.current += 1;
      stagingCleanupRef.current?.();
      stagingCleanupRef.current = null;
      switchListenersCleanupRef.current?.();
      switchListenersCleanupRef.current = null;
      isSwitchingQualityRef.current = false;
      clearStartupWatchdog();
      if (shakaPlayerRef.current) {
        shakaPlayerRef.current.destroy().catch(() => {});
        shakaPlayerRef.current = null;
      }
      if (vid) {
        vid.pause();
        vid.removeAttribute('src');
        vid.load();
      }
      if (aud) {
        aud.pause();
        aud.removeAttribute('src');
        aud.load();
      }
    };
  }, [videoId]);

  // Handle external timestamp jumps (from Timestamped Comments or Episode seeks)
  useEffect(() => {
    if (!externalSeekSec || !videoRef.current) return;
    const vid = videoRef.current;
    const aud = audioRef.current;
    const target = Math.max(0, externalSeekSec.sec);
    vid.currentTime = target;
    if (needsSeparateAudio && aud) {
      aud.currentTime = target;
    }
    setCurrentTime(target);
    if (vid.paused) {
      vid.play().catch(() => {});
    }
  }, [externalSeekSec, needsSeparateAudio]);

  // Synchronized <video> + <audio> listeners + PLL Drift Steering + Auto-Bandwidth Downgrade on Stall
  useEffect(() => {
    const vid = videoRef.current;
    const aud = audioRef.current;
    if (!vid) return;

    const onPlay = () => {
      setIsPlaying(true);
      setMediaSessionPlaybackState('playing');
      if (Number.isFinite(vid.duration) && vid.duration > 0) {
        updateMediaSessionPosition(vid.duration, vid.playbackRate || playbackRate || 1, vid.currentTime);
      }
      if (needsSeparateAudio && aud && aud.paused) {
        if (Math.abs(aud.currentTime - vid.currentTime) > 0.25) {
          aud.currentTime = vid.currentTime;
        }
        aud.play().catch(() => {});
      }
    };

    const onPause = () => {
      // Switching direct video src triggers a transient pause inside vid.load(); ignore so playback resumes.
      if (isSwitchingQualityRef.current) return;
      setIsPlaying(false);
      setMediaSessionPlaybackState('paused');
      if (Number.isFinite(vid.duration) && vid.duration > 0) {
        updateMediaSessionPosition(vid.duration, vid.playbackRate || playbackRate || 1, vid.currentTime);
      }
      if (aud && !aud.paused) {
        aud.pause();
      }
    };

    const handleVidTimeUpdate = () => {
      if (isSwitchingQualityRef.current) return;
      const cur = vid.currentTime;
      setCurrentTime(cur);
      onTimeUpdate?.(cur);

      if (Number.isFinite(vid.duration) && vid.duration > 0 && Math.floor(cur) !== Math.floor(cur - 0.3)) {
        updateMediaSessionPosition(vid.duration, vid.playbackRate || playbackRate || 1, cur);
      }

      // Persist playback progress locally for home card red progress bars
      if (videoId && vid.duration > 30 && Math.floor(cur) % 4 === 0) {
        try {
          localStorage.setItem(`phimai_pos_${videoId}`, String(Math.floor(cur)));
          localStorage.setItem(`phimai_dur_${videoId}`, String(Math.floor(vid.duration)));
        } catch {
          // ignore
        }
      }

      // PLL Soft PlaybackRate Steering for paired High-Res <video> + <audio>
      if (needsSeparateAudio && aud && !aud.paused && !vid.paused) {
        const drift = vid.currentTime - aud.currentTime;
        if (Math.abs(drift) > 1.2) {
          vid.currentTime = aud.currentTime;
          vid.playbackRate = playbackRate;
        } else if (drift > 0.05) {
          vid.playbackRate = Math.max(0.25, playbackRate * 0.95);
        } else if (drift < -0.05) {
          vid.playbackRate = playbackRate * 1.05;
        } else if (vid.playbackRate !== playbackRate) {
          vid.playbackRate = playbackRate;
        }
      }

      // Buffered bar update
      if (vid.buffered.length > 0) {
        for (let i = 0; i < vid.buffered.length; i++) {
          if (vid.buffered.start(i) <= cur && cur <= vid.buffered.end(i)) {
            setBuffered(vid.buffered.end(i));
            break;
          }
        }
      }
    };

    const onDurationChange = () => {
      if (Number.isFinite(vid.duration) && vid.duration > 0) {
        setDuration(vid.duration);
        updateMediaSessionPosition(vid.duration, vid.playbackRate || playbackRate || 1, vid.currentTime);
      }
    };

    const onWaiting = () => {
      if (isSwitchingQualityRef.current) return;
      setIsBuffering(true);
      if (needsSeparateAudio && aud && !aud.paused) aud.pause();
      if (!playbackStartedRef.current) return;

      // Auto-step down quality if direct playback stalls twice after playback started
      if (usingProgressiveRef.current && qualityMode === 'auto' && qualities.length > 1) {
        const now = Date.now();
        stallTimestampsRef.current = stallTimestampsRef.current.filter((t) => now - t < 18_000);
        stallTimestampsRef.current.push(now);
        if (stallTimestampsRef.current.length >= 2) {
          stallTimestampsRef.current = [];
          bandwidthMonitor.reportStall();
          const lower =
            qualities.find((q) => q.height < activeHeight && q.hasAudio) ||
            qualities.find((q) => q.height < activeHeight && q.height >= 360);
          if (lower) {
            void attachDirectQuality(lower, vid.currentTime, undefined, { seamless: true });
            showQualityToast(`↓ Giảm xuống ${lower.height}p do mạng chậm`);
          }
        }
      }
    };

    const onPlaying = () => {
      clearStartupWatchdog();
      playbackStartedRef.current = true;
      setIsBuffering(false);
      setDataLoaded(true);
      setMediaSessionPlaybackState('playing');
      if (Number.isFinite(vid.duration) && vid.duration > 0) {
        updateMediaSessionPosition(vid.duration, vid.playbackRate || playbackRate || 1, vid.currentTime);
      }
      if (needsSeparateAudio && aud && aud.paused && !vid.paused) {
        if (Math.abs(aud.currentTime - vid.currentTime) > 0.2) {
          aud.currentTime = vid.currentTime;
        }
        aud.play().catch(() => {});
      }
    };

    const onCanPlay = () => {
      clearStartupWatchdog();
      setIsBuffering(false);
      setDataLoaded(true);
    };

    const onEnded = () => {
      if (isLooping) {
        vid.currentTime = 0;
        if (needsSeparateAudio && aud) aud.currentTime = 0;
        vid.play().catch(() => {});
      } else {
        try {
          if (videoId) localStorage.removeItem(`phimai_pos_${videoId}`);
        } catch {
          // ignore
        }
        onVideoEnd?.();
      }
    };

    const onVideoError = () => {
      // Mid-switch failures are rolled back by attachDirectQuality's own error handler
      if (isSwitchingQualityRef.current) return;
      // If high-res adaptive stream fails cleanly, step down to progressive stream
      if (!usingProgressiveRef.current && shakaPlayerRef.current) return;
      if (usingProgressiveRef.current && !playbackStartedRef.current) {
        const latestFallbackUrl = `/api/invidious/latest_version?id=${encodeURIComponent(videoId)}&itag=18&local=true`;
        if (!vid.src.includes('latest_version')) {
          void attachDirectQuality(
            {
              id: '18',
              label: '360p',
              height: 360,
              itag: '18',
              url: latestFallbackUrl,
              hasAudio: true,
            },
            vid.currentTime
          );
          return;
        }
      }
      setIsBuffering(false);
      if (!playbackStartedRef.current) {
        setErrorMsg('Luồng video gặp gián đoạn, vui lòng thử lại.');
      }
    };

    vid.addEventListener('play', onPlay);
    vid.addEventListener('pause', onPause);
    vid.addEventListener('timeupdate', handleVidTimeUpdate);
    vid.addEventListener('durationchange', onDurationChange);
    vid.addEventListener('waiting', onWaiting);
    vid.addEventListener('playing', onPlaying);
    vid.addEventListener('canplay', onCanPlay);
    vid.addEventListener('loadeddata', onCanPlay);
    vid.addEventListener('ended', onEnded);
    vid.addEventListener('error', onVideoError);

    return () => {
      vid.removeEventListener('play', onPlay);
      vid.removeEventListener('pause', onPause);
      vid.removeEventListener('timeupdate', handleVidTimeUpdate);
      vid.removeEventListener('durationchange', onDurationChange);
      vid.removeEventListener('waiting', onWaiting);
      vid.removeEventListener('playing', onPlaying);
      vid.removeEventListener('canplay', onCanPlay);
      vid.removeEventListener('loadeddata', onCanPlay);
      vid.removeEventListener('ended', onEnded);
      vid.removeEventListener('error', onVideoError);
    };
  }, [
    videoId,
    needsSeparateAudio,
    playbackRate,
    isLooping,
    onVideoEnd,
    onTimeUpdate,
    qualityMode,
    qualities,
    activeHeight,
    attachDirectQuality,
    showQualityToast,
  ]);

  // Auto-raise resolution on direct (non-DASH) streams: while playback is smooth, measure real
  // throughput with a short download probe and switch up as soon as a higher quality fits.
  // (DASH via Shaka already adapts up and down by itself per segment.)
  useEffect(() => {
    if (compact || qualityMode !== 'auto' || !isPlaying || qualities.length < 2) return;
    let cancelled = false;
    let busy = false;

    const canDecode = (mime?: string) => !mime || videoRef.current?.canPlayType(mime) !== '';

    const check = async () => {
      const vid = videoRef.current;
      if (cancelled || busy || !vid || vid.paused || isSwitchingQualityRef.current) return;
      if (shakaPlayerRef.current || !usingProgressiveRef.current || !playbackStartedRef.current) return;

      const now = Date.now();
      if (now - lastQualitySwitchRef.current < UPGRADE_SWITCH_GAP_MS) return;
      if (now - lastProbeAtRef.current < UPGRADE_PROBE_GAP_MS) return;
      if (stallTimestampsRef.current.some((t) => now - t < UPGRADE_STALL_QUIET_MS)) return;
      if (bufferedAhead(vid) < 8) return;

      const eligible = qualities.filter(
        (q) => !failedDirectIdsRef.current.has(q.id) && !failedDirectIdsRef.current.has(String(q.height))
      );
      if (eligible.length === 0) return;

      // Best quality the screen allows (bandwidth is checked after probing); nothing to do if already there.
      const cap = bandwidthMonitor.getScreenCapHeight();
      const top = pickBestAutoQuality(eligible, cap, canDecode);
      if (!top || top.height <= activeHeight) return;

      busy = true;
      lastProbeAtRef.current = now;
      try {
        const measured = await bandwidthMonitor.probe(qualityStreamUrl(top, videoId));
        if (cancelled || measured === null) return;
        const target = pickBestAutoQuality(eligible, cap, canDecode, bandwidthMonitor.getEstimatedMbps());
        const cur = videoRef.current;
        if (target && cur && target.height > activeHeight && !isSwitchingQualityRef.current) {
          const ok = await attachDirectQuality(target, cur.currentTime, undefined, { seamless: true });
          if (ok && lastLoadedVideoIdRef.current === videoId) {
            showQualityToast(
              `↑ Tự động nâng lên ${target.height}p (~${Math.round(bandwidthMonitor.getEstimatedMbps())} Mbps)`
            );
          }
        }
      } finally {
        busy = false;
      }
    };

    const timer = setInterval(() => void check(), UPGRADE_CHECK_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [compact, qualityMode, isPlaying, qualities, activeHeight, videoId, attachDirectQuality, showQualityToast]);

  // Controls auto-hide
  const resetControlsTimer = useCallback(
    (delay = 2500) => {
      if (compact) return;
      setShowControls(true);
      if (hideControlsTimer.current) {
        clearTimeout(hideControlsTimer.current);
      }
      if (isPlaying && !showSettings) {
        hideControlsTimer.current = setTimeout(() => {
          setShowControls(false);
        }, delay);
      }
    },
    [compact, isPlaying, showSettings]
  );

  useEffect(() => {
    resetControlsTimer(2500);
    return () => {
      if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    };
  }, [isPlaying, showSettings, resetControlsTimer]);

  const togglePlay = useCallback(() => {
    const vid = videoRef.current;
    const aud = audioRef.current;
    if (!vid) return;
    if (vid.paused) {
      vid.play().catch(() => {});
      if (needsSeparateAudio && aud) aud.play().catch(() => {});
    } else {
      vid.pause();
      if (aud) aud.pause();
    }
    resetControlsTimer();
  }, [needsSeparateAudio, resetControlsTimer]);

  const handleSeek = useCallback(
    (seconds: number) => {
      const vid = videoRef.current;
      const aud = audioRef.current;
      if (!vid) return;
      const dur = duration || vid.duration || 0;
      const next = Math.max(0, dur > 0 ? Math.min(dur, seconds) : seconds);
      vid.currentTime = next;
      if (needsSeparateAudio && aud) aud.currentTime = next;
      setCurrentTime(next);
      resetControlsTimer();
    },
    [duration, needsSeparateAudio, resetControlsTimer]
  );

  const handleQualitySelect = useCallback(
    (mode: 'auto' | 'manual', q?: QualityOption) => {
      setShowSettings(false);
      setQualityMode(mode);

      const player = shakaPlayerRef.current;
      if (mode === 'auto') {
        setSelectedHeight(0);
        if (player) {
          try {
            player.configure({ abr: { enabled: true } });
            const tracks = player.getVariantTracks?.() || [];
            const active = tracks.find((t: any) => t.active);
            if (active) {
              const tier = normalizeVideoTier(active.width, active.height);
              setActiveHeight(tier);
              lastShakaTierRef.current = tier;
            }
            return;
          } catch {
            // fallback
          }
        }
        const canDecode = (mime?: string) => !mime || videoRef.current?.canPlayType(mime) !== '';
        const eligible = qualities.filter(
          (opt) => !failedDirectIdsRef.current.has(opt.id) && !failedDirectIdsRef.current.has(String(opt.height))
        );
        const best = pickBestAutoQuality(
          eligible.length > 0 ? eligible : qualities,
          bandwidthMonitor.getScreenCapHeight(),
          canDecode,
          bandwidthMonitor.getEstimatedMbps()
        );
        if (best) {
          void attachDirectQuality(best, videoRef.current?.currentTime, undefined, { seamless: true });
        }
        return;
      }

      if (!q) return;
      const prevHeight = activeQualityRef.current?.height || activeHeight;
      setSelectedHeight(q.height);
      setActiveHeight(q.height);

      if (player) {
        try {
          const tracks = player.getVariantTracks?.() || [];
          const activeTrack = tracks.find((t: any) => t.active);
          const activeCodecPrefix = (activeTrack?.videoCodec || '').split('.')[0];
          const exactMatches = tracks.filter((t: any) => normalizeVideoTier(t.width, t.height) === q.height);
          const nearMatches =
            exactMatches.length > 0
              ? exactMatches
              : tracks.filter((t: any) => Math.abs(normalizeVideoTier(t.width, t.height) - q.height) <= 120);

          if (nearMatches.length > 0) {
            player.configure({ abr: { enabled: false } });
            const rankTrack = (t: any) => {
              const codec = (t.videoCodec || '').toLowerCase();
              let score = 0;
              if (activeCodecPrefix && codec.startsWith(activeCodecPrefix.toLowerCase())) score += 4;
              if (codec.startsWith('avc1')) score += 2;
              return score;
            };
            const sorted = [...nearMatches].sort(
              (a: any, b: any) => rankTrack(b) - rankTrack(a) || (b.bandwidth || 0) - (a.bandwidth || 0)
            );
            const match = sorted[0];
            lastShakaTierRef.current = q.height;
            // Clear buffered future beyond a 1.5s safe margin so currently decoded frames keep playing smoothly
            player.selectVariantTrack(match, true, 1.5);
            showQualityToast(`Đang chuyển sang ${q.height}p...`);
            return;
          }
          // Height only exists outside Shaka manifest: keep Shaka alive while pre-staging direct stream
          showQualityToast(`Đang chuyển sang ${q.height}p...`);
          void attachDirectQuality(q, undefined, undefined, { seamless: true }).then((ok) => {
            if (!ok) {
              setActiveHeight(activeQualityRef.current?.height || prevHeight);
              setSelectedHeight(activeQualityRef.current?.height || 0);
              if (shakaPlayerRef.current) setQualityMode('auto');
              showQualityToast(`Không thể chuyển ${q.height}p, giữ nguyên chất lượng hiện tại`);
            }
          });
          return;
        } catch {
          // fallback below
        }
      }

      showQualityToast(`Đang chuyển sang ${q.height}p...`);
      void attachDirectQuality(q, videoRef.current?.currentTime, undefined, { seamless: true }).then((ok) => {
        if (!ok) {
          setActiveHeight(activeQualityRef.current?.height || prevHeight);
          setSelectedHeight(activeQualityRef.current?.height || 0);
          showQualityToast(`Không thể chuyển ${q.height}p, giữ nguyên chất lượng hiện tại`);
        }
      });
    },
    [qualities, activeHeight, attachDirectQuality, showQualityToast]
  );

  const handleSpeedChange = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) videoRef.current.playbackRate = rate;
    if (audioRef.current) audioRef.current.playbackRate = rate;
    setShowSettings(false);
  };

  const handleVolumeChange = (nextVol: number) => {
    const v = Math.max(0, Math.min(1, nextVol));
    setVolume(v);
    setIsMuted(v === 0);
    if (needsSeparateAudio && audioRef.current) {
      audioRef.current.volume = v;
      audioRef.current.muted = v === 0;
    } else if (videoRef.current) {
      videoRef.current.volume = v;
      videoRef.current.muted = v === 0;
    }
  };

  const toggleMute = useCallback(() => {
    const nextMute = !(isMuted || volume === 0);
    setIsMuted(nextMute);
    if (needsSeparateAudio && audioRef.current) {
      audioRef.current.muted = nextMute;
    } else if (videoRef.current) {
      videoRef.current.muted = nextMute;
    }
  }, [isMuted, volume, needsSeparateAudio]);

  const activeFullscreen = isFullscreen || isCssFullscreen;

  useEffect(() => {
    const onFsChange = () => {
      const fsEl = document.fullscreenElement || (document as any).webkitFullscreenElement;
      const nextNative = Boolean(fsEl);
      setIsFullscreen(nextNative);
      if (nextNative) {
        wasNativeFsRef.current = true;
      } else if (wasNativeFsRef.current) {
        wasNativeFsRef.current = false;
        setIsCssFullscreen(false);
        setVerticalFillMode('contain');
        window.dispatchEvent(new CustomEvent('phimai-player-fullscreen', { detail: { isFullscreen: false } }));
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
    };
  }, []);

  useEffect(() => {
    if (compact && isCssFullscreen) {
      setIsCssFullscreen(false);
      setVerticalFillMode('contain');
      window.dispatchEvent(new CustomEvent('phimai-player-fullscreen', { detail: { isFullscreen: false } }));
    }
  }, [compact, isCssFullscreen]);

  const toggleFullscreen = useCallback(() => {
    const c = containerRef.current;
    if (!c) return;
    const currentlyFs = Boolean(
      document.fullscreenElement || (document as any).webkitFullscreenElement || isCssFullscreen
    );
    if (currentlyFs) {
      setIsCssFullscreen(false);
      setIsFullscreen(false);
      setVerticalFillMode('contain');
      wasNativeFsRef.current = false;
      window.dispatchEvent(new CustomEvent('phimai-player-fullscreen', { detail: { isFullscreen: false } }));
      if (document.fullscreenElement || (document as any).webkitFullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
      }
    } else {
      // Activate CSS full-viewport vertical phone mode immediately; also attempt native fullscreen without locking orientation
      setIsCssFullscreen(true);
      window.dispatchEvent(new CustomEvent('phimai-player-fullscreen', { detail: { isFullscreen: true } }));
      if (c.requestFullscreen) {
        c.requestFullscreen()
          .then(() => {
            wasNativeFsRef.current = true;
            setIsFullscreen(true);
          })
          .catch(() => {
            // CSS full-viewport mode remains active
          });
      }
    }
    resetControlsTimer(3000);
  }, [isCssFullscreen, resetControlsTimer]);

  const showSeekFeedback = useCallback((side: 'left' | 'right', text: string) => {
    setSeekRipple({ side, text });
    if (seekRippleTimerRef.current) clearTimeout(seekRippleTimerRef.current);
    seekRippleTimerRef.current = setTimeout(() => setSeekRipple(null), 650);
  }, []);

  const triggerSeekBackward = useCallback(
    (e?: React.MouseEvent | React.TouchEvent) => {
      e?.stopPropagation();
      const cur = videoRef.current?.currentTime ?? currentTime;
      handleSeek(Math.max(0, cur - 10));
      showSeekFeedback('left', '-10s');
    },
    [currentTime, handleSeek, showSeekFeedback]
  );

  const triggerSeekForward = useCallback(
    (e?: React.MouseEvent | React.TouchEvent) => {
      e?.stopPropagation();
      const cur = videoRef.current?.currentTime ?? currentTime;
      const dur = duration || videoRef.current?.duration || 0;
      handleSeek(dur > 0 ? Math.min(dur, cur + 10) : cur + 10);
      showSeekFeedback('right', '+10s');
    },
    [currentTime, duration, handleSeek, showSeekFeedback]
  );

  const drawPreviewFrame = useCallback(() => {
    const pv = previewVideoRef.current;
    const canvas = previewCanvasRef.current;
    if (!pv || !canvas || pv.videoWidth === 0 || pv.videoHeight === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    try {
      ctx.drawImage(pv, 0, 0, canvas.width, canvas.height);
      setPreviewHasFrame(true);
    } catch {
      // ignore cross-origin or decode error
    }
  }, []);

  const requestPreviewSeek = useCallback((targetSec: number) => {
    const pv = previewVideoRef.current;
    if (!pv || !Number.isFinite(targetSec) || targetSec < 0) return;
    const now = Date.now();
    if (pv.readyState < 1) {
      pendingPreviewTimeRef.current = targetSec;
      return;
    }
    if (pv.seeking || now - lastPreviewSeekRef.current < 90) {
      pendingPreviewTimeRef.current = targetSec;
      return;
    }
    lastPreviewSeekRef.current = now;
    pendingPreviewTimeRef.current = null;
    try {
      pv.currentTime = targetSec;
    } catch {
      // ignore
    }
  }, []);

  const updateScrubFromClientX = useCallback(
    (clientX: number) => {
      const el = timelineRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0) return null;
      const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const dur = duration || videoRef.current?.duration || previewVideoRef.current?.duration || videoDataRef.current?.lengthSeconds || 0;
      const targetSec = dur > 0 ? pos * dur : 0;
      lastScrubTimeRef.current = targetSec;
      setScrubPercent(pos * 100);
      setScrubTime(targetSec);
      if (dur > 0) {
        requestPreviewSeek(targetSec);
      }
      return targetSec;
    },
    [duration, requestPreviewSeek]
  );

  useEffect(() => {
    if (!isScrubbing) return;
    const onWinMouseMove = (e: MouseEvent) => {
      if (!isMouseDraggingRef.current) return;
      updateScrubFromClientX(e.clientX);
    };
    const onWinMouseUp = (e: MouseEvent) => {
      if (!isMouseDraggingRef.current) return;
      isMouseDraggingRef.current = false;
      const finalTime = updateScrubFromClientX(e.clientX) ?? lastScrubTimeRef.current;
      if (finalTime !== null && Number.isFinite(finalTime)) {
        handleSeek(finalTime);
      }
      setIsScrubbing(false);
      setScrubTime(null);
    };
    window.addEventListener('mousemove', onWinMouseMove);
    window.addEventListener('mouseup', onWinMouseUp);
    return () => {
      window.removeEventListener('mousemove', onWinMouseMove);
      window.removeEventListener('mouseup', onWinMouseUp);
    };
  }, [isScrubbing, updateScrubFromClientX, handleSeek]);

  const togglePiP = async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (v.requestPictureInPicture) {
        await v.requestPictureInPicture();
      }
    } catch {
      // ignore
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    if (compact) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
      const vid = videoRef.current;
      if (!vid) return;
      switch (e.key.toLowerCase()) {
        case ' ':
        case 'k':
          e.preventDefault();
          togglePlay();
          break;
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'm':
          e.preventDefault();
          toggleMute();
          break;
        case 'j':
        case 'arrowleft':
          e.preventDefault();
          triggerSeekBackward();
          break;
        case 'l':
        case 'arrowright':
          e.preventDefault();
          triggerSeekForward();
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [compact, togglePlay, toggleFullscreen, toggleMute, triggerSeekBackward, triggerSeekForward]);

  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (compact) return;
    const now = Date.now();
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const w = rect.width;

    if (now - lastTapRef.current.time < 280) {
      if (clickX < w * 0.35) {
        triggerSeekBackward();
      } else if (clickX > w * 0.65) {
        triggerSeekForward();
      }
    } else {
      if (!showControls) {
        setShowControls(true);
        resetControlsTimer();
      } else {
        togglePlay();
      }
    }
    lastTapRef.current = { time: now, x: clickX };
  };

  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const displayedProgressPercent = isScrubbing && scrubTime !== null && duration > 0 ? scrubPercent : progressPercent;
  const bufferedPercent = duration > 0 ? Math.min(100, (buffered / duration) * 100) : 0;

  return (
    <div
      ref={containerRef}
      data-testid={compact ? undefined : 'player-container'}
      className={compact ? 'mp-compact-container' : undefined}
      onMouseMove={() => resetControlsTimer(2500)}
      onTouchStart={() => resetControlsTimer(3000)}
      onClick={handleContainerClick}
      style={
        compact
          ? {
              position: 'fixed',
              zIndex: 1200,
              display: 'flex',
              alignItems: 'center',
              backgroundColor: 'var(--color-background-surface, #161822)',
              border: '1px solid var(--color-border-emphasized, rgba(244, 244, 246, 0.24))',
              boxShadow: 'var(--shadow-high, 0 24px 64px -16px rgba(0, 0, 0, 0.85))',
              overflow: 'hidden',
              animation: 'mpSlideUpMini 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
            }
          : {
              position: 'relative',
              width: '100%',
              height: '100%',
              backgroundColor: '#000000',
              borderRadius: activeFullscreen ? '0' : '14px',
              overflow: 'hidden',
              cursor: showControls || !isPlaying || showSettings || isScrubbing ? 'default' : 'none',
              userSelect: 'none',
            }
      }
    >
      <video
        ref={videoRef}
        className={compact ? 'mp-compact-video' : undefined}
        playsInline
        muted={needsSeparateAudio ? true : isMuted}
        style={
          compact
            ? {
                width: '132px',
                height: '76px',
                objectFit: 'cover',
                display: 'block',
                flexShrink: 0,
                backgroundColor: '#000',
              }
            : {
                width: '100%',
                height: '100%',
                objectFit: activeFullscreen ? verticalFillMode : 'contain',
                display: 'block',
              }
        }
      >
        {activeCaptionUrl && (
          <track
            kind="subtitles"
            src={activeCaptionUrl}
            srcLang={currentCaption}
            label={captions.find((c) => c.languageCode === currentCaption)?.label || 'Phụ đề'}
            default
          />
        )}
      </video>

      {!compact && (
        <canvas
          ref={freezeCanvasRef}
          data-testid="quality-switch-freeze"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: activeFullscreen ? verticalFillMode : 'contain',
            zIndex: 2,
            pointerEvents: 'none',
            display: isSwitchingQuality ? 'block' : 'none',
            backgroundColor: '#000',
          }}
        />
      )}

      <audio ref={audioRef} playsInline style={{ display: 'none' }} />

      {!compact && videoId && previewEnabled && (
        <video
          ref={previewVideoRef}
          src={`/api/invidious/latest_version?id=${encodeURIComponent(videoId)}&itag=18&local=true`}
          muted
          playsInline
          preload="metadata"
          crossOrigin="anonymous"
          style={{
            position: 'absolute',
            width: '1px',
            height: '1px',
            opacity: 0,
            pointerEvents: 'none',
            zIndex: -1,
          }}
          onLoadedMetadata={() => {
            const pv = previewVideoRef.current;
            if (pv && Number.isFinite(pv.duration) && pv.duration > 0 && duration <= 0) {
              setDuration(pv.duration);
            }
            if (pendingPreviewTimeRef.current !== null && pv) {
              const target = pendingPreviewTimeRef.current;
              pendingPreviewTimeRef.current = null;
              try {
                lastPreviewSeekRef.current = Date.now();
                pv.currentTime = target;
              } catch {
                // ignore
              }
            }
          }}
          onSeeked={() => {
            drawPreviewFrame();
            const pv = previewVideoRef.current;
            if (pv && pendingPreviewTimeRef.current !== null) {
              const nextTarget = pendingPreviewTimeRef.current;
              pendingPreviewTimeRef.current = null;
              if (Math.abs(nextTarget - pv.currentTime) > 0.25) {
                lastPreviewSeekRef.current = Date.now();
                try {
                  pv.currentTime = nextTarget;
                } catch {
                  // ignore
                }
              }
            }
          }}
        />
      )}

      {/* Poster backdrop until first decoded frame */}
      {!compact && !dataLoaded && thumbnail && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 1,
            pointerEvents: 'none',
            backgroundColor: '#000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <img
            src={thumbnail}
            alt={title || ''}
            style={{ width: '100%', height: '100%', objectFit: activeFullscreen ? verticalFillMode : 'contain', filter: 'brightness(0.65)' }}
          />
        </div>
      )}

      {compact ? (
        <>
          <div
            onClick={() => onExpand?.(currentTime)}
            className="mp-compact-expand"
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: '132px',
              height: '76px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(0, 0, 0, 0.35)',
              color: '#fff',
              cursor: 'pointer',
              zIndex: 4,
            }}
            title="Mở trang xem phim"
          >
            <IoExpandOutline size={20} />
          </div>

          <div
            style={{
              flex: 1,
              minWidth: 0,
              padding: '6px 10px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              gap: '4px',
            }}
          >
            <div onClick={() => onExpand?.(currentTime)} style={{ cursor: 'pointer', minWidth: 0 }}>
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--yt-text-primary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {title || 'Đang phát'}
              </div>
              <div
                style={{
                  fontSize: '11px',
                  color: 'var(--yt-text-secondary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <Logo size={13} showText={false} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {uploader || 'PhimAI'}
                </span>
                <span>•</span>
                <span className="phimai-tabular" style={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                  {formatTime(currentTime)}
                  {duration > 0 ? ` / ${formatTime(duration)}` : ''}
                </span>
              </div>
            </div>
            <div
              style={{
                height: '3px',
                background: 'rgba(244, 244, 246, 0.14)',
                borderRadius: '2px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${progressPercent}%`,
                  background: '#e50914',
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', paddingRight: '6px', gap: '1px', flexShrink: 0 }}>
            {onPrev && (
              <button
                type="button"
                onClick={onPrev}
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--yt-text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
                title="Phim trước"
              >
                <IoPlaySkipBack size={15} />
              </button>
            )}
            <button
              type="button"
              onClick={togglePlay}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                border: 'none',
                background: 'rgba(255,255,255,0.08)',
                color: 'var(--yt-text-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
              title={isPlaying ? 'Tạm dừng' : 'Phát tiếp'}
            >
              {isPlaying ? <IoPause size={17} /> : <IoPlay size={17} />}
            </button>
            {onNext && (
              <button
                type="button"
                onClick={onNext}
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--yt-text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
                title="Phim tiếp theo"
              >
                <IoPlaySkipForward size={15} />
              </button>
            )}
            <button
              type="button"
              onClick={onCloseMiniPlayer}
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                border: 'none',
                background: 'transparent',
                color: 'var(--yt-text-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
              title="Đóng trình phát thu nhỏ"
            >
              <IoCloseOutline size={18} />
            </button>
          </div>
        </>
      ) : (
        <>
          {isBuffering && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(0,0,0,0.4)',
                zIndex: 15,
                gap: '10px',
                pointerEvents: 'none',
              }}
            >
              <div className="yt-spinner" />
              <span style={{ color: '#fff', fontSize: '12px', fontWeight: 600 }}>
                Đang tối ưu độ phân giải ({activeHeight}p)...
              </span>
            </div>
          )}

          {seekRipple && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                [seekRipple.side]: 0,
                width: '38%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(255,255,255,0.14)',
                color: '#fff',
                fontSize: '18px',
                fontWeight: 700,
                zIndex: 15,
                pointerEvents: 'none',
              }}
            >
              {seekRipple.text}
            </div>
          )}

          {qualityToast && (
            <div
              data-testid="quality-toast"
              style={{
                position: 'absolute',
                top: '12px',
                left: '50%',
                transform: 'translateX(-50%)',
                padding: '6px 14px',
                borderRadius: '9999px',
                backgroundColor: 'rgba(13, 14, 20, 0.90)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255, 216, 117, 0.36)',
                color: '#f4f4f6',
                fontSize: '12.5px',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                zIndex: 25,
                pointerEvents: 'none',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.65)',
              }}
            >
              {qualityToast}
            </div>
          )}

          {errorMsg && (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'absolute',
                inset: 0,
                backgroundColor: 'rgba(0,0,0,0.85)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                zIndex: 30,
                padding: '20px',
                textAlign: 'center',
              }}
            >
              <p style={{ color: '#fff', margin: 0, fontSize: '14px', maxWidth: '460px', lineHeight: 1.5 }}>{errorMsg}</p>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
                <button
                  type="button"
                  onClick={() => {
                    lastLoadedVideoIdRef.current = '';
                    setErrorMsg(null);
                    setIsBuffering(true);
                    const ev = new CustomEvent('phimai-retry-stream');
                    window.dispatchEvent(ev);
                    window.location.reload();
                  }}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: '#e50914',
                    color: '#ffffff',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Thử phát lại
                </button>
                {onNext && (
                  <button
                    type="button"
                    onClick={onNext}
                    style={{
                      padding: '8px 18px',
                      borderRadius: '20px',
                      border: '1px solid rgba(255,255,255,0.28)',
                      backgroundColor: 'rgba(255,255,255,0.12)',
                      color: '#fff',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Chuyển sang phim tiếp theo
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Fullscreen Top Header & Vertical Phone Fit Toggle */}
          {activeFullscreen && (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                padding: 'calc(10px + env(safe-area-inset-top, 0px)) 14px 20px',
                background: 'linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.35) 65%, transparent 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
                opacity: showControls || !isPlaying || showSettings ? 1 : 0,
                pointerEvents: showControls || !isPlaying || showSettings ? 'auto' : 'none',
                transition: 'opacity 0.2s ease',
                zIndex: 21,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                <button
                  type="button"
                  onClick={toggleFullscreen}
                  style={{
                    background: 'rgba(255,255,255,0.14)',
                    border: 'none',
                    color: '#fff',
                    width: '34px',
                    height: '34px',
                    borderRadius: '50%',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                  title="Thoát toàn màn hình"
                >
                  <IoArrowBack size={18} />
                </button>
                {title && (
                  <span
                    style={{
                      color: '#fff',
                      fontSize: '13.5px',
                      fontWeight: 600,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {title}
                  </span>
                )}
              </div>

              <button
                type="button"
                data-testid="player-vertical-fill-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setVerticalFillMode((m) => (m === 'contain' ? 'cover' : 'contain'));
                  resetControlsTimer(3000);
                }}
                style={{
                  background: verticalFillMode === 'cover' ? 'rgba(229, 9, 20, 0.88)' : 'rgba(13, 14, 20, 0.72)',
                  border: '1px solid rgba(244, 244, 246, 0.22)',
                  color: '#f4f4f6',
                  padding: '6px 10px',
                  borderRadius: '8px',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
                title="Chuyển chế độ vừa khung / tràn màn hình dọc"
              >
                <MdFitScreen size={16} />
                <span>{verticalFillMode === 'cover' ? 'Vừa khung' : 'Toàn màn dọc'}</span>
              </button>
            </div>
          )}

          {/* Center Mobile / Touch Quick Controls (-10s / Play / +10s) */}
          {!errorMsg && !isBuffering && (
            <div
              className="player-center-touch-controls"
              style={{
                position: 'absolute',
                inset: 0,
                alignItems: 'center',
                justifyContent: 'center',
                gap: '28px',
                zIndex: 18,
                pointerEvents: 'none',
                opacity: (showControls || !isPlaying) && !showSettings && !isScrubbing ? 1 : 0,
                transition: 'opacity 0.2s ease',
              }}
            >
              <button
                type="button"
                data-testid="player-center-rewind-10s"
                onClick={triggerSeekBackward}
                style={{
                  pointerEvents: (showControls || !isPlaying) && !showSettings && !isScrubbing ? 'auto' : 'none',
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  border: '1px solid rgba(255,255,255,0.2)',
                  backgroundColor: 'rgba(0,0,0,0.55)',
                  backdropFilter: 'blur(4px)',
                  color: '#fff',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
                title="Tua lùi 10 giây"
              >
                <MdReplay10 size={24} />
              </button>

              <button
                type="button"
                data-testid="player-center-play"
                onClick={(e) => {
                  e.stopPropagation();
                  togglePlay();
                }}
                style={{
                  pointerEvents: (showControls || !isPlaying) && !showSettings && !isScrubbing ? 'auto' : 'none',
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  border: '1px solid rgba(255,255,255,0.28)',
                  backgroundColor: 'rgba(0,0,0,0.62)',
                  backdropFilter: 'blur(6px)',
                  color: '#fff',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
                title={isPlaying ? 'Tạm dừng' : 'Phát'}
              >
                {isPlaying ? <IoPause size={28} /> : <IoPlay size={28} style={{ marginLeft: '2px' }} />}
              </button>

              <button
                type="button"
                data-testid="player-center-forward-10s"
                onClick={triggerSeekForward}
                style={{
                  pointerEvents: (showControls || !isPlaying) && !showSettings && !isScrubbing ? 'auto' : 'none',
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  border: '1px solid rgba(255,255,255,0.2)',
                  backgroundColor: 'rgba(0,0,0,0.55)',
                  backdropFilter: 'blur(4px)',
                  color: '#fff',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
                title="Tua nhanh 10 giây"
              >
                <MdForward10 size={24} />
              </button>
            </div>
          )}

          {/* Bottom Materialious Floating Controls */}
          <div
            className="player-controls-bar"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              padding: activeFullscreen ? '24px 16px calc(14px + env(safe-area-inset-bottom, 0px))' : '20px 16px 12px',
              background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.5) 60%, transparent 100%)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              opacity: showControls || !isPlaying || showSettings || isScrubbing ? 1 : 0,
              pointerEvents: showControls || !isPlaying || showSettings || isScrubbing ? 'auto' : 'none',
              transition: 'opacity 0.2s ease',
              zIndex: 20,
            }}
          >
            {/* Timeline Scrubber with Hold/Slide Thumbnail Preview */}
            <div
              ref={timelineRef}
              data-testid="player-timeline"
              onMouseEnter={() => setPreviewEnabled(true)}
              onMouseDown={(e) => {
                e.stopPropagation();
                setPreviewEnabled(true);
                if (Date.now() - lastTouchTimeRef.current < 500) return;
                isMouseDraggingRef.current = true;
                setIsScrubbing(true);
                updateScrubFromClientX(e.clientX);
                resetControlsTimer(4000);
              }}
              onMouseMove={(e) => {
                e.stopPropagation();
                if (Date.now() - lastTouchTimeRef.current < 500) return;
                if (!isMouseDraggingRef.current) {
                  updateScrubFromClientX(e.clientX);
                }
              }}
              onMouseLeave={() => {
                if (!isMouseDraggingRef.current && !isScrubbing) {
                  setScrubTime(null);
                }
              }}
              onTouchStart={(e) => {
                e.stopPropagation();
                setPreviewEnabled(true);
                lastTouchTimeRef.current = Date.now();
                if (e.touches.length > 0) {
                  setIsScrubbing(true);
                  updateScrubFromClientX(e.touches[0].clientX);
                  resetControlsTimer(5000);
                }
              }}
              onTouchMove={(e) => {
                e.stopPropagation();
                lastTouchTimeRef.current = Date.now();
                if (e.touches.length > 0) {
                  updateScrubFromClientX(e.touches[0].clientX);
                  resetControlsTimer(5000);
                }
              }}
              onTouchEnd={(e) => {
                e.stopPropagation();
                lastTouchTimeRef.current = Date.now();
                const finalTime = lastScrubTimeRef.current;
                if (finalTime !== null && Number.isFinite(finalTime)) {
                  handleSeek(finalTime);
                }
                setIsScrubbing(false);
                setScrubTime(null);
              }}
              onTouchCancel={(e) => {
                e.stopPropagation();
                lastTouchTimeRef.current = Date.now();
                setIsScrubbing(false);
                setScrubTime(null);
              }}
              style={{
                position: 'relative',
                height: '24px',
                display: 'flex',
                alignItems: 'center',
                cursor: 'pointer',
                touchAction: 'none',
                marginBottom: '-4px',
              }}
            >
              {/* Floating Preview Thumbnail Card while hovering, holding, or sliding */}
              {scrubTime !== null && (
                <div
                  data-testid="timeline-preview-card"
                  style={{
                    position: 'absolute',
                    bottom: '30px',
                    left: `clamp(84px, ${scrubPercent}%, calc(100% - 84px))`,
                    transform: 'translateX(-50%)',
                    width: '160px',
                    pointerEvents: 'none',
                    zIndex: 35,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <div
                    style={{
                      position: 'relative',
                      width: '160px',
                      height: '90px',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      border: '1px solid rgba(255, 216, 117, 0.65)',
                      backgroundColor: '#0d0e14',
                      boxShadow: '0 14px 34px -8px rgba(0, 0, 0, 0.85)',
                    }}
                  >
                    {thumbnail && (
                      <img
                        src={thumbnail}
                        alt=""
                        style={{
                          position: 'absolute',
                          inset: 0,
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                        }}
                      />
                    )}
                    <canvas
                      ref={previewCanvasRef}
                      width={160}
                      height={90}
                      style={{
                        position: 'relative',
                        width: '100%',
                        height: '100%',
                        display: 'block',
                        objectFit: 'cover',
                        opacity: previewHasFrame ? 1 : 0,
                        transition: 'opacity 0.12s ease',
                      }}
                    />
                  </div>
                  <div
                    data-testid="timeline-preview-time"
                    style={{
                      backgroundColor: 'rgba(13, 14, 20, 0.94)',
                      color: '#ffd875',
                      fontFamily: 'var(--font-family-code, "JetBrains Mono", monospace)',
                      fontSize: '11.5px',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '6px',
                      border: '1px solid rgba(255, 216, 117, 0.36)',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.7)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {formatTime(scrubTime)}
                  </div>
                </div>
              )}

              {/* Visual Track */}
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  height: isScrubbing ? '7px' : '4.5px',
                  borderRadius: '4px',
                  backgroundColor: 'rgba(255,255,255,0.28)',
                  transition: 'height 0.12s ease',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: 0,
                    width: `${bufferedPercent}%`,
                    backgroundColor: 'rgba(255,255,255,0.48)',
                    borderRadius: '4px',
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: 0,
                    width: `${displayedProgressPercent}%`,
                    backgroundColor: '#e50914',
                    borderRadius: '4px',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      right: isScrubbing ? '-8px' : '-6px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: isScrubbing ? '16px' : '12px',
                      height: isScrubbing ? '16px' : '12px',
                      borderRadius: '50%',
                      backgroundColor: '#e50914',
                      boxShadow: isScrubbing ? '0 0 0 4px rgba(229, 9, 20, 0.35)' : '0 1px 4px rgba(0,0,0,0.6)',
                      transition: 'width 0.12s ease, height 0.12s ease',
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Bottom Button Bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '2px', minWidth: 0 }}>
                {onPrev && (
                  <button
                    type="button"
                    className="player-prev-btn"
                    onClick={onPrev}
                    style={{ background: 'none', border: 'none', color: '#fff', padding: '6px', cursor: 'pointer', display: 'flex' }}
                    title="Tập trước"
                  >
                    <IoPlaySkipBack size={18} />
                  </button>
                )}
                <button
                  type="button"
                  data-testid="player-rewind-10s"
                  onClick={triggerSeekBackward}
                  style={{ background: 'none', border: 'none', color: '#fff', padding: '5px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                  title="Tua lùi 10 giây (j)"
                >
                  <MdReplay10 size={22} />
                </button>
                <button
                  type="button"
                  data-testid="player-play-btn"
                  onClick={togglePlay}
                  style={{ background: 'none', border: 'none', color: '#fff', padding: '5px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                  title={isPlaying ? 'Tạm dừng (k)' : 'Phát (k)'}
                >
                  {isPlaying ? <IoPause size={22} /> : <IoPlay size={22} />}
                </button>
                <button
                  type="button"
                  data-testid="player-forward-10s"
                  onClick={triggerSeekForward}
                  style={{ background: 'none', border: 'none', color: '#fff', padding: '5px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                  title="Tua nhanh 10 giây (l)"
                >
                  <MdForward10 size={22} />
                </button>
                {onNext && (
                  <button
                    type="button"
                    className="player-next-btn"
                    onClick={onNext}
                    style={{ background: 'none', border: 'none', color: '#fff', padding: '6px', cursor: 'pointer', display: 'flex' }}
                    title="Phim / tập tiếp theo"
                  >
                    <IoPlaySkipForward size={18} />
                  </button>
                )}

                <button
                  type="button"
                  onClick={toggleMute}
                  style={{ background: 'none', border: 'none', color: '#fff', padding: '5px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                  title="Tắt tiếng (m)"
                >
                  {isMuted || volume === 0 ? (
                    <IoVolumeMute size={20} />
                  ) : volume < 0.35 ? (
                    <IoVolumeLow size={20} />
                  ) : volume < 0.7 ? (
                    <IoVolumeMedium size={20} />
                  ) : (
                    <IoVolumeHigh size={20} />
                  )}
                </button>
                <input
                  className="player-volume-slider"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={isMuted ? 0 : volume}
                  onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                  style={{ width: '64px', height: '4px', cursor: 'pointer', accentColor: '#fff' }}
                />

                <div className="player-time-display" style={{ fontSize: '12px', color: '#fff', fontWeight: 500, marginLeft: '4px', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                  <span>{formatTime(isScrubbing && scrubTime !== null ? scrubTime : currentTime)}</span>
                  <span style={{ margin: '0 3px', opacity: 0.65 }}>/</span>
                  <span style={{ opacity: 0.75 }}>{formatTime(duration)}</span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
                <button
                  type="button"
                  className="player-loop-btn"
                  onClick={() => setIsLooping(!isLooping)}
                  style={{
                    background: isLooping ? 'rgba(255, 216, 117, 0.16)' : 'none',
                    border: 'none',
                    color: isLooping ? '#ffd875' : '#f4f4f6',
                    padding: '6px',
                    borderRadius: '50%',
                    cursor: 'pointer',
                    display: 'flex',
                  }}
                  title="Lặp lại"
                >
                  <IoRepeat size={19} />
                </button>

                <button
                  type="button"
                  data-testid="player-settings-btn"
                  onClick={() => {
                    setSettingsTab('main');
                    setShowSettings(!showSettings);
                  }}
                  style={{
                    background: showSettings ? 'rgba(255,255,255,0.2)' : 'none',
                    border: 'none',
                    color: '#fff',
                    padding: '6px',
                    borderRadius: '50%',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  title="Cài đặt (Chất lượng, Tốc độ, Hẹn giờ)"
                >
                  <IoSettingsOutline size={19} />
                </button>

                <button
                  type="button"
                  className="player-pip-btn"
                  onClick={togglePiP}
                  style={{ background: 'none', border: 'none', color: '#fff', padding: '6px', cursor: 'pointer', display: 'flex' }}
                  title="Hình trong hình (PiP)"
                >
                  <MdPictureInPictureAlt size={19} />
                </button>

                <button
                  type="button"
                  className="player-fullscreen-btn"
                  data-testid="player-fullscreen-btn"
                  onClick={toggleFullscreen}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#fff',
                    padding: '6px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  title={activeFullscreen ? 'Thoát toàn màn hình (f)' : 'Toàn màn hình (f)'}
                >
                  {activeFullscreen ? <IoContract size={19} /> : <IoExpand size={19} />}
                </button>
              </div>
            </div>
          </div>

          {/* Settings Modal */}
          {showSettings && (
            <div className="player-settings-overlay" onClick={() => setShowSettings(false)}>
              <div className="player-settings-modal" onClick={(e) => e.stopPropagation()}>
                {settingsTab === 'main' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <button
                      type="button"
                      onClick={() => setSettingsTab('quality')}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: 'none',
                        border: 'none',
                        color: '#fff',
                        padding: '9px 12px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '13px',
                      }}
                    >
                      <span>Chất lượng video</span>
                      <span style={{ color: '#ffd875', fontWeight: 600 }}>
                        {qualityMode === 'auto' ? `Tự động (${activeHeight}p)` : formatQualityLabel(selectedHeight || activeHeight)}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSettingsTab('speed')}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: 'none',
                        border: 'none',
                        color: '#fff',
                        padding: '9px 12px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '13px',
                      }}
                    >
                      <span>Tốc độ phát</span>
                      <span style={{ opacity: 0.75 }}>{playbackRate === 1 ? 'Chuẩn (1x)' : `${playbackRate}x`}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSettingsTab('sleep')}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: 'none',
                        border: 'none',
                        color: '#fff',
                        padding: '9px 12px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '13px',
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <IoTimerOutline size={15} /> Hẹn giờ tắt
                      </span>
                      <span style={{ opacity: 0.75 }}>{sleepMinutes > 0 ? `${sleepMinutes} phút` : 'Tắt'}</span>
                    </button>
                    {captions.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSettingsTab('subtitles')}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          background: 'none',
                          border: 'none',
                          color: '#fff',
                          padding: '9px 12px',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontSize: '13px',
                        }}
                      >
                        <span>Phụ đề</span>
                        <span style={{ opacity: 0.75 }}>{currentCaption === 'off' ? 'Tắt' : currentCaption}</span>
                      </button>
                    )}
                  </div>
                ) : settingsTab === 'quality' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <button
                      type="button"
                      onClick={() => setSettingsTab('main')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        background: 'none',
                        border: 'none',
                        color: '#fff',
                        padding: '6px 8px',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        borderBottom: '1px solid rgba(255,255,255,0.12)',
                        marginBottom: '4px',
                      }}
                    >
                      <IoArrowBack size={16} /> Chất lượng (~{estimatedMbps} Mbps)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQualitySelect('auto')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: qualityMode === 'auto' ? 'rgba(255, 216, 117, 0.14)' : 'none',
                        border: 'none',
                        color: qualityMode === 'auto' ? '#ffd875' : '#f4f4f6',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        textAlign: 'left',
                      }}
                    >
                      <span>Tự động tối đa theo mạng ({activeHeight}p)</span>
                      {qualityMode === 'auto' && <IoCheckmark size={16} />}
                    </button>
                    {qualities.map((q) => (
                      <button
                        type="button"
                        key={q.id}
                        onClick={() => handleQualitySelect('manual', q)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: qualityMode === 'manual' && selectedHeight === q.height ? 'rgba(255, 216, 117, 0.14)' : 'none',
                          border: 'none',
                          color: qualityMode === 'manual' && selectedHeight === q.height ? '#ffd875' : '#f4f4f6',
                          padding: '7px 10px',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontSize: '13px',
                        }}
                      >
                        <span>{q.label}</span>
                        {qualityMode === 'manual' && selectedHeight === q.height && <IoCheckmark size={16} />}
                      </button>
                    ))}
                  </div>
                ) : settingsTab === 'speed' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <button
                      type="button"
                      onClick={() => setSettingsTab('main')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        background: 'none',
                        border: 'none',
                        color: '#fff',
                        padding: '6px 8px',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        borderBottom: '1px solid rgba(255,255,255,0.12)',
                      }}
                    >
                      <IoArrowBack size={16} /> Tốc độ phát
                    </button>
                    {[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => (
                      <button
                        type="button"
                        key={r}
                        onClick={() => handleSpeedChange(r)}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          background: playbackRate === r ? 'rgba(255, 216, 117, 0.14)' : 'none',
                          border: 'none',
                          color: playbackRate === r ? '#ffd875' : '#f4f4f6',
                          padding: '8px 10px',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontSize: '13px',
                        }}
                      >
                        <span>{r === 1 ? 'Chuẩn (1x)' : `${r}x`}</span>
                        {playbackRate === r && <IoCheckmark size={16} />}
                      </button>
                    ))}
                  </div>
                ) : settingsTab === 'sleep' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <button
                      type="button"
                      onClick={() => setSettingsTab('main')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        background: 'none',
                        border: 'none',
                        color: '#fff',
                        padding: '6px 8px',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        borderBottom: '1px solid rgba(255,255,255,0.12)',
                      }}
                    >
                      <IoArrowBack size={16} /> Hẹn giờ tắt
                    </button>
                    {[0, 15, 30, 60, 90].map((m) => (
                      <button
                        type="button"
                        key={m}
                        onClick={() => {
                          onSelectSleepMinutes(m);
                          setShowSettings(false);
                        }}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          background: sleepMinutes === m ? 'rgba(255, 216, 117, 0.14)' : 'none',
                          border: 'none',
                          color: sleepMinutes === m ? '#ffd875' : '#f4f4f6',
                          padding: '8px 10px',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontSize: '13px',
                        }}
                      >
                        <span>{m === 0 ? 'Tắt' : `${m} phút`}</span>
                        {sleepMinutes === m && <IoCheckmark size={16} />}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <button
                      type="button"
                      onClick={() => setSettingsTab('main')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        background: 'none',
                        border: 'none',
                        color: '#fff',
                        padding: '6px 8px',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        borderBottom: '1px solid rgba(255,255,255,0.12)',
                      }}
                    >
                      <IoArrowBack size={16} /> Phụ đề
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCurrentCaption('off');
                        setActiveCaptionUrl(null);
                        setShowSettings(false);
                      }}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        background: currentCaption === 'off' ? 'rgba(255, 216, 117, 0.14)' : 'none',
                        border: 'none',
                        color: currentCaption === 'off' ? '#ffd875' : '#f4f4f6',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '13px',
                      }}
                    >
                      <span>Tắt</span>
                      {currentCaption === 'off' && <IoCheckmark size={16} />}
                    </button>
                    {captions.map((c, idx) => (
                      <button
                        type="button"
                        key={`${c.languageCode}_${idx}`}
                        onClick={() => {
                          setCurrentCaption(c.languageCode);
                          setActiveCaptionUrl(c.url);
                          setShowSettings(false);
                        }}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          background: currentCaption === c.languageCode ? 'rgba(255, 216, 117, 0.14)' : 'none',
                          border: 'none',
                          color: currentCaption === c.languageCode ? '#ffd875' : '#f4f4f6',
                          padding: '8px 10px',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontSize: '13px',
                        }}
                      >
                        <span>{c.label}</span>
                        {currentCaption === c.languageCode && <IoCheckmark size={16} />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
