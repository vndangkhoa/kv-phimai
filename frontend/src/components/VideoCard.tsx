import React, { memo, useState, useEffect } from 'react';
import { IoBookmark, IoBookmarkOutline, IoCheckmarkCircle } from 'react-icons/io5';
import type { Film } from '../types/phimai';
import { getThumbUrl, formatViewsVN, CAT_LABEL } from '../utils/phimaiUtils';

interface VideoCardProps {
  film: Film;
  saved: boolean;
  onToggleSave: (id: string) => void;
  onOpenFilm: (film: Film) => void;
  onFilterChannel?: (channel: string) => void;
}

const DEFAULT_THUMB =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"%3E%3Crect fill="%23181818" width="320" height="180"/%3E%3Cpath fill="%23ff0033" d="M142 65v50l42-25z"/%3E%3C/svg%3E';

export const VideoCard = memo(function VideoCard({
  film,
  saved,
  onToggleSave,
  onOpenFilm,
  onFilterChannel,
}: VideoCardProps) {
  const [imgErr, setImgErr] = useState(false);
  const [progressPct, setProgressPct] = useState<number>(0);

  useEffect(() => {
    try {
      const pos = parseFloat(localStorage.getItem(`phimai_pos_${film.id}`) || '0');
      const dur = parseFloat(localStorage.getItem(`phimai_dur_${film.id}`) || '0');
      if (dur > 0 && pos > 5) {
        const pct = Math.min(100, Math.round((pos / dur) * 100));
        if (pct > 3 && pct < 98) setProgressPct(pct);
      }
    } catch {
      // ignore
    }
  }, [film.id]);

  const handleOpen = (e: React.MouseEvent) => {
    e.preventDefault();
    onOpenFilm(film);
  };

  const thumbUrl = imgErr ? DEFAULT_THUMB : getThumbUrl(film.id);
  const firstTool = (film.tool || 'AI').split('•')[0].trim();

  return (
    <div className="yt-video-card-container">
      <div className="yt-card-thumb-wrapper">
        <a
          href={`/watch?v=${encodeURIComponent(film.id)}`}
          onClick={handleOpen}
          className="yt-card-thumb-link"
        >
          <img
            src={thumbUrl}
            alt={film.title}
            loading="lazy"
            decoding="async"
            onError={() => setImgErr(true)}
            className="yt-card-thumb-img"
          />

          {/* Top-left Tool Badge */}
          <div
            style={{
              position: 'absolute',
              top: '8px',
              left: '8px',
              background: 'rgba(15, 15, 15, 0.82)',
              color: '#f1f1f1',
              fontSize: '10.5px',
              fontWeight: 700,
              padding: '2px 7px',
              borderRadius: '6px',
              letterSpacing: '0.2px',
              zIndex: 3,
            }}
          >
            {firstTool}
          </div>

          {/* Hover Save / Bookmark Quick Button */}
          <div
            className="yt-thumb-quick-actions"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <button
              type="button"
              className="yt-thumb-action-btn"
              onClick={() => onToggleSave(film.id)}
              title={saved ? 'Bỏ khỏi Xem sau' : 'Lưu xem sau'}
              aria-label={saved ? 'Bỏ khỏi Xem sau' : 'Lưu xem sau'}
            >
              {saved ? <IoBookmark size={16} color="#ff0033" /> : <IoBookmarkOutline size={16} />}
            </button>
          </div>

          {/* Duration Badge */}
          {film.dur && <div className="yt-card-duration-badge">{film.dur}</div>}

          {/* Watch Progress Bar */}
          {progressPct > 0 && (
            <div className="yt-card-progress-bar-bg">
              <div className="yt-card-progress-bar-fill" style={{ width: `${progressPct}%` }} />
            </div>
          )}
        </a>
      </div>

      {/* Metadata Row */}
      <div className="yt-card-details-row">
        <button
          type="button"
          onClick={() => onFilterChannel?.(film.channel)}
          className="yt-card-avatar-link"
          style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer' }}
          title={`Xem kênh ${film.channel}`}
        >
          <div className="yt-card-avatar-circle">
            <span>{(film.channel || 'P').charAt(0).toUpperCase()}</span>
          </div>
        </button>

        <div className="yt-card-text-container">
          <a
            href={`/watch?v=${encodeURIComponent(film.id)}`}
            onClick={handleOpen}
            className="yt-card-title-link"
          >
            <h3 className="yt-card-title" title={film.title}>
              {film.title}
            </h3>
          </a>

          <div className="yt-card-metadata-col">
            <button
              type="button"
              onClick={() => onFilterChannel?.(film.channel)}
              className="yt-card-channel-link"
              style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
            >
              <span>{film.channel}</span>
              <IoCheckmarkCircle size={13} className="yt-card-verified-icon" />
            </button>

            <div className="yt-card-meta-line">
              <span>{formatViewsVN(film.views)}</span>
              <span className="yt-card-meta-dot">•</span>
              <span>{CAT_LABEL[film.cat] || film.cat}</span>
              {film.rank ? (
                <>
                  <span className="yt-card-meta-dot">•</span>
                  <span>#{film.rank}</span>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
