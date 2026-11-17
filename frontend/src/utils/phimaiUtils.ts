import type { Film } from '../types/phimai';

export function getThumbUrl(id: string): string {
  return `/api/kvtube/thumb/${encodeURIComponent(id)}`;
}

export function getFallbackThumbUrl(id: string): string {
  return `/api/kvtube/thumb/${encodeURIComponent(id)}?q=mqdefault`;
}

export function getKVTubeWatchUrl(id: string): string {
  return `/watch?v=${encodeURIComponent(id)}`;
}

export function getKVTubeEmbedUrl(id: string): string {
  return `/watch?v=${encodeURIComponent(id)}`;
}

export function getKVTubeStreamUrl(id: string): string {
  return `/api/invidious/latest_version?id=${encodeURIComponent(id)}&itag=18&local=true`;
}

export const CAT_LABEL: Record<string, string> = {
  all: 'Tất cả',
  new: 'Mới cập nhật',
  hot: 'Đang hot',
  topview: 'Xem nhiều',
  fantasy: 'Fantasy & Thần thoại',
  trung: 'Tu tiên & Cổ trang',
  hoathinh: 'Hoạt hình 3D',
  scifi: 'Viễn tưởng & Sci-Fi',
  kinhdi: 'Kinh dị & Bí ẩn',
  vietnam: 'Sử Việt & Phim Việt',
  dai: 'Phim dài trọn bộ',
  ngan: 'Phim ngắn chọn lọc',
};

export const GENRE_GROUPS: Array<{ id: string; label: string; match: string[] }> = [
  {
    id: 'tu tiên',
    label: 'Tu tiên & Huyền huyễn',
    match: ['tu tiên', 'tu-tien', 'tiên hiệp', 'tien-hiep', 'huyền huyễn', 'huyen-huyen', 'tu luyện', 'tu-luyen', 'phế vật vươn lên', 'phe-vat', 'vô địch', 'vo-dich', 'triệu hồi', 'trieu-hoi', 'thức tỉnh', 'thuc-tinh', 'thiên phú', 'thien-phu'],
  },
  {
    id: 'xuyên không',
    label: 'Xuyên không',
    match: ['xuyên không', 'xuyen-khong', 'xuyên sách', 'xuyen-sach', 'hai thế giới', 'hai-the-gioi'],
  },
  {
    id: 'ngôn tình',
    label: 'Ngôn tình & Tình cảm',
    match: ['ngôn tình', 'ngon-tinh', 'đam mỹ', 'tình cảm', 'tinh-cam', 'sủng ái', 'sung', 'hôn nhân', 'hon-nhan', 'ly hôn', 'ly-hon', 'tiểu thư', 'thieu-gia', 'thiên kim', 'thien-kim', 'công chúa', 'cong-chua', 'hoàng tử', 'hoang-tu', 'thế tử', 'the-tu'],
  },
  {
    id: 'hệ thống',
    label: 'Hệ thống',
    match: ['hệ thống', 'he-thong'],
  },
  {
    id: 'trọng sinh',
    label: 'Trọng sinh',
    match: ['trọng sinh', 'trong-sinh', 'trung-sinh'],
  },
  {
    id: 'mạt thế',
    label: 'Mạt thế & Zombie',
    match: ['mạt thế', 'mat-the', 'mathe', 'tận thế', 'tan-the', 'zombie', 'quỷ dị', 'quy-di'],
  },
  {
    id: 'kỳ ảo',
    label: 'Kỳ ảo & Thần thoại',
    match: ['kỳ ảo', 'thần thoại', 'dị năng', 'di-nang', 'không gian', 'khong-gian'],
  },
  {
    id: 'cổ trang',
    label: 'Cổ trang & Báo thù',
    match: ['cung đấu', 'cổ trang', 'co-trang', 'cổ đại', 'co-dai', 'kiếm hiệp', 'báo thù', 'bao-thu', 'chiến thần', 'chiến tranh', 'chien-tranh', 'tam quốc', 'tam-quoc', 'nữ cường', 'phản diện', 'phan-dien'],
  },
  {
    id: 'tổng tài',
    label: 'Tổng tài & Đô thị',
    match: ['tổng tài', 'tong-tai', 'hào môn', 'hao-mon', 'làm giàu', 'lam-giau', 'đô thị', 'do-thi', 'hiện đại', 'hien-dai'],
  },
  {
    id: 'sinh tồn',
    label: 'Sinh tồn',
    match: ['sinh tồn', 'sinh-ton', 'sinhton'],
  },
  {
    id: 'viễn tưởng',
    label: 'Viễn tưởng',
    match: ['viễn tưởng'],
  },
  {
    id: 'gia đình',
    label: 'Gia đình & Đời thường',
    match: ['gia đình', 'gia-dinh', 'đời đời', 'doi-doi', 'bé gái', 'be-gai'],
  },
  {
    id: 'kinh dị',
    label: 'Kinh dị',
    match: ['kinh dị'],
  },
  {
    id: 'hài hước',
    label: 'Hài hước',
    match: ['hài hước', 'hai-huoc', 'cười', 'cuoi', 'học đường', 'hoc-duong'],
  },
];

