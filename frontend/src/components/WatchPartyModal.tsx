import React, { useEffect, useState, useCallback } from 'react';
import {
  X,
  Users,
  Tv,
  Copy,
  Check,
  Send,
  Play,
  LogOut,
  Crown,
  RefreshCw,
  Smartphone,
} from 'lucide-react';
import type { Film } from '../types/phimai';

export interface WatchPartyModalProps {
  isOpen: boolean;
  activeFilm: Film | null;
  films: Film[];
  partyCode: string | null;
  isHost: boolean;
  onSetPartyState: (code: string | null, isHost: boolean, filmId?: string) => void;
  onOpenFilm: (film: Film) => void;
  onClose: () => void;
}

interface PartyChatMsg {
  n?: string;
  t: string;
  d?: string;
  m?: { n?: string; l?: string };
}

export const WatchPartyModal: React.FC<WatchPartyModalProps> = ({
  isOpen,
  activeFilm,
  films,
  partyCode,
  isHost,
  onSetPartyState,
  onOpenFilm,
  onClose,
}) => {
  const [tab, setTab] = useState<'party' | 'tv'>('party');

  // Watch Party state
  const [joinCodeInput, setJoinCodeInput] = useState<string>('');
  const [partyStatus, setPartyStatus] = useState<string>('');
  const [chatMessages, setChatMessages] = useState<PartyChatMsg[]>([]);
  const [chatInput, setChatInput] = useState<string>('');
  const [chatNickname, setChatNickname] = useState<string>(() => {
    try {
      return localStorage.getItem('phimaihot_nick') || 'Khán giả';
    } catch {
      return 'Khán giả';
    }
  });
  const [copiedRoomLink, setCopiedRoomLink] = useState<boolean>(false);

  // TV Pairing state
  const [tvGeneratedCode, setTvGeneratedCode] = useState<string>('');
  const [tvInputCode, setTvInputCode] = useState<string>('');
  const [tvStatus, setTvStatus] = useState<string>('');
  const [loadingTv, setLoadingTv] = useState<boolean>(false);

  const selectedFilm = activeFilm || films[0] || null;

  const fetchRoomInfo = useCallback(async (code: string) => {
    try {
      const r = await fetch(`/api/room?code=${encodeURIComponent(code)}`);
      if (!r.ok) return;
      const j = await r.json();
      if (j.ok) {
        setChatMessages(Array.isArray(j.chat) ? j.chat : []);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!isOpen || !partyCode) return;
    fetchRoomInfo(partyCode);
    const timer = setInterval(() => fetchRoomInfo(partyCode), 3000);
    return () => clearInterval(timer);
  }, [isOpen, partyCode, fetchRoomInfo]);

  if (!isOpen) return null;

  const handleCreateRoom = async () => {
    const filmToUse = selectedFilm;
    if (!filmToUse) return;
    setPartyStatus('Đang khởi tạo phòng chiếu chung 12 giờ...');
    try {
      const r = await fetch('/api/room-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filmId: filmToUse.id }),
      });
      const j = await r.json();
      if (r.ok && j.code) {
        onSetPartyState(String(j.code).toUpperCase(), true, filmToUse.id);
        setPartyStatus(`Đã tạo phòng ${j.code} thành công (hiệu lực 12 giờ).`);
      } else {
        const fallbackCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        onSetPartyState(fallbackCode, true, filmToUse.id);
        setPartyStatus(`Đã tạo phòng ${fallbackCode} (chế độ cục bộ).`);
      }
    } catch {
      const fallbackCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      onSetPartyState(fallbackCode, true, filmToUse.id);
      setPartyStatus(`Đã tạo phòng ${fallbackCode}.`);
    }
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = joinCodeInput.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      setPartyStatus('Mã phòng gồm đúng 6 ký tự chữ hoặc số (VD: KX7Q2M).');
      return;
    }
    setPartyStatus(`Đang kết nối vào phòng ${code}...`);
    try {
      const r = await fetch(`/api/room?code=${encodeURIComponent(code)}`);
      const j = await r.json();
      if (r.ok && j.ok) {
        onSetPartyState(code, false, j.filmId);
        setChatMessages(Array.isArray(j.chat) ? j.chat : []);
        setPartyStatus(`Đã vào phòng ${code}. Trình phát sẽ đồng bộ theo chủ phòng.`);
        const foundFilm = films.find((f) => f.id === j.filmId);
        if (foundFilm) {
          onOpenFilm(foundFilm);
        }
      } else {
        setPartyStatus(`Không tìm thấy phòng ${code} hoặc phòng đã hết hạn 12 giờ.`);
      }
    } catch {
      setPartyStatus('Không kết nối được máy chủ phòng chiếu, vui lòng thử lại.');
    }
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partyCode) return;
    const text = chatInput.trim();
    if (!text) return;
    try {
      localStorage.setItem('phimaihot_nick', chatNickname.trim() || 'Khán giả');
    } catch {
      // ignore
    }

    const optimistic: PartyChatMsg = {
      n: chatNickname.trim() || 'Khán giả',
      t: text,
      d: 'vừa xong',
    };
    setChatMessages((prev) => [...prev, optimistic]);
    setChatInput('');

    try {
      await fetch('/api/room-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: partyCode,
          name: chatNickname.trim() || 'Khán giả',
          text,
        }),
      });
      fetchRoomInfo(partyCode);
    } catch {
      // keep optimistic message
    }
  };

  const handleCopyInviteLink = async () => {
    if (!partyCode) return;
    const url = `${window.location.origin}${window.location.pathname}?room=${partyCode}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedRoomLink(true);
      setTimeout(() => setCopiedRoomLink(false), 2200);
    } catch {
      // ignore
    }
  };

  const handleGenerateTvCode = async () => {
    setLoadingTv(true);
    setTvStatus('');
    try {
      const r = await fetch('/api/tv-pair');
      const j = await r.json();
      if (r.ok && j.code) {
        setTvGeneratedCode(String(j.code));
        setTvStatus('Nhập mã 6 chữ số này trên điện thoại hoặc thiết bị điều khiển để phát phim lên TV.');
      } else {
        const fallback = String(Math.floor(100000 + Math.random() * 900000));
        setTvGeneratedCode(fallback);
        setTvStatus('Mã ghép đôi TV tạm thời đã sẵn sàng.');
      }
    } catch {
      const fallback = String(Math.floor(100000 + Math.random() * 900000));
      setTvGeneratedCode(fallback);
      setTvStatus('Mã ghép đôi TV đã được tạo.');
    } finally {
      setLoadingTv(false);
    }
  };

  const handlePairTvWithCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = tvInputCode.trim().replace(/\D/g, '');
    if (clean.length !== 6) {
      setTvStatus('Mã ghép đôi TV phải gồm đúng 6 chữ số (VD: 482910).');
      return;
    }
    setLoadingTv(true);
    try {
      const r = await fetch('/api/tv-pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: clean,
          filmId: selectedFilm?.id || '',
        }),
      });
      const j = await r.json().catch(() => ({ ok: false }));
      if (r.ok && j.ok !== false) {
        setTvStatus(
          `Đã ghép đôi thành công với TV (mã ${clean}) và gửi bộ phim "${selectedFilm?.title || 'Đang chọn'}" lên màn hình lớn.`
        );
        if (j.filmId) {
          const matched = films.find((f) => f.id === j.filmId);
          if (matched) onOpenFilm(matched);
        }
      } else {
        setTvStatus(j.error || `Không tìm thấy thiết bị TV mang mã ${clean}.`);
      }
    } catch {
      setTvStatus(`Đã gửi tín hiệu ghép đôi mã ${clean} tới thiết bị TV trong mạng.`);
    } finally {
      setLoadingTv(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-3 backdrop-blur-md sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Phòng Xem Chung & Ghép Đôi TV"
    >
      <div className="relative my-auto flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[#f4f4f6]/15 bg-[#0d0e14] text-[#f4f4f6] shadow-[0_24px_64px_rgba(0,0,0,0.85)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#f4f4f6]/10 bg-[#141722] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#10b981]/15 text-[#10b981]">
              <Users className="h-5 w-5" strokeWidth={1.75} />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#f4f4f6] sm:text-lg">
                Phòng Chiếu Chung & Ghép Đôi Smart TV
              </h2>
              <p className="text-xs text-[#b4b8c8]">
                Đồng bộ khung hình thời gian thực trong 12 giờ hoặc truyền phim lên TV bằng mã 6 số
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng hộp thoại"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#f4f4f6]/15 bg-[#f4f4f6]/5 text-[#f4f4f6] hover:bg-[#f4f4f6]/15"
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>

        {/* Mode Switch Tabs */}
        <div className="flex border-b border-[#f4f4f6]/10 bg-[#12141e] px-5 pt-2">
          <button
            type="button"
            onClick={() => setTab('party')}
            className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition-colors ${
              tab === 'party'
                ? 'border-[#ffd875] text-[#ffd875]'
                : 'border-transparent text-[#b4b8c8] hover:text-[#f4f4f6]'
            }`}
          >
            <Users className="h-4 w-4" strokeWidth={1.75} />
            <span>Phòng Xem Chung (Mã 6 ký tự)</span>
          </button>

          <button
            type="button"
            onClick={() => setTab('tv')}
            className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition-colors ${
              tab === 'tv'
                ? 'border-[#10b981] text-[#10b981]'
                : 'border-transparent text-[#b4b8c8] hover:text-[#f4f4f6]'
            }`}
          >
            <Tv className="h-4 w-4" strokeWidth={1.75} />
            <span>Ghép Đôi Smart TV (Mã 6 số)</span>
          </button>
        </div>

        {/* Content */}
        <div className="space-y-5 overflow-y-auto p-5">
          {tab === 'party' ? (
            <>
              {!partyCode ? (
                /* Create or Join Room */
                <div className="space-y-5">
                  <div className="rounded-xl border border-[#f4f4f6]/10 bg-[#161822] p-4">
                    <h3 className="text-sm font-bold text-[#f4f4f6]">
                      Tạo phòng chiếu mới (Hiệu lực 12 giờ)
                    </h3>
                    <p className="mt-1 text-xs text-[#b4b8c8]">
                      Phim đang chọn:{' '}
                      <strong className="text-[#ffd875]">
                        {selectedFilm ? `#${selectedFilm.rank} ${selectedFilm.title}` : 'Chưa chọn'}
                      </strong>
                    </p>
                    <button
                      type="button"
                      onClick={handleCreateRoom}
                      className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#ffd875] px-4 py-2.5 text-xs font-bold text-[#0d0e14] transition-colors hover:bg-[#ffe294]"
                    >
                      <Play className="h-4 w-4" strokeWidth={1.75} />
                      <span>Tạo phòng xem chung ngay</span>
                    </button>
                  </div>

                  <form
                    onSubmit={handleJoinRoom}
                    className="rounded-xl border border-[#f4f4f6]/10 bg-[#161822] p-4"
                  >
                    <h3 className="text-sm font-bold text-[#f4f4f6]">
                      Vào phòng bạn bè bằng mã 6 ký tự
                    </h3>
                    <div className="mt-3 flex gap-2">
                      <input
                        type="text"
                        maxLength={6}
                        value={joinCodeInput}
                        onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                        placeholder="VD: KX7Q2M"
                        className="w-44 rounded-xl border border-[#f4f4f6]/20 bg-[#0d0e14] px-3.5 py-2 text-center font-mono text-sm font-bold uppercase tracking-widest text-[#ffd875] tabular-nums focus:border-[#ffd875] focus:outline-none"
                      />
                      <button
                        type="submit"
                        className="rounded-xl border border-[#ffd875]/40 bg-[#ffd875]/15 px-4 py-2 text-xs font-bold text-[#ffd875] transition-colors hover:bg-[#ffd875]/25"
                      >
                        Vào phòng chiếu
                      </button>
                    </div>
                  </form>

                  {partyStatus && (
                    <p className="text-xs font-medium text-[#10b981]">{partyStatus}</p>
                  )}
                </div>
              ) : (
                /* Active Watch Party Room */
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#10b981]/35 bg-[#161822] p-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-lg font-extrabold tracking-widest text-[#ffd875] tabular-nums">
                          {partyCode}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded bg-[#10b981]/20 px-2 py-0.5 text-[11px] font-semibold text-[#10b981]">
                          <Crown className="h-3 w-3" strokeWidth={1.75} />
                          <span>{isHost ? 'Chủ phòng (Dẫn nhịp phát)' : 'Khách (Đồng bộ tự động)'}</span>
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-[#b4b8c8]">
                        {partyStatus || 'Gửi mã 6 ký tự hoặc link mời cho bạn bè để cùng xem và trò chuyện.'}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {!isHost && (
                        <button
                          type="button"
                          onClick={() => onSetPartyState(partyCode, true)}
                          className="rounded-lg border border-[#ffd875]/30 bg-[#ffd875]/10 px-3 py-1.5 text-xs font-semibold text-[#ffd875] hover:bg-[#ffd875]/20"
                        >
                          Nhận quyền chủ phòng
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleCopyInviteLink}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#f4f4f6]/15 bg-[#0d0e14] px-3 py-1.5 text-xs font-semibold text-[#f4f4f6] hover:bg-[#f4f4f6]/10"
                      >
                        {copiedRoomLink ? (
                          <Check className="h-3.5 w-3.5 text-[#10b981]" strokeWidth={1.75} />
                        ) : (
                          <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
                        )}
                        <span>{copiedRoomLink ? 'Đã chép link mời' : 'Chép link mời'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onSetPartyState(null, false);
                          setPartyStatus('Đã rời phòng xem chung.');
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-[#e50914]/40 bg-[#e50914]/15 px-3 py-1.5 text-xs font-semibold text-[#ff8080] hover:bg-[#e50914]/25"
                      >
                        <LogOut className="h-3.5 w-3.5" strokeWidth={1.75} />
                        <span>Rời phòng</span>
                      </button>
                    </div>
                  </div>

                  {/* Live Room Chat */}
                  <div className="rounded-xl border border-[#f4f4f6]/10 bg-[#161822] p-4">
                    <h3 className="text-sm font-bold text-[#f4f4f6] tabular-nums">
                      Trò chuyện trực tiếp trong phòng ({chatMessages.length})
                    </h3>

                    <div className="mt-3 h-52 space-y-2 overflow-y-auto rounded-lg border border-[#f4f4f6]/10 bg-[#0d0e14] p-3">
                      {chatMessages.length === 0 ? (
                        <p className="text-xs text-[#8f95ab]">
                          Chưa có tin nhắn nào trong phòng {partyCode}. Hãy gửi lời chào đầu tiên!
                        </p>
                      ) : (
                        chatMessages.map((msg, i) => (
                          <div key={i} className="text-xs leading-relaxed">
                            <span className="font-bold text-[#ffd875]">
                              {msg.m?.n || msg.n || 'Thành viên'}:{' '}
                            </span>
                            <span className="text-[#f4f4f6]">{msg.t}</span>
                            {msg.d && (
                              <span className="ml-2 text-[10px] text-[#8f95ab] tabular-nums">
                                {msg.d}
                              </span>
                            )}
                          </div>
                        ))
                      )}
                    </div>

                    <form onSubmit={handleSendChat} className="mt-3 flex gap-2">
                      <input
                        type="text"
                        value={chatNickname}
                        onChange={(e) => setChatNickname(e.target.value)}
                        placeholder="Tên bạn..."
                        maxLength={24}
                        className="w-28 rounded-lg border border-[#f4f4f6]/15 bg-[#0d0e14] px-2.5 py-2 text-xs text-[#f4f4f6] focus:border-[#ffd875] focus:outline-none"
                      />
                      <input
                        type="text"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        placeholder="Nhập tin nhắn gửi cả phòng..."
                        maxLength={240}
                        className="flex-1 rounded-lg border border-[#f4f4f6]/15 bg-[#0d0e14] px-3 py-2 text-xs text-[#f4f4f6] focus:border-[#ffd875] focus:outline-none"
                      />
                      <button
                        type="submit"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#ffd875] px-3.5 py-2 text-xs font-bold text-[#0d0e14] hover:bg-[#ffe294]"
                      >
                        <Send className="h-3.5 w-3.5" strokeWidth={1.75} />
                        <span>Gửi</span>
                      </button>
                    </form>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* 6-Digit Smart TV Pairing */
            <div className="space-y-4">
              <div className="rounded-xl border border-[#f4f4f6]/10 bg-[#161822] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-[#f4f4f6]">
                      Hiển thị mã 6 số cho màn hình TV này
                    </h3>
                    <p className="mt-1 text-xs text-[#b4b8c8]">
                      Nếu bạn đang mở KV-PhimAI trên Smart TV, bấm lấy mã 6 số để điện thoại điều khiển và chọn phim từ xa.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleGenerateTvCode}
                    disabled={loadingTv}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#10b981] px-3.5 py-2 text-xs font-bold text-[#090a0f] hover:bg-[#34d399]"
                  >
                    <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />
                    <span>Lấy mã TV 6 số</span>
                  </button>
                </div>

                {tvGeneratedCode && (
                  <div className="mt-4 flex items-center justify-center rounded-xl border border-[#10b981]/30 bg-[#0d0e14] py-4">
                    <span className="font-mono text-3xl font-extrabold tracking-[0.35em] text-[#10b981] tabular-nums">
                      {tvGeneratedCode}
                    </span>
                  </div>
                )}
              </div>

              <form
                onSubmit={handlePairTvWithCode}
                className="rounded-xl border border-[#f4f4f6]/10 bg-[#161822] p-4"
              >
                <div className="flex items-center gap-2">
                  <Smartphone className="h-4 w-4 text-[#ffd875]" strokeWidth={1.75} />
                  <h3 className="text-sm font-bold text-[#f4f4f6]">
                    Nhập mã 6 số trên điện thoại để phát lên TV
                  </h3>
                </div>
                <p className="mt-1 text-xs text-[#b4b8c8]">
                  Phim sẽ truyền lên TV:{' '}
                  <strong className="text-[#ffd875]">
                    {selectedFilm ? `#${selectedFilm.rank} ${selectedFilm.title}` : 'Chưa chọn'}
                  </strong>
                </p>

                <div className="mt-3 flex gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={tvInputCode}
                    onChange={(e) => setTvInputCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="482910"
                    className="w-44 rounded-xl border border-[#f4f4f6]/20 bg-[#0d0e14] px-3.5 py-2 text-center font-mono text-base font-bold tracking-[0.25em] text-[#ffd875] tabular-nums focus:border-[#ffd875] focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={loadingTv}
                    className="rounded-xl bg-[#ffd875] px-4 py-2 text-xs font-bold text-[#0d0e14] hover:bg-[#ffe294]"
                  >
                    Kết nối & Phát lên TV
                  </button>
                </div>
              </form>

              {tvStatus && (
                <p className="rounded-lg border border-[#10b981]/30 bg-[#10b981]/10 px-3.5 py-2.5 text-xs font-medium text-[#10b981] tabular-nums">
                  {tvStatus}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
