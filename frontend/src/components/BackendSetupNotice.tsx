import { IoWarningOutline } from 'react-icons/io5';

const SETUP_GUIDE_URL = 'https://github.com/vndangkhoa/kv-phimai#self-hosting';

/**
 * Shown when the server has no video backend (KV-Tube, or Invidious + Companion).
 * Films can still be browsed, but nothing can play until the operator sets one.
 */
export function BackendSetupNotice() {
  return (
    <div className="backend-setup-notice" role="alert">
      <IoWarningOutline size={22} className="backend-setup-notice-icon" aria-hidden="true" />
      <div className="backend-setup-notice-body">
        <strong>Chưa kết nối máy chủ phát video</strong>
        <p>
          Bạn vẫn xem được danh sách phim, nhưng chưa phát được video. Người quản trị cần cài{' '}
          <b>KV-Tube</b> hoặc <b>Invidious + Invidious Companion</b>, rồi đặt địa chỉ máy chủ đó
          (biến <code>KVTUBE_URL</code> trong Docker, hoặc ô "Máy chủ video" khi cài gói SPK trên Synology).
        </p>
        <p className="backend-setup-notice-en">
          No video backend is configured. The admin needs a KV-Tube install, or Invidious + Companion, and must set
          its address (<code>KVTUBE_URL</code>).
        </p>
        <a href={SETUP_GUIDE_URL} target="_blank" rel="noreferrer">
          Xem hướng dẫn tự host →
        </a>
      </div>
    </div>
  );
}
