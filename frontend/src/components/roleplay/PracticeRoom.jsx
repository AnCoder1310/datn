import { memo, useState, useRef, useEffect } from 'react';
import { ChevronLeft, SendIcon, MicIcon, SpeakerIcon } from '../common/Icons';
import { Sparkles, Video, VideoOff, ShieldCheck, X, Captions, CaptionsOff, MessageCircle, Phone, Target, Award, Compass, MessageSquare } from 'lucide-react';
import { getVehicleImage } from '../../data/vehicleData';
import { FinishConfirmDialog } from './FinishConfirmDialog';
import { practiceApi } from '../../api/practiceApi';
import { createId } from '../../lib/id';
import { useRealtimeRoleplay } from '../../hooks/useRealtimeRoleplay';
import { useLocalCamera } from '../../hooks/useLocalCamera';
import './practiceRoom.css';
import { NoticeDialog } from '../common/NoticeDialog';
import { apiErrorNotice, terminationNotice } from '../../utils/practiceNotices';
import { authApi } from '../../api/authApi';

function readPreference(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function savePreference(key, value) {
  try { localStorage.setItem(key, value); } catch { /* Room works without storage. */ }
}
function clock(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
function makeBands(green) {
  const radii = green ? [62, 84, 108, 134, 162] : [98, 127, 158, 191, 226, 263, 302, 340];
  return radii.map((radius, i) => {
    const inner = i ? radii[i - 1] : green ? 48 : 76;
    const step = green ? 16 : 22;
    const size = green ? 4.5 - .5 * i : 5 - .4 * i;
    const alpha = .85 * (1 - i / radii.length) ** (green ? 1.2 : 1.3);
    const dots = [];
    for (let x = -Math.ceil(radius / step); x <= Math.ceil(radius / step); x++) {
      for (let y = -Math.ceil(radius / step); y <= Math.ceil(radius / step); y++) {
        const distance = Math.hypot(x * step, y * step);
        if (distance >= inner && distance < radius) dots.push({ left: radius + x * step - size / 2, top: radius + y * step - size / 2 });
      }
    }
    const color = green
      ? `rgba(16, 185, 129, ${(alpha * 0.45).toFixed(3)})`
      : `rgba(148, 163, 184, ${(alpha * 0.22).toFixed(3)})`;
    return { radius, size, color, dots };
  });
}
const BLUE_BANDS = makeBands(false);
const GREEN_BANDS = makeBands(true);
function DotField({ green = false }) {
  return <span className={`pr-field ${green ? 'pr-field-green' : ''}`} aria-hidden="true">
    {(green ? GREEN_BANDS : BLUE_BANDS).map((band, i) => <span className="pr-band" key={i} style={{ width: band.radius * 2, height: band.radius * 2, '--dx': `${10 + 3 * i}px`, '--dy': `${8 + 2.4 * i}px` }}>
      <span className="pr-breath" style={{ animationDelay: `${i * (green ? .16 : .32)}s` }}>
        {band.dots.map((dot, j) => <span key={j} style={{ ...dot, width: band.size, height: band.size, background: band.color, boxShadow: `0 0 6px ${band.color}` }} />)}
      </span>
    </span>)}
  </span>;
}
function CustomerAvatar({ thinking = false, large = false }) {
  return <span className={`pr-avatar ${large ? 'pr-avatar-large' : ''}`}>
    {thinking && <><span className="pr-ring" /><span className="pr-ring" /></>}KH
  </span>;
}
function CustomerContext({ session, scenario }) {
  const channel = session?.sales_channel || scenario?.sales_channel;
  const channels = {
    fanpage: 'Fanpage',
    showroom: 'Showroom',
    phone: 'Điện thoại',
    hotline: 'Hotline',
    zalo: 'Zalo',
    online: 'Trực tuyến',
  };
  const channelLabel = channels[channel] || channel || 'Fanpage';
  const objective = session?.training_objective || scenario?.training_objective;

  const skills = [
    { num: '01', title: 'Khám phá nhu cầu', desc: 'Lắng nghe & làm rõ bài toán di chuyển/chi phí' },
    { num: '02', title: 'Kiến thức sản phẩm', desc: 'Tư vấn thông số xe, pin, trạm sạc & ADAS' },
    { num: '03', title: 'Xử lý phản đối', desc: 'Giải tỏa lo lắng về độ bền pin & chi phí' },
    { num: '04', title: 'Chính xác chính sách', desc: 'Ưu đãi lệ phí trước bạ, bảo hành 10 năm' },
    { num: '05', title: 'Chốt bước tiếp theo', desc: 'Hẹn lái thử trực tiếp hoặc đặt cọc giữ xe' },
  ];

  return (
    <div className="pr-context-wrap">
      {/* 1. KHÁCH HÀNG & LỜI MỞ ĐẦU */}
      {session?.visible_context && (
        <section className="pr-context-card pr-card-customer">
          <div className="pr-card-header">
            <div className="pr-customer-pill-wrap">
              <span className="pr-customer-avatar-tag">KH</span>
              <span className="pr-customer-channel-badge">
                <MessageCircle size={11} strokeWidth={2.4} />
                <span>Khách qua {channelLabel}</span>
              </span>
            </div>
            <span className="pr-online-dot-wrap" title="Khách đang kết nối">
              <span className="pr-online-dot" />
              <span>Kết nối</span>
            </span>
          </div>

          <div className="pr-customer-quote-box">
            <span className="pr-quote-mark">“</span>
            <p className="pr-customer-quote-text">{session.visible_context}</p>
          </div>
        </section>
      )}

      {/* 2. MỤC TIÊU PHIÊN LUYỆN TẬP */}
      {objective && (
        <section className="pr-context-card pr-card-objective">
          <div className="pr-card-header">
            <div className="pr-card-header-left">
              <span className="pr-card-icon-wrap is-objective">
                <Target size={13} strokeWidth={2.4} />
              </span>
              <h3 className="pr-card-title">Mục tiêu tư vấn</h3>
            </div>
            <span className="pr-target-tag">Trọng tâm</span>
          </div>
          <p className="pr-objective-text">{objective}</p>
        </section>
      )}

      {/* 3. 5 TIÊU CHÍ CHẤM ĐIỂM AI */}
      <section className="pr-context-card pr-card-skills">
        <div className="pr-card-header">
          <div className="pr-card-header-left">
            <span className="pr-card-icon-wrap is-skills">
              <Award size={13} strokeWidth={2.4} />
            </span>
            <h3 className="pr-card-title">5 kỹ năng chấm điểm</h3>
          </div>
          <span className="pr-criteria-tag">AI Evaluator</span>
        </div>

        <div className="pr-skills-list">
          {skills.map((skill) => (
            <div className="pr-skill-row" key={skill.num}>
              <span className="pr-skill-num">{skill.num}</span>
              <div className="pr-skill-info">
                <strong className="pr-skill-name">{skill.title}</strong>
                <span className="pr-skill-desc">{skill.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 4. MẸO TƯ VẤN (COACH HINT) */}
      <div className="pr-context-tip-card">
        <Sparkles size={14} className="pr-tip-icon" />
        <div className="pr-tip-text">
          <strong>Mẹo:</strong> Hãy lắng nghe và đặt câu hỏi mở trước khi tư vấn giá lăn bánh & pin.
        </div>
      </div>
    </div>
  );
}
function mergeVoiceTranscript(previous, incoming = [], includePartial = false) {
  const merged = new Map(previous.map((message) => [message.message_id, message]));
  for (const message of incoming) {
    if (includePartial || !message.partial) merged.set(message.message_id, message);
  }
  return [...merged.values()];
}

const TranscriptRow = memo(function TranscriptRow({ role, content, timestamp, origin, interrupted, partial }) {
  return (
    <li className={`pr-transcript-item ${role === 'advisor' ? 'pr-transcript-advisor' : ''}`}>
      <div className="pr-transcript-meta">
        <span className="pr-transcript-role-tag">{role === 'advisor' ? 'TV · Tư vấn viên' : 'KH · Khách hàng'}</span>
        {timestamp && Number.isFinite(origin) && (
          <time className="pr-transcript-time" dateTime={timestamp}>{clock(Math.max(0, Math.floor((Date.parse(timestamp) - origin) / 1000)))}</time>
        )}
        {interrupted && <span className="pr-transcript-time">Bị ngắt</span>}
        {partial && <span className="pr-transcript-time">Đang chép</span>}
      </div>
      <div className="pr-transcript-bubble"><p>{interrupted ? 'Lời khách bị ngắt.' : content}</p></div>
    </li>
  );
});

function Transcript({ messages, waiting, listRef }) {
  const origin = Date.parse(messages.find((message) => message.timestamp)?.timestamp);
  const follow = useRef(true);
  const tail = messages.at(-1)?.content;
  useEffect(() => {
    if (follow.current && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [listRef, tail, messages.length, waiting]);

  return (
    <ol className="pr-transcript" role="log" aria-label="Hội thoại" ref={listRef} onScroll={(event) => {
      const log = event.currentTarget;
      follow.current = log.scrollHeight - log.scrollTop - log.clientHeight < 64;
    }}>
      {!messages.length && (
        <li className="pr-transcript-empty">
          <Sparkles size={16} />
          <p>Bạn là tư vấn viên. Sau khi kết nối, hãy mở lời chào khách.</p>
        </li>
      )}
      {messages.map((message, i) => (
        <TranscriptRow key={message.message_id || i} {...message} origin={origin} />
      ))}
      {waiting && (
        <li className="pr-transcript-waiting" role="status">
          <span className="pr-typing"><i /><i /><i /></span>
          <span>Khách đang suy nghĩ…</span>
        </li>
      )}
    </ol>
  );
}

export function PracticeRoom({
  scenario,
  session,
  onFinish,
  onSavedAttempt,
  onExit,
  initialMode = 'text',
}) {
  const [messages, setMessages] = useState(session?.messages || []);

  const [inputMessage, setInputMessage] = useState('');
  const [voicePanelTab, setVoicePanelTab] = useState('context');
  const [loading, setLoading] = useState(false);
  const [turnCount, setTurnCount] = useState(session?.turn_count || 0);
  const [stage, setStage] = useState(session?.conversation_stage || 'opening');
  const [terminationStatus, setTerminationStatus] = useState(session?.termination_status || 'active');
  const [pendingReply, setPendingReply] = useState(session?.pending_customer_reply || false);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [notice, setNotice] = useState(null);
  const endedNoticeRef = useRef(null);
  const inputRef = useRef(null);
  const [voiceHint, setVoiceHint] = useState('');
  const resendTextRef = useRef('');
  const showError = async (error) => {
    console.debug('Practice request failed', { status: error.status, code: error.code, name: error.name });
    let reason = terminationStatus;
    if (error.code === 'session_finished') {
      endedNoticeRef.current = 'rejected';
      try {
        const saved = await practiceApi.getSession(session.session_id);
        reason = saved.termination_status;
        setMessages(saved.messages);
        setPendingReply(saved.pending_customer_reply);
      } catch (refreshError) {
        console.debug('Practice session refresh failed', { code: refreshError.code });
        reason = 'completed';
      }
      setTerminationStatus(reason);
    }
    const nextNotice = apiErrorNotice(error, reason);
    if (nextNotice) setNotice(nextNotice);
    else if (['voice_invalid_audio', 'voice_empty_transcript', 'voice_too_long'].includes(error.code)) {
      setVoiceHint('Không nghe rõ, hãy giữ nút lâu hơn và nói lại.');
    }
  };
  useEffect(() => {
    if (terminationStatus === 'active' || endedNoticeRef.current) return;
    endedNoticeRef.current = terminationStatus;
    if (!session?.result) queueMicrotask(() => setNotice((current) => current || terminationNotice(terminationStatus)));
  }, [terminationStatus, session?.result]);
  const [mode, setMode] = useState(initialMode === 'voice' ? 'voice' : 'text');
  const voiceGender = scenario?.voice_gender;
  const [speakingId, setSpeakingId] = useState(null);

  const chatListRef = useRef(null);
  const transcriptRef = useRef(null);
  const audioRef = useRef(null);
  const audioUrlsRef = useRef(new Map());
  const sendingRef = useRef(false);
  const realtimeAudioRef = useRef(null);
  const realtime = useRealtimeRoleplay(session.session_id, realtimeAudioRef, async (snapshot) => {
    setMessages((previous) => mergeVoiceTranscript(previous, snapshot.messages));
    if (Number.isInteger(snapshot.turns)) setTurnCount(snapshot.turns);
    if (!Number.isInteger(snapshot.turns) || snapshot.turns >= (session.max_turns || 10)) {
      try {
        const saved = await practiceApi.getSession(session.session_id);
        setMessages((previous) => mergeVoiceTranscript(previous, saved.messages));
        setTurnCount(saved.turn_count);
        setTerminationStatus(saved.termination_status);
        setStage(saved.conversation_stage);
      } catch { /* Keep the saved turn count visible. */ }
    }
  });

  const playCustomer = async (message) => {
    if (!message || message.role !== 'customer') return;
    const gender = voiceGender || 'female';
    const cacheKey = `${message.message_id}:${gender}`;
    setSpeakingId(message.message_id);
    try {
      let url = audioUrlsRef.current.get(cacheKey);
      if (!url) {
        try {
          const blob = await practiceApi.customerSpeech(session.session_id, message.message_id, gender);
          url = URL.createObjectURL(blob);
          audioUrlsRef.current.set(cacheKey, url);
        } catch (apiErr) {
          // Khi backend chưa cấu hình Google TTS, phát giọng tiếng Việt tự động bằng Web SpeechSynthesis
          if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(message.content);
            utterance.lang = 'vi-VN';
            utterance.rate = 1.05;
            const voices = window.speechSynthesis.getVoices();
            const viVoice = voices.find((v) => v.lang.startsWith('vi'));
            if (viVoice) utterance.voice = viVoice;
            utterance.onend = () => setSpeakingId(null);
            utterance.onerror = () => setSpeakingId(null);
            window.speechSynthesis.speak(utterance);
            return;
          }
          throw apiErr;
        }
      }
      audioRef.current?.pause();
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setSpeakingId(null);
      try {
        await audio.play();
      } catch (playbackError) {
        console.debug('Practice audio playback interrupted', { name: playbackError.name });
        setVoiceHint('Nhấn nút loa để nghe lại.');
        setSpeakingId(null);
      }
    } catch (requestError) {
      showError(requestError);
      setSpeakingId(null);
    }
  };

  const camera = useLocalCamera();
  const [mirrorEnabled, setMirrorEnabled] = useState(false);
  const [mirrorLayout, setMirrorLayout] = useState(() => readPreference('practice.mirror.layout', 'split'));
  const [captionsOn, setCaptionsOn] = useState(() => readPreference('practice.mirror.captions', 'true') !== 'false');
  const toggleCaptions = () => setCaptionsOn((value) => { savePreference('practice.mirror.captions', String(!value)); return !value; });
  const [phone, setPhone] = useState(() => window.matchMedia('(max-width: 768px)').matches);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);
  const [slow, setSlow] = useState(false);
  const videoRef = useRef(null);
  const drawerRef = useRef(null);
  const drawerTriggerRef = useRef(null);
  const voiceStartedRef = useRef(null);
  const waiting = loading || pendingReply;
  const recording = realtime.status === 'advisor_speaking';
  const mirrorOn = mode === 'voice' && camera.status === 'on';
  const focusMirror = mirrorOn && (phone || mirrorLayout === 'focus');
  const thinking = realtime.status === 'thinking';
  const callStates = {
    idle: 'Chưa bắt đầu cuộc gọi', connecting: 'Đang kết nối…', reconnecting: 'Đang kết nối lại…',
    listening: 'Sẵn sàng nghe bạn', advisor_speaking: 'Đang nghe bạn', thinking: 'Khách đang suy nghĩ…',
    customer_speaking: 'Khách đang nói', interrupted: 'Đã ngắt lời khách', stopping: 'Đang lưu bản chép lời…',
    ended: 'Cuộc gọi đã kết thúc', disconnected: 'Mất kết nối', error: 'Chưa kết nối được cuộc gọi',
    unavailable: 'Gọi thoại chưa được cấu hình',
  };
  const statusText = callStates[realtime.status];
  const callPending = ['connecting', 'reconnecting', 'stopping'].includes(realtime.status);
  const transcriptMessages = mode === 'voice' ? mergeVoiceTranscript(messages, realtime.messages, true) : messages;
  const latestCustomer = transcriptMessages.findLast((message) => message.role === 'customer' && !message.interrupted);
  const latestAdvisor = transcriptMessages.findLast((message) => message.role === 'advisor');
  const maxTurns = session?.max_turns || 10;
  const { start: startCamera, stop: stopCamera } = camera;
  useEffect(() => {
    const query = window.matchMedia('(max-width: 768px)');
    const update = () => setPhone(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (mode === 'voice' && mirrorEnabled && terminationStatus === 'active') startCamera();
    else stopCamera();
    return stopCamera;
  }, [mode, mirrorEnabled, startCamera, stopCamera, terminationStatus]);
  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = camera.stream;
  }, [camera.stream, focusMirror]);
  useEffect(() => {
    if (!realtime.open) return;
    voiceStartedRef.current = Date.now();
    const timer = setInterval(() => setCallSeconds(Math.floor((Date.now() - voiceStartedRef.current) / 1000)), 500);
    return () => clearInterval(timer);
  }, [realtime.open]);
  useEffect(() => {
    const reset = setTimeout(() => setSlow(false), 0);
    const timer = waiting ? setTimeout(() => setSlow(true), 15000) : null;
    return () => { clearTimeout(reset); clearTimeout(timer); };
  }, [waiting]);
  useEffect(() => {
    if (!drawerOpen) return;
    const previous = drawerTriggerRef.current;
    drawerRef.current?.querySelector('button')?.focus();
    return () => previous?.focus();
  }, [drawerOpen]);
  useEffect(() => {
    const input = inputRef.current;
    if (input) { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 120)}px`; }
  }, [inputMessage, mode]);
  const toggleMirror = () => {
    const next = !mirrorEnabled || ['denied', 'error', 'unsupported'].includes(camera.status);
    setMirrorEnabled(next);
    if (next && mirrorEnabled) startCamera();
    if (!next) stopCamera();
  };
  const chooseLayout = (layout) => {
    setMirrorLayout(layout);
    savePreference('practice.mirror.layout', layout);
  };
  const parallax = (event) => {
    if (!window.matchMedia('(pointer: fine)').matches || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty('--mx', String(Math.max(-1, Math.min(1, (event.clientX - bounds.left) / bounds.width * 2 - 1))));
    event.currentTarget.style.setProperty('--my', String(Math.max(-1, Math.min(1, (event.clientY - bounds.top) / bounds.height * 2 - 1))));
  };
  const roomKeyDown = (event) => {
    if (event.key === 'Escape') setDrawerOpen(false);
  };
  const stageLabels = {
    opening: 'Giai đoạn: Chào hỏi & Mở đầu',
    discovery: 'Giai đoạn: Khai thác nhu cầu',
    presentation: 'Giai đoạn: Giới thiệu giải pháp',
    objection_handling: 'Giai đoạn: Xử lý băn khoăn',
    closing: 'Giai đoạn: Chốt & Hướng dẫn',
    completed: 'Giai đoạn: Hoàn thành',
  };

  useEffect(() => {
    const list = chatListRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, loading, mode, pendingReply, drawerOpen]);

  useEffect(() => () => {
    audioRef.current?.pause();
    audioUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  async function toggleVoiceMode() {
    if (callPending || finishing) return;
    if (mode === 'voice') {
      try { await realtime.stop(); } catch { return; }
      setMode('text');
    } else {
      audioRef.current?.pause();
      window.speechSynthesis?.cancel();
      setSpeakingId(null);
      setCallSeconds(0);
      setMode('voice');
    }
  }

  async function handleSendMessage(message = inputMessage) {
    const text = typeof message === 'string' ? message.trim() : inputMessage.trim();
    if (!text || sendingRef.current || loading || finishing || pendingReply || terminationStatus !== 'active') return;
    sendingRef.current = true;

    const advisorMsg = {
      message_id: createId('adv'),
      role: 'advisor',
      content: text,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, advisorMsg]);
    setLoading(true);
    setNotice(null);

    try {
      const request = practiceApi.sendMessage(session.session_id, text);
      setInputMessage('');
      const updated = await request;
      setMessages(updated.messages);
      setStage(updated.conversation_stage);
      setTurnCount(updated.turn_count);
      setTerminationStatus(updated.termination_status);
      setPendingReply(updated.pending_customer_reply);
    } catch (requestError) {
      if (requestError.code === 'message_not_sent') {
        resendTextRef.current = text;
        setInputMessage(text);
        setMessages((previous) => previous.filter((item) => item.message_id !== advisorMsg.message_id));
      }
      await showError(requestError);
      try {
        const saved = await practiceApi.getSession(session.session_id);
        setMessages(saved.messages);
        setStage(saved.conversation_stage);
        setTurnCount(saved.turn_count);
        setTerminationStatus(saved.termination_status);
        setPendingReply(saved.pending_customer_reply);
        // Preserve any next-turn draft typed while waiting.
      } catch {
        // Keep the advisor's visible draft; do not fabricate a customer reply.
      }
    } finally {
      sendingRef.current = false;
      setLoading(false);
    }
  }

  async function handleRetryReply() {
    if (loading || finishing) return;
    setLoading(true);
    setNotice(null);
    try {
      const updated = await practiceApi.retryCustomerReply(session.session_id);
      setMessages(updated.messages);
      setStage(updated.conversation_stage);
      setTurnCount(updated.turn_count);
      setTerminationStatus(updated.termination_status);
      setPendingReply(updated.pending_customer_reply);
    } catch (requestError) {
      showError(requestError);
      try {
        const saved = await practiceApi.getSession(session.session_id);
        setMessages(saved.messages);
        setStage(saved.conversation_stage);
        setTurnCount(saved.turn_count);
        setTerminationStatus(saved.termination_status);
        setPendingReply(saved.pending_customer_reply);
      } catch {
        // Keep the saved pending turn visible until the session can be loaded.
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFinishSession = async () => {
    if (loading || finishing || pendingReply) return;
    setFinishing(true);
    setShowFinishConfirm(true);
    setNotice(null);
    try {
      await realtime.stop();
      const resultView = await practiceApi.finishSession(session.session_id, {
        realtime: Boolean(realtime.model || messages.some((message) => message.turn_id)),
      });
      onFinish(resultView);
    } catch (requestError) {
      if (requestError.code === 'realtime_transcript_incomplete') {
        setVoiceHint(requestError.message);
        return;
      }
      try {
        const saved = await practiceApi.getSession(session.session_id);
        setTerminationStatus(saved.termination_status);
        setPendingReply(saved.pending_customer_reply);
        setMessages(saved.messages);
        if (saved.termination_status !== 'active') {
          const detail = await practiceApi.getAttempt(session.session_id);
          if (detail.ai_evaluation?.result) {
            await onSavedAttempt(session.session_id);
            return;
          }
        }
      } catch (refreshError) {
        console.debug('Practice finish reconciliation failed', { code: refreshError.code });
      }
      await showError(requestError.code || requestError.status === 401
        ? requestError : { code: 'evaluation_failed' });
    } finally {
      setFinishing(false);
      setShowFinishConfirm(false);
    }
  };

  const handleNoticeAction = async (id) => {
    setNotice(null);
    if (id === 'finish_and_score' || id === 'retry_finish') await handleFinishSession();
    else if (id === 'view_result') await onSavedAttempt(session.session_id);
    else if (id === 'new_session') onExit();
    else if (id === 'resend') await handleSendMessage(resendTextRef.current);
    else if (id === 'retry_reply') await handleRetryReply();
    else if (id === 'login') {
      try { await authApi.logout(); } finally { window.location.reload(); }
    } else if (id === 'type_instead') {
      setMode('text');
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  const context = <CustomerContext session={session} scenario={scenario} />;
  const modeControl = <div className="pr-segment pr-mode" role="group" aria-label="Cách luyện">
    {['text', 'voice'].map((value) => <button key={value} aria-pressed={mode === value} onClick={() => { if (mode !== value) void toggleVoiceMode(); }} disabled={callPending || finishing || terminationStatus !== 'active'}>{value === 'text' ? <><MessageCircle aria-hidden="true" />Nhắn tin</> : <><Phone aria-hidden="true" />Gọi thoại</>}</button>)}
  </div>;
  const layoutControl = <div className="pr-segment pr-layout" role="group" aria-label="Bố cục Mirror">
    <button aria-pressed={mirrorLayout === 'split'} onClick={() => chooseLayout('split')}>Chia đôi</button>
    <button aria-pressed={mirrorLayout === 'focus'} onClick={() => chooseLayout('focus')}>Toàn màn hình</button>
  </div>;
  const callControls = (
    <div className="pr-realtime-controls">
      {!realtime.open || realtime.status === 'disconnected' ? (
        <button type="button" className="pr-realtime-primary" disabled={waiting || finishing || terminationStatus !== 'active'} onClick={() => { setVoiceHint(''); setCallSeconds(0); void realtime.start(); }}>
          <Phone size={18} aria-hidden="true" /> {realtime.status === 'unavailable' ? 'Kiểm tra lại cấu hình' : ['disconnected', 'error'].includes(realtime.status) ? 'Kết nối lại' : 'Bắt đầu cuộc gọi'}
        </button>
      ) : (
        <>
          <button type="button" disabled={callPending || finishing} aria-pressed={realtime.muted} onClick={realtime.toggleMicrophone}>
            <MicIcon aria-hidden="true" /> {realtime.muted ? 'Bật mic' : 'Tắt mic'}
          </button>
          <button type="button" aria-pressed={!realtime.audioEnabled} onClick={realtime.toggleAudio}>
            <SpeakerIcon aria-hidden="true" /> {realtime.audioEnabled ? 'Tắt âm thanh' : 'Bật âm thanh'}
          </button>
          <button type="button" disabled={finishing || !['customer_speaking', 'thinking'].includes(realtime.status)} onClick={realtime.interrupt}>Ngắt lời khách</button>
          <button type="button" className="pr-realtime-end" disabled={realtime.status === 'stopping' || finishing} onClick={() => { void realtime.stop().catch((error) => setVoiceHint(error.message)); }}>Kết thúc cuộc gọi</button>
        </>
      )}
      {realtime.devices.length > 1 && (
        <label>Mic <select value={realtime.deviceId} disabled={callPending || finishing} onChange={(event) => realtime.chooseDevice(event.target.value)}>
          <option value="">Mặc định</option>
          {realtime.devices.filter((device) => device.deviceId).map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Mic ${index + 1}`}</option>)}
        </select></label>
      )}
      {realtime.speakers.length > 1 && (
        <label>Loa <select value={realtime.speakerId} disabled={callPending || finishing} onChange={(event) => realtime.chooseSpeaker(event.target.value)}>
          <option value="">Mặc định</option>
          {realtime.speakers.filter((device) => device.deviceId && device.deviceId !== 'default').map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Loa ${index + 1}`}</option>)}
        </select></label>
      )}
    </div>
  );
  const transcript = <Transcript messages={transcriptMessages} waiting={mode === 'voice' ? thinking : waiting} listRef={transcriptRef} />;
  const composer = <div className="pr-composer">
    <div className="pr-compose-row"><textarea ref={inputRef} value={inputMessage} onChange={(event) => setInputMessage(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); handleSendMessage(); } }} placeholder="Nhắn cho khách…" aria-label="Nhắn tin cho khách hàng" rows={1} disabled={finishing || terminationStatus !== 'active'} />
      <button className="pr-send" onClick={() => handleSendMessage()} disabled={!inputMessage.trim() || waiting || finishing || terminationStatus !== 'active'} aria-label="Gửi tin nhắn"><SendIcon /></button></div>
    <p className="pr-hint">{waiting ? 'Bạn vẫn gõ trước được. Nút gửi mở lại khi khách trả lời xong.' : 'Enter để gửi, Shift + Enter để xuống dòng.'}</p>
  </div>;
  const vehicleModel = /VF[\s_-]*(Wild|[356789])(?![a-z0-9])/i.exec(`${scenario?.model_badge || ''} ${scenario?.model || ''} ${scenario?.scenario_id || ''} ${scenario?.title || ''}`)?.[1].toLowerCase();
  const isApartmentScenario = scenario?.scenario_id === 'SCENARIO_03_VF6_APARTMENT';
  const vehicle = isApartmentScenario ? '/vehicles/official/vf-6-green.webp' : vehicleModel ? `/vehicles/official/vf-${vehicleModel}.webp` : getVehicleImage(scenario?.model_badge || scenario?.model || scenario?.title);
  const vehicleAlt = isApartmentScenario ? 'VinFast VF 6 màu xanh' : vehicleModel ? `VinFast VF ${vehicleModel === 'wild' ? 'Wild' : vehicleModel}` : 'Xe luyện tập';
  return (
    <section className={`pr-room ${mode === 'voice' ? 'pr-voice' : 'pr-text'} ${mirrorOn ? 'pr-mirror' : ''} ${focusMirror ? 'pr-focus' : ''}`} aria-label="Phiên luyện tập" onKeyDown={roomKeyDown}>
      <audio ref={realtimeAudioRef} autoPlay playsInline hidden />
      <NoticeDialog notice={notice} onAction={handleNoticeAction} onClose={() => setNotice(null)} />
      <header className="pr-bar">
        <button className="pr-back" onClick={onExit} aria-label="Rời phòng"><ChevronLeft /><span>Rời phòng</span></button>
        {vehicle && <img className="pr-vehicle" src={vehicle} alt={vehicleAlt} width={200} height={106} />}
        <div className="pr-identity"><h2>{scenario?.title}</h2><div className="pr-meta"><span className="pr-model">{scenario?.model_badge || scenario?.model}</span><span className="pr-stage-label">{stageLabels[stage] || stage}</span><span>Lượt {Math.max(turnCount, realtime.turns || 0)} / {maxTurns}</span><progress aria-label="Tiến độ lượt trao đổi" value={Math.max(turnCount, realtime.turns || 0)} max={maxTurns} />{focusMirror && <span>Cuộc gọi {clock(callSeconds)}</span>}</div></div>
        {modeControl}
        {focusMirror && <><span className="pr-private"><ShieldCheck size={16} />Chỉ trên máy này</span>{layoutControl}<button className="pr-mirror-off" onClick={toggleMirror} aria-label="Tắt Mirror"><VideoOff size={18} /></button></>}
        <button className="pr-finish" onClick={() => setShowFinishConfirm(true)} disabled={waiting || finishing || callPending}><span className="pr-finish-full">Kết thúc & chấm điểm</span><span className="pr-finish-short">Kết thúc</span></button>
        <details className="pr-phone-context"><summary>Bối cảnh khách ▾</summary>{context}</details>
      </header>
      {terminationStatus !== 'active' && <p className={`pr-termination ${terminationStatus === 'advisor_misconduct' ? 'pr-misconduct' : ''}`} role="status">{terminationStatus === 'advisor_misconduct' ? 'Phiên luyện tập đã dừng do ngôn từ không phù hợp.' : 'Cuộc trò chuyện đã kết thúc. Hãy xem đánh giá.'}</p>}
      <div className="pr-body">
        {mode === 'text' ? <>
          <aside className="pr-context" aria-label="Bối cảnh khách">
            <div className="pr-context-top-title">
              <div className="pr-context-title-group">
                <Compass size={16} strokeWidth={2.2} />
                <h2>Bối cảnh tình huống</h2>
              </div>
              <span className="pr-context-role-badge">Tư vấn 1:1</span>
            </div>
            {context}
          </aside>
          <div className="pr-chat"><ol className="pr-messages" role="log" aria-label="Hội thoại" ref={chatListRef}>
            {!messages.length && (
              <li className="pr-empty-coach" role="status">
                <div className="pr-coach-badge">
                  <Sparkles size={16} />
                  <span>Sẵn sàng phiên luyện tập</span>
                </div>
                <h3 className="pr-coach-title">Bạn là tư vấn viên — Hãy mở lời chào khách trước</h3>
                <p className="pr-coach-desc">Chủ động tìm hiểu nhu cầu, tư vấn phiên bản và chính sách pin phù hợp với bối cảnh của khách hàng.</p>
                <div className="pr-coach-suggestions">
                  <span className="pr-coach-label">Gợi ý mở đầu nhanh:</span>
                  <button
                    type="button"
                    className="pr-suggestion-chip"
                    onClick={() => {
                      const text = "Dạ em chào anh/chị, em là tư vấn viên VinFast. Em có thể hỗ trợ anh/chị tìm hiểu thông tin gì về xe hôm nay ạ?";
                      setInputMessage(text);
                      inputRef.current?.focus();
                    }}
                  >
                    “Dạ em chào anh/chị, em là tư vấn viên VinFast. Em có thể hỗ trợ thông tin gì về xe hôm nay ạ?”
                  </button>
                  <button
                    type="button"
                    className="pr-suggestion-chip"
                    onClick={() => {
                      const text = "Chào anh/chị! Em thấy mình đang tìm hiểu xe điện VinFast, anh/chị đang cân nhắc xe cho nhu cầu gia đình hay công việc ạ?";
                      setInputMessage(text);
                      inputRef.current?.focus();
                    }}
                  >
                    “Chào anh/chị! Không biết mình đang cân nhắc xe cho gia đình hay công việc ạ?”
                  </button>
                </div>
              </li>
            )}
            {messages.map((message, i) => <li key={message.message_id || i} className={`pr-message ${message.role === 'advisor' ? 'pr-advisor' : ''}`}>
              <span className="pr-message-avatar" aria-hidden="true">{message.role === 'advisor' ? 'TV' : 'KH'}</span><div className="pr-message-main"><div className="pr-message-meta"><strong>{message.role === 'advisor' ? 'Bạn' : 'Khách'}</strong>{message.timestamp && <><span>·</span><time dateTime={message.timestamp}>{new Date(message.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</time></>}</div><div className="pr-bubble"><p>{message.content}</p>{message.role === 'customer' && <button className="pr-replay" onClick={() => playCustomer(message)} disabled={speakingId === message.message_id} aria-label="Phát giọng khách"><SpeakerIcon /></button>}</div>{message.role === 'advisor' && i === messages.length - 1 && <span className="pr-receipt">{waiting ? 'Đã xem' : 'Đã gửi'}</span>}</div>
            </li>)}
            {waiting && <li className="pr-message"><span className="pr-message-avatar" aria-hidden="true">KH</span><div><div className="pr-message-meta"><strong>Khách</strong> · đang soạn tin</div><span className="pr-typing" role="status" aria-label="Khách đang soạn tin"><i /><i /><i /></span></div></li>}
          </ol>{composer}</div>
        </> : <>
          <div className="pr-stage" onPointerMove={parallax} onPointerLeave={(event) => { event.currentTarget.style.setProperty('--mx', '0'); event.currentTarget.style.setProperty('--my', '0'); }}>
            {mirrorOn ? <>
              <video className="pr-video" ref={videoRef} autoPlay muted playsInline />
              {!focusMirror && <div className="pr-video-top"><span className="pr-private"><ShieldCheck size={18} />Mirror chỉ hiện trên máy này, không ghi hình</span>{layoutControl}<button onClick={toggleMirror}><VideoOff size={18} />Tắt Mirror</button></div>}
              <div className="pr-video-bottom">
                <div className="pr-customer-card"><CustomerAvatar thinking={thinking} /><div><strong>{scenario?.customer_name || 'Khách'}</strong><span role="status">{statusText}</span></div></div>
                {focusMirror && captionsOn && <div className="pr-focus-caption" aria-live="polite"><p>{latestCustomer?.content || 'Phụ đề lời khách sẽ hiện ở đây khi khách nói.'}</p><small>Bạn: {latestAdvisor?.content || (recording ? 'Đang nhận diện lời nói…' : 'Bạn có thể nói khi đã kết nối.')}</small></div>}
                <div className="pr-call-controls"><span className="pr-focus-tools"><button className="pr-caption-toggle" onClick={toggleCaptions} aria-pressed={captionsOn}>{captionsOn ? <CaptionsOff aria-hidden="true" /> : <Captions aria-hidden="true" />}{captionsOn ? 'Ẩn phụ đề' : 'Hiện phụ đề'}</button><button className="pr-drawer-trigger" ref={drawerTriggerRef} onClick={() => setDrawerOpen(true)} aria-expanded={drawerOpen}>Hội thoại ({messages.length})</button></span>{callControls}<button className="pr-phone-text" onClick={toggleVoiceMode} disabled={callPending || finishing}>Nhắn tin</button></div>
              </div>
            </> : <>
              <span className="pr-call-timer">{realtime.open ? `Cuộc gọi luyện tập · ${clock(callSeconds).padStart(5, '0')}` : 'Cuộc gọi luyện tập'}</span>
              <div className="pr-avatar-area"><DotField /><div className="pr-parallax-avatar"><CustomerAvatar thinking={thinking} large /></div></div>
              <div className="pr-customer-name"><strong>{scenario?.customer_name || 'Khách'}</strong><span role="status">{realtime.status === 'customer_speaking' && <span className="pr-wave" aria-hidden="true">{[0, 1, 2, 3, 4].map((i) => <i key={i} style={{ animationDelay: `${i * .12}s` }} />)}</span>}{statusText}</span></div>
              <div className="pr-caption"><p>{latestCustomer?.content || 'Phụ đề lời khách sẽ hiện ở đây khi khách nói.'}</p>{latestAdvisor && <small>Bạn · {latestAdvisor.partial ? 'Đang chép · ' : ''}{latestAdvisor.content}</small>}</div>
              <div className="pr-call-controls"><div className="pr-mirror-control"><button className="pr-mirror-enable" onClick={toggleMirror} disabled={camera.status === 'requesting' || terminationStatus !== 'active'}><span><strong>{camera.status === 'requesting' ? 'Đang mở camera…' : 'Bật Mirror'}</strong><small>Chỉ trên máy bạn, không ghi hình</small><em>Tập nụ cười và ánh mắt tự tin khi nói</em></span><span className="pr-camera-icon"><Video /></span></button>{['denied', 'unsupported', 'error'].includes(camera.status) && <p className="pr-camera-error" role="status">{camera.status === 'denied' ? 'Chưa có quyền dùng camera. Hãy cho phép camera trong trình duyệt.' : camera.status === 'unsupported' ? 'Trình duyệt không hỗ trợ camera.' : 'Không mở được camera. Hãy kiểm tra camera rồi thử lại.'}</p>}</div>{callControls}</div>
            </>}
          </div>
          {!focusMirror && (
            <aside className="pr-voice-sidebar" aria-label="Bảng thông tin cuộc gọi">
              {/* TAB HEADER SWITCHER */}
              <div className="pr-voice-tab-header">
                <div className="pr-voice-segmented-tabs" role="tablist" aria-label="Chuyển chế độ xem">
                  <button
                    type="button"
                    className={`pr-voice-tab-btn ${voicePanelTab === 'context' ? 'is-active' : ''}`}
                    onClick={() => setVoicePanelTab('context')}
                    aria-selected={voicePanelTab === 'context'}
                  >
                    <Compass size={14} />
                    <span>Bối cảnh & Mục tiêu</span>
                  </button>
                  <button
                    type="button"
                    className={`pr-voice-tab-btn ${voicePanelTab === 'transcript' ? 'is-active' : ''}`}
                    onClick={() => setVoicePanelTab('transcript')}
                    aria-selected={voicePanelTab === 'transcript'}
                  >
                    <MessageSquare size={14} />
                    <span>Ghi chép hội thoại</span>
                    {messages.length > 0 && <span className="pr-tab-count">{messages.length}</span>}
                  </button>
                </div>
              </div>

              {/* CONTENT AREA */}
              <div className="pr-voice-sidebar-content">
                {voicePanelTab === 'context' ? (
                  <div className="pr-voice-context-scroll">
                    {context}
                  </div>
                ) : (
                  <div className="pr-voice-transcript-wrap">
                    <div className="pr-voice-transcript-head">
                      <h3>{mirrorOn ? 'Toàn bộ hội thoại' : 'Bản ghi lời thoại'}</h3>
                      {realtime.open && <span className="pr-voice-live-badge">Trực tiếp</span>}
                    </div>
                    {transcript}
                  </div>
                )}
              </div>
            </aside>
          )}
        </>}
      </div>
      {(slow && waiting || pendingReply) && <div className="pr-slow" role="status"><span>{slow ? 'Khách đang cân nhắc lâu hơn thường lệ.' : 'Tin nhắn đã lưu. Khách hàng chưa phản hồi.'}</span>{pendingReply && <button onClick={handleRetryReply} disabled={loading || finishing}>Gửi lại yêu cầu</button>}</div>}
      {(realtime.error || voiceHint) && <p className="pr-feedback" role="status">{realtime.error || voiceHint}</p>}
      {drawerOpen && <div className="pr-drawer-backdrop" onClick={() => setDrawerOpen(false)}><aside className="pr-drawer" ref={drawerRef} role="dialog" aria-modal="true" aria-label="Toàn bộ hội thoại" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === 'Tab') { const controls = [...event.currentTarget.querySelectorAll('button:not(:disabled)')]; const first = controls[0]; const last = controls.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } } }}><header><h2>Toàn bộ hội thoại</h2><button aria-label="Đóng hội thoại" onClick={() => setDrawerOpen(false)}><X /></button></header>{transcript}</aside></div>}
      <FinishConfirmDialog isOpen={showFinishConfirm} onClose={() => setShowFinishConfirm(false)} onConfirm={handleFinishSession} finishing={finishing} />
    </section>
  );
}
