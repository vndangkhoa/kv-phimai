import React, { useState, useRef, useMemo, useEffect } from 'react';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Kbd } from '@astryxdesign/core/Kbd';
import { Menu, Search, ArrowLeft } from 'lucide-react';
import type { Film } from '../types/phimai';
import { getThumbUrl } from '../utils/phimaiUtils';
import { Logo } from './Logo';

interface HeaderProps {
  query: string;
  onQueryChange: (q: string) => void;
  onSubmitSearch: (q: string) => void;
  onToggleSidebar: () => void;
  onGoHome: () => void;
  allFilms: Film[];
  onSelectFilm: (film: Film) => void;
  onlineCount: number;
}

export function Header({
  query,
  onQueryChange,
  onSubmitSearch,
  onToggleSidebar,
  onGoHome,
  allFilms,
  onSelectFilm,
  onlineCount,
}: HeaderProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) {
        return;
      }
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !isFocused) return [];
    const matched: Film[] = [];
    for (const f of allFilms) {
      if (
        f.title.toLowerCase().includes(q) ||
        f.channel.toLowerCase().includes(q) ||
        (f.tags || []).some((t) => t.toLowerCase().includes(q))
      ) {
        matched.push(f);
        if (matched.length >= 7) break;
      }
    }
    return matched;
  }, [query, isFocused, allFilms]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    onSubmitSearch(query);
    setIsFocused(false);
    setMobileSearchOpen(false);
  };

  return (
    <header className="yt-header">
      {!mobileSearchOpen ? (
        <>
          {/* Left: Hamburger + PhimAI Brand + Live Online Pill */}
          <div className="yt-header-left" style={{ gap: '12px' }}>
            <IconButton
              variant="ghost"
              size="md"
              label="Danh mục"
              tooltip="Danh mục"
              onClick={onToggleSidebar}
              icon={<Menu size={20} strokeWidth={1.75} />}
            />

            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                onGoHome();
              }}
              className="yt-logo-link"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                marginLeft: 0,
                textDecoration: 'none',
              }}
              title="PhimAI — Trang chủ"
            >
              <Logo size={28} />
            </a>

            <span className="phimai-online-pill hidden-mobile">
              <StatusDot variant="success" label={`${onlineCount} đang xem`} isPulsing />
              <span>{onlineCount} đang xem</span>
            </span>
          </div>

          {/* Center: Cinema Noir Search Bar with Astryx TextInput */}
          <div
            className="yt-header-center hidden-mobile"
            style={{ position: 'relative' }}
            onFocusCapture={() => setIsFocused(true)}
            onBlurCapture={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                setTimeout(() => setIsFocused(false), 160);
              }
            }}
          >
            <form className="phimai-search-form" onSubmit={handleSubmit}>
              <div className="phimai-search-input-wrap">
                <TextInput
                  ref={inputRef}
                  type="search"
                  enterKeyHint="search"
                  size="lg"
                  label="Tìm kiếm phim AI"
                  isLabelHidden
                  startIcon="search"
                  hasClear
                  width="100%"
                  placeholder="Tìm kiếm 9.220+ phim AI, kênh, thể loại..."
                  value={query}
                  onChange={(val) => onQueryChange(val)}
                  onEnter={() => handleSubmit()}
                />

                {!query && !isFocused && (
                  <span
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      pointerEvents: 'none',
                      opacity: 0.72,
                    }}
                  >
                    <Kbd keys="/" />
                  </span>
                )}
              </div>

              <Button
                type="submit"
                variant="secondary"
                size="lg"
                label="Tìm"
                tooltip="Tìm kiếm"
                icon={<Search size={16} strokeWidth={1.75} />}
              />
            </form>

            {suggestions.length > 0 && (
              <div className="yt-search-suggestions" role="listbox" aria-label="Gợi ý tìm kiếm">
                {suggestions.map((film) => (
                  <button
                    type="button"
                    key={film.id}
                    role="option"
                    aria-selected={false}
                    className="yt-suggestion-item"
                    style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'left' }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setIsFocused(false);
                      onSelectFilm(film);
                    }}
                  >
                    <img
                      src={getThumbUrl(film.id)}
                      alt=""
                      width={48}
                      height={27}
                      loading="lazy"
                      style={{
                        width: '48px',
                        height: '27px',
                        borderRadius: '4px',
                        objectFit: 'cover',
                        flexShrink: 0,
                        backgroundColor: '#08090d',
                      }}
                    />
                    <span
                      style={{
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontSize: '13.5px',
                        color: 'var(--color-text-primary)',
                      }}
                    >
                      {film.title}
                    </span>
                    <span
                      className="phimai-tabular"
                      style={{ fontSize: '11.5px', color: 'var(--color-text-secondary)', flexShrink: 0 }}
                    >
                      {film.channel}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right: Mobile Search trigger */}
          <div className="yt-header-right">
            <div className="visible-mobile">
              <IconButton
                variant="ghost"
                size="md"
                label="Tìm kiếm"
                onClick={() => setMobileSearchOpen(true)}
                icon={<Search size={20} strokeWidth={1.75} />}
              />
            </div>
          </div>
        </>
      ) : (
        <form
          onSubmit={handleSubmit}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            width: '100%',
          }}
        >
          <IconButton
            variant="ghost"
            size="md"
            label="Đóng tìm kiếm"
            onClick={() => setMobileSearchOpen(false)}
            icon={<ArrowLeft size={20} strokeWidth={1.75} />}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <TextInput
              type="search"
              enterKeyHint="search"
              size="lg"
              label="Tìm kiếm phim AI"
              isLabelHidden
              hasAutoFocus
              hasClear
              width="100%"
              placeholder="Tìm tên phim, kênh, thể loại..."
              value={query}
              onChange={(val) => onQueryChange(val)}
              onEnter={() => handleSubmit()}
            />
          </div>
          <IconButton
            type="submit"
            variant="secondary"
            size="md"
            label="Tìm kiếm"
            icon={<Search size={18} strokeWidth={1.75} />}
          />
        </form>
      )}
    </header>
  );
}
