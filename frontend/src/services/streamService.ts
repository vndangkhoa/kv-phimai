import type { ChannelDetailResponse, ChannelInfo, Film } from '../types/phimai';

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
  unavailable?: boolean;
  unavailableReason?: string;
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
  if (trimmed === '/companion' || trimmed.startsWith('/companion/')) {
    return `/api/invidious${trimmed}`;
  }
  if (trimmed.startsWith('/videoplayback')) {
    return `/api/invidious/companion${trimmed}`;
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
    if (u.pathname === '/videoplayback' || u.pathname.startsWith('/videoplayback/')) {
      return `/api/invidious/companion${pathAndQuery}`;
    }
    if (/^\/(api|companion|latest_version)(\/|$)/.test(u.pathname) || host.includes('khoavo.')) {
      return `/api/invidious${pathAndQuery}`;
    }
  } catch {
    return `/api/invidious/${trimmed.replace(/^\/+/, '')}`;
  }
  return trimmed;
}

const BW_STORAGE_KEY = 'phimai_bw_estimate_v1';
const BW_STORAGE_TTL_MS = 3 * 24 * 60 * 60 * 1000;

/** Rough Mbps needed per resolution when a stream has no bitrate info. */
function mbpsNeededForHeight(height: number): number {
  if (height >= 2160) return 18;
  if (height >= 1440) return 9;
  if (height >= 1080) return 4.5;
  if (height >= 720) return 2.2;
  if (height >= 480) return 1.1;
  if (height >= 360) return 0.6;
  return 0.4;
}

/** Mbps a quality option needs to play smoothly (35% headroom, plus audio track if separate). */
export function mbpsNeededForQuality(q: QualityOption): number {
  if (q.bitrate && q.bitrate > 0) {
    return (q.bitrate / 1_000_000) * 1.35 + (q.hasAudio ? 0 : 0.16);
  }
  return mbpsNeededForHeight(q.height);
}

export class BandwidthMonitor {
  private emaMbps: number;
  private listeners = new Set<(mbps: number) => void>();

  constructor() {
    this.emaMbps = this.loadSaved() ?? this.detectInitialMbps();
    if (typeof navigator !== 'undefined' && (navigator as any).connection?.addEventListener) {
      try {
        (navigator as any).connection.addEventListener('change', () => {
          const dl = Number((navigator as any).connection?.downlink || 0);
          // downlink is capped at 10 by Chrome; only trust it as a downgrade signal
          if (dl > 0 && dl < 10 && dl < this.emaMbps) {
            this.emaMbps = dl;
            this.emit();
          }
        });
      } catch {
        // ignore
      }
    }
  }

  private loadSaved(): number | null {
    try {
      const raw = JSON.parse(localStorage.getItem(BW_STORAGE_KEY) || 'null');
      if (raw && raw.mbps > 0 && Date.now() - raw.ts < BW_STORAGE_TTL_MS) return Number(raw.mbps);
    } catch {
      // ignore
    }
    return null;
  }