export function genreMatch(film: Film, gid: string): boolean {
  if (!gid || gid === 'all') return true;
  const group = GENRE_GROUPS.find((g) => g.id === gid);
  const tags = film.tags || [];
  if (!group) return tags.includes(gid);
  return tags.some((t) => group.match.includes(t));
}

export function durMinutes(film: Pick<Film, 'dur' | 'cat'>): number {
  const d = film.dur || '';
  let m = d.match(/(\d+)\s*giờ\s*(\d+)?/i);
  if (m) return parseInt(m[1], 10) * 60 + (m[2] ? parseInt(m[2], 10) : 0);
  m = d.match(/(\d+)g(\d+)/i);
  if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  m = d.match(/(\d+)\s*phút/i);
  if (m) return parseInt(m[1], 10);
  if (film.cat === 'ngan') return 12;
  if (/series|phần|mùa|tập|trọn|full/i.test(d)) return 150;
  return 45;
}

export function viewsNumber(film: Pick<Film, 'views'>): number {
  const v = film.views;
  if (!v) return 0;
  const cleaned = String(v).replace(/[,.\s]/g, '');
  const n = parseInt(cleaned, 10);
  return Number.isNaN(n) ? 0 : n;
}

export function formatViewsVN(views: string | number): string {
  const n = typeof views === 'number' ? views : parseInt(String(views || '').replace(/,/g, ''), 10);
  if (Number.isNaN(n) || n <= 0) return String(views || 'Đang hot');
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.', ',').replace(',0', '')} Tr lượt xem`;
  if (n >= 1_000) return `${Math.round(n / 1_000)} N lượt xem`;
  return `${n} lượt xem`;
}

