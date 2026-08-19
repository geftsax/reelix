let settings = { apiBaseUrl: '', environmentLabel: 'unknown' };

export const loadSettings = async () => {
  try {
    const response = await fetch('config.json', { cache: 'no-cache' });
    if (response.ok) settings = { ...settings, ...(await response.json()) };
  } catch {
  }

  if (!settings.apiBaseUrl) settings.apiBaseUrl = window.location.origin;
  settings.apiBaseUrl = settings.apiBaseUrl.replace(/\/+$/, '');
  return settings;
};

export const getSettings = () => settings;

const TOKEN_KEY = 'reelix.token';

export const readToken = () => window.localStorage.getItem(TOKEN_KEY);
export const writeToken = (token) => window.localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => window.localStorage.removeItem(TOKEN_KEY);

export class ApiError extends Error {
  constructor(status, payload) {
    super(payload?.message || `Request failed with status ${status}.`);
    this.name = 'ApiError';
    this.status = status;
    this.details = payload?.details ?? null;
    this.payload = payload;
  }
}

const request = async (path, { method = 'GET', body, formData, auth = true } = {}) => {
  const headers = {};
  const token = readToken();
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  let payload;
  if (formData) {
    payload = formData;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const response = await fetch(`${settings.apiBaseUrl}${path}`, { method, headers, body: payload });

  if (response.status === 204 || response.status === 304) return null;

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    if (response.status === 401) clearToken();
    throw new ApiError(response.status, data);
  }

  return data;
};

export const api = {
  systemInfo: () => request('/api/system/info', { auth: false }),
  health: () => request('/api/system/health', { auth: false }),
  metrics: () => request('/api/system/metrics'),

  reference: () => request('/api/reference', { auth: false }),
  dashboard: () => request('/api/dashboard'),

  search: (params) => {
    const query = new URLSearchParams();
    Object.entries(params ?? {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') query.set(key, value);
    });
    const suffix = query.toString();
    return request(`/api/clips${suffix ? `?${suffix}` : ''}`);
  },

  clip: (clipId) => request(`/api/clips/${clipId}`),
  playback: (clipId) => request(`/api/clips/${clipId}/playback`),
  library: () => request('/api/clips/library'),
  setClipState: (clipId, publishState) =>
    request(`/api/clips/${clipId}/state`, { method: 'PATCH', body: { publishState } }),

  comments: (clipId, page = 1) => request(`/api/clips/${clipId}/comments?page=${page}`),
  postComment: (clipId, body) =>
    request(`/api/clips/${clipId}/comments`, { method: 'POST', body: { body } }),

  myRating: (clipId) => request(`/api/clips/${clipId}/rating`),
  rate: (clipId, score) =>
    request(`/api/clips/${clipId}/rating`, { method: 'PUT', body: { score } }),

  register: (payload) => request('/api/auth/register', { method: 'POST', body: payload, auth: false }),
  login: (payload) => request('/api/auth/login', { method: 'POST', body: payload, auth: false }),
  me: () => request('/api/auth/me'),

  upload: (formData) => request('/api/clips', { method: 'POST', formData }),

  adminAccounts: () => request('/api/admin/accounts'),
  adminCreateAccount: (payload) => request('/api/admin/accounts', { method: 'POST', body: payload }),
  adminSetRole: (payload) =>
    request('/api/admin/accounts/role', { method: 'PATCH', body: payload }),
};
