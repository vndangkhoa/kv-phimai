import React, { useMemo, useState } from 'react';
import { Clock, Search, Shuffle, SlidersHorizontal, Sparkles } from 'lucide-react';
import { Dialog } from '@astryxdesign/core/Dialog';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import type { Film, FilterState } from '../types/phimai';
import {
  ASK_PRESETS,
  askFmtDur,
  askParse,
  askScore,
  durMinutes,
  type ScoredFilm,
} from '../utils/phimaiUtils';
import { FilmThumb } from './FilmThumb';
import { OverlayHeader } from './OverlayHeader';
import { PHONE_QUERY, useMediaQuery } from './useMediaQuery';
import './overlays.css';

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

const ICON = { className: 'h-4 w-4 shrink-0', strokeWidth: 1.75 } as const;

/** Vietnamese natural-language film finder (askParse + askScore). */
export const AskAssistantModal: React.FC<AskAssistantModalProps> = ({
  isOpen,
  films,
  onOpenFilm,
  onApplyFilters,
  onClose,
}) => {
  const isPhone = useMediaQuery(PHONE_QUERY);
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
            why: `${preset.label} · thời lượng ${askFmtDur(durMinutes(f))}`,
          }));
        return {
          summary: `Combo "${preset.label}": ${matched.length.toLocaleString('vi-VN')} phim phù hợp.`,
          results: matched,
          parsed: askParse(preset.query, films),
        };
      }
    }

    const q = submittedQuery.trim();
    if (!q) {
      return {
        summary: 'Mô tả bộ phim bạn muốn xem: thể loại, độ dài, trọn bộ hay kênh.',
        results: [] as ScoredFilm[],
        parsed: null,
      };
    }

    let parsed = askParse(q, films);
    // askParse can read a generic phrase ("trọn bộ") as a channel name, which
    // then filters out every film. Drop that channel guess when it matches nothing.
    if (parsed.channel && !films.some((f) => (askScore(f, parsed)?.score ?? 0) >= 2)) {
      parsed = { ...parsed, channel: '', channelPhrase: '' };
    }
    if (parsed.random) {
      const fullPool = films.filter((f) => /full|trọn/i.test(f.dur || ''));
      const pool = (fullPool.length >= 10 ? fullPool : films).slice(0, 24).map((f) => ({
        film: f,
        score: 5,
        why: `Gợi ý ngẫu nhiên · thời lượng ${askFmtDur(durMinutes(f))}`,
      }));
      return { summary: 'Gợi ý nhanh các phim AI trọn bộ nổi bật trong kho:', results: pool, parsed };
    }

    const scored: ScoredFilm[] = [];
    for (const f of films) {
      const res = askScore(f, parsed);
      if (res && res.score >= 2) scored.push(res);
    }
    scored.sort((a, b) => b.score - a.score || b.film.rank - a.film.rank);

    const bits: string[] = [];
    if (parsed.concepts.length > 0) bits.push(`chủ đề ${parsed.concepts.map((c) => c.label).join(', ')}`);
    if (parsed.channel) bits.push(`kênh ${parsed.channel}`);
    if (parsed.full) bits.push('trọn bộ FULL');
    if (parsed.durText) bits.push(parsed.durText);
    if (parsed.keywords.length > 0) bits.push(`từ khóa "${parsed.keywords.join(' ')}"`);

    const summary =
      scored.length > 0
        ? `${scored.length.toLocaleString('vi-VN')} phim khớp: ${bits.join(' + ')}.`
        : 'Chưa có phim khớp mọi điều kiện. Thử nới độ dài hoặc chọn một combo bên dưới.';

    return { summary, results: scored, parsed };
  }, [submittedQuery, activePresetId, films]);

  const handleRunSearch = (e?: React.FormEvent) => {
    e?.preventDefault();
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
      if (firstConcept.cats.length > 0) patch.cat = firstConcept.cats[0];
      else patch.genre = firstConcept.label;
    }
    if (p.keywords.length > 0) {
      patch.query = p.keywords.join(' ');
    } else if (!patch.genre || patch.genre === 'all') {
      patch.query = query.trim();
    }
    if (p.min !== null && p.min >= 240) patch.time = 'o240';
    else if (p.min !== null && p.min >= 120) patch.time = 'h24';
    else if (p.max !== null && p.max <= 120) patch.time = 'u120';

    onApplyFilters(patch);
    onClose();
  };

  const visibleResults = evaluation.results.slice(0, shownCount);

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      variant={isPhone ? 'fullscreen' : 'standard'}
      width={960}
      maxHeight="92dvh"
      padding={0}
      purpose="form"
      className="kv-overlay"
      data-testid="ask-assistant-modal"
    >
      {isOpen ? (
        <div className="kv-frame">
          <OverlayHeader
            title="Trợ lý AI chọn phim"
            subtitle="Hỏi bằng tiếng Việt: cốt truyện, thời lượng, trọn bộ hay kênh, trên toàn bộ kho phim."
            startContent={
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#ffd875]/15 text-[#ffd875]">
                <Sparkles className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
              </span>
            }
            onClose={onClose}
            closeLabel="Đóng trợ lý"
          />

          <div className="kv-body kv-scroll space-y-5 px-4 pt-4 sm:px-6 sm:pt-5">
            {/* Natural language query */}
            <form onSubmit={handleRunSearch} role="search" className="space-y-2">
              <TextInput
                type="search"
                label="Bạn muốn xem phim gì?"
                isLabelHidden
                value={query}
                onChange={(v) => setQuery(v)}
                placeholder="VD: tu tiên hài hước trọn bộ trên 4 tiếng"
                startIcon={Search}
                enterKeyHint="search"
                hasClear
                width="100%"
              />
              <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                <Button
                  type="submit"
                  variant="primary"
                  label="Tìm theo ý"
                  icon={<Sparkles {...ICON} aria-hidden="true" />}
                  width={isPhone ? '100%' : undefined}
                  className="kv-touch"
                />
                <Button
                  label="Áp bộ lọc"
                  tooltip="Áp điều kiện tìm vào lưới phim chính"
                  icon={<SlidersHorizontal {...ICON} aria-hidden="true" />}
                  onClick={handleApplyToMainGrid}
                  width={isPhone ? '100%' : undefined}
                  className="kv-touch"
                />
              </div>
            </form>

            {/* Quick prompts */}
            <section aria-labelledby="kv-ask-prompts">
              <h3 id="kv-ask-prompts" className="text-sm font-semibold text-[#f4f4f6]">
                Câu hỏi gợi ý
              </h3>
              <ul className="kv-scroll-x -mx-4 mt-2 flex gap-2 px-4 sm:mx-0 sm:flex-wrap sm:px-0">
                {QUICK_PROMPTS.map((qp) => {
                  const active = submittedQuery === qp && !activePresetId;
                  return (
                    <li key={qp} className="shrink-0">
                      <button
                        type="button"
                        onClick={() => handleSelectPrompt(qp)}
                        aria-pressed={active}
                        className={`min-h-[44px] whitespace-nowrap rounded-full border px-3.5 text-xs transition-colors sm:min-h-[36px] ${
                          active
                            ? 'border-[#ffd875] bg-[#ffd875]/15 font-semibold text-[#ffd875]'
                            : 'border-[#f4f4f6]/15 bg-[#161822] text-[#c4c8d9] hover:border-[#f4f4f6]/35 hover:text-[#f4f4f6]'
                        }`}
                      >
                        {qp}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* Curated combos */}
            <section aria-labelledby="kv-ask-combos">
              <h3 id="kv-ask-combos" className="text-sm font-semibold text-[#f4f4f6]">
                Combo tâm trạng và cày đêm
              </h3>
              <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {ASK_PRESETS.map((preset) => {
                  const isSelected = activePresetId === preset.id;
                  return (
                    <li key={preset.id}>
                      <button
                        type="button"
                        onClick={() => handleSelectPreset(preset.id, preset.query)}
                        aria-pressed={isSelected}
                        className={`flex min-h-[56px] w-full flex-col items-start rounded-xl border p-3 text-left transition-colors ${
                          isSelected
                            ? 'border-[#ffd875] bg-[#ffd875]/15'
                            : 'border-[#f4f4f6]/10 bg-[#161822] hover:border-[#f4f4f6]/25'
                        }`}
                      >
                        <span className="text-xs font-bold text-[#f4f4f6]">{preset.label}</span>
                        <span className="mt-1 line-clamp-2 text-[11px] text-[#c4c8d9]">{preset.desc}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* Results */}
            <section aria-labelledby="kv-ask-summary" className="rounded-xl border border-[#f4f4f6]/10 bg-[#161822] p-3 sm:p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p id="kv-ask-summary" role="status" className="text-sm font-semibold text-[#ffd875] tabular-nums">
                  {evaluation.summary}
                </p>
                <Button
                  label="Đổi ngẫu nhiên"
                  size="sm"
                  variant="ghost"
                  icon={<Shuffle {...ICON} aria-hidden="true" />}
                  onClick={() => handleSelectPrompt('Gợi ý ngẫu nhiên')}
                  className="kv-touch self-start sm:self-auto"
                />
              </div>

              {visibleResults.length > 0 && (
                <ul className="mt-3 grid grid-cols-1 gap-2.5 md:grid-cols-2">
                  {visibleResults.map(({ film, why }) => (
                    <li key={film.id} className="min-w-0">
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenFilm(film);
                        }}
                        className="kv-thumb-zoom group flex w-full items-start gap-3 rounded-xl border border-[#f4f4f6]/10 bg-[#0d0e14] p-2.5 text-left transition-colors hover:border-[#ffd875]/60"
                      >
                        <span className="relative block h-16 w-28 shrink-0 overflow-hidden rounded-lg bg-black">
                          <FilmThumb id={film.id} alt="" className="h-full w-full object-cover" />
                          <span className="absolute bottom-1 left-1 rounded-md bg-black/80 px-1.5 py-0.5 text-[10px] font-bold text-[#ffd875] tabular-nums">
                            #{film.rank}
                          </span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-2 text-xs font-bold text-[#f4f4f6] group-hover:text-[#ffd875]">
                            {film.title}
                          </span>
                          <span className="mt-1 block text-[11px] font-medium text-[#34d399]">{why}</span>
                          <span className="mt-1 flex items-center gap-2 text-[11px] text-[#c4c8d9] tabular-nums">
                            <span className="truncate">{film.channel}</span>
                            {film.dur && (
                              <span className="inline-flex shrink-0 items-center gap-0.5">
                                <Clock className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
                                {film.dur}
                              </span>
                            )}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {evaluation.results.length > shownCount && (
                <div className="mt-4 flex justify-center">
                  <Button
                    label={`Xem thêm (${shownCount}/${evaluation.results.length.toLocaleString('vi-VN')})`}
                    onClick={() => setShownCount((c) => c + 12)}
                    width={isPhone ? '100%' : undefined}
                    className="kv-touch tabular-nums"
                  />
                </div>
              )}
            </section>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
};
