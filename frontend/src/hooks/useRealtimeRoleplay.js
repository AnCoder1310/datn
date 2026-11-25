import { useEffect, useRef, useState } from 'react';
import { practiceApi } from '../api/practiceApi';

const initial = { status: 'idle', error: '', model: '', messages: [], incomplete: false };
const ended = new Set(['ended', 'disconnected']);

export function closeRealtimeMedia(call, audio) {
  clearTimeout(call.connectionTimeout);
  call.events?.close();
  call.stream?.getTracks().forEach((track) => track.stop());
  if (call.peer) {
    call.peer.onconnectionstatechange = null;
    call.peer.ontrack = null;
    call.peer.close();
  }
  if (audio) {
    audio.pause();
    audio.srcObject = null;
  }
}

export function microphoneConstraints(deviceId) {
  return { audio: {
    echoCancellation: true, noiseSuppression: true, autoGainControl: true,
    ...(deviceId && { deviceId: { exact: deviceId } }),
  } };
}

function microphoneError(error) {
  if (error.name === 'NotAllowedError' || error.name === 'SecurityError') return 'Bạn chưa cấp quyền dùng mic. Hãy cho phép mic trong trình duyệt và thử lại.';
  if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') return 'Không tìm thấy mic đã chọn. Hãy chọn thiết bị khác.';
  if (error.name === 'NotReadableError') return 'Không mở được mic. Hãy kiểm tra thiết bị và các ứng dụng đang dùng mic.';
  return error.message || 'Không kết nối được cuộc gọi. Vui lòng thử lại.';
}