export function formatClock(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function viNorm(s: string): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasPhrase(hay: string, needle: string): boolean {
  return ` ${hay} `.includes(` ${needle} `);
}

export interface AskConcept {
  label: string;
  q: string[];
  f: string[];
  cats: string[];
}

export const ASK_CONCEPTS: AskConcept[] = [
  {
    label: 'tu tiên',
    q: ['tu tien', 'tien hiep', 'huyen huyen', 'tu luyen', 'luyen khi', 'do kiep', 'thien ton', 'tien ton', 'tien de', 'chan tien', 'tu chan', 'thien dao', 'linh can'],
    f: ['tu tien', 'tien hiep', 'huyen huyen', 'tu luyen', 'luyen khi', 'do kiep', 'thien ton', 'tien ton', 'tien de', 'chan tien', 'tu chan', 'thien dao', 'linh can'],
    cats: [],
  },
  {
    label: 'xuyên không',
    q: ['xuyen khong', 'xuyen sach', 'xuyen ve', 'xuyen toi'],
    f: ['xuyen khong', 'xuyen sach', 'xuyen ve', 'xuyen toi'],
    cats: [],
  },
  {
    label: 'trọng sinh',
    q: ['trong sinh', 'song lai', 'trung sinh'],
    f: ['trong sinh', 'song lai', 'trung sinh'],
    cats: [],
  },
  {
    label: 'mạt thế',
    q: ['mat the', 'tan the', 'zombie', 'xac song', 'sinh ton', 'tich tru', 'di nang'],
    f: ['mat the', 'tan the', 'zombie', 'xac song', 'sinh ton', 'tich tru', 'di nang'],
    cats: [],
  },
  {
    label: 'ngôn tình',
    q: ['ngon tinh', 'tong tai', 'sung ai', 'cung chieu', 'tinh yeu', 'vo chong', 'hon uoc', 'nuong tu', 'ai phi', 'vuong gia', 'truong cong chua'],
    f: ['ngon tinh', 'tong tai', 'sung ai', 'cung chieu', 'tinh yeu', 'vo chong', 'hon uoc', 'nuong tu', 'ai phi', 'vuong gia', 'truong cong chua'],
    cats: [],
  },
  {
    label: 'cung đấu',
    q: ['cung dau', 'hau cung', 'hoang hau', 'hoang de', 'tranh sung'],
    f: ['cung dau', 'hau cung', 'hoang hau', 'hoang de', 'tranh sung'],
    cats: [],
  },
  {
    label: 'kinh dị',
    q: ['kinh di', 'ma quai', 'quy di', 'am anh', 'rung ron', 'ma ca rong', 'kinh hoang'],
    f: ['kinh di', 'ma quai', 'quy di', 'am anh', 'rung ron', 'ma ca rong', 'kinh hoang'],
    cats: ['kinhdi'],
  },
  {
    label: 'hài hước',
    q: ['hai huoc', 'hai', 'buon cuoi', 'vui nhon'],
    f: ['hai huoc', 'buon cuoi', 'vui nhon', 'gay cuoi', 'do khoc do cuoi'],
    cats: [],
  },
  {
    label: 'chữa lành',
    q: ['chua lanh', 'nhe nhang', 'am ap', 'cam dong', 'cam xuc', 'de thuong'],
    f: ['chua lanh', 'nhe nhang', 'am ap', 'cam dong', 'cam xuc', 'de thuong'],
    cats: [],
  },
  {
    label: 'hoạt hình',
    q: ['hoat hinh', 'anime', 'hoat hinh ai'],
    f: ['hoat hinh', 'anime', 'hoat hinh ai'],
    cats: ['hoathinh'],
  },
  {
    label: 'viễn tưởng',
    q: ['vien tuong', 'vu tru', 'nguoi may', 'robot', 'tuong lai', 'hanh tinh', 'khoa hoc'],
    f: ['vien tuong', 'vu tru', 'nguoi may', 'robot', 'tuong lai', 'hanh tinh', 'khoa hoc'],
    cats: ['scifi'],
  },
  {
    label: 'việt nam',
    q: ['viet nam', 'phim viet', 'viet', 'su viet'],
    f: ['viet nam', 'phim viet', 'ao dai', 'saigon', 'ha noi', 'dai viet'],
    cats: ['vietnam'],
  },
  {
    label: 'trung quốc',
    q: ['trung quoc', 'tq', 'phim tau'],
    f: ['ai tq', 'trung quoc'],
    cats: ['trung'],
  },
  {
    label: 'fantasy',
    q: ['fantasy', 'rong', 'than thoai'],
    f: ['fantasy', 'rong', 'than thoai', 'phep thuat', 'quai vat', 'ky ao', 'hiep si'],
    cats: ['fantasy'],
  },
  {
    label: 'cổ trang',
    q: ['co trang', 'co dai', 'hoang cung'],
    f: ['co trang', 'co dai', 'hoang cung', 'trieu dinh'],
    cats: [],
  },
];

const ASK_STOP = [
  'phim', 'xem', 'tim', 'goi', 'y', 'cho', 'toi', 'minh', 'mot', 'bo', 'cai', 'la', 'gi',
  'hay', 'nao', 'voi', 'va', 'tren', 'duoi', 'gio', 'tieng', 'phut', 'buoi', 'muon', 'can',
  'loai', 've', 'cua', 'o', 'co', 'nay', 'do', 'thi', 'de', 'duoc', 'tu', 'den', 'nhu',
  'kieu', 'dang', 'them', 'chi', 'chut', 'nhieu', 'it', 'ngan', 'dai', 'an', 'ma',
];

export interface ParsedAskQuery {
  min: number | null;
  max: number | null;
  durText: string;
  full: boolean;
  channel: string;
  channelPhrase: string;
  concepts: AskConcept[];
  keywords: string[];
  random: boolean;
}

export function askFmtDur(m: number): string {
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const r = m % 60;
    return `${h} giờ${r ? ` ${r} phút` : ''}`;
  }
  return `${m} phút`;
}

