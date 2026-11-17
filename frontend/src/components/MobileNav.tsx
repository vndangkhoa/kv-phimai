import React from 'react';
import {
  IoHome,
  IoHomeOutline,
  IoFlame,
  IoFlameOutline,
  IoFilm,
  IoFilmOutline,
  IoBookmark,
  IoBookmarkOutline,
  IoSparklesOutline,
} from 'react-icons/io5';

interface MobileNavProps {
  activeView: 'home' | 'watch' | 'shorts';
  activeSort: string;
  onSelectHome: () => void;
  onSelectHot: () => void;
  onSelectShorts: () => void;
  onSelectSaved: () => void;
  onOpenAssistant: () => void;
}

export function MobileNav({
  activeView,
  activeSort,
  onSelectHome,
  onSelectHot,
  onSelectShorts,
  onSelectSaved,
  onOpenAssistant,
}: MobileNavProps) {
  if (activeView === 'watch') return null;

  const isHome = activeView === 'home' && activeSort !== 'hot' && activeSort !== 'saved';
  const isHot = activeView === 'home' && activeSort === 'hot';
  const isShorts = activeView === 'shorts';
  const isSaved = activeView === 'home' && activeSort === 'saved';

  const tabs = [
    {
      id: 'home',
      label: 'Trang chủ',
      active: isHome,
      onClick: onSelectHome,
      icon: isHome ? <IoHome size={20} /> : <IoHomeOutline size={20} />,
    },
    {
      id: 'hot',
      label: 'Thịnh hành',
      active: isHot,
      onClick: onSelectHot,
      icon: isHot ? <IoFlame size={20} /> : <IoFlameOutline size={20} />,
    },
    {
      id: 'shorts',
      label: 'Shorts',
      active: isShorts,
      onClick: onSelectShorts,
      icon: isShorts ? <IoFilm size={20} /> : <IoFilmOutline size={20} />,
    },
    {
      id: 'saved',
      label: 'Đã lưu',
      active: isSaved,
      onClick: onSelectSaved,
      icon: isSaved ? <IoBookmark size={20} /> : <IoBookmarkOutline size={20} />,
    },
    {
      id: 'ask',
      label: 'Trợ lý AI',
      active: false,
      onClick: onOpenAssistant,
      icon: <IoSparklesOutline size={20} />,
    },
  ];

  return (
    <nav
      className="mobile-nav"
      style={{
        backgroundColor: 'var(--yt-background, #0f0f0f)',
        borderTop: '1px solid var(--yt-border, rgba(255,255,255,0.12))',
        height: 'calc(52px + env(safe-area-inset-bottom, 0px))',
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
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 1,
            height: '52px',
            border: 'none',
            background: 'transparent',
            color: tab.active ? 'var(--yt-text-primary, #f1f1f1)' : 'var(--yt-text-secondary, #aaaaaa)',
            cursor: 'pointer',
            gap: '2px',
          }}
        >
          {tab.icon}
          <span style={{ fontSize: '10px', fontWeight: tab.active ? 600 : 400 }}>{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
