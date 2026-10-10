/**
 * API client for Koefi WebApp
 */
const API_BASE = window.location.origin;

function getInitData() {
  try {
    return window.Telegram?.WebApp?.initData || '';
  } catch {
    return '';
  }
}

async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Telegram-Init-Data': getInitData(),
    ...(options.headers || {}),
  };

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let detail = 'Ошибка сервера';
    try {
      const err = await res.json();
      detail = err.detail || detail;
    } catch {}
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
  }

  return res.json();
}

const Api = {
  me: () => api('/api/me'),
  start: (referrer) => api(`/api/start${referrer ? `?referrer=${referrer}` : ''}`, { method: 'POST' }),
  matches: () => api('/api/matches'),
  match: (id) => api(`/api/matches/${id}`),
  addFav: (id) => api(`/api/matches/${id}/favorite`, { method: 'POST' }),
  removeFav: (id) => api(`/api/matches/${id}/favorite`, { method: 'DELETE' }),
  favorites: () => api('/api/favorites'),
  express: (page = 0) => api(`/api/express?page=${page}`),
  createPayment: () => api('/api/premium/create', { method: 'POST' }),
  checkPayment: (pid) => api(`/api/premium/check/${pid}`),
  support: (category, text) => api('/api/support', {
    method: 'POST',
    body: JSON.stringify({ category, text }),
  }),
  supportCats: () => api('/api/support/categories'),

  // Admin
  adminMatches: () => api('/api/admin/matches'),
  adminCreateMatch: (data) => api('/api/admin/matches', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  adminSetText: (id, text) => api(`/api/admin/matches/${id}/text`, {
    method: 'PUT',
    body: JSON.stringify({ text }),
  }),
  adminDeleteMatch: (id) => api(`/api/admin/matches/${id}`, { method: 'DELETE' }),
  adminClearMatches: () => api('/api/admin/matches', { method: 'DELETE' }),
  adminExpress: () => api('/api/admin/express'),
  adminAddExpress: (data) => api('/api/admin/express', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  adminClearExpress: () => api('/api/admin/express', { method: 'DELETE' }),
  adminAddResult: (data) => api('/api/admin/express/result', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  adminGrantPremium: (user_id, days = 30) => api('/api/admin/premium/grant', {
    method: 'POST',
    body: JSON.stringify({ user_id, days }),
  }),
  adminRevokePremium: (user_id) => api('/api/admin/premium/revoke', {
    method: 'POST',
    body: JSON.stringify({ user_id, days: 0 }),
  }),
  adminSupport: () => api('/api/admin/support'),
  adminSupportThread: (id) => api(`/api/admin/support/${id}`),
  adminReply: (id, text) => api(`/api/admin/support/${id}/reply`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  }),
  adminLogs: () => api('/api/admin/logs'),

  news: () => api('/api/news'),
  adminNews: () => api('/api/admin/news'),
  adminCreateNews: (text) => api('/api/admin/news', { method: 'POST', body: JSON.stringify({ text }) }),
  adminDeleteNews: (id) => api(`/api/admin/news/${id}`, { method: 'DELETE' }),

  parserFetch: (date) => api(`/api/admin/parser/fetch?date=${date}`, { method: 'POST' }),
  parserList: (page = 0) => api(`/api/admin/parser/list?page=${page}`),
  parserLeagues: () => api('/api/admin/parser/leagues'),
  parserAdd: (params) => {
    const q = new URLSearchParams();
    if (params.parsed_id) q.set('parsed_id', params.parsed_id);
    if (params.league_id) q.set('league_id', params.league_id);
    if (params.all_matches) q.set('all_matches', 'true');
    return api(`/api/admin/parser/add?${q}`, { method: 'POST' });
  },
};