export function askParse(rawQ: string, films: Film[]): ParsedAskQuery {
  const n = viNorm(rawQ);
  const p: ParsedAskQuery = {
    min: null,
    max: null,
    durText: '',
    full: false,
    channel: '',
    channelPhrase: '',
    concepts: [],
    keywords: [],
    random: false,
  };

  let m: RegExpMatchArray | null;
  if ((m = n.match(/tren\s*(\d+)\s*(gio|tieng)/))) {
    p.min = parseInt(m[1], 10) * 60 + 1;
    p.durText = `trên ${m[1]} giờ`;
  } else if ((m = n.match(/hon\s*(\d+)\s*(gio|tieng)/))) {
    p.min = parseInt(m[1], 10) * 60 + 1;
    p.durText = `trên ${m[1]} giờ`;
  } else if ((m = n.match(/duoi\s*(\d+)\s*(gio|tieng)/))) {
    p.max = parseInt(m[1], 10) * 60 - 1;
    p.durText = `dưới ${m[1]} giờ`;
  } else if ((m = n.match(/duoi\s*(\d+)\s*phut/))) {
    p.max = parseInt(m[1], 10);
    p.durText = `dưới ${m[1]} phút`;
  } else if ((m = n.match(/tren\s*(\d+)\s*phut/))) {
    p.min = parseInt(m[1], 10);
    p.durText = `trên ${m[1]} phút`;
  } else if ((m = n.match(/(\d+)\s*-\s*(\d+)\s*(gio|tieng)/))) {
    p.min = parseInt(m[1], 10) * 60;
    p.max = parseInt(m[2], 10) * 60;
    p.durText = `${m[1]}-${m[2]} giờ`;
  }

  if (/ca buoi toi/.test(n) && p.min === null) {
    p.min = 90;
    p.durText = 'xem cả buổi tối';
  }
  if (/xem nhanh|ngan/.test(n) && p.max === null) {
    p.max = 60;
    p.durText = 'xem nhanh (dưới 60 phút)';
  }
  if (/tron bo|mot leo|khong cho tap|khong doi tap/.test(n)) {
    p.full = true;
  } else if (hasPhrase(n, 'full')) {
    p.full = true;
  }

  const chans: string[] = [];
  films.forEach((c) => {
    if (c.channel && !chans.includes(c.channel)) chans.push(c.channel);
  });
  const ASK_GENERIC = ['phim', 'kenh', 'ai', 'ngan', 'dai', 'moi', 'hay', 'hot', 'viet', 'trung', 'an', 'xem', 'tim'];
  const ASK_CONCEPT_PHRASES: Record<string, boolean> = {};
  ASK_CONCEPTS.forEach((cp) => {
    cp.q.forEach((k) => {
      ASK_CONCEPT_PHRASES[k] = true;
    });
  });

  for (const ch of chans) {
    const cn = viNorm(ch);
    if (cn && hasPhrase(n, cn)) {
      p.channel = ch;
      p.channelPhrase = cn;
      break;
    }
    const w2 = cn.split(' ').slice(0, 2);
    if (w2.length === 2 && !ASK_GENERIC.includes(w2[0]) && !ASK_CONCEPT_PHRASES[w2.join(' ')] && hasPhrase(n, w2.join(' '))) {
      p.channel = ch;
      p.channelPhrase = w2.join(' ');
      break;
    }
  }

  ASK_CONCEPTS.forEach((cp) => {
    if (cp.q.some((k) => hasPhrase(n, k))) p.concepts.push(cp);
  });

  let rest = ` ${n} `;
  rest = rest
    .replace(/tren\s*\d+\s*(gio|tieng)/g, ' ')
    .replace(/hon\s*\d+\s*(gio|tieng)/g, ' ')
    .replace(/duoi\s*\d+\s*(gio|tieng)/g, ' ')
    .replace(/\d+\s*-\s*\d+\s*(gio|tieng)/g, ' ')
    .replace(/tren\s*\d+\s*phut/g, ' ')
    .replace(/duoi\s*\d+\s*phut/g, ' ')
    .replace(/ca buoi toi/g, ' ')
    .replace(/xem nhanh/g, ' ')
    .replace(/tron bo|mot leo|khong cho tap|khong doi tap/g, ' ')
    .replace(/\bfull\b/g, ' ')
    .replace(/ngau nhien/g, ' ');

  if (p.channelPhrase) {
    rest = rest.replace(new RegExp(p.channelPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), ' ');
  }
  ASK_CONCEPTS.forEach((cp) => {
    cp.q.forEach((k) => {
      rest = rest.split(` ${k} `).join(' ');
    });
  });

  p.keywords = rest.split(' ').filter((w) => w && !/^\d+$/.test(w) && !ASK_STOP.includes(w));
  p.random = p.concepts.length === 0 && p.keywords.length === 0 && p.min === null && p.max === null && !p.full && !p.channel;
  return p;
}

