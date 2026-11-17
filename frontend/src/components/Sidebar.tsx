import React, { useEffect, useState, useMemo } from 'react';
import {
  IoHomeOutline,
  IoFlameOutline,
  IoTimeOutline,
  IoBookmarkOutline,
  IoCheckmarkDoneCircleOutline,
  IoMenuOutline,
  IoCompassOutline,
  IoPricetagOutline,
  IoTvOutline,
  IoChevronForwardOutline,
} from 'react-icons/io5';
import type { Film, FilterState } from '../types/phimai';
import { CAT_LABEL, GENRE_GROUPS, viewsNumber } from '../utils/phimaiUtils';
import {
  getSubscribedChannels,
  SUBSCRIPTIONS_EVENT,
  type ChannelSubscription,
} from '../services/streamService';

interface SidebarProps {
  isOpen: boolean;
  isOverlayMode: boolean;
  onClose: () => void;
  activeView: 'home' | 'watch' | 'channels' | 'channel';
  activeChannelName?: string;
  filters: FilterState;
  categories: Record<string, number>;
  allFilms: Film[];
  onSelectFilter: (patch: Partial<FilterState>) => void;
  onGoHome: () => void;
  onOpenChannels: () => void;
  onOpenChannel: (channelName: string) => void;
}

const CAT_ORDER = ['all', 'trung', 'hoathinh', 'fantasy', 'scifi', 'kinhdi', 'ngan', 'vietnam'];

export function Sidebar({
  isOpen,
  isOverlayMode,
  onClose,
  activeView,
  activeChannelName,
  filters,
  categories,
  allFilms,
  onSelectFilter,
  onGoHome,
  onOpenChannels,
  onOpenChannel,
}: SidebarProps) {
  const [subscriptions, setSubscriptions] = useState<ChannelSubscription[]>(() => getSubscribedChannels());

  useEffect(() => {
    const sync = () => setSubscriptions(getSubscribedChannels());
    window.addEventListener(SUBSCRIPTIONS_EVENT, sync);
    return () => window.removeEventListener(SUBSCRIPTIONS_EVENT, sync);
  }, []);

  const topFeaturedChannels = useMemo(() => {
    const counts = new Map<string, { name: string; count: number; views: number }>();
    for (const f of allFilms) {
      if (!f.channel) continue;
      const prev = counts.get(f.channel);
      if (prev) {
        prev.count += 1;
        prev.views += viewsNumber(f);
      } else {
        counts.set(f.channel, { name: f.channel, count: 1, views: viewsNumber(f) });
      }
    }
    return Array.from(counts.values())
      .sort((a, b) => b.views - a.views || b.count - a.count)
      .slice(0, 6);
  }, [allFilms]);

  const choose = (patch: Partial<FilterState>) => {
    onSelectFilter(patch);
    onGoHome();
    if (isOverlayMode) onClose();
  };

  const openChannelAndClose = (name: string) => {
    onOpenChannel(name);
    if (isOverlayMode) onClose();
  };

  const openDirectoryAndClose = () => {
    onOpenChannels();
    if (isOverlayMode) onClose();
  };

  const content = (
    <div className="yt-sidebar-scrollable" style={{ paddingBottom: '28px' }}>
      {/* Main Section */}
      <div className="yt-sidebar-section">
        <button
          type="button"
          onClick={() => choose({ cat: 'all', genre: 'all', sort: 'random', fullOnly: false, channel: '' })}
          className={`yt-sidebar-item ${activeView === 'home' && filters.cat === 'all' && filters.sort === 'random' && !filters.fullOnly && filters.genre === 'all' ? 'active' : ''}`}
          style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}
        >
          <div className="yt-sidebar-item-icon"><IoHomeOutline size={21} /></div>
          <span className="yt-sidebar-item-text">Trang chủ</span>
        </button>

        <button
          type="button"
          onClick={openDirectoryAndClose}
          className={`yt-sidebar-item ${activeView === 'channels' || activeView === 'channel' ? 'active' : ''}`}
          style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}
        >
          <div className="yt-sidebar-item-icon"><IoTvOutline size={21} /></div>
          <span className="yt-sidebar-item-text">Kênh Phim AI</span>
        </button>

        <button
          type="button"
          onClick={() => choose({ sort: 'hot', cat: 'all', genre: 'all' })}
          className={`yt-sidebar-item ${activeView === 'home' && filters.sort === 'hot' ? 'active' : ''}`}
          style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}
        >
          <div className="yt-sidebar-item-icon"><IoFlameOutline size={21} /></div>
          <span className="yt-sidebar-item-text">Đang thịnh hành</span>
        </button>

        <button
          type="button"
          onClick={() => choose({ sort: 'new', cat: 'all', genre: 'all' })}
          className={`yt-sidebar-item ${activeView === 'home' && filters.sort === 'new' ? 'active' : ''}`}
          style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}
        >
          <div className="yt-sidebar-item-icon"><IoTimeOutline size={21} /></div>
          <span className="yt-sidebar-item-text">Mới cập nhật</span>
        </button>

        <button
          type="button"
          onClick={() => choose({ fullOnly: !filters.fullOnly })}
          className={`yt-sidebar-item ${activeView === 'home' && filters.fullOnly ? 'active' : ''}`}
          style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}
        >
          <div className="yt-sidebar-item-icon"><IoCheckmarkDoneCircleOutline size={21} /></div>
          <span className="yt-sidebar-item-text">Trọn bộ FULL</span>
        </button>
      </div>

      <div className="yt-sidebar-divider" />

      {/* Subscriptions / Featured Channels Section (kv-tube style) */}
      <div className="yt-sidebar-section">
        <button
          type="button"
          onClick={openDirectoryAndClose}
          className="yt-sidebar-section-header"
          style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}
        >
          <span>{subscriptions.length > 0 ? 'Kênh đăng ký' : 'Kênh nổi bật'}</span>
          <IoChevronForwardOutline size={14} className="yt-header-chevron" />
        </button>

        {(subscriptions.length > 0 ? subscriptions.map((s) => s.name) : topFeaturedChannels.map((c) => c.name)).map((chName) => {
          const isChActive = activeView === 'channel' && activeChannelName?.toLowerCase() === chName.toLowerCase();
          return (
            <button
              type="button"
              key={chName}
              onClick={() => openChannelAndClose(chName)}
              className={`yt-sidebar-sub-item ${isChActive ? 'active' : ''}`}
              style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer' }}
              title={chName}
            >
              <div className="yt-sidebar-sub-avatar">
                <span>{chName.charAt(0).toUpperCase()}</span>
              </div>
              <span className="yt-sidebar-sub-name">{chName}</span>
            </button>
          );
        })}
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
