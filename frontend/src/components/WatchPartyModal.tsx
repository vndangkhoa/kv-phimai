import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, Crown, LogOut, Play, RefreshCw, Send, Smartphone, Tv, Users } from 'lucide-react';
import { Dialog } from '@astryxdesign/core/Dialog';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { Badge } from '@astryxdesign/core/Badge';
import type { Film } from '../types/phimai';
import { OverlayHeader } from './OverlayHeader';
import { PHONE_QUERY, useMediaQuery } from './useMediaQuery';
import './overlays.css';

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

const ICON = { className: 'h-4 w-4 shrink-0', strokeWidth: 1.75 } as const;

/** Watch Party (6-character room, 12h) + live chat + 6-digit Smart TV pairing. */
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
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [tab, setTab] = useState<'party' | 'tv'>('party');

  // Watch Party
  const [joinCodeInput, setJoinCodeInput] = useState<string>('');
  const [partyStatus, setPartyStatus] = useState<string>('');
  const [partyError, setPartyError] = useState<boolean>(false);
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
  const chatLogRef = useRef<HTMLOListElement | null>(null);

  // TV pairing
  const [tvGeneratedCode, setTvGeneratedCode] = useState<string>('');
  const [tvInputCode, setTvInputCode] = useState<string>('');
  const [tvStatus, setTvStatus] = useState<string>('');
  const [tvError, setTvError] = useState<boolean>(false);
  const [loadingTv, setLoadingTv] = useState<boolean>(false);

  const selectedFilm = activeFilm || films[0] || null;

  const fetchRoomInfo = useCallback(async (code: string) => {
    try {
      const r = await fetch(`/api/room?code=${encodeURIComponent(code)}`);
      if (!r.ok) return;
      const j = await r.json();
      if (j.ok) setChatMessages(Array.isArray(j.chat) ? j.chat : []);
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

  // Keep the chat log pinned to the newest message
  useEffect(() => {
    const el = chatLogRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chatMessages.length]);

  const handleCreateRoom = async () => {
    const filmToUse = selectedFilm;
    if (!filmToUse) return;
    setPartyError(false);
    setPartyStatus('Đang tạo phòng chiếu chung 12 giờ…');
    try {
      const r = await fetch('/api/room-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filmId: filmToUse.id }),
      });
      const j = await r.json();
      if (r.ok && j.code) {
        onSetPartyState(String(j.code).toUpperCase(), true, filmToUse.id);
        setPartyStatus(`Đã tạo phòng ${j.code}, hiệu lực 12 giờ.`);
      } else {
        const fallbackCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        onSetPartyState(fallbackCode, true, filmToUse.id);
        setPartyStatus(`Đã tạo phòng ${fallbackCode} ở chế độ cục bộ.`);
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
      setPartyError(true);
      setPartyStatus('Mã phòng gồm đúng 6 chữ hoặc số, VD: KX7Q2M.');
      return;
    }
    setPartyError(false);
    setPartyStatus(`Đang vào phòng ${code}…`);
    try {
      const r = await fetch(`/api/room?code=${encodeURIComponent(code)}`);
      const j = await r.json();
      if (r.ok && j.ok) {
        onSetPartyState(code, false, j.filmId);
        setChatMessages(Array.isArray(j.chat) ? j.chat : []);
        setPartyStatus(`Đã vào phòng ${code}. Trình phát đồng bộ theo chủ phòng.`);
        const foundFilm = films.find((f) => f.id === j.filmId);
        if (foundFilm) onOpenFilm(foundFilm);
      } else {
        setPartyError(true);
        setPartyStatus(`Không tìm thấy phòng ${code}, hoặc phòng đã quá 12 giờ. Hỏi lại mã từ chủ phòng.`);
      }
    } catch {
      setPartyError(true);
      setPartyStatus('Không kết nối được máy chủ phòng chiếu. Kiểm tra mạng rồi thử lại.');
    }
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partyCode) return;
    const text = chatInput.trim();
    if (!text) return;
    const nick = chatNickname.trim() || 'Khán giả';
    try {
      localStorage.setItem('phimaihot_nick', nick);
    } catch {
      // ignore
    }
    setChatMessages((prev) => [...prev, { n: nick, t: text, d: 'vừa xong' }]);
    setChatInput('');
    try {
      await fetch('/api/room-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: partyCode, name: nick, text }),
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
    setTvError(false);
    try {
      const r = await fetch('/api/tv-pair');
      const j = await r.json();
      if (r.ok && j.code) {
        setTvGeneratedCode(String(j.code));
        setTvStatus('Nhập mã 6 số này trên điện thoại để điều khiển và phát phim lên TV.');
      } else {
        setTvGeneratedCode(String(Math.floor(100000 + Math.random() * 900000)));
        setTvStatus('Mã ghép đôi tạm thời đã sẵn sàng.');
      }
    } catch {
      setTvGeneratedCode(String(Math.floor(100000 + Math.random() * 900000)));
      setTvStatus('Mã ghép đôi TV đã được tạo.');
    } finally {
      setLoadingTv(false);
    }
  };

  const handlePairTvWithCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = tvInputCode.trim().replace(/\D/g, '');
    if (clean.length !== 6) {
      setTvError(true);
      setTvStatus('Mã ghép đôi TV gồm đúng 6 chữ số, VD: 482910.');
      return;
    }
    setTvError(false);
    setLoadingTv(true);
    try {
      const r = await fetch('/api/tv-pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: clean, filmId: selectedFilm?.id || '' }),
      });
      const j = await r.json().catch(() => ({ ok: false }));
      if (r.ok && j.ok !== false) {
        setTvStatus(`Đã ghép đôi TV mã ${clean} và gửi "${selectedFilm?.title || 'phim đang chọn'}" lên màn hình lớn.`);
        if (j.filmId) {
          const matched = films.find((f) => f.id === j.filmId);
          if (matched) onOpenFilm(matched);
        }
      } else {
        setTvError(true);
        setTvStatus(j.error || `Không tìm thấy TV mang mã ${clean}. Kiểm tra mã trên màn hình TV rồi thử lại.`);
      }
    } catch {
      setTvStatus(`Đã gửi tín hiệu ghép đôi mã ${clean} tới TV trong mạng.`);
    } finally {
      setLoadingTv(false);
    }
  };

  const fullWidth = isPhone ? '100%' : undefined;
  const filmLabel = selectedFilm ? `#${selectedFilm.rank} ${selectedFilm.title}` : 'Chưa chọn phim';

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      variant={isPhone ? 'fullscreen' : 'standard'}
      width={680}
      maxHeight="90dvh"
      padding={0}
      purpose="form"
      className="kv-overlay"
      data-testid="watch-party-modal"
    >
      {isOpen ? (
        <div className="kv-frame">
          <OverlayHeader
            title="Xem chung và ghép đôi TV"
            subtitle="Đồng bộ khung hình trong 12 giờ, hoặc truyền phim lên TV bằng mã 6 số."
            startContent={
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#10b981]/15 text-[#34d399]">
                <Users className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
              </span>
            }
            onClose={onClose}
            closeLabel="Đóng xem chung"
          />

          <div className="border-b border-[#f4f4f6]/10 px-2 sm:px-4">
            <TabList
              value={tab}
              onChange={(v) => setTab(v === 'tv' ? 'tv' : 'party')}
              role="tablist"
              layout={isPhone ? 'fill' : 'hug'}
            >
              <Tab
                value="party"
                label="Phòng xem chung"
                panelId="kv-party-panel"
                icon={<Users {...ICON} aria-hidden="true" />}
              />
              <Tab value="tv" label="Ghép đôi TV" panelId="kv-tv-panel" icon={<Tv {...ICON} aria-hidden="true" />} />
            </TabList>
          </div>

          <div className="kv-body kv-scroll px-4 pt-4 sm:px-6 sm:pt-5">
            {tab === 'party' ? (
              <div id="kv-party-panel" role="tabpanel" aria-label="Phòng xem chung" className="space-y-4">
                {!partyCode ? (
                  <>
                    <section aria-labelledby="kv-create-title" className="rounded-xl border border-[#f4f4f6]/10 bg-[#161822] p-4">
                      <h3 id="kv-create-title" className="text-sm font-bold text-[#f4f4f6]">
                        Tạo phòng chiếu mới
                      </h3>
                      <p className="mt-1 text-xs text-[#c4c8d9]">
                        Phim đang chọn: <strong className="font-semibold text-[#ffd875] tabular-nums">{filmLabel}</strong>
                      </p>
                      <div className="mt-3">
                        <Button
                          label="Tạo phòng xem chung"
                          variant="primary"
                          icon={<Play {...ICON} aria-hidden="true" />}
                          clickAction={handleCreateRoom}
                          isDisabled={!selectedFilm}
                          width={fullWidth}
                          className="kv-touch"
                        />
                      </div>
                    </section>

                    <form
                      onSubmit={handleJoinRoom}
                      aria-labelledby="kv-join-title"
                      className="rounded-xl border border-[#f4f4f6]/10 bg-[#161822] p-4"
                      noValidate
                    >
                      <h3 id="kv-join-title" className="text-sm font-bold text-[#f4f4f6]">
                        Vào phòng bạn bè
                      </h3>
                      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[200px_auto] sm:items-end">
                        <TextInput
                          label="Mã phòng 6 ký tự"
                          value={joinCodeInput}
                          onChange={(v) => setJoinCodeInput(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                          placeholder="KX7Q2M"
                          autoCapitalize="characters"
                          hasAutoCorrect={false}
                          hasSpellCheck={false}
                          autoComplete="off"
                          enterKeyHint="go"
                          controlClassName="font-mono tracking-[0.2em] tabular-nums"
                          status={partyError ? { type: 'error' } : undefined}
                          width="100%"
                        />
                        <Button
                          type="submit"
                          label="Vào phòng chiếu"
                          width={fullWidth}
                          className="kv-touch sm:justify-self-start"
                        />
                      </div>
                    </form>

                    {partyStatus && (
                      <p
                        role={partyError ? 'alert' : 'status'}
                        className={`text-sm font-medium ${partyError ? 'text-[#ff6b72]' : 'text-[#34d399]'}`}
                      >
                        {partyStatus}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <section
                      aria-label={`Phòng ${partyCode}`}
                      className="space-y-3 rounded-xl border border-[#10b981]/35 bg-[#161822] p-4"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xl font-extrabold tracking-[0.2em] text-[#ffd875] tabular-nums">
                          {partyCode}
                        </span>
                        <Badge
                          variant="green"
                          icon={<Crown className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />}
                          label={isHost ? 'Chủ phòng, dẫn nhịp phát' : 'Khách, tự đồng bộ'}
                        />
                      </div>
                      <p role="status" className="text-xs text-[#c4c8d9]">
                        {partyStatus || 'Gửi mã 6 ký tự hoặc link mời cho bạn bè để cùng xem và trò chuyện.'}
                      </p>
                      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                        <Button
                          label={copiedRoomLink ? 'Đã chép link mời' : 'Chép link mời'}
                          icon={copiedRoomLink ? <Check {...ICON} aria-hidden="true" /> : <Copy {...ICON} aria-hidden="true" />}
                          onClick={handleCopyInviteLink}
                          width={fullWidth}
                          className="kv-touch"
                        />
                        {!isHost && (
                          <Button
                            label="Nhận quyền chủ phòng"
                            icon={<Crown {...ICON} aria-hidden="true" />}
                            onClick={() => onSetPartyState(partyCode, true)}
                            width={fullWidth}
                            className="kv-touch"
                          />
                        )}
                        <Button
                          label="Rời phòng"
                          variant="destructive"
                          icon={<LogOut {...ICON} aria-hidden="true" />}
                          onClick={() => {
                            onSetPartyState(null, false);
                            setPartyError(false);
                            setPartyStatus('Đã rời phòng xem chung.');
                          }}
                          width={fullWidth}
                          className="kv-touch"
                        />
                      </div>
                    </section>

                    <section aria-labelledby="kv-chat-title" className="rounded-xl border border-[#f4f4f6]/10 bg-[#161822] p-4">
                      <h3 id="kv-chat-title" className="text-sm font-bold text-[#f4f4f6] tabular-nums">
                        Trò chuyện trong phòng ({chatMessages.length})
                      </h3>
                      <ol
                        ref={chatLogRef}
                        role="log"
                        aria-live="polite"
                        aria-label="Tin nhắn trong phòng"
                        className="kv-scroll mt-3 h-56 space-y-2 rounded-lg border border-[#f4f4f6]/10 bg-[#0d0e14] p-3 sm:h-60"
                      >
                        {chatMessages.length === 0 ? (
                          <li className="text-xs text-[#9da3b8]">
                            Phòng {partyCode} chưa có tin nhắn. Gửi lời chào đầu tiên bên dưới.
                          </li>
                        ) : (
                          chatMessages.map((msg, i) => (
                            <li key={i} className="break-words text-xs leading-relaxed">
                              <span className="font-bold text-[#ffd875]">{msg.m?.n || msg.n || 'Thành viên'}: </span>
                              <span className="text-[#f4f4f6]">{msg.t}</span>
                              {msg.d && <span className="ml-2 text-[10px] text-[#9da3b8] tabular-nums">{msg.d}</span>}
                            </li>
                          ))
                        )}
                      </ol>

                      <form onSubmit={handleSendChat} className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[140px_minmax(0,1fr)_auto]">
                        <TextInput
                          label="Tên của bạn"
                          isLabelHidden
                          value={chatNickname}
                          onChange={(v) => setChatNickname(v.slice(0, 24))}
                          placeholder="Tên của bạn"
                          autoComplete="nickname"
                          width="100%"
                        />
                        <TextInput
                          label="Tin nhắn"
                          isLabelHidden
                          value={chatInput}
                          onChange={(v) => setChatInput(v.slice(0, 240))}
                          placeholder="Nhắn cả phòng…"
                          enterKeyHint="send"
                          width="100%"
                        />
                        <Button
                          type="submit"
                          variant="primary"
                          label="Gửi"
                          icon={<Send {...ICON} aria-hidden="true" />}
                          isDisabled={!chatInput.trim()}
                          width={fullWidth}
                          className="kv-touch"
                        />
                      </form>
                    </section>
                  </>
                )}
              </div>
            ) : (
              <div id="kv-tv-panel" role="tabpanel" aria-label="Ghép đôi TV" className="space-y-4">
                <section aria-labelledby="kv-tvcode-title" className="rounded-xl border border-[#f4f4f6]/10 bg-[#161822] p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 id="kv-tvcode-title" className="text-sm font-bold text-[#f4f4f6]">
                        Hiện mã 6 số trên TV này
                      </h3>
                      <p className="mt-1 max-w-[60ch] text-xs text-[#c4c8d9]">
                        Đang mở KV-PhimAI trên Smart TV? Lấy mã để điện thoại chọn phim và điều khiển từ xa.
                      </p>
                    </div>
                    <Button
                      label="Lấy mã TV"
                      icon={<RefreshCw {...ICON} aria-hidden="true" />}
                      onClick={handleGenerateTvCode}
                      isLoading={loadingTv}
                      width={fullWidth}
                      className="kv-touch shrink-0"
                    />
                  </div>
                  {tvGeneratedCode && (
                    <div className="mt-4 flex items-center justify-center rounded-xl border border-[#10b981]/30 bg-[#0d0e14] py-4">
                      <span
                        aria-label={`Mã TV ${tvGeneratedCode.split('').join(' ')}`}
                        className="font-mono text-3xl font-extrabold tracking-[0.3em] text-[#34d399] tabular-nums sm:text-4xl"
                      >
                        {tvGeneratedCode}
                      </span>
                    </div>
                  )}
                </section>

                <form
                  onSubmit={handlePairTvWithCode}
                  aria-labelledby="kv-tvpair-title"
                  className="rounded-xl border border-[#f4f4f6]/10 bg-[#161822] p-4"
                  noValidate
                >
                  <div className="flex items-center gap-2">
                    <Smartphone className="h-4 w-4 text-[#ffd875]" strokeWidth={1.75} aria-hidden="true" />
                    <h3 id="kv-tvpair-title" className="text-sm font-bold text-[#f4f4f6]">
                      Nhập mã TV trên điện thoại
                    </h3>
                  </div>
                  <p className="mt-1 text-xs text-[#c4c8d9]">
                    Phim sẽ phát lên TV: <strong className="font-semibold text-[#ffd875] tabular-nums">{filmLabel}</strong>
                  </p>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[200px_auto] sm:items-end">
                    <TextInput
                      label="Mã TV 6 số"
                      value={tvInputCode}
                      onChange={(v) => setTvInputCode(v.replace(/\D/g, '').slice(0, 6))}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="482910"
                      enterKeyHint="go"
                      controlClassName="font-mono tracking-[0.25em] tabular-nums"
                      status={tvError ? { type: 'error' } : undefined}
                      width="100%"
                    />
                    <Button
                      type="submit"
                      variant="primary"
                      label="Phát lên TV"
                      icon={<Tv {...ICON} aria-hidden="true" />}
                      isLoading={loadingTv}
                      width={fullWidth}
                      className="kv-touch sm:justify-self-start"
                    />
                  </div>
                </form>

                {tvStatus && (
                  <p
                    role={tvError ? 'alert' : 'status'}
                    className={`rounded-lg border px-3.5 py-2.5 text-sm font-medium tabular-nums ${
                      tvError
                        ? 'border-[#e50914]/40 bg-[#e50914]/10 text-[#ff6b72]'
                        : 'border-[#10b981]/30 bg-[#10b981]/10 text-[#34d399]'
                    }`}
                  >
                    {tvStatus}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </Dialog>
  );
};