export interface ScoredFilm {
  film: Film;
  score: number;
  why: string;
}

export function askScore(c: Film, p: ParsedAskQuery): ScoredFilm | null {
  const m = durMinutes(c);
  if (p.min !== null && m < p.min) return null;
  if (p.max !== null && m > p.max) return null;
  if (p.full && !/full|trọn/i.test(c.dur || '')) return null;
  if (p.channel && c.channel !== p.channel) return null;

  const titleN = viNorm(c.title);
  const bodyN = viNorm(`${c.blurb || ''} ${c.blurbLong || ''} ${c.tool || ''} ${CAT_LABEL[c.cat] || ''} ${(c.tags || []).join(' ')}`);
  let score = 0;
  const why: string[] = [];

  p.concepts.forEach((cp) => {
    const hit = cp.cats.includes(c.cat) || cp.f.some((k) => hasPhrase(titleN, k) || hasPhrase(bodyN, k));
    if (hit) {
      score += 3;
      why.push(cp.label);
    }
  });

  p.keywords.forEach((kw) => {
    if (hasPhrase(titleN, kw)) {
      score += 3;
      why.push(`khớp "${kw}"`);
    } else if (hasPhrase(bodyN, kw)) {
      score += 2;
      why.push(`nội dung "${kw}"`);
    }
  });

  if (p.min !== null || p.max !== null) score += 2;
  if (p.full) score += 2;
  if (p.channel) {
    score += 2;
    why.push(`kênh ${c.channel}`);
  }
  why.push(`thời lượng ${askFmtDur(m)}`);
  return { film: c, score, why: why.join(' • ') };
}

export interface AskPreset {
  id: string;
  label: string;
  desc: string;
  query: string;
  test: (c: Film) => boolean;
}

export const ASK_PRESETS: AskPreset[] = [
  {
    id: 'caydem',
    label: 'Cày đêm giấu nghề — trọn bộ trên 5 tiếng',
    desc: 'Nhân vật ẩn giấu thực lực, phế vật nghịch tập, thời lượng trên 300 phút',
    query: 'tu tiên trọn bộ trên 5 tiếng giấu nghề phế vật',
    test: (c) =>
      /full|trọn/i.test(c.dur || '') &&
      durMinutes(c) >= 300 &&
      /giấu|phế vật|giả vờ|ẩn giấu|giả heo|nghịch thiên/i.test(`${c.title || ''} ${c.blurb || ''} ${c.blurbLong || ''}`),
  },
  {
    id: 'tutien',
    label: 'Tu tiên trọn bộ trên 4 tiếng',
    desc: 'Đại chiến tiên giới, độ kiếp hóa thần, xem liền mạch không chờ tập',
    query: 'tu tiên trọn bộ trên 4 tiếng',
    test: (c) => /full|trọn/i.test(c.dur || '') && durMinutes(c) >= 240 && ((c.tags || []).includes('tu tiên') || c.cat === 'trung'),
  },
  {
    id: 'thuyetminh',
    label: 'Thuyết minh Việt — dài trên 5 tiếng',
    desc: 'Bản lồng tiếng / thuyết minh tiếng Việt rõ ràng để nghe hoặc cày đêm',
    query: 'thuyết minh trọn bộ trên 5 tiếng',
    test: (c) => /Thuyết minh|Lồng tiếng/i.test(c.tool || '') && durMinutes(c) >= 300,
  },
  {
    id: 'ngontinh',
    label: 'Ngôn tình, tổng tài — dài tập',
    desc: 'Xuyên không, trọng sinh báo thù, hào môn thế gia trên 2 tiếng',
    query: 'ngôn tình tổng tài trên 2 tiếng',
    test: (c) => ((c.tags || []).includes('ngôn tình') || (c.tags || []).includes('tổng tài')) && durMinutes(c) >= 120,
  },
  {
    id: 'suviet',
    label: 'Hào khí Sử Việt & Văn hóa Việt',
    desc: 'Tái hiện lịch sử Đại Việt, truyền thuyết dân gian bằng công nghệ AI',
    query: 'phim việt nam lịch sử hào hùng',
    test: (c) => c.cat === 'vietnam',
  },
  {
    id: 'scifi',
    label: 'Viễn tưởng & Fantasy Quốc tế (Veo / Sora)',
    desc: 'Phim ngắn điện ảnh quốc tế sử dụng Google Veo, OpenAI Sora, Runway',
    query: 'phim viễn tưởng fantasy xem nhanh dưới 30 phút',
    test: (c) => (c.cat === 'fantasy' || c.cat === 'scifi') && durMinutes(c) <= 45,
  },
];

