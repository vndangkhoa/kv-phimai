import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { ExternalLink } from 'lucide-react';

const SETUP_GUIDE_URL = 'https://github.com/vndangkhoa/kv-phimai#self-hosting';

/**
 * Shown when the server has no video backend (KV-Tube, or Invidious + Companion).
 * Films can still be browsed, but nothing can play until the operator sets one.
 */
export function BackendSetupNotice() {
  return (
    <div className="backend-setup-notice-wrap" role="alert">
      <Banner
        status="warning"
        container="card"
        collapsible={false}
        title="Chưa kết nối máy chủ phát video"
        description="Bạn vẫn xem được danh sách phim, nhưng chưa phát được video cho tới khi cấu hình máy chủ nguồn."
        endContent={
          <Button
            variant="primary"
            size="sm"
            label="Xem hướng dẫn tự host"
            href={SETUP_GUIDE_URL}
            target="_blank"
            rel="noreferrer"
            icon={<ExternalLink size={14} strokeWidth={1.75} />}
          />
        }
      >
        <div className="backend-setup-notice-body" style={{ fontSize: '13.5px', lineHeight: 1.55 }}>
          <p style={{ margin: '0 0 6px' }}>
            Người quản trị cần cài <strong>KV-Tube</strong> hoặc{' '}
            <strong>Invidious + Invidious Companion</strong>, rồi đặt địa chỉ máy chủ đó (biến{' '}
            <code>KVTUBE_URL</code> trong Docker, hoặc ô &ldquo;Máy chủ video&rdquo; khi cài gói
            SPK trên Synology).
          </p>
          <p className="backend-setup-notice-en" style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
            No video backend is configured. The admin needs a KV-Tube install, or Invidious +
            Companion, and must set its address (<code>KVTUBE_URL</code>).
          </p>
        </div>
      </Banner>
    </div>
  );
}
