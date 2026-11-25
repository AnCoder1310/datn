import test from 'node:test';
import process from 'node:process';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from '@babel/parser';
import { apiErrorNotice } from '../../utils/practiceNotices.js';

const source = process.env.REGRESSION_BASELINE
  ? readFileSync(process.env.REGRESSION_BASELINE, 'utf8')
  : readFileSync(new URL('./PracticeRoom.jsx', import.meta.url), 'utf8');
function handler(name, scope, text = source) {
  const ast = parse(text, { sourceType: 'module', plugins: ['jsx'] });
  let found;
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'FunctionDeclaration' && node.id.name === name) found = node;
    if (node.type === 'VariableDeclarator' && node.id.name === name) found = node.init.type === 'CallExpression' ? node.init.arguments[0] : node.init;
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') walk(value);
    }
  }
  walk(ast);
  return new Function(...Object.keys(scope), `return (${text.slice(found.start, found.end)})`)(...Object.values(scope));
}
function room() {
  const state = { draft: 'Xin chào', messages: [], termination: 'active', notice: null, opened: false };
  const scope = {
    inputMessage: state.draft, sendingRef: { current: false }, loading: false, finishing: false,
    pendingReply: false, transcribing: false, recorder: { recordingState: 'idle' }, terminationStatus: 'active',
    session: { session_id: 's' }, messages: [], createId: () => 'adv',
    resendTextRef: { current: '' }, modeRef: { current: 'text' },
    setMessages: (value) => { state.messages = typeof value === 'function' ? value(state.messages) : value; },
    setInputMessage: (value) => { state.draft = value; },
    setTerminationStatus: (value) => { state.termination = value; },
    setNotice: (value) => { state.notice = value; },
    setStage() {}, setTurnCount() {}, setPendingReply() {}, setLoading() {}, setFinishing() {}, setShowFinishConfirm() {},
    onFinish() {}, onSavedAttempt: async () => { state.opened = true; },
    showError: async (error) => { state.notice = apiErrorNotice(error); },
    realtime: { stop: async () => {} }, setVoiceHint() {},
    practiceApi: {},
  };
  return { state, scope };
}
test('send retains draft until success and restores unsaved text for resend', async () => {
  const { state, scope } = room();
  scope.practiceApi.sendMessage = async () => {
    assert.equal(state.draft, 'Xin chào');
    throw { code: 'message_not_sent' };
  };
  scope.practiceApi.getSession = async () => { throw new Error('offline'); };
  await handler('handleSendMessage', scope)();
  assert.equal(state.draft, 'Xin chào');
  assert.equal(scope.resendTextRef.current, 'Xin chào');
  assert.deepEqual(state.messages, []);
});
for (const code of ['evaluation_failed', undefined]) {
  test(`finish ${code || 'lost response'} disables ended room and reopens saved result`, async () => {
    const { state, scope } = room();
    scope.practiceApi.finishSession = async () => { throw { code }; };
    scope.practiceApi.getSession = async () => ({ termination_status: 'advisor_ended', messages: [] });
    scope.practiceApi.getAttempt = async () => ({ ai_evaluation: { result: { score: 3 } } });
    await handler('handleFinishSession', scope)();
    assert.equal(state.termination, 'advisor_ended');
    assert.equal(state.opened, true);
  });
}
test('finish with missing evaluation disables ended room and keeps retry', async () => {
  const { state, scope } = room();
  scope.practiceApi.finishSession = async () => { throw { code: 'evaluation_failed' }; };
  scope.practiceApi.getSession = async () => ({ termination_status: 'advisor_ended', messages: [] });
  scope.practiceApi.getAttempt = async () => ({ ai_evaluation: { result: null } });
  await handler('handleFinishSession', scope)();
  assert.equal(state.termination, 'advisor_ended');
  assert.equal(state.notice.actions[0].id, 'retry_finish');
});
test('session_finished uses refreshed server reason', async () => {
  const { state, scope } = room();
  scope.endedNoticeRef = { current: null };
  scope.apiErrorNotice = apiErrorNotice;
  scope.setVoiceHint = () => {};
  scope.practiceApi.getSession = async () => ({ termination_status: 'dropped_out', messages: [] });
  await handler('showError', scope)({ code: 'session_finished' });
  assert.equal(state.termination, 'dropped_out');
  assert.match(state.notice.message, /rời cuộc trò chuyện/);
});
for (const name of ['NotAllowedError', 'AbortError', 'Error']) {
  test(`playback ${name} only shows inline replay hint`, async () => {
    const { state, scope } = room();
    let hint = '';
    Object.assign(scope, {
      voiceGender: 'female', audioUrlsRef: { current: new Map([['customer:female', 'blob:cached']]) },
      audioRef: { current: null }, setSpeakingId() {},
      setVoiceHint: (value) => { hint = value; },
      Audio: class { async play() { throw { name }; } },
    });
    await handler('playCustomer', scope)({ message_id: 'customer', role: 'customer' });
    assert.equal(hint, 'Nhấn nút loa để nghe lại.');
    assert.equal(state.notice, null);
    assert.equal(scope.modeRef.current, 'text');
  });
}
test('finish does not score a call with an incomplete transcript', async () => {
  const { state, scope } = room();
  let hint = '';
  scope.setVoiceHint = (value) => { hint = value; };
  scope.realtime.stop = async () => { throw { code: 'realtime_transcript_incomplete', message: 'Bản chép chưa hoàn tất.' }; };
  scope.practiceApi.finishSession = () => assert.fail('an incomplete call must never be scored');
  await handler('handleFinishSession', scope)();
  assert.equal(state.draft, 'Xin chào');
  assert.equal(state.notice, null);
  assert.equal(hint, 'Bản chép chưa hoàn tất.');
});

