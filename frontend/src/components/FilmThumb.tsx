import React from 'react';
import { getFallbackThumbUrl, getThumbUrl } from '../utils/phimaiUtils';

interface FilmThumbProps {
  id: string;
  alt: string;
  className?: string;
  lazy?: boolean;
}

/** KV-Tube thumbnail (/api/kvtube/thumb) with a one-shot fallback. */
export const FilmThumb: React.FC<FilmThumbProps> = ({ id, alt, className, lazy = true }) => (
  <img
    src={getThumbUrl(id)}
    alt={alt}
    loading={lazy ? 'lazy' : undefined}
    decoding="async"
    onError={(e) => {
      const t = e.currentTarget;
      if (!t.dataset.fallback) {
        t.dataset.fallback = '1';
        t.src = getFallbackThumbUrl(id);
      }
    }}
    className={className}
  />
);
