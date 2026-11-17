import type { Film } from '../types/phimai';

export interface StreamFormatItem {
  url: string;
  itag?: string | number;
  type?: string;
  quality?: string;
  qualityLabel?: string;
  resolution?: string;
  container?: string;
  encoding?: string;
  height?: number;
  bitrate?: string | number;
  fps?: number;
  audioQuality?: string;
  hasAudio?: boolean;
}

export interface VideoCaptionItem {
  label: string;
  languageCode: string;
  url: string;
}

export interface VideoStreamPayload {
  id: string;
  title?: string;
  author?: string;
  authorId?: string;
  lengthSeconds?: number;
  viewCount?: number;
  watchUrl?: string;
  thumbnailUrl?: string;
  directStreamUrl?: string;
  bestAudioUrl?: string;
  hlsUrl?: string;
  dashUrl?: string;
  streams?: StreamFormatItem[];
  formatStreams?: StreamFormatItem[];
  adaptiveFormats?: StreamFormatItem[];
  captions?: VideoCaptionItem[];
  film?: Film;
  series?: Film[];
  related?: Film[];
}

export interface QualityOption {
  id: string;
  label: string;
  height: number;
  itag?: string;
  fps?: number;
  bitrate?: number;
  url?: string;
  hasAudio: boolean;
  type?: string;
}

const CACHE_TTL_MS = 10 * 60 * 1000;
const streamCache = new Map<string, { data: VideoStreamPayload; ts: number }>();
const inflightRequests = new Map<string, Promise<VideoStreamPayload | null>>();

export function parseVideoHeight(f: StreamFormatItem): number {
  if (typeof f.height === 'number' && f.height >= 144) return f.height;
  const label = f.qualityLabel || f.resolution || f.quality || '';
  const match = String(label).match(/(\d+)p/i);
  if (match) return parseInt(match[1], 10);
  if (typeof f.resolution === 'string' && f.resolution.includes('x')) {
    const parts = f.resolution.split('x');
    const h = parseInt(parts[1], 10);
    if (!Number.isNaN(h) && h >= 144) return h;
  }
  const itagNum = parseInt(String(f.itag || ''), 10);
  const itagMap: Record<number, number> = {
    313: 2160, 315: 2160, 401: 2160, 266: 2160, 138: 2160,
    271: 1440, 308: 1440, 400: 1440, 264: 1440,
    137: 1080, 248: 1080, 299: 1080, 303: 1080, 399: 1080,
    22: 720, 136: 720, 247: 720, 298: 720, 302: 720, 398: 720,
    135: 480, 244: 480, 397: 480,
    18: 360, 134: 360, 243: 360, 396: 360,
    133: 240, 242: 240, 395: 240,
    160: 144, 278: 144, 394: 144,
  };
  return itagMap[itagNum] || 0;
}

export function proxySameOriginUrl(raw?: string | null): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^(blob|data):/i.test(trimmed)) return trimmed;
  if (
    trimmed.startsWith('/api/invidious') ||
    trimmed.startsWith('/api/kvtube/') ||
    trimmed.startsWith('/api/video/') ||
    trimmed.startsWith('/api/thumb/')
  ) {
    return trimmed;
  }
  if (trimmed.startsWith('/companion/')) {
    return `/api/invidious${trimmed.replace(/^\/companion/, '')}`;
  }
  if (trimmed.startsWith('/')) {
    return `/api/invidious${trimmed}`;
  }
  try {
    const u = new URL(trimmed);
    const host = u.hostname.toLowerCase();
    const pathAndQuery = `${u.pathname}${u.search}`;
    if (u.pathname.startsWith('/api/invidious')) {
      return pathAndQuery;
    }
    if (host === 'manifest.googlevideo.com' || host.endsWith('.googlevideo.com') || host === 'googlevideo.com') {
      const sep = u.search ? '&' : '?';
      const hasHost = u.searchParams.has('host');
      return `/api/invidious/companion${u.pathname}${u.search}${hasHost ? '' : `${sep}host=${encodeURIComponent(u.hostname)}`}`;
    }
    if (/^\/(api|companion|videoplayback|latest_version)(\/|$)/.test(u.pathname) || host.includes('khoavo.')) {
      return `/api/invidious${pathAndQuery}`;
    }
  } catch {
    return `/api/invidious/${trimmed.replace(/^\/+/, '')}`;
  }
  return trimmed;
}

