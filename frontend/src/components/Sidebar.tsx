import React from 'react';
import {
  IoHomeOutline,
  IoFlameOutline,
  IoTimeOutline,
  IoBookmarkOutline,
  IoCheckmarkDoneCircleOutline,
  IoMenuOutline,
  IoCompassOutline,
  IoPricetagOutline,
} from 'react-icons/io5';
import type { FilterState } from '../types/phimai';
import { CAT_LABEL, GENRE_GROUPS } from '../utils/phimaiUtils';

interface SidebarProps {
  isOpen: boolean;
  isOverlayMode: boolean;
  onClose: () => void;
  filters: FilterState;
  categories: Record<string, number>;
  onSelectFilter: (patch: Partial<FilterState>) => void;
  onGoHome: () => void;
}

const CAT_ORDER = ['all', 'trung', 'hoathinh', 'fantasy', 'scifi', 'kinhdi', 'ngan', 'vietnam'];

export function Sidebar({
  isOpen,
  isOverlayMode,
  onClose,
  filters,
  categories,
  onSelectFilter,
  onGoHome,
}: SidebarProps) {
  const choose = (patch: Partial<FilterState>) => {
    onSelectFilter(patch);
    onGoHome();
    if (isOverlayMode) onClose();
  };

  const content = (
    <div className="yt-sidebar-scrollable" style={{ paddingBottom: '28px' }}>
      {/* Main Section */}
      <div className="yt-sidebar-section">
        <button
          type="button"
          onClick={() => choose({ cat: 'all', genre: 'all', sort: 'random', fullOnly: false, channel: '' })}
          className={`yt-sidebar-item ${filters.cat === 'all' && filters.sort === 'random' && !filters.fullOnly && filters.genre === 'all' ? 'active' : ''}`}
          style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}
        >
          <div className="yt-sidebar-item-icon"><IoHomeOutline size={21} /></div>
          <span className="yt-sidebar-item-text">Trang chủ</span>
        </button>

        <button
          type="button"
          onClick={() => choose({ sort: 'hot', cat: 'all', genre: 'all' })}
          className={`yt-sidebar-item ${filters.sort === 'hot' ? 'active' : ''}`}
          style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}
        >
          <div className="yt-sidebar-item-icon"><IoFlameOutline size={21} /></div>
          <span className="yt-sidebar-item-text">Đang thịnh hành</span>
        </button>

        <button
          type="button"
          onClick={() => choose({ sort: 'new', cat: 'all', genre: 'all' })}
          className={`yt-sidebar-item ${filters.sort === 'new' ? 'active' : ''}`}
          style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}
        >
          <div className="yt-sidebar-item-icon"><IoTimeOutline size={21} /></div>
          <span className="yt-sidebar-item-text">Mới cập nhật</span>
        </button>

        <button
          type="button"
          onClick={() => choose({ fullOnly: !filters.fullOnly })}
          className={`yt-sidebar-item ${filters.fullOnly ? 'active' : ''}`}
          style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}
        >
          <div className="yt-sidebar-item-icon"><IoCheckmarkDoneCircleOutline size={21} /></div>
          <span className="yt-sidebar-item-text">Trọn bộ FULL</span>
        </button>
      </div>

      <div className="yt-sidebar-divider" />

      {/* Personal Library */}
      <div className="yt-sidebar-section">
        <div className="yt-sidebar-section-header plain">
          <span>Thư viện của bạn</span>
        </div>

        <button
          type="button"
          onClick={() => choose({ sort: 'history' })}
          className={`yt-sidebar-item ${filters.sort === 'history' ? 'active' : ''}`}
          style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}
        >
          <div className="yt-sidebar-item-icon"><IoTimeOutline size={21} /></div>
          <span className="yt-sidebar-item-text">Lịch sử đã xem</span>
        </button>

        <button
          type="button"
          onClick={() => choose({ sort: 'saved' })}
          className={`yt-sidebar-item ${filters.sort === 'saved' ? 'active' : ''}`}
          style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}
        >
          <div className="yt-sidebar-item-icon"><IoBookmarkOutline size={21} /></div>
          <span className="yt-sidebar-item-text">Xem sau (Đã lưu)</span>
        </button>
      </div>

      <div className="yt-sidebar-divider" />

      {/* Categories */}
      <div className="yt-sidebar-section">
        <div className="yt-sidebar-section-header plain">
          <span>Danh mục Phim AI</span>
        </div>
        {CAT_ORDER.map((catId) => {
          const count = catId === 'all' ? Object.values(categories).reduce((a, b) => a + b, 0) : categories[catId] || 0;
          const isActive = filters.cat === catId && catId !== 'all';
          return (
            <button
              type="button"
              key={catId}
              onClick={() => choose({ cat: catId })}
              className={`yt-sidebar-item ${isActive ? 'active' : ''}`}
              style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}
            >
              <div className="yt-sidebar-item-icon"><IoCompassOutline size={19} /></div>
              <span className="yt-sidebar-item-text" style={{ flex: 1 }}>{CAT_LABEL[catId] || catId}</span>
              {count > 0 && (
                <span style={{ fontSize: '11px', color: 'var(--yt-text-secondary)' }}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="yt-sidebar-divider" />

      {/* Hot Genres */}
      <div className="yt-sidebar-section">
        <div className="yt-sidebar-section-header plain">
          <span>Thể loại phổ biến</span>
        </div>
        {GENRE_GROUPS.slice(0, 10).map((g) => {
          const isActive = filters.genre === g.id;
          return (
            <button
              type="button"
              key={g.id}
              onClick={() => choose({ genre: isActive ? 'all' : g.id })}
              className={`yt-sidebar-item ${isActive ? 'active' : ''}`}
              style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}
            >
              <div className="yt-sidebar-item-icon"><IoPricetagOutline size={18} /></div>
              <span className="yt-sidebar-item-text">{g.label}</span>
            </button>
          );
        })}
      </div>

      <div className="yt-sidebar-divider" />
      <div className="yt-sidebar-footer">
        <div className="yt-footer-links">
          <span>4K Adaptive Stream</span>
          <span>Zero Ads</span>
          <span>9.220+ AI Films</span>
        </div>
        <div className="yt-footer-copy">© 2026 PhimAI Cinema</div>
      </div>
    </div>
  );

  if (isOverlayMode) {
    if (!isOpen) return null;
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex' }}>
        <div
          onClick={onClose}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 9999 }}
        />
        <aside
          style={{
            position: 'relative',
            zIndex: 10000,
            width: '250px',
            height: '100%',
            backgroundColor: 'var(--yt-background)',
            boxShadow: '4px 0 24px rgba(0,0,0,0.45)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              height: 'var(--yt-header-height, 56px)',
              display: 'flex',
              alignItems: 'center',
              padding: '0 16px',
              gap: '12px',
              borderBottom: '1px solid var(--yt-border)',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              className="yt-icon-btn"
              title="Đóng menu"
            >
              <IoMenuOutline size={22} />
            </button>
            <span style={{ fontWeight: 800, fontSize: '17px', color: 'var(--yt-text-primary)' }}>
              PhimAI
            </span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>{content}</div>
        </aside>
      </div>
    );
  }

  return (
    <aside className={`yt-sidebar-container ${isOpen ? 'expanded' : 'collapsed'}`}>
      {content}
    </aside>
  );
}
