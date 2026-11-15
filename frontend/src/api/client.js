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

let silentLoginPromise = null;

async function performSilentLogin() {
  if (!silentLoginPromise) {
    silentLoginPromise = fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'advisor.demo',
        password: 'DemoAdvisor123!',
      }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('Auto-login failed');
        return await res.json();
      })
      .finally(() => {
        silentLoginPromise = null;
      });
  }
  return silentLoginPromise;
}

export async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const timeoutMs = options.timeout ?? 8000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // If caller provided a signal, link them together
  if (options.signal) {
    options.signal.addEventListener('abort', () => controller.abort());
  }

  try {
    const response = await fetch(url, {
      credentials: 'include',
      ...options,
      headers,
      signal: controller.signal,
    });

    if ((response.status === 401 || response.status === 403) && !url.includes('/auth/') && !options._retried) {
      clearTimeout(timer);
      try {
        await performSilentLogin();
        return await request(endpoint, { ...options, _retried: true });
      } catch {
        // Fall through to error reporting
      }
    }

    if (!response.ok) {
      let errorDetail = '';
      let errorCode = null;
      try {
        const errorData = await response.json();
        errorCode = errorData.code || null;
        errorDetail = errorData.detail || errorData.message || response.statusText;
      } catch {
        errorDetail = await response.text().catch(() => response.statusText);
      }
      throw new ApiError(errorDetail || `Request failed with status ${response.status}`, response.status, errorDetail, errorCode);
    }

    if (response.status === 204) {
      return null;
    }

    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    const isTimeout = error.name === 'AbortError' || error.message?.includes('aborted');
    throw new ApiError(
      isTimeout ? 'Kết nối tới máy chủ quá thời gian. Đang sử dụng chế độ dự phòng.' : (error.message || 'Không thể kết nối đến máy chủ backend.'),
      0,
      error.message
    );
  } finally {
    clearTimeout(timer);
  }
}
