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
  const shakaPlayerRef = useRef<any>(null);
  const videoDataRef = useRef<VideoStreamPayload | null>(null);
  const usingProgressiveRef = useRef(false);
  const playbackStartedRef = useRef(false);
  const hideControlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef<{ time: number; x: number }>({ time: 0, x: 0 });
  const stallTimestampsRef = useRef<number[]>([]);
  const lastLoadedVideoIdRef = useRef<string>('');
  const startupWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekRippleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const [dataLoaded, setDataLoaded] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isCssFullscreen, setIsCssFullscreen] = useState(false);
  const [verticalFillMode, setVerticalFillMode] = useState<'contain' | 'cover'>('contain');
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const [scrubPercent, setScrubPercent] = useState<number>(0);
  const [previewHasFrame, setPreviewHasFrame] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isLooping, setIsLooping] = useState(false);

  const [needsSeparateAudio, setNeedsSeparateAudio] = useState(false);
  const [bestAudioUrl, setBestAudioUrl] = useState('');

  // Adaptive Quality & Bandwidth states
  const [qualities, setQualities] = useState<QualityOption[]>([]);
  const [qualityMode, setQualityMode] = useState<'auto' | 'manual'>('auto');
  const [selectedHeight, setSelectedHeight] = useState<number>(0);
  const [activeHeight, setActiveHeight] = useState<number>(1080);
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
        const parsed = raw ? parseFloat(raw) : 0;
        return Number.isFinite(parsed) && parsed > 5 ? parsed : 0;
      } catch {
        return 0;
      }
    },
    [initialTimeSec]
  );

  // Direct stream attachment helper (handles both muxed MP4 and high-res video + separate audio)
  const attachDirectQuality = useCallback(
    (q: QualityOption, resumeAtSec?: number, dataOverride?: VideoStreamPayload | null) => {
      const vid = videoRef.current;
      const aud = audioRef.current;
      const vData = dataOverride || videoDataRef.current;
      if (!vid || !vData) return;

      const targetTime = resumeAtSec !== undefined ? resumeAtSec : vid.currentTime || 0;
      const audioUrl = vData.bestAudioUrl
        ? proxySameOriginUrl(vData.bestAudioUrl)
        : `/api/invidious/latest_version?id=${encodeURIComponent(videoId)}&itag=140&local=true`;

      let streamSrc = q.url ? proxySameOriginUrl(q.url) : '';
      if (!streamSrc && q.itag) {
        streamSrc = `/api/invidious/latest_version?id=${encodeURIComponent(videoId)}&itag=${encodeURIComponent(q.itag)}&local=true`;
      }
      if (!streamSrc) {
        streamSrc = `/api/invidious/latest_version?id=${encodeURIComponent(videoId)}&itag=18&local=true`;
      }

      usingProgressiveRef.current = true;
      setActiveHeight(q.height || 360);
      setIsBuffering(true);
      setErrorMsg(null);

      if (!q.hasAudio && audioUrl) {
        setNeedsSeparateAudio(true);
        setBestAudioUrl(audioUrl);
        vid.muted = true;
        if (aud) {
          aud.src = audioUrl;
          aud.volume = isMuted ? 0 : volume;
          aud.muted = isMuted;
          aud.playbackRate = playbackRate;
          aud.load();
          if (targetTime > 0) {
            aud.currentTime = targetTime;
          }
        }
      } else {
        setNeedsSeparateAudio(false);
        vid.muted = isMuted;
        vid.volume = volume;
        if (aud) {
          aud.pause();
          aud.removeAttribute('src');
          aud.load();
        }
      }

      vid.src = streamSrc;
      vid.playbackRate = playbackRate;
      vid.load();
      if (targetTime > 0) {
        try {
          vid.currentTime = targetTime;
        } catch {
          // will apply on loadedmetadata / canplay
        }
      }
      if (autoplay) {
        vid.play().catch(() => {});
        if (!q.hasAudio && aud && audioUrl) {
          aud.play().catch(() => {});
        }
      }

      // Guardrail: if high-res or adaptive direct stream fails to decode frames within 4.5s,
      // automatically step down to resilient muxed MP4 progressive stream so playback never stalls.
      clearStartupWatchdog();
      if (!streamSrc.includes('itag=18')) {
        startupWatchdogRef.current = setTimeout(() => {
          const curVid = videoRef.current;
          if (!curVid || playbackStartedRef.current || curVid.readyState >= 2) return;
          const muxed =
            vData.streams?.find((s) => s.url) ||
            qualities.find((opt) => opt.hasAudio && opt.itag === '18');
          const fallbackUrl =
            muxed?.url && !muxed.url.includes(streamSrc)
              ? proxySameOriginUrl(muxed.url)
              : `/api/invidious/latest_version?id=${encodeURIComponent(videoId)}&itag=18&local=true`;
          console.warn('[PhimAI Player] Startup watchdog stepping down to muxed stream:', fallbackUrl);
          setNeedsSeparateAudio(false);
          setActiveHeight(360);
          if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.removeAttribute('src');
          }
          curVid.muted = isMuted;
          curVid.volume = volume;
          curVid.src = fallbackUrl;
          curVid.load();
          if (targetTime > 0) {
            try {
              curVid.currentTime = targetTime;
            } catch {
              // ignore
            }
          }
          if (autoplay) curVid.play().catch(() => {});
        }, 4500);
      }
    },
    [videoId, autoplay, isMuted, volume, playbackRate, clearStartupWatchdog, qualities]
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
    stallTimestampsRef.current = [];
    setDataLoaded(false);
    setErrorMsg(null);
    setIsBuffering(true);
    setQualityMode('auto');
    setSelectedHeight(0);
    setPreviewHasFrame(false);
    setScrubTime(null);
    setIsScrubbing(false);
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
        const recommendedMax = bandwidthMonitor.getRecommendedMaxHeight();
        const bestInitial = pickBestAutoQuality(qualList, recommendedMax, canDecodeType);

        // 1. Try Shaka Player DASH/HLS ABR first for true dynamic bandwidth switching up to 4K
        const dashManifest = videoData.dashUrl ? proxySameOriginUrl(videoData.dashUrl) : '';
        const hlsManifest = videoData.hlsUrl ? proxySameOriginUrl(videoData.hlsUrl) : '';

        if (dashManifest || hlsManifest) {
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

              const estBps = Math.max(25_000_000, Math.round(bandwidthMonitor.getEstimatedMbps() * 1_000_000));
              player.configure({
                abr: {
                  enabled: true,
                  defaultBandwidthEstimate: estBps,
                  switchInterval: 2,
                  bandwidthUpgradeTarget: 0.72,
                  bandwidthDowngradeTarget: 0.9,
                  restrictions: {
                    minHeight: 480,
                  },
                },
                streaming: {
                  rebufferingGoal: 1.0,
                  bufferingGoal: 14,
                  bufferBehind: 24,
                  retryParameters: {
                    maxAttempts: 1,
                    baseDelay: 250,
                    backoffFactor: 1.2,
                    timeout: 2400,
                  },
                },
              });

              const normalizeTier = (w?: number, h?: number) => {
                const vw = w || 0;
                const vh = h || 0;
                if (vw > 0 && vh > 0) {
                  // For portrait videos (height > width), tier equals short side (e.g. 720x960 -> 720p, 1080x1920 -> 1080p)
                  return vh > vw ? vw : vh;
                }
                return vh || vw || 720;
              };

              const updateActiveVariantHeight = () => {
                try {
                  const tracks = player.getVariantTracks?.() || [];
                  const active = tracks.find((t: any) => t.active);
                  if (active) {
                    setActiveHeight(normalizeTier(active.width, active.height));
                  } else if (vidEl.videoHeight > 0) {
                    setActiveHeight(normalizeTier(vidEl.videoWidth, vidEl.videoHeight));
                  }
                } catch {
                  // ignore
                }
              };

              player.addEventListener('adaptation', updateActiveVariantHeight);
              player.addEventListener('variantchanged', updateActiveVariantHeight);

              const manifestUrl = dashManifest || hlsManifest;
              await Promise.race([
                player.load(manifestUrl, resumePos > 0 ? resumePos : undefined),
                new Promise<never>((_, reject) =>
                  setTimeout(() => reject(new Error('Shaka manifest/segment timeout (2.6s)')), 2600)
                ),
              ]);
              if (cancelled) return;

              // Enforce minHeight 480p only if HD/480p+ variants actually exist in this video's manifest
              const loadedTracks = player.getVariantTracks?.() || [];
              const has480Plus = loadedTracks.some((t: any) => normalizeTier(t.width, t.height) >= 480);
              if (!has480Plus) {
                player.configure({ abr: { restrictions: { minHeight: 0 } } });
              } else {
                // Immediately select the highest variant supported by estimated bandwidth
                const maxTarget = bandwidthMonitor.getRecommendedMaxHeight();
                const candidates = loadedTracks
                  .filter((t: any) => normalizeTier(t.width, t.height) <= maxTarget)
                  .sort((a: any, b: any) => normalizeTier(b.width, b.height) - normalizeTier(a.width, a.height));
                if (candidates.length > 0 && candidates[0].height && candidates[0].height < 480) {
                  player.configure({ abr: { restrictions: { minHeight: 0 } } });
                }
              }

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

              // Sync discovered Shaka variant heights into Quality menu
              const vTracks = player.getVariantTracks?.() || [];
              if (Array.isArray(vTracks) && vTracks.length > 0) {
                const mergedHeights = new Set(qualList.map((q) => q.height));
                for (const t of vTracks) {
                  if (t.height && t.height >= 144 && !mergedHeights.has(t.height)) {
                    mergedHeights.add(t.height);
                    qualList.push({
                      id: `shaka_${t.height}`,
                      label: formatQualityLabel(t.height, t.frameRate),
                      height: t.height,
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
              updateActiveVariantHeight();
              if (autoplay) {
                vidEl.play().catch(() => {});
              }
              setIsBuffering(false);

              // Verify Shaka actually decodes frames within 4s; otherwise drop to muxed MP4
              clearStartupWatchdog();
              startupWatchdogRef.current = setTimeout(async () => {
                if (cancelled || playbackStartedRef.current || vidEl.readyState >= 2) return;
                console.warn('[PhimAI Player] Shaka decoded-frame watchdog triggered -> switching to progressive MP4');
                if (shakaPlayerRef.current) {
                  await shakaPlayerRef.current.destroy().catch(() => {});
                  shakaPlayerRef.current = null;
                }
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
                attachDirectQuality(muxed, resumePos, videoData);
              }, 4000);
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

      // Buffered bar update + upward bandwidth signal when buffer grows well ahead
      if (vid.buffered.length > 0) {
        for (let i = 0; i < vid.buffered.length; i++) {
          if (vid.buffered.start(i) <= cur && cur <= vid.buffered.end(i)) {
            const bufEnd = vid.buffered.end(i);
            setBuffered(bufEnd);
            if (bufEnd - cur > 18) {
              bandwidthMonitor.reportHealthyBuffer();
            }
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
            attachDirectQuality(lower, vid.currentTime);
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
        onVideoEnd?.();
      }
    };

    const onVideoError = () => {
      // If high-res adaptive stream fails cleanly, step down to progressive stream
      if (!usingProgressiveRef.current && shakaPlayerRef.current) return;
      if (usingProgressiveRef.current && !playbackStartedRef.current) {
        const latestFallbackUrl = `/api/invidious/latest_version?id=${encodeURIComponent(videoId)}&itag=18&local=true`;
        if (!vid.src.includes('latest_version')) {
          attachDirectQuality(
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
  ]);

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
            if (active?.height) setActiveHeight(active.height);
            return;
          } catch {
            // fallback
          }
        }
        const canDecode = (mime?: string) => !mime || videoRef.current?.canPlayType(mime) !== '';
        const best = pickBestAutoQuality(qualities, bandwidthMonitor.getRecommendedMaxHeight(), canDecode);
        if (best) attachDirectQuality(best, videoRef.current?.currentTime);
        return;
      }

      if (!q) return;
      setSelectedHeight(q.height);
      setActiveHeight(q.height);

      if (player) {
        try {
          player.configure({ abr: { enabled: false } });
          const tracks = player.getVariantTracks?.() || [];
          const match =
            tracks.find((t: any) => t.height === q.height) ||
            tracks.find((t: any) => Math.abs((t.height || 0) - q.height) <= 120);
          if (match) {
            player.selectVariantTrack(match, true);
            return;
          }
          // If height only exists in adaptiveFormats (not Shaka manifest), destroy Shaka and play direct dual stream
          void player.destroy().catch(() => {});
          shakaPlayerRef.current = null;
        } catch {
          // fallback below
        }
      }

      attachDirectQuality(q, videoRef.current?.currentTime);
    },
    [qualities, attachDirectQuality]
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
              backgroundColor: 'var(--yt-surface, #181818)',
              border: '1px solid var(--yt-border, rgba(255,255,255,0.14))',
              boxShadow: '0 12px 36px rgba(0, 0, 0, 0.7)',
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

      <audio ref={audioRef} playsInline style={{ display: 'none' }} />

      {!compact && videoId && (
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
                <span style={{ flexShrink: 0 }}>
                  {formatTime(currentTime)}
                  {duration > 0 ? ` / ${formatTime(duration)}` : ''}
                </span>
              </div>
            </div>
            <div
              style={{
                height: '3px',
                background: 'rgba(255,255,255,0.16)',
                borderRadius: '2px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${progressPercent}%`,
                  background: '#ff0033',
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
                    borderRadius: '20px',
                    border: 'none',
                    backgroundColor: '#ff0033',
                    color: '#fff',
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
                  background: verticalFillMode === 'cover' ? 'rgba(255, 0, 51, 0.85)' : 'rgba(255,255,255,0.16)',
                  border: '1px solid rgba(255,255,255,0.22)',
                  color: '#fff',
                  padding: '6px 10px',
                  borderRadius: '18px',
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
              onMouseDown={(e) => {
                e.stopPropagation();
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
                      border: '2px solid rgba(255,255,255,0.85)',
                      backgroundColor: '#0f0f0f',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.8)',
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
                      backgroundColor: 'rgba(15, 15, 15, 0.92)',
                      color: '#fff',
                      fontSize: '11.5px',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '6px',
                      border: '1px solid rgba(255,255,255,0.18)',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.6)',
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
                    backgroundColor: '#ff0033',
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
                      backgroundColor: '#ff0033',
                      boxShadow: isScrubbing ? '0 0 0 4px rgba(255, 0, 51, 0.32)' : 'none',
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
                    background: isLooping ? 'rgba(255,255,255,0.2)' : 'none',
                    border: 'none',
                    color: isLooping ? '#3ea6ff' : '#fff',
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
                      <span style={{ color: '#3ea6ff', fontWeight: 600 }}>
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
                        background: qualityMode === 'auto' ? 'rgba(62,166,255,0.18)' : 'none',
                        border: 'none',
                        color: qualityMode === 'auto' ? '#3ea6ff' : '#fff',
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
                          background: qualityMode === 'manual' && selectedHeight === q.height ? 'rgba(255,255,255,0.16)' : 'none',
                          border: 'none',
                          color: qualityMode === 'manual' && selectedHeight === q.height ? '#3ea6ff' : '#fff',
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
                          background: playbackRate === r ? 'rgba(255,255,255,0.15)' : 'none',
                          border: 'none',
                          color: playbackRate === r ? '#3ea6ff' : '#fff',
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
                          background: sleepMinutes === m ? 'rgba(255,255,255,0.15)' : 'none',
                          border: 'none',
                          color: sleepMinutes === m ? '#3ea6ff' : '#fff',
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
                        background: currentCaption === 'off' ? 'rgba(255,255,255,0.15)' : 'none',
                        border: 'none',
                        color: currentCaption === 'off' ? '#3ea6ff' : '#fff',
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
                          background: currentCaption === c.languageCode ? 'rgba(255,255,255,0.15)' : 'none',
                          border: 'none',
                          color: currentCaption === c.languageCode ? '#3ea6ff' : '#fff',
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
