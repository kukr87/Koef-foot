/**
 * Koefii Mini App — Frontend
 * Dark Football Theme
 */

const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  tg.setHeaderColor('#0a0e17');
  tg.setBackgroundColor('#0a0e17');
}

const API = '/api';
let currentUser = null;
let currentPage = 'home';
let pageHistory = [];

// ====================== HELPERS ======================

function getInitData() {
  return tg?.initData || '';
}

async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Telegram-Init-Data': getInitData(),
    ...(options.headers || {}),
  };
  const res = await fetch(API + path, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || err.message || 'Ошибка сервера');
  }
  return res.json();
}

function toast(msg, duration = 2500) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), duration);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function greeting() {
  const h = new Date().getHours();
  if (h >= 6 && h < 12) return '☀️ Доброе утро';
  if (h >= 12 && h < 18) return '🏙 Привет';
  if (h >= 18 && h < 23) return '🌙 Вечер добрый';
  return '🌙 Доброй ночи';
}

function avatarHtml(url, name, sizeClass = 'avatar') {
  if (url) {
    return `<img class="${sizeClass}" src="${escapeHtml(url)}" alt="" onerror="this.outerHTML=this.dataset.fallback" data-fallback="<div class='${sizeClass}-placeholder'>${(name || '?')[0].toUpperCase()}</div>" />`;
  }
  const letter = (name || '?')[0].toUpperCase();
  return `<div class="${sizeClass}-placeholder">${letter}</div>`;
}

// ====================== NAVIGATION ======================

function navigate(page, data = null, push = true) {
  if (push && currentPage !== page) {
    pageHistory.push({ page: currentPage, data: null });
  }
  currentPage = page;
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.page === page);
  });
  render(page, data);
}

function goBack() {
  if (pageHistory.length) {
    const prev = pageHistory.pop();
    currentPage = prev.page;
    document.querySelectorAll('.nav-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.page === prev.page);
    });
    render(prev.page, prev.data);
  } else {
    navigate('home', null, false);
  }
}

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    pageHistory = [];
    navigate(btn.dataset.page, null, false);
  });
});

// ====================== RENDERERS ======================

const content = document.getElementById('content');

