const API_BASE = '/api/v1';

export class ApiError extends Error {
  constructor(message, status = 500, detail = null, code = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
    this.code = code;
  }
}

export async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const timeoutMs = options.timeout ?? 15000;
  const controller = new AbortController();
  const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;

  const callerSignal = options.signal;
  const abortRequest = () => controller.abort();
  if (callerSignal?.aborted) abortRequest();
  else callerSignal?.addEventListener('abort', abortRequest, { once: true });

  try {
    const response = await fetch(url, {
      credentials: 'include',
      ...options,
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      let detail = body || response.statusText;
      let code = null;
      try {
        const payload = JSON.parse(body);
        detail = payload?.detail || payload?.message || response.statusText;
        code = payload?.code || null;
      } catch {
        // Some proxies return plain-text errors.
      }
      const message = typeof detail === 'string' ? detail : 'Dữ liệu gửi lên chưa hợp lệ.';
      throw new ApiError(message || `Yêu cầu thất bại (${response.status}).`, response.status, detail, code);
    }

    if (response.status === 204) {
      return null;
    }

    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    if (callerSignal?.aborted) throw error;
    const isTimeout = controller.signal.aborted;
    throw new ApiError(
      isTimeout ? 'Kết nối tới máy chủ quá thời gian. Vui lòng thử lại.' : (error.message || 'Không thể kết nối đến máy chủ backend.'),
      0,
      error.message,
      isTimeout ? 'timeout' : null
    );
  } finally {
    callerSignal?.removeEventListener('abort', abortRequest);
    if (timer !== null) clearTimeout(timer);
  }
}