export class BandwidthMonitor {
  private emaMbps: number;
  private listeners = new Set<(mbps: number) => void>();

  constructor() {
    this.emaMbps = this.detectInitialMbps();
    if (typeof navigator !== 'undefined' && (navigator as any).connection?.addEventListener) {
      try {
        (navigator as any).connection.addEventListener('change', () => {
          const dl = Number((navigator as any).connection?.downlink || 0);
          if (dl > 0) {
            this.emaMbps = dl;
            this.emit();
          }
        });
      } catch {
        // ignore
      }
    }
  }

  private detectInitialMbps(): number {
    try {
      const conn = (navigator as any).connection;
      if (conn) {
        if (conn.saveData) return 1.5;
        const dl = Number(conn.downlink || 0);
        if (dl > 0) {
          // Chrome caps navigator.connection.downlink at 10 Mbps even on 100Mbps+ fiber
          return dl >= 10 ? 25 : dl;
        }
        if (conn.effectiveType === '2g' || conn.effectiveType === 'slow-2g') return 0.8;
        if (conn.effectiveType === '3g') return 2.2;
      }
    } catch {
      // ignore
    }
    // Default broadband speed estimate
    return 18;
  }

  public recordTransfer(bytes: number, durationMs: number): void {
    if (bytes < 4096 || durationMs <= 0) return;
    const instantMbps = (bytes * 8) / (durationMs / 1000) / 1_000_000;
    const clamped = Math.max(0.4, Math.min(200, instantMbps));
    this.emaMbps = this.emaMbps * 0.45 + clamped * 0.55;
    this.emit();
  }

  public reportStall(): void {
    // Gently step down estimated bandwidth after a buffer stall
    this.emaMbps = Math.max(0.8, this.emaMbps * 0.58);
    this.emit();
  }

  public reportHealthyBuffer(): void {
    // Gently probe upward when buffer fills comfortably without stalls
    this.emaMbps = Math.min(100, this.emaMbps * 1.18 + 0.5);
    this.emit();
  }

  public getEstimatedMbps(): number {
    return this.emaMbps;
  }

  public getRecommendedMaxHeight(): number {
    const mbps = this.emaMbps;
    const screenCap =
      typeof window !== 'undefined' && window.screen?.height
        ? Math.max(window.screen.height * (window.devicePixelRatio || 1), 1080)
        : 2160;

    let target = 1080;
    if (mbps >= 18) target = 2160;
    else if (mbps >= 9) target = 1440;
    else if (mbps >= 3.8) target = 1080;
    else if (mbps >= 1.8) target = 720;
    else if (mbps >= 0.9) target = 480;
    else target = 360;

    return Math.min(target, screenCap >= 1800 ? 2160 : screenCap >= 1200 ? 1440 : 1080);
  }

  public subscribe(fn: (mbps: number) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) {
      try {
        fn(this.emaMbps);
      } catch {
        // ignore
      }
    }
  }
}

export const bandwidthMonitor = new BandwidthMonitor();

export function getCachedVideoStream(videoId: string): VideoStreamPayload | null {
  const hit = streamCache.get(videoId);
  if (!hit) return null;
  if (Date.now() - hit.ts > CACHE_TTL_MS) {
    streamCache.delete(videoId);
    return null;
  }
  return hit.data;
}

export async function fetchVideoStream(videoId: string): Promise<VideoStreamPayload | null> {
  if (!videoId) return null;
  const cached = getCachedVideoStream(videoId);
  if (cached) return cached;

  const existing = inflightRequests.get(videoId);
  if (existing) return existing;

  const promise = (async (): Promise<VideoStreamPayload | null> => {
    try {
      const t0 = performance.now();
      const res = await fetch(`/api/video/${encodeURIComponent(videoId)}`);
      if (!res.ok) return null;
      const text = await res.text();
      bandwidthMonitor.recordTransfer(text.length, Math.max(10, performance.now() - t0));
      const data = JSON.parse(text) as VideoStreamPayload;
      streamCache.set(videoId, { data, ts: Date.now() });
      if (streamCache.size > 120) {
        const firstKey = streamCache.keys().next().value;
        if (firstKey) streamCache.delete(firstKey);
      }
      return data;
    } catch {
      return null;
    } finally {
      inflightRequests.delete(videoId);
    }
  })();

  inflightRequests.set(videoId, promise);
  return promise;
}