async function render(page, data) {
  content.innerHTML = '<div class="empty-state"><div class="icon">⏳</div><p>Загрузка...</p></div>';
  try {
    switch (page) {
      case 'home': await renderHome(); break;
      case 'matches': await renderMatches(); break;
      case 'match-group': await renderMatchGroup(data); break;
      case 'match-detail': await renderMatchDetail(data); break;
      case 'express': await renderExpress(); break;
      case 'account': await renderAccount(); break;
      case 'favorites': await renderFavorites(); break;
      case 'premium': await renderPremium(); break;
      case 'support': await renderSupport(); break;
      case 'support-form': await renderSupportForm(data); break;
      case 'ref': await renderRef(); break;
      default: await renderHome();
    }
  } catch (e) {
    content.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><p>${escapeHtml(e.message)}</p>
      <button class="btn btn-secondary" onclick="navigate('home')" style="margin-top:16px">На главную</button></div>`;
  }
}

// ---------- HOME ----------
async function renderHome() {
  const me = currentUser;
  let bonusHtml = '';
  if (me.bonus) {
    bonusHtml = `
      <div class="bonus-banner">
        <h3>${escapeHtml(me.bonus.text)}</h3>
        <p style="color:var(--text-secondary);font-size:13px;margin-top:6px">📅 Premium до: ${escapeHtml(me.bonus.end_date)}</p>
      </div>`;
  }

  content.innerHTML = `
    <div class="welcome-banner">
      <div class="welcome-title">${greeting()}, ${escapeHtml(me.user.first_name)}!</div>
      <p class="welcome-text">Я 🤖 твой помощник в мире футбола — собираю полную статистику, анализирую и предоставляю более вероятные исходы на события.</p>
    </div>
    ${bonusHtml}
    <div class="menu-grid">
      <div class="menu-item" onclick="navigate('matches')">
        <span class="icon">⚽</span>
        <span class="label">Матчи</span>
      </div>
      <div class="menu-item" onclick="navigate('express')">
        <span class="icon">🚆</span>
        <span class="label">Экспресс дня</span>
      </div>
      <div class="menu-item" onclick="navigate('account')">
        <span class="icon">👤</span>
        <span class="label">Аккаунт</span>
      </div>
      <div class="menu-item" onclick="navigate('support')">
        <span class="icon">✉️</span>
        <span class="label">Техподдержка</span>
      </div>
    </div>
    <div style="margin-top:16px">
      <a href="https://t.me/koefchat" target="_blank" class="btn btn-secondary" style="text-decoration:none">
        💬 Чат канала
      </a>
    </div>
  `;
}

// ---------- MATCHES ----------
async function renderMatches() {
  const data = await api('/matches');
  if (!data.groups.length) {
    content.innerHTML = `
      <button class="btn-back" onclick="goBack()">← Назад</button>
      <div class="empty-state"><div class="icon">⚽</div><p>Матчей пока нет</p></div>`;
    return;
  }
  let html = `<div class="section-title">📋 Выберите (страна — лига)</div>`;
  data.groups.forEach(g => {
    html += `
      <div class="group-card" onclick='navigate("match-group", ${JSON.stringify(g)})'>
        <div class="group-left">
          <span class="group-flag">${g.flag}</span>
          <div class="group-info">
            <div class="country">${escapeHtml(g.country)}</div>
            <div class="league">${escapeHtml(g.league)}</div>
          </div>
        </div>
        <span class="group-count">${g.count}</span>
      </div>`;
  });
  content.innerHTML = html;
}

async function renderMatchGroup(group) {
  let html = `
    <button class="btn-back" onclick="goBack()">← Назад</button>
    <div class="card-title">${group.flag} ${escapeHtml(group.country)} — ${escapeHtml(group.league)}</div>`;
  group.matches.forEach(m => {
    const time = m.match_time ? `<span class="match-time">🕒 ${escapeHtml(m.match_time)}</span>` : '';
    html += `
      <div class="match-item" onclick="navigate('match-detail', ${m.id})">
        ${time}
        <span class="match-name">${escapeHtml(m.name)}</span>
      </div>`;
  });
  content.innerHTML = html;
}

async function renderMatchDetail(matchId) {
  try {
    const m = await api(`/matches/${matchId}`);
    const favBtn = m.is_favorite
      ? `<button class="btn btn-danger" onclick="toggleFav(${m.id})">💔 Убрать из избранного</button>`
      : `<button class="btn btn-secondary" onclick="toggleFav(${m.id})">⭐ В избранное</button>`;

    content.innerHTML = `
      <button class="btn-back" onclick="goBack()">← Назад</button>
      <div class="match-detail-header">
        <div class="match-detail-name">⚽ ${escapeHtml(m.name)}</div>
        <div class="match-meta">
          ${m.match_time ? `<span class="meta-tag">🕒 ${escapeHtml(m.match_time)}</span>` : ''}
          <span class="meta-tag">${m.flag} ${escapeHtml(m.country)}</span>
          <span class="meta-tag">🏆 ${escapeHtml(m.league)}</span>
        </div>
      </div>
      <div class="match-text">${escapeHtml(m.text) || '<span style="color:var(--text-muted)">Текст прогноза пока не добавлен</span>'}</div>
      ${favBtn}
    `;
  } catch (e) {
    if (e.message.includes('Лимит')) {
      content.innerHTML = `
        <button class="btn-back" onclick="goBack()">← Назад</button>
        <div class="empty-state">
          <div class="icon">🔒</div>
          <p>${escapeHtml(e.message)}</p>
          <button class="btn btn-gold" onclick="navigate('premium')" style="margin-top:16px">Купить Premium</button>
        </div>`;
    } else throw e;
  }
}

async function toggleFav(matchId) {
  try {
    const res = await api(`/favorites/${matchId}`, { method: 'POST' });
    toast(res.message);
    renderMatchDetail(matchId);
  } catch (e) {
    toast(e.message);
  }
}

// ---------- EXPRESS ----------
async function renderExpress(page = 0) {
  const data = await api(`/express?page=${page}`);
  let picksHtml = '';

  if (!data.is_premium) {
    picksHtml = `
      <div class="express-card">
        <div class="lock-overlay">
          <div class="icon">🔒</div>
          <h3 style="margin-bottom:8px">🚆 Экспресс дня</h3>
          <p style="color:var(--text-secondary);margin-bottom:16px">Полный экспресс доступен только по Premium!<br>
          ⭐ Купите Premium и получите доступ ко всем экспрессам и матчам без ограничений.</p>
          <button class="btn btn-gold" onclick="navigate('premium')">Купить Premium</button>
        </div>
      </div>`;
  } else if (data.picks.length) {
    picksHtml = `<div class="express-card"><div class="card-title">🚆 Экспресс дня</div>`;
    data.picks.forEach(p => {
      picksHtml += `
        <div class="express-pick">
          <div class="name">⚽ ${escapeHtml(p.name)}</div>
          <div class="meta">${p.flag} ${escapeHtml(p.country)} — ${escapeHtml(p.league)}</div>
          <div class="pred">⚡ Прогноз: ${escapeHtml(p.prediction)}</div>
          <div class="pred">🎯 Коэффициент: ${escapeHtml(p.coef)}</div>
        </div>`;
    });
    picksHtml += `<div class="total-coef">👑 Общий коэффициент: ${data.total_coef}</div></div>`;
  } else {
    picksHtml = `<div class="express-card"><div class="card-title">🚆 Экспресс дня</div>
      <p style="color:var(--text-secondary);padding:12px 0">Экспресс пока не сформирован. Загляните позже!</p></div>`;
  }

  const s = data.stats;
  const statsHtml = `
    <div class="card">
      <div class="card-title">📊 Статистика экспрессов</div>
      <div class="stats-grid">
        <div class="stat-box"><div class="val">${s.total}</div><div class="lbl">Всего</div></div>
        <div class="stat-box"><div class="val">${s.wins}</div><div class="lbl">✅ Заходов</div></div>
        <div class="stat-box"><div class="val">${s.losses}</div><div class="lbl">❌ Мимо</div></div>
        <div class="stat-box"><div class="val">${s.winrate.toFixed(1)}%</div><div class="lbl">Винрейт</div></div>
        <div class="stat-box"><div class="val">${s.roi >= 0 ? '+' : ''}${s.roi.toFixed(1)}%</div><div class="lbl">ROI</div></div>
        <div class="stat-box"><div class="val">${s.profit >= 0 ? '+' : ''}${s.profit.toFixed(2)}</div><div class="lbl">Прибыль</div></div>
      </div>
    </div>`;

  let resultsHtml = `<div class="card"><div class="card-title">📋 Прошедшие прогнозы</div>`;
  if (!data.results.length) {
    resultsHtml += `<p style="color:var(--text-muted);padding:8px 0">Прошедших прогнозов пока нет.</p>`;
  } else {
    data.results.forEach(r => {
      resultsHtml += `
        <div class="result-item">
          <span>${r.result_emoji}</span>
          <span style="flex:1">🚆 ${escapeHtml(r.created_at)} | ${r.type_label} | кф. ${Number(r.coef).toFixed(2)}</span>
        </div>`;
    });
    if (data.total_pages > 1) {
      resultsHtml += `
        <div class="pagination">
          <button class="page-btn" ${page <= 0 ? 'disabled' : ''} onclick="renderExpress(${page - 1})">←</button>
          <span class="page-info">${page + 1}/${data.total_pages}</span>
          <button class="page-btn" ${page >= data.total_pages - 1 ? 'disabled' : ''} onclick="renderExpress(${page + 1})">→</button>
        </div>`;
    }
  }
  resultsHtml += `</div>`;

  content.innerHTML = picksHtml + statsHtml + resultsHtml;
}

// ---------- ACCOUNT ----------
async function renderAccount() {
  const me = await api('/me');
  currentUser = me;
  const u = me.user;
  const s = me.stats;

  const subBadge = u.subscription === 'Premium'
    ? `<span class="sub-badge premium">⭐ Premium</span>`
    : `<span class="sub-badge free">🆓 Free</span>`;

  let premiumBtn = '';
  if (u.subscription === 'Free') {
    premiumBtn = `<button class="btn btn-gold" onclick="navigate('premium')">Купить Premium (${300} ₽)</button>`;
  } else {
    premiumBtn = `<div class="card" style="margin-top:12px"><div class="info-list">
      <li><span class="label">📅 Premium до</span><span class="value">${escapeHtml(u.end_date || '—')}</span></li>
    </div></div>`;
  }

  content.innerHTML = `
    <div class="profile-card">
      ${avatarHtml(u.photo_url, u.first_name, 'profile-avatar')}
      <div class="profile-name">${escapeHtml(u.first_name)}</div>
      <div class="profile-id">ID: ${u.id}</div>
      ${subBadge}
      <div class="stats-row">
        <div class="stat-item">
          <div class="stat-value">${u.matches_left}</div>
          <div class="stat-label">Матчей сегодня</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${u.days_in_project}</div>
          <div class="stat-label">Дней в проекте</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${s.fav_count}</div>
          <div class="stat-label">Избранное</div>
        </div>
      </div>
    </div>

    <div class="card">
      <ul class="info-list">
        <li><span class="label">📅 С нами с</span><span class="value">${escapeHtml(u.reg_date || '—')}</span></li>
        <li><span class="label">🏆 Матчей в базе</span><span class="value">${s.total_matches}</span></li>
        <li><span class="label">👥 Всего пользователей</span><span class="value">${s.total_users}</span></li>
        <li><span class="label">⭐ Premium-пользователей</span><span class="value">${s.premium_users}</span></li>
      </ul>
    </div>

    <button class="btn btn-secondary" onclick="navigate('favorites')">⭐ Избранное (${s.fav_count})</button>
    <button class="btn btn-secondary" onclick="navigate('ref')">🔗 Реферальная ссылка (приглашено: ${s.ref_count})</button>
    ${premiumBtn}
  `;

  // Update header avatar
  const headerUser = document.getElementById('header-user');
  headerUser.innerHTML = avatarHtml(u.photo_url, u.first_name, 'avatar');
}

async function renderFavorites() {
  const data = await api('/favorites');
  let html = `<button class="btn-back" onclick="goBack()">← Назад</button>
    <div class="card-title">⭐ Избранные матчи</div>`;
  if (!data.favorites.length) {
    html += `<div class="empty-state"><div class="icon">⭐</div><p>У вас пока нет избранных матчей.</p></div>`;
  } else {
    data.favorites.forEach(m => {
      const time = m.match_time ? `<span class="match-time">🕒 ${escapeHtml(m.match_time)}</span>` : '';
      html += `
        <div class="match-item" onclick="navigate('match-detail', ${m.id})">
          ${time}
          <span class="match-name">${m.flag} ${escapeHtml(m.name)}</span>
        </div>`;
    });
  }
  content.innerHTML = html;
}

async function renderRef() {
  const me = currentUser || await api('/me');
  content.innerHTML = `
    <button class="btn-back" onclick="goBack()">← Назад</button>
    <div class="card">
      <div class="card-title">🔗 Ваша реферальная ссылка</div>
      <p style="font-family:monospace;font-size:13px;word-break:break-all;background:var(--bg-elevated);padding:12px;border-radius:8px;margin:12px 0">
        ${escapeHtml(me.ref_link)}
      </p>
      <p style="color:var(--text-secondary);font-size:14px">
        🎉 За каждого приглашённого — 3 дня Premium бесплатно!<br>
        Приглашено: <b>${me.stats.ref_count}</b> чел.
      </p>
      <button class="btn btn-primary" onclick="copyRef('${me.ref_link}')">📋 Скопировать</button>
    </div>`;
}

function copyRef(link) {
  navigator.clipboard?.writeText(link).then(() => toast('Ссылка скопирована!')).catch(() => {
    tg?.showAlert(link);
  });
}

// ---------- PREMIUM ----------
async function renderPremium() {
  content.innerHTML = `
    <button class="btn-back" onclick="goBack()">← Назад</button>
    <div class="premium-card">
      <h2>⭐ Premium</h2>
      <p style="color:var(--text-secondary)">Полный доступ</p>
      <ul class="premium-features">
        <li>✅ Безлимитные матчи</li>
        <li>✅ Доступ к экспрессам</li>
        <li>✅ Полная статистика</li>
      </ul>
      <div class="premium-price">300 ₽ / месяц</div>
      <button class="btn btn-gold" id="pay-btn" onclick="createPayment()">💳 Оплатить 300 ₽</button>
    </div>
    <div id="pay-status"></div>
  `;
}

async function createPayment() {
  const btn = document.getElementById('pay-btn');
  btn.disabled = true;
  btn.textContent = 'Создаём платёж...';
  try {
    const res = await api('/premium/create', { method: 'POST' });
    if (res.confirmation_url) {
      document.getElementById('pay-status').innerHTML = `
        <div class="card" style="margin-top:12px">
          <p style="margin-bottom:12px">Нажмите кнопку ниже для оплаты:</p>
          <a href="${res.confirmation_url}" target="_blank" class="btn btn-primary" style="text-decoration:none">💳 Перейти к оплате</a>
          <button class="btn btn-secondary" style="margin-top:8px" onclick="checkPayment('${res.payment_id}')">✅ Я оплатил — проверить</button>
        </div>`;
    }
  } catch (e) {
    toast(e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '💳 Оплатить 300 ₽';
  }
}

async function checkPayment(pid) {
  try {
    const res = await api(`/premium/check/${pid}`, { method: 'POST' });
    toast(res.message);
    if (res.status === 'succeeded') {
      currentUser = await api('/me');
      setTimeout(() => navigate('account'), 1500);
    }
  } catch (e) {
    toast(e.message);
  }
}

// ---------- SUPPORT ----------
async function renderSupport() {
  const cats = [
    { id: 'bug', label: '🐛 Баг / ошибка' },
    { id: 'pay', label: '💳 Оплата' },
    { id: 'idea', label: '💡 Предложение' },
    { id: 'q', label: '❓ Вопрос' },
  ];
  let html = `
    <div class="card-title">✉️ Техподдержка</div>
    <p style="color:var(--text-secondary);margin-bottom:16px">Выберите категорию обращения:</p>`;
  cats.forEach(c => {
    html += `<button class="cat-btn" onclick="navigate('support-form', '${c.id}')">${c.label}</button>`;
  });
  content.innerHTML = html;
}

async function renderSupportForm(cat) {
  const labels = { bug: '🐛 Баг / ошибка', pay: '💳 Оплата', idea: '💡 Предложение', q: '❓ Вопрос' };
  content.innerHTML = `
    <button class="btn-back" onclick="goBack()">← Назад</button>
    <div class="card-title">${labels[cat] || 'Вопрос'}</div>
    <p style="color:var(--text-secondary);margin-bottom:12px">Напишите ваше сообщение (одним сообщением):</p>
    <textarea class="textarea" id="support-text" placeholder="Опишите ваш вопрос или проблему..."></textarea>
    <button class="btn btn-primary" onclick="sendSupport('${cat}')">Отправить</button>
  `;
}

async function sendSupport(cat) {
  const text = document.getElementById('support-text').value.trim();
  if (!text) {
    toast('Введите сообщение');
    return;
  }
  try {
    const res = await api('/support', {
      method: 'POST',
      body: JSON.stringify({ category: cat, text }),
    });
    toast(res.message);
    setTimeout(() => navigate('home'), 1500);
  } catch (e) {
    toast(e.message);
  }
}

// ====================== INIT ======================

async function init() {
  try {
    // Для разработки без Telegram — mock
    if (!getInitData() && location.hostname === 'localhost') {
      console.warn('No Telegram initData — using mock mode');
      // В проде обязательно нужен Telegram
    }

    currentUser = await api('/me');
    const u = currentUser.user;

    // Header avatar
    document.getElementById('header-user').innerHTML =
      avatarHtml(u.photo_url, u.first_name, 'avatar');

    document.getElementById('loader').classList.add('hidden');
    document.getElementById('main').classList.remove('hidden');

    navigate('home', null, false);
  } catch (e) {
    document.getElementById('loader').innerHTML = `
      <div style="text-align:center;padding:40px">
        <div style="font-size:48px;margin-bottom:16px">⚠️</div>
        <p style="color:var(--text-secondary)">${escapeHtml(e.message)}</p>
        <p style="color:var(--text-muted);font-size:13px;margin-top:12px">Откройте приложение через Telegram</p>
      </div>`;
  }
}

init();
