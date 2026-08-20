const BASE = '/api';

// Slightly above the largest nginx proxy_read_timeout any /api/ call might
// hit, so a genuinely dead connection eventually surfaces as a real,
// catchable error instead of hanging the UI forever (2026-08-10
// silent-timeout fix). Raised 230000 -> 380000 on 2026-08-14 to stay above
// the new /api/hermes/ location's 350s (up from the general /api/ block's
// 220s, which is still fine for every other route) — see
// HANDOFF_P2_TIMEOUT_FIX_2026-08-14.md and hermes-runner/server.py's
// timeout-chain comment for the full chain this sits at the top of.
const REQUEST_TIMEOUT_MS = 380000;

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
  // Operational visibility (2026-08-16) — same fazle-ops passthrough
  // pattern as the 3 calls above, reusing the same /fazle-ops-internal/
  // nginx location and modules/preflight_guard/routes.py's new
  // ops_health_summary/ops_dlq_status endpoints (see that file's own
  // comment for why these live in this specific namespace).
  fazleOpsHealth: () => request('/fazle-ops/health'),
  fazleOpsDlq: () => request('/fazle-ops/dlq'),

  // Minimal Owner-facing Hermes Task/Approval panel (2026-08-20) — thin
  // passthrough to fazle-core's modules.hermes_tasks routes via
  // backend/src/routes/hermesTasks.js. Read-plus-approve/reject only;
  // WhatsApp/chat remains the way tasks/authorizations actually get
  // created, this panel never does that.
  hermesTasks: (status) => request(`/hermes-tasks/tasks${status ? `?status=${status}` : ''}`),
  hermesTask: (id) => request(`/hermes-tasks/tasks/${id}`),
  hermesPendingActions: (taskId) =>
    request(`/hermes-tasks/actions?status=pending${taskId ? `&task_id=${taskId}` : ''}`),
  hermesApproveAction: (id) => request(`/hermes-tasks/actions/${id}/approve`, { method: 'POST' }),
  hermesRejectAction: (id, reason) =>
    request(`/hermes-tasks/actions/${id}/reject`, { method: 'POST', body: { reason } }),

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