const viewSource = process.env.REGRESSION_VIEW_BASELINE
  ? readFileSync(process.env.REGRESSION_VIEW_BASELINE, 'utf8')
  : readFileSync(new URL('./RoleplayView.jsx', import.meta.url), 'utf8');
for (const name of ['loadHistory', 'handleStartScenario', 'openAttempt']) {
  for (const error of [{ status: 401 }, { code: 'session_busy' }]) {
    test(`${name} ${error.code || '401'} renders fallback and routes notice`, async () => {
      let message;
      let notice;
      const reject = async () => { throw error; };
      const scope = {
        apiErrorNotice, scenarios: [{ scenario_id: 's' }], starting: false,
        practiceApi: { getHistory: reject, startSession: reject, getAttempt: reject },
        setNotice: (value) => { notice = value; },
        setHistoryError: (value) => { message = value; },
        setStartError: (value) => { message = value; },
        setHistory() {}, setHistoryStatus() {}, setActiveScenario() {}, setStarting() {}, setLastMaxTurns() {}, setInitialMode() {},
        setActiveSession() {}, setViewMode() {}, setHistoryScenarioId() {}, setSelectedSessionId() {},
        setDetailStatus() {}, setAttemptDetail() {}, setRetryEvaluationError() {},
      };
      await handler(name, scope, viewSource)('s');
      assert.ok(message);
      if (error.status === 401) assert.equal(notice.actions[0].id, 'login');
    });
  }
}

