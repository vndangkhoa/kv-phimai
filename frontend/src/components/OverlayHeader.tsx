import React from 'react';
import { X } from 'lucide-react';
import { DialogHeader } from '@astryxdesign/core/Dialog';
import { IconButton } from '@astryxdesign/core/IconButton';

interface OverlayHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  startContent?: React.ReactNode;
  onClose: () => void;
  closeLabel?: string;
}

/**
 * Astryx DialogHeader with the overlay layer's padding and a Vietnamese close
 * control. The title is the dialog's accessible name and takes focus on open;
 * it wraps to two lines instead of truncating.
 */
export const OverlayHeader: React.FC<OverlayHeaderProps> = ({
  title,
  subtitle,
  startContent,
  onClose,
  closeLabel = 'Đóng',
}) => (
  <DialogHeader
    className="shrink-0 bg-[#141722] px-4 py-3 sm:px-6 sm:py-4"
    title={<span className="kv-head-title">{title}</span>}
    subtitle={subtitle}
    startContent={startContent}
    endContent={
      <IconButton
        label={closeLabel}
        tooltip={closeLabel}
        variant="ghost"
        icon={<X className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />}
        onClick={onClose}
        className="kv-touch-square"
      />
    }
  />
);
