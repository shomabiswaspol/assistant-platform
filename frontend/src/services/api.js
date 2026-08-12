const BASE = '/api';

// Slightly above nginx's outer /api/ proxy_read_timeout (220s) so a genuinely
// dead connection eventually surfaces as a real, catchable error instead of
// hanging the UI forever (2026-08-10 silent-timeout fix).
const REQUEST_TIMEOUT_MS = 230000;

function getToken() {
  return localStorage.getItem('token');
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `request failed (${res.status})`);
  return data;
}

async function requestForm(path, formData) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers, body: formData });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `request failed (${res.status})`);
  return data;
}

export const api = {
  register: (payload) => request('/auth/register', { method: 'POST', body: payload, auth: false }),
  login: (payload) => request('/auth/login', { method: 'POST', body: payload, auth: false }),
  me: () => request('/auth/me'),
  forgotPassword: (email) => request('/auth/forgot-password', { method: 'POST', body: { email }, auth: false }),
  resetPassword: (token, new_password) =>
    request('/auth/reset-password', { method: 'POST', body: { token, new_password }, auth: false }),

  chatSessions: () => request('/chat/sessions'),
  chatMessages: (sessionId) => request(`/chat/sessions/${sessionId}/messages`),
  chatRenameSession: (sessionId, title) =>
    request(`/chat/sessions/${sessionId}`, { method: 'PATCH', body: { title } }),
  chatDeleteSession: (sessionId) => request(`/chat/sessions/${sessionId}`, { method: 'DELETE' }),
  chatSend: (payload) => request('/chat/send', { method: 'POST', body: payload }),
  chatSendAudio: (blob, sessionId) => {
    const form = new FormData();
    form.append('audio', blob, 'voice.webm');
    if (sessionId) form.append('session_id', sessionId);
    return requestForm('/chat/send-audio', form);
  },
  chatSendImage: (file, sessionId, message) => {
    const form = new FormData();
    form.append('image', file);
    if (sessionId) form.append('session_id', sessionId);
    if (message) form.append('message', message);
    return requestForm('/chat/send-image', form);
  },

  adminRequests: (status = 'pending') => request(`/admin/membership-requests?status=${status}`),
  adminDecide: (id, decision, note) =>
    request(`/admin/membership-requests/${id}/decide`, { method: 'POST', body: { decision, note } }),
  adminUsers: () => request('/admin/users'),
  adminSetUserStatus: (id, status) => request(`/admin/users/${id}/status`, { method: 'POST', body: { status } }),

  profile: () => request('/profile'),
  updateProfile: (payload) => request('/profile', { method: 'PATCH', body: payload }),
  changePassword: (current_password, new_password) =>
    request('/profile/change-password', { method: 'POST', body: { current_password, new_password } }),

  models: () => request('/settings/models'),
  apiKeys: () => request('/settings/api-keys'),
  addApiKey: (payload) => request('/settings/api-keys', { method: 'POST', body: payload }),
  deleteApiKey: (id) => request(`/settings/api-keys/${id}`, { method: 'DELETE' }),
  omnirouteStatus: () => request('/settings/omniroute-status'),
  // Hermes customer-dispatch Phase 1 (2026-08-12) — admin-only ON/OFF for
  // the 4 hermes_customer_* feature flags, via backend/src/routes/fazleOps.js
  // (a passthrough to fazle-core's own preflight_guard ops-flag endpoints).
  hermesCustomerFlags: () => request('/fazle-ops/flags'),
  activateHermesCustomerFlag: (name) => request(`/fazle-ops/activate/${name}`, { method: 'POST' }),
  killSwitchHermesCustomerFlag: (name) => request(`/fazle-ops/kill-switch/${name}`, { method: 'POST' }),

  usageDaily: () => request('/usage/daily'),
  usageMonthly: () => request('/usage/monthly'),
  usageFreeRemaining: () => request('/usage/free-remaining'),

  opencodeSessions: () => request('/opencode/session'),
  opencodeCreateSession: () => request('/opencode/session', { method: 'POST' }),
  opencodeMessages: (sessionId) => request(`/opencode/session/${sessionId}/messages`),
  opencodePrompt: (sessionId, text) =>
    request(`/opencode/session/${sessionId}/prompt`, { method: 'POST', body: { text } }),

  hermesMessages: () => request('/hermes/messages'),
  hermesPersonas: () => request('/hermes/personas'),
  hermesState: () => request('/hermes/state'),
  hermesSend: (message, persona) => request('/hermes/send', { method: 'POST', body: { message, persona } }),
  hermesReset: () => request('/hermes/reset', { method: 'POST' }),
  hermesMode: () => request('/hermes/mode'),
  hermesSetMode: (mode) => request('/hermes/mode', { method: 'POST', body: { mode } }),
};