test('dead evaluation state, autosend alias and duplicate style are removed', () => {
  assert.doesNotMatch(viewSource, /retryEvaluationError|setRetryEvaluationError/);
  assert.doesNotMatch(source, /const autoSend =/);
  const css = readFileSync(new URL('./PracticeRoomVoice.css', import.meta.url), 'utf8');
  assert.equal((css.match(/\.practice-room-auto-send \{/g) || []).length, 1);
});

const hookSource = readFileSync(new URL('../../hooks/usePushToTalk.js', import.meta.url), 'utf8');
for (const name of ['NotAllowedError', 'NotFoundError', 'NotReadableError']) {
  test(`getUserMedia ${name} exposes permission errors only for denied or missing microphone`, async () => {
    let permission = null;
    let hint = '';
    const scope = {
      recorderRef: { current: null }, recordingState: 'idle', pendingStopRef: { current: false },
      failedRef: { current: false }, window: { MediaRecorder: class {} },
      navigator: { mediaDevices: { getUserMedia: async () => { throw { name }; } } },
      setRecordingError: (value) => { hint = value; }, setRecordingState() {},
      setPermissionError: (value) => { permission = value; }, release() {},
    };
    await handler('start', scope, hookSource)();
    assert.ok(hint);
    assert.equal(permission?.name || null, name === 'NotReadableError' ? null : name);
  });
}

test('retry evaluation keeps progress dialog visible until request settles', async () => {
  const { state, scope } = room();
  let dialogOpen = false;
  let finishing = false;
  let rejectRequest;
  scope.setShowFinishConfirm = (value) => { dialogOpen = value; };
  scope.setFinishing = (value) => { finishing = value; };
  state.notice = apiErrorNotice({ code: 'evaluation_failed' });
  scope.practiceApi.finishSession = () => new Promise((_, reject) => { rejectRequest = reject; });
  scope.practiceApi.getSession = async () => ({ termination_status: 'advisor_ended', messages: [] });
  scope.practiceApi.getAttempt = async () => ({ ai_evaluation: null });
  scope.handleFinishSession = handler('handleFinishSession', scope);
  const pending = handler('handleNoticeAction', scope)('retry_finish');
  assert.equal(state.notice, null);
  assert.equal(dialogOpen, true);
  assert.equal(finishing, true);
  await Promise.resolve();
  rejectRequest({ code: 'evaluation_failed' });
  await pending;
  assert.equal(dialogOpen, false);
  assert.equal(finishing, false);
  assert.equal(state.notice.actions[0].id, 'retry_finish');
});

const realtimeHook = readFileSync(new URL('../../hooks/useRealtimeRoleplay.js', import.meta.url), 'utf8');

test('realtime WebRTC setup, partial captions and shutdown share one training session', async () => {
  const initial = { status: 'idle', messages: [] };
  let state = initial;
  let peer, stopped = 0;
  const track = { enabled: true, stop() { this.stopped = true; } };
  const stream = { getAudioTracks: () => [track], getTracks: () => [track] };
  const events = { close() { this.closed = true; } };
  const audio = { async play() {}, pause() { this.paused = true; } };
  const callRef = { current: null };
  const scope = {
    initial, state, callRef, mounted: { current: true }, sessionId: 'training-1',
    muted: false, audioEnabled: true, audioRef: { current: audio }, deviceId: 'headset',
    ended: new Set(['ended', 'disconnected']),
    globalThis: { RTCPeerConnection: class {}, EventSource: class {} },
    microphoneConstraints: (id) => ({ audio: { deviceId: id } }),
    navigator: { mediaDevices: {
      async getUserMedia(options) { assert.equal(options.audio.deviceId, 'headset'); return stream; },
      async enumerateDevices() { return []; },
    } },
    RTCPeerConnection: class {
      constructor() { peer = this; }
      addTrack(input) { assert.equal(input, track); }
      async createOffer() { return { sdp: 'offer' }; }
      async setLocalDescription(offer) { this.localDescription = offer; }
      async setRemoteDescription(answer) {
        assert.deepEqual(answer, { type: 'answer', sdp: 'answer' });
        this.connectionState = 'connected';
        this.onconnectionstatechange();
      }
      close() { this.closed = true; }
    },
    setState(update) { state = typeof update === 'function' ? update(state) : update; },
    setDevices() {}, setAudioEnabled() {}, setTimeout: () => 1, clearTimeout() {},
    practiceApi: {
      async realtimeAvailability(id) { assert.equal(id, 'training-1'); return { available: true }; },
      async startRealtime(id, offer) {
        assert.equal(id, 'training-1'); assert.equal(offer, 'offer'); assert.equal(track.enabled, false);
        return { call_id: 'call-1', sdp: 'answer', model: 'gpt-realtime-2.1' };
      },
      realtimeEvents: () => events,
      async stopRealtime(id, call) {
        assert.equal(id, 'training-1'); assert.equal(call, 'call-1');
        assert.equal(track.enabled, false); assert.equal(audio.paused, true);
        stopped++;
        return { messages: [{ message_id: 'm1', content: 'Anh cần xem VF 5.', partial: false }] };
      },
    },
  };
  scope.close = (call, snapshot) => {
    handler('closeRealtimeMedia', scope, realtimeHook)(call, audio);
    callRef.current = null;
    state = { ...state, ...snapshot };
  };
  scope.stop = handler('stop', scope, realtimeHook);
  await handler('start', scope, realtimeHook)();
  assert.equal(track.enabled, true);
  const incoming = {};
  peer.ontrack({ streams: [incoming] });
  assert.equal(audio.srcObject, incoming);
  events.onmessage({ data: JSON.stringify({ status: 'customer_speaking', messages: [{ message_id: 'm1', partial: true }] }) });
  assert.equal(state.messages[0].partial, true);
  assert.equal(state.status, 'customer_speaking');
  await scope.stop();
  assert.equal(state.messages[0].partial, false);
  assert.equal(stopped, 1);
  assert.equal(track.stopped && events.closed && peer.closed, true);
  assert.equal(audio.srcObject, null);
});

for (const available of [true, false]) {
  test(`${available ? 'mic permission denial' : 'missing OpenAI settings'} opens no realtime session`, async () => {
    const callRef = { current: null };
    let micRequests = 0;
    const scope = {
      initial: {}, state: { status: 'idle' }, callRef, muted: false, audioEnabled: true, mounted: { current: true },
      sessionId: 'training-1', deviceId: '', globalThis: { RTCPeerConnection: class {}, EventSource: class {} },
      navigator: { mediaDevices: {
        async getUserMedia() { micRequests++; throw new DOMException('', 'NotAllowedError'); },
      } },
      microphoneConstraints: () => ({ audio: true }),
      microphoneError: handler('microphoneError', {}, realtimeHook),
      setState() {},
      close: (call, snapshot) => {
        assert.equal(call.id, undefined);
        assert.equal(snapshot.status, available ? 'error' : 'unavailable');
        assert.match(snapshot.error, available ? /chưa cấp quyền dùng mic/ : /OPENAI_API_KEY/);
      },
      practiceApi: {
        async realtimeAvailability() { return { available, message: 'Máy chủ chưa cấu hình OPENAI_API_KEY.' }; },
        startRealtime() { assert.fail('the browser must not start a provider session'); },
      },
    };
    await handler('start', scope, realtimeHook)();
    assert.equal(micRequests, Number(available));
  });
}