export function useRealtimeRoleplay(sessionId, audioRef, onCallClosed) {
  const [state, setState] = useState(initial);
  const [muted, setMuted] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState('');
  const [speakers, setSpeakers] = useState([]);
  const [speakerId, setSpeakerId] = useState('');
  const callRef = useRef(null);
  const mounted = useRef(false);
  const closedCallback = useRef(onCallClosed);
  useEffect(() => { closedCallback.current = onCallClosed; }, [onCallClosed]);

  useEffect(() => {
    mounted.current = true;
    const audio = audioRef.current;
    return () => {
      mounted.current = false;
      const call = callRef.current;
      if (!call) return;
      callRef.current = null;
      closeRealtimeMedia(call, audio);
      if (call.id) void practiceApi.stopRealtime(sessionId, call.id).catch(() => {});
    };
  }, [audioRef, sessionId]);

  function close(call, snapshot) {
    if (callRef.current !== call) return;
    callRef.current = null;
    closeRealtimeMedia(call, audioRef.current);
    setState((previous) => ({ ...previous, ...snapshot, open: false }));
    if (call.id) void closedCallback.current?.(snapshot);
  }

  async function stop(disconnected = false) {
    const call = callRef.current;
    if (!call) return;
    if (call.stopping) return call.stopping;
    call.stream?.getAudioTracks().forEach((track) => { track.enabled = false; });
    audioRef.current?.pause();
    setState((previous) => ({ ...previous, status: 'stopping' }));
    if (!call.id) {
      close(call, { status: 'ended' });
      return;
    }
    call.stopping = (async () => {
      let snapshot;
      try {
        snapshot = await practiceApi.stopRealtime(sessionId, call.id);
      } catch (error) {
        if (error.status !== 404) {
          closeRealtimeMedia(call, audioRef.current);
          call.stopping = null;
          setState((previous) => ({
            ...previous, status: 'disconnected',
            error: 'Mất kết nối khi lưu bản chép. Hãy thử kết nối lại hoặc bấm kết thúc cuộc gọi lần nữa.',
          }));
          throw error;
        }
      }
      const status = disconnected ? 'disconnected' : 'ended';
      close(call, { ...snapshot, status });
      if (snapshot?.incomplete) {
        throw Object.assign(new Error('Bản chép lời chưa hoàn tất. Hệ thống chưa thể chấm điểm phiên này.'), { code: 'realtime_transcript_incomplete' });
      }
    })();
    return call.stopping;
  }

  async function start() {
    if (callRef.current) {
      if (state.status !== 'disconnected') return;
      try { await stop(true); } catch { return; }
      if (callRef.current) return;
    }
    if (!globalThis.RTCPeerConnection || !globalThis.EventSource || !navigator.mediaDevices?.getUserMedia) {
      setState((previous) => ({ ...previous, status: 'error', error: 'Trình duyệt cần HTTPS và hỗ trợ WebRTC để gọi thoại.' }));
      return;
    }
    const call = { microphoneMuted: muted, outputEnabled: audioEnabled };
    callRef.current = call;
    setState({ ...initial, status: ['error', 'disconnected'].includes(state.status) ? 'reconnecting' : 'connecting', open: true });
    const isCurrent = () => mounted.current && callRef.current === call;
    try {
      const availability = await practiceApi.realtimeAvailability(sessionId);
      if (!isCurrent()) return;
      if (!availability.available) {
        close(call, { status: 'unavailable', error: availability.message });
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia(microphoneConstraints(deviceId));
      if (!isCurrent()) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      call.stream = stream;
      const track = stream.getAudioTracks()[0];
      if (!track) throw new DOMException('', 'NotFoundError');
      track.enabled = false;
      const peer = new RTCPeerConnection();
      call.peer = peer;
      call.sender = peer.addTrack(track, stream);
      track.onended = () => { if (isCurrent() && !call.stopping) void stop(true).catch(() => {}); };
      peer.ontrack = ({ streams, track: incoming }) => {
        if (!isCurrent() || !audioRef.current) return;
        const audio = audioRef.current;
        audio.srcObject = streams[0] || new MediaStream([incoming]);
        audio.muted = !call.outputEnabled;
        if (call.outputEnabled) void audio.play().catch(() => {
          if (isCurrent()) {
            call.outputEnabled = false;
            setAudioEnabled(false);
          }
        });
      };
      peer.onconnectionstatechange = () => {
        if (!isCurrent() || call.stopping) return;
        if (peer.connectionState === 'connected') {
          clearTimeout(call.connectionTimeout);
          call.stream.getAudioTracks().forEach((input) => { input.enabled = !call.microphoneMuted; });
          setState((previous) => ({
            ...previous,
            status: ['connecting', 'reconnecting'].includes(previous.status) ? 'listening' : previous.status,
          }));
        } else if (['failed', 'disconnected', 'closed'].includes(peer.connectionState)) {
          void stop(true).catch(() => {});
        }
      };
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      if (!isCurrent()) return;
      const result = await practiceApi.startRealtime(sessionId, peer.localDescription.sdp);
      if (!isCurrent()) {
        void practiceApi.stopRealtime(sessionId, result.call_id).catch(() => {});
        return;
      }
      call.id = result.call_id;
      setState((previous) => ({ ...previous, model: result.model }));
      call.events = practiceApi.realtimeEvents(sessionId, call.id);
      call.events.onmessage = ({ data }) => {
        if (!isCurrent() || call.stopping) return;
        try {
          const snapshot = JSON.parse(data);
          if (ended.has(snapshot.status)) close(call, snapshot);
          else setState((previous) => ({
            ...previous, ...snapshot, open: true,
            status: peer.connectionState === 'connected' ? snapshot.status : previous.status,
          }));
        } catch {
          void stop(true).catch(() => {});
        }
      };
      call.events.onerror = () => { if (isCurrent() && !call.stopping) void stop(true).catch(() => {}); };
      call.connectionTimeout = setTimeout(() => { if (isCurrent()) void stop(true).catch(() => {}); }, 16000);
      await peer.setRemoteDescription({ type: 'answer', sdp: result.sdp });
      const available = await navigator.mediaDevices.enumerateDevices().catch(() => []);
      if (isCurrent()) {
        setDevices(available.filter((device) => device.kind === 'audioinput'));
        if (typeof audioRef.current?.setSinkId === 'function') {
          setSpeakers(available.filter((device) => device.kind === 'audiooutput'));
        }
      }
    } catch (error) {
      if (!isCurrent()) return;
      const detail = microphoneError(error);
      if (call.id) {
        try { await stop(true); } catch { /* Keep the saved transcript and the retry control. */ }
        if (mounted.current) setState((previous) => ({ ...previous, error: detail }));
      } else close(call, { status: 'error', error: detail });
    }
  }

  function toggleMicrophone() {
    const next = !muted;
    setMuted(next);
    const call = callRef.current;
    if (!call) return;
    call.microphoneMuted = next;
    if (call.peer?.connectionState === 'connected' && !call.stopping) {
      call.stream.getAudioTracks().forEach((track) => { track.enabled = !next; });
    }
  }

  async function toggleAudio() {
    const next = !audioEnabled;
    const audio = audioRef.current;
    if (audio) {
      audio.muted = !next;
      if (next && audio.srcObject) {
        try { await audio.play(); } catch {
          setState((previous) => ({ ...previous, error: 'Trình duyệt đang chặn phát âm thanh. Hãy kiểm tra quyền phát âm thanh.' }));
          return;
        }
      }
    }
    if (callRef.current) callRef.current.outputEnabled = next;
    setAudioEnabled(next);
  }

  async function chooseDevice(next) {
    const call = callRef.current;
    if (!call?.sender) {
      setDeviceId(next);
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(microphoneConstraints(next));
      if (callRef.current !== call || call.stopping) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const track = stream.getAudioTracks()[0];
      track.enabled = !call.microphoneMuted;
      await call.sender.replaceTrack(track);
      call.stream.getTracks().forEach((input) => input.stop());
      call.stream = stream;
      track.onended = () => { if (callRef.current === call && !call.stopping) void stop(true).catch(() => {}); };
      setDeviceId(next);
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      setState((previous) => ({ ...previous, error: microphoneError(error) }));
    }
  }

  async function interrupt() {
    const call = callRef.current;
    if (!call?.id || call.stopping) return;
    try { await practiceApi.interruptRealtime(sessionId, call.id); } catch (error) {
      setState((previous) => ({ ...previous, error: error.message }));
    }
  }

  async function chooseSpeaker(next) {
    try {
      await audioRef.current.setSinkId(next);
      setSpeakerId(next);
    } catch {
      setState((previous) => ({ ...previous, error: 'Không chuyển được thiết bị phát âm thanh. Hãy thử chọn loa khác.' }));
    }
  }

  return { ...state, muted, audioEnabled, devices, deviceId, speakers, speakerId,
    start, stop, toggleMicrophone, toggleAudio, chooseDevice, chooseSpeaker, interrupt };
}
