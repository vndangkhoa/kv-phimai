import React, { useState, useEffect, useMemo } from 'react';
import {
  IoSearchOutline,
  IoCheckmarkCircle,
  IoPersonAddOutline,
  IoCheckmark,
  IoArrowBack,
  IoTvOutline,
  IoCloseOutline,
} from 'react-icons/io5';
import type { ChannelInfo } from '../types/phimai';
import {
  fetchChannelsList,
  getSubscribedChannels,
  toggleChannelSubscription,
  SUBSCRIPTIONS_EVENT,
} from '../services/streamService';
import { CAT_LABEL, getThumbUrl } from '../utils/phimaiUtils';

interface ChannelsDirectoryPageProps {
  onOpenChannel: (channelName: string) => void;
  onBackHome: () => void;
}

function formatTotalViewsShort(n: number): string {
  if (!n || n <= 0) return '0 lượt xem';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} Tr lượt xem`;
  if (n >= 1_000) return `${Math.round(n / 1_000).toLocaleString()} N lượt xem`;
  return `${n.toLocaleString()} lượt xem`;
}

function hashGrad(name: string): string {
  const grads = [
    'linear-gradient(135deg, #be123c, #881337)',
    'linear-gradient(135deg, #1d4ed8, #1e3a8a)',
    'linear-gradient(135deg, #6d28d9, #4c1d95)',
    'linear-gradient(135deg, #047857, #064e3b)',
    'linear-gradient(135deg, #b45309, #78350f)',
    'linear-gradient(135deg, #0e7490, #164e63)',
  ];
  let sum = 0;
  for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
  return grads[sum % grads.length];
}

export function ChannelsDirectoryPage({ onOpenChannel, onBackHome }: ChannelsDirectoryPageProps) {
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<'popular' | 'count' | 'name'>('popular');
  const [onlySubscribed, setOnlySubscribed] = useState(false);
  const [shownCount, setShownCount] = useState(36);
  const [subscribedNames, setSubscribedNames] = useState<Set<string>>(() => {
    return new Set(getSubscribedChannels().map((s) => s.name.toLowerCase()));
  });

  useEffect(() => {
    const sync = () => {
      setSubscribedNames(new Set(getSubscribedChannels().map((s) => s.name.toLowerCase())));
    };
    window.addEventListener(SUBSCRIPTIONS_EVENT, sync);
    return () => window.removeEventListener(SUBSCRIPTIONS_EVENT, sync);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchChannelsList('', sortBy)
      .then((list) => {
        if (active) setChannels(list);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [sortBy]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return channels.filter((ch) => {
      if (onlySubscribed && !subscribedNames.has(ch.name.toLowerCase())) return false;
      if (q && !ch.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [channels, query, onlySubscribed, subscribedNames]);

  useEffect(() => {
    setShownCount(36);
  }, [query, sortBy, onlySubscribed]);

  const visibleChannels = useMemo(() => filtered.slice(0, shownCount), [filtered, shownCount]);
  const hasMore = shownCount < filtered.length;

  const handleToggleSub = (e: React.MouseEvent, ch: ChannelInfo) => {
    e.stopPropagation();
    toggleChannelSubscription({
      name: ch.name,
      authorId: ch.authorId,
      thumbnail: ch.thumbnail,
    });
  };

  return (
    <div style={{ maxWidth: '1750px', margin: '0 auto', padding: '16px 20px 80px' }}>
      {/* Top Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '14px',
          marginBottom: '18px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={onBackHome}
            className="watch-action-pill"
            style={{ height: '32px', padding: '0 12px', fontSize: '12.5px' }}
          >
            <IoArrowBack size={14} />
            <span>Trang chủ</span>
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <IoTvOutline size={22} color="#ff0033" />
            <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: 'var(--yt-text-primary)' }}>
              Khám phá Kênh Phim AI ({channels.length})
            </h1>
          </div>
        </div>

        {/* Search bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: 'var(--yt-surface)',
            border: '1px solid var(--yt-border)',
            borderRadius: '20px',
            padding: '6px 14px',
            minWidth: '240px',
            flex: '0 1 320px',
          }}
        >
          <IoSearchOutline size={16} color="var(--yt-text-secondary)" />
          <input
            type="text"
            placeholder="Tìm tên kênh Phim AI..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              background: 'none',
              border: 'none',
              outline: 'none',
              color: 'var(--yt-text-primary)',
              fontSize: '13.5px',
              flex: 1,
            }}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              style={{ background: 'none', border: 'none', color: 'var(--yt-text-secondary)', cursor: 'pointer', display: 'flex' }}
            >
              <IoCloseOutline size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Filter & Sort Chips */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <button
          type="button"
          onClick={() => setOnlySubscribed(false)}
          className={`yt-filter-chip ${!onlySubscribed ? 'active' : ''}`}
        >
          Tất cả kênh
        </button>
        <button
          type="button"
          onClick={() => setOnlySubscribed(true)}
          className={`yt-filter-chip ${onlySubscribed ? 'active' : ''}`}
        >
          Đã đăng ký ({subscribedNames.size})
        </button>
        <span style={{ width: '1px', backgroundColor: 'var(--yt-border)', margin: '0 4px' }} />
        <button
          type="button"
          onClick={() => setSortBy('popular')}
          className={`yt-filter-chip ${sortBy === 'popular' ? 'active' : ''}`}
        >
          Nhiều lượt xem nhất
        </button>
        <button
          type="button"
          onClick={() => setSortBy('count')}
          className={`yt-filter-chip ${sortBy === 'count' ? 'active' : ''}`}
        >
          Nhiều phim nhất
        </button>
        <button
          type="button"
          onClick={() => setSortBy('name')}
          className={`yt-filter-chip ${sortBy === 'name' ? 'active' : ''}`}
        >
          Tên A–Z
        </button>
      </div>

      {loading && channels.length === 0 ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '16px',
          }}
        >
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: '210px', borderRadius: '14px' }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: '60px 16px', textAlign: 'center', color: 'var(--yt-text-secondary)' }}>
          {onlySubscribed
            ? 'Bạn chưa đăng ký kênh nào. Nhấn "Đăng ký" ở bất kỳ kênh hoặc video nào để theo dõi tại đây!'
            : 'Không tìm thấy kênh phù hợp.'}
        </div>
      ) : (
        <>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '16px',
          }}
        >
          {visibleChannels.map((ch) => {
            const isSub = subscribedNames.has(ch.name.toLowerCase());
            const previews = (ch.previewFilms || []).slice(0, 3);
            return (
              <div
                key={ch.name}
                onClick={() => onOpenChannel(ch.name)}
                style={{
                  cursor: 'pointer',
                  borderRadius: '14px',
                  backgroundColor: 'var(--yt-surface)',
                  border: '1px solid var(--yt-border)',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'transform 0.15s ease, border-color 0.15s ease',
                }}
              >
                {/* Preview Thumb Strip (strictly clipped 92px height) */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: previews.length > 1 ? `repeat(${previews.length}, minmax(0, 1fr))` : 'minmax(0, 1fr)',
                    gridTemplateRows: '92px',
                    height: '92px',
                    minHeight: '92px',
                    maxHeight: '92px',
                    flexShrink: 0,
                    overflow: 'hidden',
                    gap: '2px',
                    backgroundColor: '#111',
                  }}
                >
                  {previews.length > 0 ? (
                    previews.map((pf) => (
                      <div key={pf.id} style={{ width: '100%', height: '92px', overflow: 'hidden', position: 'relative' }}>
                        <img
                          src={getThumbUrl(pf.id)}
                          alt={pf.title}
                          loading="lazy"
                          style={{
                            position: 'absolute',
                            inset: 0,
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            display: 'block',
                          }}
                        />
                      </div>
                    ))
                  ) : (
                    <div style={{ width: '100%', height: '92px', background: hashGrad(ch.name) }} />
                  )}
                </div>

                {/* Channel Details Body */}
                <div
                  style={{
                    padding: '12px 14px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    flex: 1,
                    backgroundColor: 'var(--yt-surface)',
                    position: 'relative',
                    zIndex: 1,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div
                      style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '50%',
                        background: hashGrad(ch.name),
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 800,
                        fontSize: '19px',
                        flexShrink: 0,
                      }}
                    >
                      {ch.name.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span
                          style={{
                            fontWeight: 700,
                            fontSize: '15px',
                            color: 'var(--yt-text-primary)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {ch.name}
                        </span>
                        <IoCheckmarkCircle size={14} color="var(--yt-blue, #3ea6ff)" />
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--yt-text-secondary)', marginTop: '2px' }}>
                        {ch.count} phim • {formatTotalViewsShort(ch.totalViews)}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginTop: 'auto' }}>
                    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', minWidth: 0 }}>
                      {(ch.categories || []).slice(0, 2).map((c) => (
                        <span
                          key={c}
                          style={{
                            fontSize: '11px',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            backgroundColor: 'var(--yt-hover)',
                            color: 'var(--yt-text-secondary)',
                          }}
                        >
                          {CAT_LABEL[c] || c}
                        </span>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={(e) => handleToggleSub(e, ch)}
                      className={`watch-sub-btn ${isSub ? 'subscribed' : 'unsubscribed'}`}
                      style={{
                        height: '32px',
                        padding: '0 12px',
                        fontSize: '12px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        flexShrink: 0,
                      }}
                    >
                      {isSub ? <IoCheckmark size={14} /> : <IoPersonAddOutline size={13} />}
                      <span>{isSub ? 'Đã đăng ký' : 'Đăng ký'}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {hasMore && (
          <div style={{ padding: '28px', textAlign: 'center' }}>
            <button
              type="button"
              onClick={() => setShownCount((c) => c + 36)}
              className="watch-action-pill"
            >
              Xem thêm kênh ({filtered.length - visibleChannels.length} kênh còn lại)
            </button>
          </div>
        )}
      </>
      )}
    </div>
  );
}
