import { Home, Tv, Flame, Bookmark, History } from 'lucide-react';

interface MobileNavProps {
  activeView: 'home' | 'watch' | 'channels' | 'channel';
  activeSort: string;
  onSelectHome: () => void;
  onSelectChannels: () => void;
  onSelectHot: () => void;
  onSelectSaved: () => void;
  onSelectHistory: () => void;
}

export function MobileNav({
  activeView,
  activeSort,
  onSelectHome,
  onSelectChannels,
  onSelectHot,
  onSelectSaved,
  onSelectHistory,
}: MobileNavProps) {
  if (activeView === 'watch') return null;

  const isHome = activeView === 'home' && activeSort !== 'hot' && activeSort !== 'saved' && activeSort !== 'history';
  const isChannels = activeView === 'channels' || activeView === 'channel';
  const isHot = activeView === 'home' && activeSort === 'hot';
  const isSaved = activeView === 'home' && activeSort === 'saved';
  const isHistory = activeView === 'home' && activeSort === 'history';

  const tabs = [
    {
      id: 'home',
      label: 'Trang chủ',
      active: isHome,
      onClick: onSelectHome,
      icon: <Home size={19} strokeWidth={isHome ? 2.2 : 1.75} />,
    },
    {
      id: 'channels',
      label: 'Kênh',
      active: isChannels,
      onClick: onSelectChannels,
      icon: <Tv size={19} strokeWidth={isChannels ? 2.2 : 1.75} />,
    },
    {
      id: 'hot',
      label: 'Thịnh hành',
      active: isHot,
      onClick: onSelectHot,
      icon: <Flame size={19} strokeWidth={isHot ? 2.2 : 1.75} />,
    },
    {
      id: 'saved',
      label: 'Đã lưu',
      active: isSaved,
      onClick: onSelectSaved,
      icon: <Bookmark size={19} strokeWidth={isSaved ? 2.2 : 1.75} />,
    },
    {
      id: 'history',
      label: 'Lịch sử',
      active: isHistory,
      onClick: onSelectHistory,
      icon: <History size={19} strokeWidth={isHistory ? 2.2 : 1.75} />,
    },
  ];

  return (
    <nav
      className="mobile-nav"
      aria-label="Điều hướng di động"
      style={{
        height: 'calc(54px + env(safe-area-inset-bottom, 0px))',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        zIndex: 999,
        alignItems: 'center',
        justifyContent: 'space-around',
      }}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={tab.onClick}
          aria-current={tab.active ? 'page' : undefined}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 1,
            height: '54px',
            minHeight: '46px',
            border: 'none',
            background: 'transparent',
            color: tab.active ? 'var(--color-accent, #ffd875)' : 'var(--color-text-secondary, #c4c8d9)',
            cursor: 'pointer',
            gap: '3px',
            transition: 'color 0.15s ease',
          }}
        >
          {tab.icon}
          <span style={{ fontSize: '10.5px', fontWeight: tab.active ? 700 : 500 }}>{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
