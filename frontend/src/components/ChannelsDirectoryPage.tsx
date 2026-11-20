import React, { useState, useEffect, useMemo } from 'react';
import { Avatar } from '@astryxdesign/core/Avatar';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Heading } from '@astryxdesign/core/Heading';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Skeleton } from '@astryxdesign/core/Skeleton';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { BadgeCheck, UserPlus, Check, ArrowLeft, Tv } from 'lucide-react';
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
    'linear-gradient(135deg, #9e0610, #161822)',
    'linear-gradient(135deg, #243b6b, #0d0e14)',
    'linear-gradient(135deg, #43286b, #161822)',
    'linear-gradient(135deg, #0d5c46, #0d0e14)',
    'linear-gradient(135deg, #6b4c14, #161822)',
    'linear-gradient(135deg, #164863, #0d0e14)',
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
          <Button
            variant="ghost"
            size="sm"
            label="Trang chủ"
            icon={<ArrowLeft size={14} strokeWidth={1.75} />}
            onClick={onBackHome}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Tv size={22} strokeWidth={1.75} style={{ color: '#e50914' }} />
            <Heading
              level={1}
              className="phimai-display-heading"
              weight="bold"
              style={{ margin: 0, fontSize: '26px', lineHeight: 1.08 }}
            >
              Khám phá Kênh Phim AI
            </Heading>
            <Text size="sm" color="secondary" hasTabularNumbers>
              ({channels.length})
            </Text>
          </div>
        </div>

        {/* Search bar */}
        <TextInput
          type="search"
          enterKeyHint="search"
          size="md"
          label="Tìm kênh Phim AI"
          isLabelHidden
          startIcon="search"
          hasClear
          width="300px"
          placeholder="Tìm tên kênh Phim AI..."
          value={query}
          onChange={(val) => setQuery(val)}
        />
      </div>

      {/* Scope + Sort Controls */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '20px' }}>
        <div className="phimai-sort-scroll">
          <SegmentedControl
            size="sm"
            label="Lọc kênh theo đăng ký"
            value={onlySubscribed ? 'subscribed' : 'all'}
            onChange={(val) => setOnlySubscribed(val === 'subscribed')}
          >
            <SegmentedControlItem value="all" label="Tất cả kênh" />
            <SegmentedControlItem value="subscribed" label={`Đã đăng ký (${subscribedNames.size})`} />
          </SegmentedControl>
        </div>

        <div className="phimai-sort-scroll">
          <SegmentedControl
            size="sm"
            label="Sắp xếp kênh"
            value={sortBy}
            onChange={(val) => setSortBy(val as 'popular' | 'count' | 'name')}
          >
            <SegmentedControlItem value="popular" label="Nhiều lượt xem nhất" />
            <SegmentedControlItem value="count" label="Nhiều phim nhất" />
            <SegmentedControlItem value="name" label="Tên A–Z" />
          </SegmentedControl>
        </div>
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
            <Skeleton key={i} width="100%" height={210} radius={3} index={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: '56px 16px' }}>
          <EmptyState
            icon={<Tv size={36} strokeWidth={1.75} />}
            title={onlySubscribed ? 'Chưa có kênh đăng ký' : 'Không tìm thấy kênh phù hợp'}
            description={
              onlySubscribed
                ? 'Nhấn "Đăng ký" ở bất kỳ kênh hoặc video nào để theo dõi tại đây.'
                : 'Thử từ khóa tìm kiếm khác hoặc xóa bộ lọc.'
            }
            actions={
              onlySubscribed ? (
                <Button variant="primary" label="Xem tất cả kênh" onClick={() => setOnlySubscribed(false)} />
              ) : undefined
            }
          />
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
                <article
                  key={ch.name}
                  className="phimai-channel-card"
                  onClick={() => onOpenChannel(ch.name)}
                >
                  {/* Preview Thumb Strip (strictly clipped 92px height) */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns:
                        previews.length > 1 ? `repeat(${previews.length}, minmax(0, 1fr))` : 'minmax(0, 1fr)',
                      gridTemplateRows: '92px',
                      height: '92px',
                      minHeight: '92px',
                      maxHeight: '92px',
                      flexShrink: 0,
                      overflow: 'hidden',
                      gap: '2px',
                      backgroundColor: '#08090d',
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
                      padding: '14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                      flex: 1,
                      backgroundColor: 'var(--yt-surface, #161822)',
                      position: 'relative',
                      zIndex: 1,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <Avatar size="lg" name={ch.name} alt={ch.name} tooltip={false} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <a
                            href={`/channel/${encodeURIComponent(ch.name)}`}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              onOpenChannel(ch.name);
                            }}
                            style={{
                              fontWeight: 700,
                              fontSize: '15px',
                              color: 'var(--color-text-primary)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              textDecoration: 'none',
                            }}
                          >
                            {ch.name}
                          </a>
                          <BadgeCheck size={14} strokeWidth={1.75} style={{ color: 'var(--color-accent, #ffd875)', flexShrink: 0 }} />
                        </div>
                        <div className="phimai-tabular" style={{ fontSize: '12px', color: 'var(--yt-text-muted)', marginTop: '2px' }}>
                          {ch.count} phim • {formatTotalViewsShort(ch.totalViews)}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginTop: 'auto' }}>
                      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', flex: '1 1 auto', minWidth: 0 }}>
                        {(ch.categories || []).slice(0, 2).map((c) => (
                          <Badge key={c} variant="neutral" label={CAT_LABEL[c] || c} />
                        ))}
                      </div>

                      <div style={{ flexShrink: 0 }}>
                        <Button
                          variant={isSub ? 'secondary' : 'primary'}
                          size="sm"
                          label={isSub ? 'Đã đăng ký' : 'Đăng ký'}
                          icon={isSub ? <Check size={14} strokeWidth={1.75} /> : <UserPlus size={13} strokeWidth={1.75} />}
                          onClick={(e) => handleToggleSub(e, ch)}
                        />
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          {hasMore && (
            <div style={{ padding: '28px', textAlign: 'center' }}>
              <Button
                variant="secondary"
                size="md"
                label={`Xem thêm kênh (${filtered.length - visibleChannels.length} kênh còn lại)`}
                onClick={() => setShownCount((c) => c + 36)}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
