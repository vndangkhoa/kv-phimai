import React, { useState, useRef, useMemo } from 'react';
import {
  IoMenuOutline,
  IoSearchOutline,
  IoCloseOutline,
  IoArrowBack,
} from 'react-icons/io5';
import type { Film } from '../types/phimai';

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmitSearch(query);
    setIsFocused(false);
    setMobileSearchOpen(false);
  };

  return (
    <header className="yt-header">
      {!mobileSearchOpen ? (
        <>
          {/* Left: Hamburger + PhimAI Brand */}
          <div className="yt-header-left" style={{ gap: '12px' }}>
            <button
              type="button"
              className="yt-icon-btn"
              onClick={onToggleSidebar}
              aria-label="Danh mục"
              title="Danh mục"
            >
              <IoMenuOutline size={24} />
            </button>

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
                gap: '7px',
                textDecoration: 'none',
                color: 'var(--yt-text-primary)',
                fontWeight: 800,
                fontSize: '18px',
                letterSpacing: '-0.4px',
              }}
              title="PhimAI — Trang chủ"
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '30px',
                  height: '21px',
                  borderRadius: '6px',
                  backgroundColor: '#ff0033',
                  color: '#ffffff',
                  fontSize: '11px',
                  fontWeight: 900,
                }}
              >
                ▶
              </span>
              <span>PhimAI</span>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  color: 'var(--yt-text-secondary)',
                  alignSelf: 'flex-start',
                  marginTop: '2px',
                }}
              >
                4K
              </span>
            </a>

            <span
              className="hidden-mobile"
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: '#10b981',
                background: 'rgba(16, 185, 129, 0.12)',
                padding: '3px 8px',
                borderRadius: '999px',
                whiteSpace: 'nowrap',
              }}
            >
              ● {onlineCount} đang xem
            </span>
          </div>

          {/* Center: Materialious Search Bar */}
          <div className="yt-header-center hidden-mobile" style={{ position: 'relative' }}>
            <form className="yt-compound-search-form" onSubmit={handleSubmit}>
              <div className={`yt-search-input-box ${isFocused ? 'focused' : ''}`}>
                {isFocused && (
                  <div className="yt-search-leading-icon">
                    <IoSearchOutline size={17} />
                  </div>
                )}
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Tìm kiếm 9.220+ phim AI, kênh, thể loại..."
                  value={query}
                  onChange={(e) => onQueryChange(e.target.value)}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setTimeout(() => setIsFocused(false), 180)}
                />
                {query && (
                  <button
                    type="button"
                    className="yt-search-clear-btn"
                    onClick={() => {
                      onQueryChange('');
                      inputRef.current?.focus();
                    }}
                    title="Xóa từ khóa"
                  >
                    <IoCloseOutline size={18} />
                  </button>
                )}
              </div>
              <button type="submit" className="yt-search-submit-btn" title="Tìm kiếm">
                <IoSearchOutline size={20} />
              </button>
            </form>

            {suggestions.length > 0 && (
              <div className="yt-search-suggestions">
                {suggestions.map((film) => (
                  <div
                    key={film.id}
                    className="yt-suggestion-item"
                    onMouseDown={() => {
                      setIsFocused(false);
                      onSelectFilm(film);
                    }}
                  >
                    <IoSearchOutline size={15} className="yt-suggestion-icon" />
                    <span
                      style={{
                        flex: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {film.title}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--yt-text-secondary)' }}>
                      {film.channel}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: Mobile Search only */}
          <div className="yt-header-right">
            <button
              type="button"
              className="yt-icon-btn visible-mobile"
              onClick={() => setMobileSearchOpen(true)}
              aria-label="Tìm kiếm"
            >
              <IoSearchOutline size={22} />
            </button>
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
          <button
            type="button"
            className="yt-icon-btn"
            onClick={() => setMobileSearchOpen(false)}
          >
            <IoArrowBack size={22} />
          </button>
          <div className="yt-search-input-box focused" style={{ flex: 1 }}>
            <input
              autoFocus
              type="text"
              placeholder="Tìm tên phim, kênh, thể loại..."
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
            />
            {query && (
              <button
                type="button"
                className="yt-search-clear-btn"
                onClick={() => onQueryChange('')}
              >
                <IoCloseOutline size={18} />
              </button>
            )}
          </div>
          <button type="submit" className="yt-icon-btn">
            <IoSearchOutline size={21} />
          </button>
        </form>
      )}
    </header>
  );
}