  private save(): void {
    try {
      localStorage.setItem(BW_STORAGE_KEY, JSON.stringify({ mbps: this.emaMbps, ts: Date.now() }));
    } catch {
      // ignore
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

  /** Feed a real media download (bytes over transfer time, excluding connection latency). */
  public recordTransfer(bytes: number, durationMs: number, weight = 0.5): void {
    if (bytes < 64 * 1024 || durationMs <= 0) return;
    const instantMbps = (bytes * 8) / (durationMs / 1000) / 1_000_000;
    const clamped = Math.max(0.3, Math.min(300, instantMbps));
    this.emaMbps = this.emaMbps * (1 - weight) + clamped * weight;
    this.save();
    this.emit();
  }

  public reportStall(): void {
    // Step down estimated bandwidth after repeated buffer stalls
    this.emaMbps = Math.max(0.5, this.emaMbps * 0.6);
    this.save();
    this.emit();
  }

  /**
   * Measure real throughput by downloading the first ~1.5 MB of a media URL.
   * Time is counted from the first received byte, so server latency is excluded.
   * Returns the measured Mbps (also folded into the estimate), or null if too little data arrived.
   */
  public async probe(url: string, maxBytes = 1_500_000, timeoutMs = 6000): Promise<number | null> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let bytes = 0;
    let tFirst = 0;
    try {
      const res = await fetch(url, {
        headers: { Range: `bytes=0-${maxBytes - 1}` },
        signal: ctrl.signal,
        cache: 'no-store',
      });
      if (!res.ok || !res.body) return null;
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!tFirst) {
          tFirst = performance.now(); // first chunk only starts the clock
          continue;
        }
        bytes += value.byteLength;
        if (bytes >= maxBytes) {
          ctrl.abort();
          break;
        }
      }
    } catch {
      // timeout / abort: use whatever arrived
    } finally {
      clearTimeout(timer);
    }
    if (!tFirst || bytes < 128 * 1024) return null;
    const ms = Math.max(50, performance.now() - tFirst);
    const mbps = (bytes * 8) / (ms / 1000) / 1_000_000;
    this.recordTransfer(bytes, ms, 0.8); // a deliberate 1.5 MB probe is a strong signal
    return mbps;
  }

  public getEstimatedMbps(): number {
    return this.emaMbps;
  }

  /** Highest resolution worth playing on this screen, regardless of bandwidth. */
  public getScreenCapHeight(): number {
    const screenPx =
      typeof window !== 'undefined' && window.screen?.height
        ? Math.max(window.screen.height * (window.devicePixelRatio || 1), 1080)
        : 2160;
    return screenPx >= 1800 ? 2160 : screenPx >= 1200 ? 1440 : 1080;
  }

  /** Resolution cap from both the bandwidth estimate and the screen. */
  public getRecommendedMaxHeight(): number {
    const mbps = this.emaMbps;
    let target = 1080;
    if (mbps >= 18) target = 2160;
    else if (mbps >= 9) target = 1440;
    else if (mbps >= 3.8) target = 1080;
    else if (mbps >= 1.8) target = 720;
    else if (mbps >= 0.9) target = 480;
    else target = 360;

    return Math.min(target, this.getScreenCapHeight());
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
      const res = await fetch(`/api/video/${encodeURIComponent(videoId)}`);
      if (!res.ok) return null;
      const text = await res.text();
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

  // 2. Collect progressive formatStreams (muxed video+audio) as fallback or 360p/720p.
  // If an adaptive-only entry already claimed this height, replace it with the muxed stream
  // so progressive resilient fallback (e.g., itag=18 at 360p) is always available.
  const prog = Array.isArray(data.formatStreams) ? data.formatStreams : [];
  for (const f of prog) {
    const h = parseVideoHeight(f) || 360;
    const opt: QualityOption = {
      id: String(f.itag || `prog_${h}`),
      label: formatQualityLabel(h, f.fps),
      height: h,
      itag: f.itag ? String(f.itag) : undefined,
      fps: f.fps,
      bitrate: Number(f.bitrate || 0),
      url: proxySameOriginUrl(f.url),
      hasAudio: true,
      type: f.type,
    };
    const existingIdx = options.findIndex((o) => o.height === h);
    if (existingIdx < 0) {
      seenHeights.add(h);
      options.push(opt);
    } else if (!options[existingIdx].hasAudio) {
      options[existingIdx] = opt;
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
  canDecodeType: (mime?: string) => boolean,
  budgetMbps?: number
): QualityOption | null {
  if (qualities.length === 0) return null;
  const playable = qualities.filter((q) => !q.type || canDecodeType(q.type));
  const pool = playable.length > 0 ? playable : qualities;
  // Highest resolution within the screen cap whose real bitrate fits the measured bandwidth
  const withinBudget = pool.filter(
    (q) => q.height <= maxRecommendedHeight && (budgetMbps === undefined || mbpsNeededForQuality(q) <= budgetMbps)
  );
  if (withinBudget.length > 0) {
    return withinBudget[0]; // sorted descending
  }
  // Otherwise pick the lowest available playable resolution
  return pool[pool.length - 1];
}

// ---------------------------------------------------------------------------
// Channel Subscriptions & Directory / Channel Surfing API
// ---------------------------------------------------------------------------

export const SUBSCRIPTIONS_KEY = 'phimai_subscriptions_v1';
export const SUBSCRIPTIONS_EVENT = 'phimai-subscriptions-changed';

export interface ChannelSubscription {
  name: string;
  authorId?: string;
  thumbnail?: string;
  subscribedAt: number;
}

export function getSubscribedChannels(): ChannelSubscription[] {
  try {
    const raw = JSON.parse(localStorage.getItem(SUBSCRIPTIONS_KEY) || '[]');
    if (Array.isArray(raw)) {
      return raw.filter((item) => item && typeof item.name === 'string');
    }
  } catch {
    // ignore
  }
  return [];
}

export function isChannelSubscribed(channelName: string): boolean {
  if (!channelName) return false;
  const target = channelName.toLowerCase();
  return getSubscribedChannels().some((s) => s.name.toLowerCase() === target);
}

export function toggleChannelSubscription(ch: {
  name: string;
  authorId?: string;
  thumbnail?: string;
}): { subscribed: boolean; list: ChannelSubscription[] } {
  const existing = getSubscribedChannels();
  const targetLower = ch.name.toLowerCase();
  const idx = existing.findIndex((s) => s.name.toLowerCase() === targetLower);
  let next: ChannelSubscription[];
  let subscribed: boolean;
  if (idx >= 0) {
    next = existing.filter((_, i) => i !== idx);
    subscribed = false;
  } else {
    next = [
      {
        name: ch.name,
        authorId: ch.authorId,
        thumbnail: ch.thumbnail,
        subscribedAt: Date.now(),
      },
      ...existing,
    ];
    subscribed = true;
  }
  try {
    localStorage.setItem(SUBSCRIPTIONS_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(SUBSCRIPTIONS_EVENT, { detail: next }));
  } catch {
    // ignore
  }
  return { subscribed, list: next };
}

export async function fetchChannelsList(
  query = '',
  sort: 'popular' | 'count' | 'name' = 'popular'
): Promise<ChannelInfo[]> {
  const params = new URLSearchParams();
  if (query.trim()) params.set('q', query.trim());
  if (sort) params.set('sort', sort);
  const res = await fetch(`/api/channels?${params.toString()}`);
  if (!res.ok) throw new Error('Không tải được danh sách kênh');
  const data = await res.json();
  return Array.isArray(data?.items) ? (data.items as ChannelInfo[]) : [];
}

export async function fetchChannelDetail(
  idOrName: string,
  opts: { sort?: 'newest' | 'popular' | 'oldest'; tab?: string; q?: string } = {}
): Promise<ChannelDetailResponse | null> {
  const params = new URLSearchParams();
  if (opts.sort) params.set('sort', opts.sort);
  if (opts.tab) params.set('tab', opts.tab);
  if (opts.q) params.set('q', opts.q);
  const qs = params.toString();
  const res = await fetch(
    `/api/channel/${encodeURIComponent(idOrName)}${qs ? `?${qs}` : ''}`
  );
  if (!res.ok) return null;
  return (await res.json()) as ChannelDetailResponse;
}