// Series grouping logic ported from phimai.online
const SEASON_RANGE = [/\bmua\s*(\d+)\s*[-+]\s*(\d+)\b/, /\bseason\s*(\d+)\s*[-+]\s*(\d+)\b/];
const PART_RES: Array<[RegExp, string]> = [
  [/\bphan\s*dau\b/, 'first'],
  [/\bphan\s*cuoi\b/, 'last'],
  [/\bphan\s*(\d+)\s*[-+]\s*(\d+)\b/, 'range'],
  [/\bphan\s*(\d+)\b/, 'num'],
  [/\bp\s*(\d+)\s*[-+]\s*(\d+)\b/, 'range'],
  [/\bp(\d+)\b/, 'num'],
  [/\bpart\s*(\d+)\s*[-+]\s*(\d+)\b/, 'range'],
  [/\bpart\s*(\d+)\b/, 'num'],
  [/\bseason\s*(\d+)\b/, 'num'],
  [/\bmua\s*(\d+)\b/, 'num'],
  [/\btap\s*(\d+)\s*[-+]\s*(\d+)\b/, 'range'],
  [/\btap\s*(\d+)\b/, 'num'],
  [/\bep\s*(\d+)\s*[-+]\s*(\d+)\b/, 'range'],
  [/\bep\s*(\d+)\b/, 'num'],
];
const COMPLETE_RES = [/\bfull\b/g, /tron bo/g, /ban full/g, /\bcomplete\b/g];
const GENERIC_WORDS = new Set(
  'ai movie film short horror thriller fantasy scifi sci fi supernatural epic adventure drama animation animated generated hollywood style official trailer teaser festival global series episode season part end bo tron ban full complete dai the a an of'.split(' ')
);

function normSeries(s: string): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/[“”"'‘’`´]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function findPart(t: string): [string | null, number | null, boolean] {
  for (const r of SEASON_RANGE) {
    if (r.test(t)) return [null, null, true];
  }
  for (const [r, kind] of PART_RES) {
    const m = r.exec(t);
    if (m) {
      if (kind === 'first') return ['dau', 0, false];
      if (kind === 'last') return ['cuoi', 999, false];
      if (kind === 'range') return [`${m[1]}-${m[2]}`, parseInt(m[1], 10), false];
      return [m[1], parseInt(m[1], 10), false];
    }
  }
  return [null, null, false];
}

