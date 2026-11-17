export interface Film {
  id: string;
  rank: number;
  title: string;
  channel: string;
  views: string;
  dur: string;
  cat: string;
  tool: string;
  blurb: string;
  blurbLong?: string;
  tags: string[];
  adult?: boolean;
}

export interface KVTubeStreamInfo {
  id: string;
  watchUrl: string;
  embedUrl: string;
  channelUrl: string;
  thumbnailUrl: string;
  hlsUrl?: string;
  dashUrl?: string;
  directStreamUrl: string;
  streams: Array<{ url: string; quality: string; type: string; container?: string }>;
  captions: Array<{ label: string; languageCode: string; url: string }>;
}

export interface FilterState {
  query: string;
  cat: string;
  genre: string;
  fullOnly: boolean;
  mood: string;
  time: string;
  familyMode: boolean;
  sort: 'random' | 'new' | 'hot' | 'topview' | 'saved' | 'history';
  channel: string;
}

export interface PhimAIInterfaceProps {
  films: Film[];
  totalFilms: number;
  heroFilms: Film[];
  topWeekFilms: Array<{ film: Film; count: number }>;
  continueFilms: Film[];
  pinnedFilms: Film[];
  categories: Record<string, number>;
  genres: Record<string, number>;
  stats: { online: number; visits: number; plays: number; totalFilms: number; newWeek: number };
  wallPosts: Array<{ id: string; name: string; text: string; ts: number; likes: number }>;
  filters: FilterState;
  setFilters: (patch: Partial<FilterState>) => void;
  resetFilters: () => void;
  savedIds: Set<string>;
  toggleSave: (id: string) => void;
  ratings: Record<string, { s: number; n: number }>;
  commentCounts: Record<string, number>;
  onOpenFilm: (film: Film) => void;
  onOpenSwipeFeed: (startFilm?: Film) => void;
  onOpenAskAssistant: () => void;
  onOpenWatchParty: (film?: Film) => void;
  onRandomFilm: () => void;
  onPostWall: (name: string, text: string) => Promise<void>;
  onLikeWall: (id: string) => Promise<void>;
  onLoadMore: () => void;
  hasMore: boolean;
  loading: boolean;
  getThumbUrl: (id: string) => string;
  getKVTubeWatchUrl: (id: string) => string;
  activePartyCode?: string | null;
}

export interface ChannelInfo {
  name: string;
  authorId?: string;
  count: number;
  totalViews: number;
  fullCount: number;
  thumbnail: string;
  banner: string;
  categories: string[];
  url: string;
  previewFilms?: Film[];
}

export interface ChannelPlaylist {
  id: string;
  title: string;
  count: number;
  thumbnail: string;
  films: Film[];
}

export interface ChannelDetailResponse extends ChannelInfo {
  description?: string;
  subCount?: number;
  avatarUrl?: string;
  bannerUrl?: string;
  films: Film[];
  playlists: ChannelPlaylist[];
  totalMatched: number;
}
