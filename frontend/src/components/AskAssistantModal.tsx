import React, { useState, useMemo } from 'react';
import {
  X,
  Sparkles,
  Search,
  Play,
  SlidersHorizontal,
  Shuffle,
  Clock,
  Film as FilmIcon,
} from 'lucide-react';
import type { Film, FilterState } from '../types/phimai';
import {
  ASK_PRESETS,
  askFmtDur,
  askParse,
  askScore,
  durMinutes,
  getFallbackThumbUrl,
  getThumbUrl,
  type ScoredFilm,
} from '../utils/phimaiUtils';

export interface AskAssistantModalProps {
  isOpen: boolean;
  films: Film[];
  onOpenFilm: (film: Film) => void;
  onApplyFilters: (patch: Partial<FilterState>) => void;
  onClose: () => void;
}

const QUICK_PROMPTS = [
  'Phim tu tiên trọn bộ trên 4 tiếng',
  'Xuyên không trọng sinh nữ cường báo thù',
  'Mạt thế sinh tồn zombie kịch tính',
  'Ngôn tình tổng tài hào môn dài tập',
  'Phim lịch sử Việt Nam hào hùng',
  'Viễn tưởng không gian AI Veo Sora dưới 30 phút',
];

export const AskAssistantModal: React.FC<AskAssistantModalProps> = ({
  isOpen,
  films,
  onOpenFilm,
  onApplyFilters,
  onClose,
}) => {
  const [query, setQuery] = useState<string>('');
  const [submittedQuery, setSubmittedQuery] = useState<string>('Phim tu tiên trọn bộ trên 4 tiếng');
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [shownCount, setShownCount] = useState<number>(12);

  const evaluation = useMemo(() => {
    if (activePresetId) {
      const preset = ASK_PRESETS.find((p) => p.id === activePresetId);
      if (preset) {
        const matched = films
          .filter(preset.test)
          .sort((a, b) => b.rank - a.rank)
          .map((f) => ({
            film: f,
            score: 10,
            why: `${preset.label} • thời lượng ${askFmtDur(durMinutes(f))}`,
          }));
        return {
          summary: `Khớp combo "${preset.label}": tìm thấy ${matched.length} bộ phim phù hợp nhất.`,
          results: matched,
          parsed: askParse(preset.query, films),
        };
      }
    }

    const q = submittedQuery.trim();
    if (!q) {
      return {
        summary: 'Hãy nhập mô tả bộ phim bạn muốn xem (thể loại, độ dài, trọn bộ, kênh...)',
        results: [] as ScoredFilm[],
        parsed: null,
      };
    }

    const parsed = askParse(q, films);
    if (parsed.random) {
      const fullPool = films.filter((f) => /full|trọn/i.test(f.dur || ''));
      const pool = (fullPool.length >= 10 ? fullPool : films)
        .slice(0, 24)
        .map((f) => ({
          film: f,
          score: 5,
          why: `Đề xuất ngẫu nhiên • thời lượng ${askFmtDur(durMinutes(f))}`,
        }));
      return {
        summary: 'Gợi ý nhanh các bộ phim AI trọn bộ nổi bật trong kho:',
        results: pool,
        parsed,
      };
    }

    const scored: ScoredFilm[] = [];
    for (const f of films) {
      const res = askScore(f, parsed);
      if (res && res.score >= 2) {
        scored.push(res);
      }
    }
    scored.sort((a, b) => b.score - a.score || b.film.rank - a.film.rank);

    const bits: string[] = [];
    if (parsed.concepts.length > 0) {
      bits.push(`chủ đề ${parsed.concepts.map((c) => c.label).join(', ')}`);
    }
    if (parsed.channel) bits.push(`kênh ${parsed.channel}`);
    if (parsed.full) bits.push('trọn bộ FULL');
    if (parsed.durText) bits.push(parsed.durText);
    if (parsed.keywords.length > 0) bits.push(`từ khóa "${parsed.keywords.join(' ')}"`);

    const summary =
      scored.length > 0
        ? `Tìm thấy ${scored.length.toLocaleString('vi-VN')} bộ phim khớp với: ${bits.join(' + ')}.`
        : 'Chưa tìm thấy bộ phim khớp chặt với mọi điều kiện — bạn thử nới độ dài hoặc chọn combo bên dưới.';

    return {
      summary,
      results: scored,
      parsed,
    };
  }, [submittedQuery, activePresetId, films]);

  if (!isOpen) return null;

  const handleRunSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setActivePresetId(null);
    setSubmittedQuery(query.trim() || 'Gợi ý ngẫu nhiên');
    setShownCount(12);
  };

  const handleSelectPrompt = (promptText: string) => {
    setActivePresetId(null);
    setQuery(promptText);
    setSubmittedQuery(promptText);
    setShownCount(12);
  };

  const handleSelectPreset = (presetId: string, presetQuery: string) => {
    setActivePresetId(presetId);
    setQuery(presetQuery);
    setSubmittedQuery(presetQuery);
    setShownCount(12);
  };

  const handleApplyToMainGrid = () => {
    const p = evaluation.parsed || askParse(query || submittedQuery, films);
    const patch: Partial<FilterState> = {
      cat: 'all',
      genre: 'all',
      fullOnly: p.full,
      time: 'all',
      channel: p.channel || '',
      query: '',
    };

    if (p.concepts.length > 0) {
      const firstConcept = p.concepts[0];
      if (firstConcept.cats.length > 0) {
        patch.cat = firstConcept.cats[0];
      } else {
        patch.genre = firstConcept.label;
      }
    }
    if (p.keywords.length > 0) {
      patch.query = p.keywords.join(' ');
    } else if (!patch.genre || patch.genre === 'all') {
      patch.query = query.trim();
    }

    if (p.min !== null && p.min >= 240) {
      patch.time = 'o240';
    } else if (p.min !== null && p.min >= 120) {
      patch.time = 'h24';
    } else if (p.max !== null && p.max <= 120) {
      patch.time = 'u120';
    }

    onApplyFilters(patch);
    onClose();
  };

  const visibleResults = evaluation.results.slice(0, shownCount);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-3 backdrop-blur-md sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Trợ lý AI tìm phim tiếng Việt"
    >
      <div className="relative my-auto flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[#f4f4f6]/15 bg-[#0d0e14] text-[#f4f4f6] shadow-[0_24px_64px_rgba(0,0,0,0.85)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#f4f4f6]/10 bg-[#141722] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#ffd875]/15 text-[#ffd875]">
              <Sparkles className="h-5 w-5" strokeWidth={1.75} />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#f4f4f6] sm:text-lg">
                Trợ lý AI Chọn Phim (Ngôn ngữ tự nhiên tiếng Việt)
              </h2>
              <p className="text-xs text-[#b4b8c8]">
                Phân tích cốt truyện (tu tiên, xuyên không, trọng sinh, mạt thế), thời lượng & kênh trên toàn bộ 9.220 phim
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng trợ lý"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#f4f4f6]/15 bg-[#f4f4f6]/5 text-[#f4f4f6] hover:bg-[#f4f4f6]/15"
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-5 overflow-y-auto p-5">
          {/* Natural Language Input Form */}
          <form onSubmit={handleRunSearch} className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#b4b8c8]"
                strokeWidth={1.75}
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="VD: phim tu tiên hài hước trọn bộ trên 4 tiếng, hoặc xuyên không báo thù..."
                className="w-full rounded-xl border border-[#f4f4f6]/20 bg-[#161822] py-2.5 pl-10 pr-4 text-sm text-[#f4f4f6] placeholder-[#8f95ab] focus:border-[#ffd875] focus:outline-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#ffd875] px-4 py-2.5 text-xs font-bold text-[#0d0e14] transition-colors hover:bg-[#ffe294]"
              >
                <Sparkles className="h-4 w-4" strokeWidth={1.75} />
                <span>Tìm theo ý</span>
              </button>
              <button
                type="button"
                onClick={handleApplyToMainGrid}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#f4f4f6]/20 bg-[#161822] px-3.5 py-2.5 text-xs font-semibold text-[#f4f4f6] transition-colors hover:bg-[#f4f4f6]/10"
              >
                <SlidersHorizontal className="h-4 w-4 text-[#ffd875]" strokeWidth={1.75} />
                <span>Áp vào lưới chính</span>
              </button>
            </div>
          </form>

          {/* Quick Natural Language Examples */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-[#b4b8c8]">Gợi ý câu hỏi:</span>
            {QUICK_PROMPTS.map((qp) => (
              <button
                key={qp}
                type="button"
                onClick={() => handleSelectPrompt(qp)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  submittedQuery === qp && !activePresetId
                    ? 'border-[#ffd875] bg-[#ffd875]/20 text-[#ffd875] font-semibold'
                    : 'border-[#f4f4f6]/15 bg-[#161822] text-[#c9cddc] hover:border-[#f4f4f6]/35'
                }`}
              >
                {qp}
              </button>
            ))}
          </div>

          {/* Curated Combo Presets */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#b4b8c8]">
              Combo tâm trạng & Cày đêm chọn sẵn
            </h3>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
              {ASK_PRESETS.map((preset) => {
                const isSelected = activePresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectPreset(preset.id, preset.query)}
                    className={`flex flex-col items-start rounded-xl border p-3 text-left transition-all ${
                      isSelected
                        ? 'border-[#ffd875] bg-[#ffd875]/15'
                        : 'border-[#f4f4f6]/10 bg-[#161822] hover:border-[#f4f4f6]/25'
                    }`}
                  >
                    <span className="text-xs font-bold text-[#f4f4f6]">{preset.label}</span>
                    <span className="mt-1 line-clamp-2 text-[11px] text-[#b4b8c8]">
                      {preset.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Results Section */}
          <div className="rounded-xl border border-[#f4f4f6]/10 bg-[#161822] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-[#ffd875] tabular-nums">
                {evaluation.summary}
              </p>
              <button
                type="button"
                onClick={() => handleSelectPrompt('Gợi ý ngẫu nhiên')}
                className="inline-flex items-center gap-1 rounded-lg border border-[#f4f4f6]/15 bg-[#0d0e14] px-2.5 py-1 text-xs text-[#c9cddc] hover:text-[#f4f4f6]"
              >
                <Shuffle className="h-3.5 w-3.5" strokeWidth={1.75} />
                <span>Đổi ngẫu nhiên</span>
              </button>
            </div>

            {visibleResults.length > 0 && (
              <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {visibleResults.map(({ film, why }) => (
                  <button
                    key={film.id}
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenFilm(film);
                    }}
                    className="group flex items-start gap-3 rounded-xl border border-[#f4f4f6]/10 bg-[#0d0e14] p-2.5 text-left transition-all hover:border-[#ffd875]/60"
                  >
                    <div className="relative h-16 w-28 shrink-0 overflow-hidden rounded-lg bg-black">
                      <img
                        src={getThumbUrl(film.id)}
                        onError={(e) => {
                          const t = e.currentTarget;
                          if (!t.dataset.fallback) {
                            t.dataset.fallback = '1';
                            t.src = getFallbackThumbUrl(film.id);
                          }
                        }}
                        alt={film.title}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      <span className="absolute bottom-1 left-1 rounded bg-black/80 px-1.5 py-0.5 text-[10px] font-bold text-[#ffd875] tabular-nums">
                        #{film.rank}
                      </span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-2 text-xs font-bold text-[#f4f4f6] group-hover:text-[#ffd875]">
                        {film.title}
                      </div>
                      <div className="mt-1 text-[11px] font-medium text-[#10b981]">
                        {why}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-[#b4b8c8] tabular-nums">
                        <span className="truncate">{film.channel}</span>
                        {film.dur && (
                          <span className="inline-flex shrink-0 items-center gap-0.5">
                            <Clock className="h-3 w-3" strokeWidth={1.75} />
                            {film.dur}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {evaluation.results.length > shownCount && (
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={() => setShownCount((c) => c + 12)}
                  className="rounded-xl border border-[#f4f4f6]/20 bg-[#0d0e14] px-4 py-2 text-xs font-semibold text-[#f4f4f6] tabular-nums hover:border-[#ffd875]"
                >
                  Xem thêm kết quả ({shownCount}/{evaluation.results.length.toLocaleString('vi-VN')})
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
