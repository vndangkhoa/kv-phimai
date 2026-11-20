import { useEffect, useState, useMemo } from 'react';
import { Avatar } from '@astryxdesign/core/Avatar';
import { Divider } from '@astryxdesign/core/Divider';
import { Drawer, DrawerHeader } from '@astryxdesign/core/Drawer';
import { Layout } from '@astryxdesign/core/Layout';
import {
  Home,
  Tv,
  Flame,
  Clock,
  CheckCircle2,
  History,
  Bookmark,
  Compass,
  Tag,
  ChevronRight,
} from 'lucide-react';
import type { Film, FilterState } from '../types/phimai';
import { CAT_LABEL, GENRE_GROUPS, viewsNumber } from '../utils/phimaiUtils';
import { Logo } from './Logo';
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
          className={`yt-sidebar-item ${
            activeView === 'home' && filters.cat === 'all' && filters.sort === 'random' && !filters.fullOnly && filters.genre === 'all'
              ? 'active'
              : ''
          }`}
        >
          <div className="yt-sidebar-item-icon">
            <Home size={18} strokeWidth={1.75} />
          </div>
          <span className="yt-sidebar-item-text">Trang chủ</span>
        </button>

        <button
          type="button"
          onClick={openDirectoryAndClose}
          className={`yt-sidebar-item ${activeView === 'channels' || activeView === 'channel' ? 'active' : ''}`}
        >
          <div className="yt-sidebar-item-icon">
            <Tv size={18} strokeWidth={1.75} />
          </div>
          <span className="yt-sidebar-item-text">Kênh Phim AI</span>
        </button>

        <button
          type="button"
          onClick={() => choose({ sort: 'hot', cat: 'all', genre: 'all' })}
          className={`yt-sidebar-item ${activeView === 'home' && filters.sort === 'hot' ? 'active' : ''}`}
        >
          <div className="yt-sidebar-item-icon">
            <Flame size={18} strokeWidth={1.75} />
          </div>
          <span className="yt-sidebar-item-text">Đang thịnh hành</span>
        </button>

        <button
          type="button"
          onClick={() => choose({ sort: 'new', cat: 'all', genre: 'all' })}
          className={`yt-sidebar-item ${activeView === 'home' && filters.sort === 'new' ? 'active' : ''}`}
        >
          <div className="yt-sidebar-item-icon">
            <Clock size={18} strokeWidth={1.75} />
          </div>
          <span className="yt-sidebar-item-text">Mới cập nhật</span>
        </button>

        <button
          type="button"
          onClick={() => choose({ fullOnly: !filters.fullOnly })}
          className={`yt-sidebar-item ${activeView === 'home' && filters.fullOnly ? 'active' : ''}`}
        >
          <div className="yt-sidebar-item-icon">
            <CheckCircle2 size={18} strokeWidth={1.75} />
          </div>
          <span className="yt-sidebar-item-text">Trọn bộ FULL</span>
        </button>
      </div>

      <div style={{ padding: '10px 6px' }}>
        <Divider variant="subtle" />
      </div>

      {/* Subscriptions / Featured Channels Section */}
      <div className="yt-sidebar-section">
        <button
          type="button"
          onClick={openDirectoryAndClose}
          className="yt-sidebar-section-header"
          style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer', justifyContent: 'space-between' }}
        >
          <span>{subscriptions.length > 0 ? 'Kênh đăng ký' : 'Kênh nổi bật'}</span>
          <ChevronRight size={14} strokeWidth={1.75} className="yt-header-chevron" />
        </button>

        {(subscriptions.length > 0 ? subscriptions.map((s) => s.name) : topFeaturedChannels.map((c) => c.name)).map(
          (chName) => {
            const isChActive = activeView === 'channel' && activeChannelName?.toLowerCase() === chName.toLowerCase();
            return (
              <button
                type="button"
                key={chName}
                onClick={() => openChannelAndClose(chName)}
                className={`yt-sidebar-sub-item ${isChActive ? 'active' : ''}`}
                title={chName}
              >
                <Avatar size="sm" name={chName} tooltip={false} />
                <span className="yt-sidebar-sub-name">{chName}</span>
              </button>
            );
          }
        )}
      </div>

      <div style={{ padding: '10px 6px' }}>
        <Divider variant="subtle" />
      </div>

      {/* Personal Library */}
      <div className="yt-sidebar-section">
        <div className="yt-sidebar-section-header plain">
          <span>Thư viện của bạn</span>
        </div>

        <button
          type="button"
          onClick={() => choose({ sort: 'history' })}
          className={`yt-sidebar-item ${filters.sort === 'history' ? 'active' : ''}`}
        >
          <div className="yt-sidebar-item-icon">
            <History size={18} strokeWidth={1.75} />
          </div>
          <span className="yt-sidebar-item-text">Lịch sử đã xem</span>
        </button>

        <button
          type="button"
          onClick={() => choose({ sort: 'saved' })}
          className={`yt-sidebar-item ${filters.sort === 'saved' ? 'active' : ''}`}
        >
          <div className="yt-sidebar-item-icon">
            <Bookmark size={18} strokeWidth={1.75} />
          </div>
          <span className="yt-sidebar-item-text">Xem sau (Đã lưu)</span>
        </button>
      </div>

      <div style={{ padding: '10px 6px' }}>
        <Divider variant="subtle" />
      </div>

      {/* Categories */}
      <div className="yt-sidebar-section">
        <div className="yt-sidebar-section-header plain">
          <span>Danh mục Phim AI</span>
        </div>
        {CAT_ORDER.map((catId) => {
          const count = catId === 'all' ? categories.all || allFilms.length || 0 : categories[catId] || 0;
          const isActive = filters.cat === catId && catId !== 'all';
          return (
            <button
              type="button"
              key={catId}
              onClick={() => choose({ cat: catId })}
              className={`yt-sidebar-item ${isActive ? 'active' : ''}`}
            >
              <div className="yt-sidebar-item-icon">
                <Compass size={17} strokeWidth={1.75} />
              </div>
              <span className="yt-sidebar-item-text" style={{ flex: 1 }}>
                {CAT_LABEL[catId] || catId}
              </span>
              {count > 0 && <span className="phimai-sidebar-count">{count}</span>}
            </button>
          );
        })}
      </div>

      <div style={{ padding: '10px 6px' }}>
        <Divider variant="subtle" />
      </div>

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
            >
              <div className="yt-sidebar-item-icon">
                <Tag size={16} strokeWidth={1.75} />
              </div>
              <span className="yt-sidebar-item-text">{g.label}</span>
            </button>
          );
        })}
      </div>

      <div style={{ padding: '10px 6px' }}>
        <Divider variant="subtle" />
      </div>
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
    return (
      <Drawer
        isOpen={isOpen}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        side="start"
        width={268}
        label="Danh mục PhimAI"
      >
        <Layout
          height="fill"
          header={
            <DrawerHeader
              title={<Logo size={24} />}
              onOpenChange={(open) => {
                if (!open) onClose();
              }}
              hasDivider
            />
          }
          content={<div style={{ margin: '0 -12px' }}>{content}</div>}
        />
      </Drawer>
    );
  }

  return (
    <aside className={`yt-sidebar-container ${isOpen ? 'expanded' : 'collapsed'}`}>
      {content}
    </aside>
  );
}