function cleanSegment(seg: string): string {
  let s = seg.replace(/^(?:【|\[)[^】\]]*(?:】|\])\s*/, '');
  s = s.replace(/[\(\[【]\s*new\s*[\)\]】]/g, ' ');
  for (const r of SEASON_RANGE) s = s.replace(new RegExp(r.source, 'g'), ' ');
  for (const [r] of PART_RES) s = s.replace(new RegExp(r.source), ' ');
  for (const r of COMPLETE_RES) s = s.replace(r, ' ');
  s = s.replace(/\b\d+\s*h\b/g, ' ');
  s = s.replace(/[^\p{L}\p{N}\s]/gu, ' ');
  s = s.replace(/\b(full hd|fhd|4k|8k|202[0-9]|20[0-9]{2})\b/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

const GENERIC_SERIES_PHRASES = new Set([
  'phim',
  'phim ai',
  'phim ngan',
  'phim moi',
  'phim hay',
  'review phim',
  'phim thuyet minh',
  'phim vietsub',
  'phim ngon tinh',
  'phim co trang',
  'hoat hinh',
  'hoat hinh 3d',
  'short drama',
  'full bo',
  'tron bo',
  'noi bat',
  'tap moi',
  'phan moi',
]);

const PART_RANGE_RE = /(?:tap|phan|part|ep|episode)\s*\d+\s*[-–~]\s*\d+/i;
const RAW_EP_STRIP_RE = /[\(\[【]?\s*(?:tập|tap|phần|phan|part|ep|episode|chương|chuong|mùa|mua|season|p)\s*0*\d+(?:\s*[-–~]\s*\d+)?\s*[\)\]】.\-:]*/gi;

export function getEpisodeNumber(film: Pick<Film, 'title'>): number | null {
  const raw = film?.title || '';
  const n = normSeries(raw);
  if (PART_RANGE_RE.test(n)) return null;
  const [, num] = findPart(n);
  return num;
}

export function getEpisodeInfo(
  title: string,
  channel = ''
): { baseKey: string; baseTitle: string; epNum: number | null } {
  const n = normSeries(title);
  const epNum = PART_RANGE_RE.test(n) ? null : findPart(n)[1];
  const pipeSegs = (title || '').split(/[｜│|]/);
  const candidates: string[] = [];

  for (const ps of pipeSegs) {
    const m = RAW_EP_STRIP_RE.exec(ps);
    RAW_EP_STRIP_RE.lastIndex = 0;
    if (m && m.index > 2) {
      const prefix = ps.slice(0, m.index).replace(/[-–—:•\s]+$/, '').trim();
      if (prefix) candidates.push(prefix);
    }
    const stripped = ps.replace(RAW_EP_STRIP_RE, ' ').replace(/^[-–—:•\s]+|[-–—:•\s]+$/g, '').trim();
    if (stripped) candidates.push(stripped);
    for (const sub of ps.split(/[-—:]/)) {
      const subClean = sub.replace(RAW_EP_STRIP_RE, ' ').trim();
      if (subClean) candidates.push(subClean);
    }
  }

  const normCh = cleanSegment(normSeries(channel));
  for (const rawCand of candidates) {
    const cleaned = cleanSegment(normSeries(rawCand));
    const words = cleaned.split(' ').filter(Boolean);
    if (
      words.length >= 2 &&
      cleaned !== normCh &&
      !GENERIC_SERIES_PHRASES.has(cleaned) &&
      !words.every((w) => GENERIC_WORDS.has(w))
    ) {
      const baseKey = words.slice(0, 7).join(' ');
      const baseTitle = rawCand.trim().split(/\s+/).slice(0, 7).join(' ');
      return { baseKey, baseTitle, epNum };
    }
  }

  return { baseKey: '', baseTitle: '', epNum };
}

export function getSeriesEpisodes(film: Film, allFilms: Film[]): Film[] {
  const info = getEpisodeInfo(film.title, film.channel);
  const base = info.baseKey;
  if (!base) return [];

  const targetChannel = normSeries(film.channel || '');
  const seen = new Set<string>();
  const candidates: Film[] = [];

  for (const f of allFilms) {
    if (!f?.id || seen.has(f.id)) continue;
    const fCh = normSeries(f.channel || '');
    if (targetChannel && fCh && fCh !== targetChannel) continue;

    const fInfo = getEpisodeInfo(f.title, f.channel);
    const matchesKey = fInfo.baseKey === base;
    const matchesNorm = fInfo.epNum !== null && cleanSegment(normSeries(f.title)).includes(base);
    if (matchesKey || matchesNorm) {
      seen.add(f.id);
      candidates.push(f);
    }
  }

  if (candidates.length < 2 && info.epNum === null) return [];
  return candidates
    .slice()
    .sort((a, b) => {
      const ordA = getEpisodeNumber(a) ?? 9999;
      const ordB = getEpisodeNumber(b) ?? 9999;
      return ordA - ordB || a.rank - b.rank;
    })
    .slice(0, 120);
}

// 18+ age verification helpers (device-local)
const AGE_KEY = 'phimai_age_verified_v1';

export function isAgeVerified(): boolean {
  try {
    return localStorage.getItem(AGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markAgeVerified(): void {
  try {
    localStorage.setItem(AGE_KEY, '1');
  } catch {
    // ignore storage errors
  }
}

export function calculateAge(day: number, month: number, year: number): number | null {
  if (!day || !month || !year || year < 1900 || year > new Date().getFullYear()) return null;
  const dob = new Date(year, month - 1, day);
  if (dob.getFullYear() !== year || dob.getMonth() !== month - 1 || dob.getDate() !== day) {
    return null;
  }
  const now = new Date();
  let age = now.getFullYear() - year;
  const mDiff = now.getMonth() - (month - 1);
  if (mDiff < 0 || (mDiff === 0 && now.getDate() < day)) {
    age--;
  }
  return age;
}
