const BASE = '/api';

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
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `request failed (${res.status})`);
  return data;
}

export const api = {
  register: (payload) => request('/auth/register', { method: 'POST', body: payload, auth: false }),
  login: (payload) => request('/auth/login', { method: 'POST', body: payload, auth: false }),
  me: () => request('/auth/me'),
  forgotPassword: (email) => request('/auth/forgot-password', { method: 'POST', body: { email }, auth: false }),

  chatSessions: () => request('/chat/sessions'),
  chatMessages: (sessionId) => request(`/chat/sessions/${sessionId}/messages`),
  chatSend: (payload) => request('/chat/send', { method: 'POST', body: payload }),

  adminRequests: (status = 'pending') => request(`/admin/membership-requests?status=${status}`),
  adminDecide: (id, decision, note) =>
    request(`/admin/membership-requests/${id}/decide`, { method: 'POST', body: { decision, note } }),
  adminUsers: () => request('/admin/users'),

  profile: () => request('/profile'),
  updateProfile: (payload) => request('/profile', { method: 'PATCH', body: payload }),

  models: () => request('/settings/models'),
  apiKeys: () => request('/settings/api-keys'),
  addApiKey: (payload) => request('/settings/api-keys', { method: 'POST', body: payload }),
  deleteApiKey: (id) => request(`/settings/api-keys/${id}`, { method: 'DELETE' }),
  omnirouteStatus: () => request('/settings/omniroute-status'),

  usageDaily: () => request('/usage/daily'),
  usageMonthly: () => request('/usage/monthly'),
};
