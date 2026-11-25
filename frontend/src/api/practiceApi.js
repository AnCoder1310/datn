import { ApiError, request } from './client';

async function voiceRequest(path, options = {}, responseType = 'json') {
  let response;
  try {
    response = await fetch(`/api/v1${path}`, { credentials: 'include', ...options });
  } catch (error) {
    throw new ApiError(error.message || 'Không thể kết nối dịch vụ giọng nói.', 0);
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const detail = typeof payload.detail === 'string' ? payload.detail : 'Dịch vụ giọng nói chưa sẵn sàng. Vui lòng thử lại.';
    throw new ApiError(detail, response.status, detail, payload.code || null);
  }
  return responseType === 'blob' ? response.blob() : response.json();
}

export const practiceApi = {
  realtimeAvailability(sessionId) {
    return request(`/practice/${encodeURIComponent(sessionId)}/realtime`, { method: 'GET' });
  },

  startRealtime(sessionId, sdp) {
    return request(`/practice/${encodeURIComponent(sessionId)}/realtime`, {
      method: 'POST', body: JSON.stringify({ sdp }), timeout: 55000,
    });
  },

  realtimeEvents(sessionId, callId) {
    return new EventSource(`/api/v1/practice/${encodeURIComponent(sessionId)}/realtime/${encodeURIComponent(callId)}/events`);
  },

  stopRealtime(sessionId, callId) {
    return request(`/practice/${encodeURIComponent(sessionId)}/realtime/${encodeURIComponent(callId)}/stop`, {
      method: 'POST', timeout: 22000, keepalive: true,
    });
  },

  interruptRealtime(sessionId, callId) {
    return request(`/practice/${encodeURIComponent(sessionId)}/realtime/${encodeURIComponent(callId)}/interrupt`, { method: 'POST' });
  },

  async getScenarios({ signal } = {}) {
    return request('/practice/scenarios', {
      method: 'GET',
      signal,
      timeout: 15000,
    });
  },

  async startSession(scenarioId, assignmentId = null) {
    return request('/practice/sessions', {
      method: 'POST',
      body: JSON.stringify({ scenario_id: scenarioId, ...(assignmentId ? { assignment_id: assignmentId } : {}) }),
      timeout: 20000,
    });
  },

  async getAssignments() {
    return request('/practice/assignments', { timeout: 15000 });
  },

  async sendMessage(sessionId, message) {
    return request(`/practice/${encodeURIComponent(sessionId)}/message`, {
      method: 'POST',
      body: JSON.stringify({ message: message.trim() }),
      timeout: 30000,
    });
  },

  async transcribeVoice(sessionId, audioBlob, durationSeconds) {
    const query = `duration_seconds=${encodeURIComponent(durationSeconds)}`;
    return voiceRequest(`/practice/${encodeURIComponent(sessionId)}/voice/transcribe?${query}`, {
      method: 'POST',
      headers: { 'Content-Type': audioBlob.type || 'audio/webm' },
      body: audioBlob,
    });
  },

  async customerSpeech(sessionId, messageId, gender) {
    return voiceRequest(`/practice/${encodeURIComponent(sessionId)}/voice/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message_id: messageId, gender }),
    }, 'blob');
  },

  async retryCustomerReply(sessionId) {
    return request(`/practice/${encodeURIComponent(sessionId)}/retry-reply`, {
      method: 'POST',
      timeout: 30000,
    });
  },

  async finishSession(sessionId, { realtime = false } = {}) {
    return request(`/practice/${encodeURIComponent(sessionId)}/finish`, {
      method: 'POST',
      timeout: realtime ? 180000 : 45000,
    });
  },

  async getResult(sessionId) {
    return request(`/practice/${encodeURIComponent(sessionId)}/result`, {
      method: 'GET',
      timeout: 20000,
    });
  },

  async getSession(sessionId) {
    return request(`/practice/${encodeURIComponent(sessionId)}`, {
      method: 'GET',
      timeout: 15000,
    });
  },

  async getHistory(scenarioId = null) {
    const query = scenarioId ? `?scenario_id=${encodeURIComponent(scenarioId)}` : '';
    return request(`/practice/history${query}`, { method: 'GET', timeout: 15000 });
  },

  async getProgress() {
    return request('/practice/progress', { method: 'GET', timeout: 15000 });
  },

  async getAttempt(sessionId) {
    return request(`/practice/${encodeURIComponent(sessionId)}/attempt`, { method: 'GET', timeout: 15000 });
  },
};
