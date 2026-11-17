import React, { useId } from 'react';

interface LogoProps {
  size?: number;
  showText?: boolean;
  showQualityBadge?: boolean;
  className?: string;
}

export function Logo({
  size = 28,
  showText = true,
  showQualityBadge = true,
  className,
}: LogoProps) {
  const uid = useId().replace(/:/g, '');
  const gradId = `phimai-logo-bg-${uid}`;
  const sheenId = `phimai-logo-sheen-${uid}`;

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        userSelect: 'none',
        lineHeight: 1,
      }}
    >
      {/* Unified PhimAI Brand Mark — matches /icon.svg, PWA icon & SPK icon */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 512 512"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ flexShrink: 0, display: 'block', borderRadius: Math.round(size * 0.22) }}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={gradId} x1="48" y1="32" x2="464" y2="480" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FF244C" />
            <stop offset="52%" stopColor="#FF0033" />
            <stop offset="100%" stopColor="#B00022" />
          </linearGradient>
          <linearGradient id={sheenId} x1="0" y1="0" x2="0" y2="512" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.22" />
            <stop offset="45%" stopColor="#FFFFFF" stopOpacity="0.02" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.18" />
          </linearGradient>
        </defs>
        <rect x="16" y="16" width="480" height="480" rx="112" fill={`url(#${gradId})`} />
        <rect x="16" y="16" width="480" height="480" rx="112" fill={`url(#${sheenId})`} />
        <path
          d="M196 154C196 142.2 209.1 135.1 219 141.5L368 237.5C377.1 243.4 377.1 256.6 368 262.5L219 358.5C209.1 364.9 196 357.8 196 346V154Z"
          fill="#FFFFFF"
        />
        <path
          d="M376 92L386 124L418 134L386 144L376 176L366 144L334 134L366 124L376 92Z"
          fill="#FFF5CC"
        />
        <path
          d="M418 168L422.5 182L436.5 186.5L422.5 191L418 205L413.5 191L399.5 186.5L413.5 182L418 168Z"
          fill="#FFFFFF"
          fillOpacity="0.92"
        />
      </svg>

      {showText && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <span
            style={{
              fontSize: Math.round(size * 0.68),
              fontWeight: 800,
              letterSpacing: '-0.5px',
              fontFamily: '"Be Vietnam Pro", Roboto, sans-serif',
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            <span style={{ color: '#FF0033' }}>Phim</span>
            <span style={{ color: 'var(--yt-text-primary, #f1f1f1)' }}>AI</span>
          </span>
          {showQualityBadge && (
            <span
              style={{
                fontSize: '9.5px',
                fontWeight: 700,
                color: 'var(--yt-text-secondary, #aaaaaa)',
                alignSelf: 'flex-start',
                marginTop: '1px',
                letterSpacing: '0.2px',
              }}
            >
              4K
            </span>
          )}
        </span>
      )}
    </span>
  );
}