export function prefetchVideoStream(videoId: string): void {
  if (!videoId) return;
  if (getCachedVideoStream(videoId) || inflightRequests.has(videoId)) return;
  void fetchVideoStream(videoId);
}

export function buildQualityList(data: VideoStreamPayload | null): QualityOption[] {
  if (!data) return [];
  const options: QualityOption[] = [];
  const seenHeights = new Set<number>();

  // 1. Collect adaptive video streams (4K 2160p, 2K 1440p, 1080p, 720p, 480p, 360p)
  const adapt = Array.isArray(data.adaptiveFormats) ? data.adaptiveFormats : [];
  for (const f of adapt) {
    const t = (f.type || '').toLowerCase();
    if (t.includes('audio/') || f.audioQuality) continue;
    const h = parseVideoHeight(f);
    if (h < 144) continue;
    // Prefer widely supported H.264 (avc1) or VP9 over AV1 if duplicate height
    const existingIdx = options.findIndex((o) => o.height === h);
    const isH264 = t.includes('avc1');
    const isVP9 = t.includes('vp9') || t.includes('vp09');
    if (existingIdx >= 0) {
      const prev = options[existingIdx];
      const prevIsH264 = (prev.type || '').toLowerCase().includes('avc1');
      if (!prevIsH264 && (isH264 || (isVP9 && !(prev.type || '').toLowerCase().includes('vp9')))) {
        options[existingIdx] = {
          id: String(f.itag || `adapt_${h}`),
          label: formatQualityLabel(h, f.fps),
          height: h,
          itag: f.itag ? String(f.itag) : undefined,
          fps: f.fps,
          bitrate: Number(f.bitrate || 0),
          url: proxySameOriginUrl(f.url),
          hasAudio: false,
          type: f.type,
        };
      }
      continue;
    }
    seenHeights.add(h);
    options.push({
      id: String(f.itag || `adapt_${h}`),
      label: formatQualityLabel(h, f.fps),
      height: h,
      itag: f.itag ? String(f.itag) : undefined,
      fps: f.fps,
      bitrate: Number(f.bitrate || 0),
      url: proxySameOriginUrl(f.url),
      hasAudio: false,
      type: f.type,
    });
  }

  // 2. Collect progressive formatStreams (muxed video+audio) as fallback or 360p/720p
  const prog = Array.isArray(data.formatStreams) ? data.formatStreams : [];
  for (const f of prog) {
    const h = parseVideoHeight(f) || 360;
    if (!seenHeights.has(h)) {
      seenHeights.add(h);
      options.push({
        id: String(f.itag || `prog_${h}`),
        label: formatQualityLabel(h, f.fps),
        height: h,
        itag: f.itag ? String(f.itag) : undefined,
        fps: f.fps,
        bitrate: Number(f.bitrate || 0),
        url: proxySameOriginUrl(f.url),
        hasAudio: true,
        type: f.type,
      });
    }
  }

  options.sort((a, b) => b.height - a.height || (b.bitrate || 0) - (a.bitrate || 0));
  return options;
}

export function formatQualityLabel(height: number, fps?: number): string {
  const fpsStr = fps && fps > 30 ? String(Math.round(fps)) : '';
  if (height >= 2160) return `${height}p${fpsStr} (4K)`;
  if (height >= 1440) return `${height}p${fpsStr} (2K)`;
  if (height >= 1080) return `${height}p${fpsStr} (Full HD)`;
  if (height >= 720) return `${height}p${fpsStr} (HD)`;
  return `${height}p`;
}

export function pickBestAutoQuality(
  qualities: QualityOption[],
  maxRecommendedHeight: number,
  canDecodeType: (mime?: string) => boolean
): QualityOption | null {
  if (qualities.length === 0) return null;
  const playable = qualities.filter((q) => !q.type || canDecodeType(q.type));
  const pool = playable.length > 0 ? playable : qualities;
  // Choose highest resolution <= maxRecommendedHeight (so on fiber/fast net -> 1080p/1440p/2160p!)
  const withinBudget = pool.filter((q) => q.height <= maxRecommendedHeight);
  if (withinBudget.length > 0) {
    return withinBudget[0]; // sorted descending
  }
  // Otherwise pick the lowest available playable resolution
  return pool[pool.length - 1];
}
