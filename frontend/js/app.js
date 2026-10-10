/**
 * Koefi WebApp — main application logic
 * Dark football theme · Full feature parity with Telegram bot
 */

// ---------- Telegram WebApp init ----------
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  tg.setHeaderColor('#0a0e14');
  tg.setBackgroundColor('#0a0e14');
  try { tg.disableVerticalSwipes(); } catch {}
}

// ---------- State ----------
const state = {
  user: null,
  page: 'home',
  pageStack: [],
  matchesCache: null,
  expressPage: 0,
  currentMatchId: null,
  supportCat: null,
  welcomeBonus: null,
};

// ---------- Helpers ----------
function $(sel) { return document.querySelector(sel); }
function el(html) {
  const d = document.createElement('div');
  d.innerHTML = html.trim();
  return d.firstChild;
}

function toast(msg, type = 'success') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => t.classList.remove('show'), 2800);
}

function greeting() {
  const h = new Date().getHours();
  if (h >= 6 && h < 12) return '☀️ Доброе утро';
  if (h >= 12 && h < 18) return '🏙 Привет';
  if (h >= 18 && h < 23) return '🌙 Вечер добрый';
  return '🌙 Доброй ночи';
}

function setHeader(title, badge) {
  $('#headerTitle').textContent = title;
  const b = $('#subBadge');
  if (badge === false) {
    b.classList.add('hidden');
  } else {
    b.classList.remove('hidden');
    const isPrem = state.user?.subscription === 'Premium';
    b.textContent = isPrem ? '⭐ Premium' : 'Free';
    b.className = `header-badge${isPrem ? ' premium' : ''}`;
  }
}

function setNav(active) {
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.page === active);
  });
}

function showLoader() {
  $('#main').innerHTML = `<div class="loader"><div class="spinner"></div><div class="text-muted">Загрузка...</div></div>`;
}

// ---------- Navigation ----------
function navigate(page, push = true) {
  if (push && state.page !== page) {
    state.pageStack.push(state.page);
  }
  state.page = page;
  render();
}

function goBack() {
  const prev = state.pageStack.pop() || 'home';
  state.page = prev;
  render();
}

// ---------- Renderers ----------
async function render() {
  const main = $('#main');
  showLoader();

  try {
    if (!state.user) {
      state.user = await Api.me();
    }

    switch (state.page) {
      case 'home': await renderHome(); break;
      case 'matches': await renderMatches(); break;
      case 'match': await renderMatchDetail(); break;
      case 'express': await renderExpress(); break;
      case 'account': await renderAccount(); break;
      case 'favorites': await renderFavorites(); break;
      case 'support': await renderSupport(); break;
      case 'supportForm': await renderSupportForm(); break;
      case 'premium': await renderPremium(); break;
      case 'admin': await renderAdmin(); break;
      case 'adminMatches': await renderAdminMatches(); break;
      case 'adminExpress': await renderAdminExpress(); break;
      case 'adminPremium': await renderAdminPremium(); break;
      case 'adminSupport': await renderAdminSupport(); break;
      case 'adminLogs': await renderAdminLogs(); break;
      case 'adminNews': await renderAdminNews(); break;
      case 'adminParser': await renderAdminParser(); break;
      case 'adminParserList': await renderAdminParserList(); break;
      default: await renderHome();
    }
  } catch (e) {
    main.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><p>${e.message}</p>
      <button class="btn btn-outline mt-16" onclick="location.reload()">Обновить</button></div>`;
  }
}

// ===== HOME =====
async function renderHome() {
  setHeader('Koefi');
  setNav('home');
  const u = state.user;

  let bonusHtml = '';
  if (state.welcomeBonus) {
    bonusHtml = `
      <div class="welcome-banner">
        <h3>🎁 Test Drive активирован!</h3>
        <p>30 дней Premium бесплатно до ${state.welcomeBonus}. Оцените все возможности без ограничений.</p>
      </div>`;
    state.welcomeBonus = null;
  }

  let newsHtml = '<div class="section-title">📰 Лента проекта</div>';
  try {
    const news = await Api.news();
    if (news.items && news.items.length) {
      for (const n of news.items) {
        newsHtml += `
          <div class="news-card">
            <div class="news-num">#${n.number}</div>
            <div class="news-text">${escapeHtml(n.text)}</div>
            <div class="news-footer">Администрация проекта · ${(n.created_at || '').slice(0, 10)}</div>
          </div>`;
      }
    } else {
      newsHtml += `<div class="empty-state" style="padding:32px"><p class="text-muted">Новостей пока нет</p></div>`;
    }
  } catch (e) {
    newsHtml += `<div class="empty-state" style="padding:24px"><p class="text-muted">Не удалось загрузить новости</p></div>`;
  }

  $('#main').innerHTML = `
    <div class="page">
      <div class="greeting">
        <h1>${greeting()}, ${escapeHtml(u.first_name)}!</h1>
        <p>Я твой помощник в мире футбола — собираю статистику, анализирую и даю наиболее вероятные исходы.</p>
      </div>
      ${bonusHtml}
      ${newsHtml}
    </div>`;
}

async function renderMatches() {
  setHeader('Матчи');
  setNav('matches');

  if (!state.matchesCache) {
    const data = await Api.matches();
    state.matchesCache = data.groups;
  }
  const groups = state.matchesCache;

  if (!groups.length) {
    $('#main').innerHTML = `<div class="page empty-state"><div class="icon">⚽</div><p>Матчей пока нет.<br>Загляните позже!</p></div>`;
    return;
  }

  let html = '<div class="page">';
  for (const g of groups) {
    html += `
      <div class="group-header">
        <span class="flag">${g.flag}</span>
        <span>${g.country} — ${g.league}</span>
        <span class="text-muted">(${g.count})</span>
      </div>`;
    for (const m of g.matches) {
      const logos = teamLogosHtml(m.home_logo, m.away_logo, m.name);
      html += `
        <div class="match-row" onclick="openMatch(${m.id})">
          ${m.match_time ? `<span class="match-time">${m.match_time}</span>` : ''}
          <div>
            <div class="match-name">${logos}${escapeHtml(m.name)}</div>
            <div class="match-league">${g.flag} ${escapeHtml(g.league)}</div>
          </div>
        </div>`;
    }
  }
  html += '</div>';
  $('#main').innerHTML = html;
}

function openMatch(id) {
  state.currentMatchId = id;
  navigate('match');
}

// ===== MATCH DETAIL =====
async function renderMatchDetail() {
  setHeader('Матч', false);
  setNav('matches');

  try {
    const m = await Api.match(state.currentMatchId);
    $('#main').innerHTML = `
      <div class="page">
        <button class="back-btn" onclick="goBack()">← Назад</button>
        <div class="detail-header">
          <div class="teams-logos">
            ${m.home_logo ? `<img class="team-logo-lg" src="${escapeAttr(m.home_logo)}" onerror="this.style.display='none'" />` : ''}
            ${m.away_logo ? `<img class="team-logo-lg" src="${escapeAttr(m.away_logo)}" onerror="this.style.display='none'" />` : ''}
          </div>
          <div class="teams">${escapeHtml(m.name)}</div>
          <div class="meta">
            ${m.match_time ? `<span>🕒 ${m.match_time}</span>` : ''}
            <span>${m.flag} ${escapeHtml(m.country)}</span>
            <span>🏆 ${escapeHtml(m.league)}</span>
          </div>
        </div>
        ${m.text
          ? `<div class="prediction-box">${escapeHtml(m.text)}</div>`
          : `<div class="empty-state" style="padding:24px"><p class="text-muted">Прогноз пока не добавлен</p></div>`
        }
        <div class="btn-group">
          <button class="btn ${m.is_favorite ? 'btn-danger' : 'btn-outline'}" onclick="toggleFav(${m.id}, ${m.is_favorite})">
            ${m.is_favorite ? '💔 Убрать' : '⭐ В избранное'}
          </button>
        </div>
      </div>`;
  } catch (e) {
    if (e.message.includes('limit') || e.message.includes('Premium')) {
      $('#main').innerHTML = `
        <div class="page empty-state">
          <div class="icon">🔒</div>
          <p>Лимит матчей исчерпан (3 в день).<br>Купите Premium для безлимитного доступа.</p>
          <button class="btn btn-gold mt-16" onclick="navigate('premium')">Купить Premium</button>
          <button class="btn btn-outline mt-8" onclick="goBack()">Назад</button>
        </div>`;
    } else {
      throw e;
    }
  }
}

async function toggleFav(id, isFav) {
  try {
    if (isFav) {
      await Api.removeFav(id);
      toast('Убрано из избранного');
    } else {
      await Api.addFav(id);
      toast('Добавлено в избранное');
    }
    renderMatchDetail();
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ===== EXPRESS =====
async function renderExpress() {
  setHeader('Экспресс дня');
  setNav('express');

  const data = await Api.express(state.expressPage);
  let html = '<div class="page">';

  // Current express
  if (data.locked) {
    html += `
      <div class="express-card">
        <div class="locked-overlay">
          <div class="lock-icon">🔒</div>
          <p class="fw-600 mb-8">Полный экспресс доступен только по Premium</p>
          <p class="text-muted" style="font-size:13px;margin-bottom:16px">Безлимитные матчи, экспрессы и полная статистика</p>
          <button class="btn btn-gold" onclick="navigate('premium')">Купить Premium — ${state.user.premium_price} ₽</button>
        </div>
      </div>`;
  } else if (data.picks && data.picks.length) {
    html += '<div class="express-card">';
    for (const p of data.picks) {
      html += `
        <div class="express-pick">
          <div class="fw-600">⚽ ${p.name}</div>
          <div class="text-muted" style="font-size:12px;margin-top:2px">${p.flag} ${p.country} — ${p.league}</div>
          <div class="pred">⚡ ${p.prediction}</div>
          <div class="coef">🎯 кф. ${p.coef}</div>
        </div>`;
    }
    html += `<div class="express-total">👑 Общий коэффициент: ${data.total_coef}</div></div>`;
  } else {
    html += `<div class="express-card empty-state" style="padding:32px"><div class="icon">⚡</div><p>Экспресс пока не сформирован.<br>Загляните позже!</p></div>`;
  }

  // Stats
  const s = data.stats;
  html += `
    <div class="section-title">📊 Статистика</div>
    <div class="stat-grid">
      <div class="stat-item"><div class="value">${s.total}</div><div class="label">Всего</div></div>
      <div class="stat-item"><div class="value text-green">${s.wins}</div><div class="label">Заходов</div></div>
      <div class="stat-item"><div class="value">${s.winrate}%</div><div class="label">Винрейт</div></div>
      <div class="stat-item"><div class="value ${s.roi >= 0 ? 'text-green' : ''}">${s.roi > 0 ? '+' : ''}${s.roi}%</div><div class="label">ROI</div></div>
    </div>`;

  // History
  html += `<div class="section-title">📋 Прошедшие прогнозы</div>`;
  if (data.history.length) {
    html += '<div class="card">';
    for (const h of data.history) {
      html += `
        <div class="history-item">
          <div>
            <span class="fw-600">${h.type_label}</span>
            <span class="text-muted"> · ${h.date}</span>
            <div class="text-gold" style="font-size:12px">кф. ${h.coef.toFixed(2)}</div>
          </div>
          <span class="${h.result === 'win' ? 'badge-win' : 'badge-lose'}">${h.result === 'win' ? '✅ Зашёл' : '❌ Мимо'}</span>
        </div>`;
    }
    html += '</div>';
    if (data.total_pages > 1) {
      html += `
        <div class="pagination">
          <button ${data.page === 0 ? 'disabled' : ''} onclick="expressPage(${data.page - 1})">←</button>
          <span class="page-info">${data.page + 1} / ${data.total_pages}</span>
          <button ${data.page >= data.total_pages - 1 ? 'disabled' : ''} onclick="expressPage(${data.page + 1})">→</button>
        </div>`;
    }
  } else {
    html += `<div class="empty-state" style="padding:24px"><p>Прошедших прогнозов пока нет</p></div>`;
  }

  html += '</div>';
  $('#main').innerHTML = html;
}

function expressPage(p) {
  state.expressPage = p;
  renderExpress();
}

// ===== ACCOUNT =====
async function renderAccount() {
  setHeader('Аккаунт');
  setNav('account');
  state.user = await Api.me();
  const u = state.user;
  const photo = u.photo_url
    ? `<img class="avatar-img" src="${escapeAttr(u.photo_url)}" alt="" />`
    : `<div class="avatar">⚽</div>`;

  $('#main').innerHTML = `
    <div class="page">
      <div class="profile-card">
        ${photo}
        <div class="profile-name">${escapeHtml(u.first_name)}</div>
        <div class="profile-id">ID: ${u.user_id}</div>
      </div>
      <div class="card">
        <div class="info-row"><span class="label">Тариф</span><span class="value">${u.subscription === 'Premium' ? '⭐ Premium' : '🆓 Free'}</span></div>
        ${u.subscription === 'Premium' ? `<div class="info-row"><span class="label">Действует до</span><span class="value text-gold">${u.end_date || '—'}</span></div>` : ''}
        <div class="info-row"><span class="label">Матчей сегодня</span><span class="value">${u.matches_left}</span></div>
        <div class="info-row"><span class="label">С нами с</span><span class="value">${u.reg_date || '—'}</span></div>
        <div class="info-row"><span class="label">Дней в проекте</span><span class="value">${u.days_in_project}</span></div>
        <div class="info-row"><span class="label">Пользователей</span><span class="value">${u.total_users}</span></div>
      </div>
      <button class="btn btn-outline" onclick="navigate('favorites')">⭐ Избранное (${u.fav_count})</button>
      <button class="btn btn-outline mt-8" onclick="showRefLink()">🔗 Реферальная ссылка (${u.ref_count})</button>
      <button class="btn btn-outline mt-8" onclick="openChannel()">💬 Чат канала</button>
      ${u.subscription === 'Free'
        ? `<button class="btn btn-gold mt-8" onclick="navigate('premium')">Купить Premium — ${u.premium_price} ₽</button>`
        : `<button class="btn btn-outline mt-8" onclick="toast('Подписка активна до ${u.end_date}')">📋 Информация о подписке</button>`
      }
      <button class="btn btn-outline mt-8" onclick="navigate('support')">✉️ Техподдержка</button>
      ${u.is_admin ? `<button class="btn btn-outline mt-8" onclick="navigate('admin')">🔧 Админ-панель</button>` : ''}
    </div>`;
}

function openChannel() {
  const url = 'https://t.me/koefchat';
  if (tg?.openTelegramLink) tg.openTelegramLink(url);
  else if (tg?.openLink) tg.openLink(url);
  else window.open(url, '_blank');
}

function showRefLink() {
  const link = state.user.ref_link;
  if (tg?.openTelegramLink) {
    // Show share
  }
  if (navigator.clipboard) {
    navigator.clipboard.writeText(link).then(() => toast('Ссылка скопирована!'));
  }
  tg?.showPopup?.({
    title: 'Реферальная ссылка',
    message: `${link}\n\nЗа каждого приглашённого — 3 дня Premium!`,
    buttons: [{ type: 'default', text: 'OK' }],
  }) || alert(`Ваша ссылка:\n${link}\n\nЗа каждого — 3 дня Premium!`);
}

// ===== FAVORITES =====
async function renderFavorites() {
  setHeader('Избранное', false);
  setNav('account');
  const data = await Api.favorites();

  let html = `<div class="page"><button class="back-btn" onclick="goBack()">← Назад</button>`;
  if (!data.items.length) {
    html += `<div class="empty-state"><div class="icon">⭐</div><p>У вас пока нет избранных матчей</p></div>`;
  } else {
    html += '<div class="mt-12">';
    for (const m of data.items) {
      html += `
        <div class="match-row" onclick="openMatch(${m.id})">
          ${m.match_time ? `<span class="match-time">${m.match_time}</span>` : `<span class="match-time">${m.flag}</span>`}
          <div class="match-name">${m.name}</div>
        </div>`;
    }
    html += '</div>';
  }
  html += '</div>';
  $('#main').innerHTML = html;
}

// ===== SUPPORT =====
async function renderSupport() {
  setHeader('Техподдержка', false);
  setNav('account');
  const cats = await Api.supportCats();

  let html = `<div class="page"><button class="back-btn" onclick="goBack()">← Назад</button>
    <p class="text-muted mt-12 mb-8" style="font-size:14px">Выберите категорию обращения:</p>
    <div class="cat-grid">`;
  for (const [key, label] of Object.entries(cats.categories)) {
    const icon = label.split(' ')[0];
    const text = label.split(' ').slice(1).join(' ');
    html += `<button class="cat-btn" onclick="selectSupportCat('${key}')"><span class="icon">${icon}</span>${text}</button>`;
  }
  html += '</div></div>';
  $('#main').innerHTML = html;
}

function selectSupportCat(cat) {
  state.supportCat = cat;
  navigate('supportForm');
}

async function renderSupportForm() {
  setHeader('Написать', false);
  setNav('account');
  $('#main').innerHTML = `
    <div class="page">
      <button class="back-btn" onclick="goBack()">← Назад</button>
      <p class="text-muted mt-12 mb-8" style="font-size:14px">Напишите ваше сообщение:</p>
      <textarea id="supportText" placeholder="Опишите проблему или вопрос..."></textarea>
      <button class="btn btn-primary mt-12" onclick="sendSupport()">Отправить</button>
    </div>`;
}

async function sendSupport() {
  const text = $('#supportText')?.value?.trim();
  if (!text) return toast('Введите сообщение', 'error');
  try {
    await Api.support(state.supportCat, text);
    toast('Сообщение отправлено!');
    navigate('account');
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ===== PREMIUM =====
async function renderPremium() {
  setHeader('Premium', false);
  setNav('account');
  const price = state.user.premium_price;

  $('#main').innerHTML = `
    <div class="page">
      <button class="back-btn" onclick="goBack()">← Назад</button>
      <div class="profile-card mt-12">
        <div style="font-size:40px;margin-bottom:8px">⭐</div>
        <div class="profile-name">Premium</div>
        <p class="text-muted mt-8" style="font-size:13px;line-height:1.5">
          Безлимитные матчи<br>
          Доступ к экспрессам<br>
          Полная статистика
        </p>
        <div class="text-gold fw-600 mt-12" style="font-size:28px">${price} ₽</div>
        <div class="text-muted" style="font-size:12px">на 30 дней</div>
      </div>
      <button class="btn btn-gold" id="payBtn" onclick="startPayment()">💳 Оплатить ${price} ₽</button>
      <p class="text-center text-muted mt-12" style="font-size:12px">Оплата через ЮKassa · Безопасно</p>
    </div>`;
}

async function startPayment() {
  const btn = $('#payBtn');
  btn.disabled = true;
  btn.textContent = 'Создание платежа...';
  try {
    const res = await Api.createPayment();
    if (res.confirmation_url) {
      if (tg?.openLink) {
        tg.openLink(res.confirmation_url);
      } else {
        window.open(res.confirmation_url, '_blank');
      }
      // Poll status
      btn.textContent = 'Проверяем оплату...';
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        try {
          const st = await Api.checkPayment(res.payment_id);
          if (st.status === 'succeeded') {
            clearInterval(poll);
            toast('🎉 Premium активирован!');
            state.user = null; // force refresh
            navigate('account');
          }
        } catch {}
        if (attempts > 40) {
          clearInterval(poll);
          btn.disabled = false;
          btn.textContent = `💳 Оплатить ${state.user.premium_price} ₽`;
          toast('Платёж ещё обрабатывается. Проверьте позже.', 'error');
        }
      }, 3000);
    }
  } catch (e) {
    toast(e.message, 'error');
    btn.disabled = false;
    btn.textContent = `💳 Оплатить ${state.user.premium_price} ₽`;
  }
}

// ===== ADMIN =====
async function renderAdmin() {
  if (!state.user.is_admin) return navigate('home');
  setHeader('Админ', false);
  setNav('account');

  $('#main').innerHTML = `
    <div class="page">
      <button class="back-btn" onclick="goBack()">← Назад</button>
      <div class="admin-section mt-12">
        <h3>Матчи</h3>
        <div class="admin-action" onclick="navigate('adminMatches')"><span class="icon">⚽</span> Управление матчами</div>
        <div class="admin-action" onclick="navigate('adminParser')"><span class="icon">🔍</span> Парсер матчей</div>
      </div>
      <div class="admin-section">
        <h3>Новости</h3>
        <div class="admin-action" onclick="navigate('adminNews')"><span class="icon">📰</span> Добавить / управление новостями</div>
      </div>
      <div class="admin-section">
        <h3>Экспресс</h3>
        <div class="admin-action" onclick="navigate('adminExpress')"><span class="icon">⚡</span> Экспресс дня</div>
      </div>
      <div class="admin-section">
        <h3>Подписки</h3>
        <div class="admin-action" onclick="navigate('adminPremium')"><span class="icon">⭐</span> Управление Premium</div>
      </div>
      <div class="admin-section">
        <h3>Поддержка</h3>
        <div class="admin-action" onclick="navigate('adminSupport')"><span class="icon">✉️</span> Сообщения поддержки</div>
      </div>
      <div class="admin-section">
        <h3>Система</h3>
        <div class="admin-action" onclick="navigate('adminLogs')"><span class="icon">📋</span> Логи админа</div>
      </div>
    </div>`;
}

async function renderAdminMatches() {
  setHeader('Матчи (админ)', false);
  const data = await Api.adminMatches();

  let html = `<div class="page"><button class="back-btn" onclick="goBack()">← Назад</button>
    <button class="btn btn-primary mt-12" onclick="showAddMatchForm()">➕ Добавить матч</button>
    <button class="btn btn-danger mt-8" onclick="clearAllMatches()">🗑 Очистить все</button>
    <div class="section-title">Все матчи (${data.items.length})</div>`;

  for (const m of data.items) {
    const hasText = m.text && m.text.trim();
    html += `
      <div class="card" style="padding:12px">
        <div class="card-title" style="font-size:14px">${m.name}</div>
        <div class="card-sub">${m.country} · ${m.league} ${m.match_time ? '· ' + m.match_time : ''}</div>
        <div class="btn-group mt-8">
          <button class="btn btn-sm btn-outline" onclick="editMatchText(${m.id}, '${escapeAttr(m.name)}')">${hasText ? '✏️ Текст' : '📝 Добавить текст'}</button>
          <button class="btn btn-sm btn-danger" onclick="deleteMatch(${m.id})">🗑</button>
        </div>
      </div>`;
  }
  html += '</div>';
  $('#main').innerHTML = html;
}

function showAddMatchForm() {
  $('#main').innerHTML = `
    <div class="page">
      <button class="back-btn" onclick="navigate('adminMatches')">← Назад</button>
      <div class="section-title">Новый матч</div>
      <input type="text" id="mName" placeholder="Команды (Спартак — Зенит)" style="min-height:auto;margin-bottom:8px" />
      <input type="text" id="mCountry" placeholder="Страна" style="min-height:auto;margin-bottom:8px" />
      <input type="text" id="mLeague" placeholder="Лига" style="min-height:auto;margin-bottom:8px" />
      <input type="text" id="mTime" placeholder="Время (18:30) или -" style="min-height:auto;margin-bottom:8px" />
      <textarea id="mText" placeholder="Текст прогноза (можно пусто)"></textarea>
      <button class="btn btn-primary mt-12" onclick="submitMatch()">Сохранить</button>
    </div>`;
}

async function submitMatch() {
  const name = $('#mName')?.value?.trim();
  const country = $('#mCountry')?.value?.trim();
  const league = $('#mLeague')?.value?.trim();
  let time = $('#mTime')?.value?.trim() || '';
  if (time === '-') time = '';
  const text = $('#mText')?.value?.trim() || '';
  if (!name || !country || !league) return toast('Заполните обязательные поля', 'error');
  try {
    await Api.adminCreateMatch({ name, country, league, match_time: time, text });
    toast('Матч добавлен!');
    state.matchesCache = null;
    navigate('adminMatches');
  } catch (e) { toast(e.message, 'error'); }
}

function editMatchText(id, name) {
  $('#main').innerHTML = `
    <div class="page">
      <button class="back-btn" onclick="navigate('adminMatches')">← Назад</button>
      <p class="mt-12 fw-600">${name}</p>
      <textarea id="editText" placeholder="Текст прогноза..." class="mt-8"></textarea>
      <button class="btn btn-primary mt-12" onclick="saveMatchText(${id})">Сохранить</button>
    </div>`;
}

async function saveMatchText(id) {
  const text = $('#editText')?.value?.trim();
  if (!text) return toast('Введите текст', 'error');
  try {
    await Api.adminSetText(id, text);
    toast('Текст сохранён!');
    navigate('adminMatches');
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteMatch(id) {
  if (!confirm('Удалить матч?')) return;
  try {
    await Api.adminDeleteMatch(id);
    toast('Удалён');
    state.matchesCache = null;
    renderAdminMatches();
  } catch (e) { toast(e.message, 'error'); }
}

async function clearAllMatches() {
  if (!confirm('Удалить ВСЕ матчи?')) return;
  try {
    await Api.adminClearMatches();
    toast('Все матчи удалены');
    state.matchesCache = null;
    renderAdminMatches();
  } catch (e) { toast(e.message, 'error'); }
}

async function renderAdminExpress() {
  setHeader('Экспресс (админ)', false);
  const data = await Api.adminExpress();

  let html = `<div class="page"><button class="back-btn" onclick="goBack()">← Назад</button>`;
  if (data.picks.length) {
    html += '<div class="express-card mt-12">';
    for (const p of data.picks) {
      html += `<div class="express-pick"><div class="fw-600">${p.name}</div>
        <div class="pred">${p.prediction} · кф. ${p.coef}</div></div>`;
    }
    html += '</div>';
  } else {
    html += `<div class="empty-state mt-12"><p>Экспресс пуст</p></div>`;
  }

  html += `
    <button class="btn btn-primary mt-12" onclick="showAddExpressForm()">➕ Добавить матч</button>
    <button class="btn btn-danger mt-8" onclick="clearExpress()">🗑 Очистить экспресс</button>
    <button class="btn btn-outline mt-8" onclick="showResultForm()">📝 Ввести результат</button>
    <div class="section-title">Статистика</div>
    <div class="stat-grid">
      <div class="stat-item"><div class="value">${data.stats.total}</div><div class="label">Всего</div></div>
      <div class="stat-item"><div class="value">${data.stats.winrate}%</div><div class="label">Винрейт</div></div>
      <div class="stat-item"><div class="value">${data.stats.roi}%</div><div class="label">ROI</div></div>
      <div class="stat-item"><div class="value">${data.stats.profit}</div><div class="label">Профит</div></div>
    </div></div>`;
  $('#main').innerHTML = html;
}

function showAddExpressForm() {
  // Need match list
  Api.adminMatches().then(data => {
    let opts = data.items.map(m =>
      `<div class="match-row" onclick="selectExpressMatch(${m.id}, '${escapeAttr(m.name)}')">
        <div class="match-name">${m.name}</div>
      </div>`
    ).join('');
    $('#main').innerHTML = `
      <div class="page">
        <button class="back-btn" onclick="navigate('adminExpress')">← Назад</button>
        <div class="section-title">Выберите матч</div>
        ${opts || '<p class="text-muted">Нет матчей</p>'}
      </div>`;
  });
}

function selectExpressMatch(id, name) {
  $('#main').innerHTML = `
    <div class="page">
      <button class="back-btn" onclick="navigate('adminExpress')">← Назад</button>
      <p class="mt-12 fw-600">${name}</p>
      <input type="text" id="exPred" placeholder="Прогноз (П1 / ТБ 2.5)" style="min-height:auto;margin:8px 0" />
      <input type="text" id="exCoef" placeholder="Коэффициент (1.85)" style="min-height:auto;margin-bottom:8px" />
      <button class="btn btn-primary" onclick="submitExpress(${id})">Добавить</button>
    </div>`;
}

async function submitExpress(matchId) {
  const prediction = $('#exPred')?.value?.trim();
  const coef = $('#exCoef')?.value?.trim();
  if (!prediction || !coef) return toast('Заполните поля', 'error');
  try {
    await Api.adminAddExpress({ match_id: matchId, prediction, coef });
    toast('Добавлено в экспресс!');
    navigate('adminExpress');
  } catch (e) { toast(e.message, 'error'); }
}

async function clearExpress() {
  if (!confirm('Очистить экспресс?')) return;
  try {
    await Api.adminClearExpress();
    toast('Очищен');
    renderAdminExpress();
  } catch (e) { toast(e.message, 'error'); }
}

function showResultForm() {
  $('#main').innerHTML = `
    <div class="page">
      <button class="back-btn" onclick="navigate('adminExpress')">← Назад</button>
      <div class="section-title">Результат экспресса</div>
      <div class="btn-group">
        <button class="btn btn-outline" onclick="resultType='double';showCoefInputs(2)">Двойник</button>
        <button class="btn btn-outline" onclick="resultType='triple';showCoefInputs(3)">Тройник</button>
      </div>
    </div>`;
}

let resultType = 'double';
function showCoefInputs(n) {
  let inputs = '';
  for (let i = 0; i < n; i++) {
    inputs += `<input type="text" id="coef${i}" placeholder="Кф. ${i + 1}" style="min-height:auto;margin-bottom:8px" />`;
  }
  $('#main').innerHTML = `
    <div class="page">
      <button class="back-btn" onclick="showResultForm()">← Назад</button>
      <div class="section-title">Коэффициенты</div>
      ${inputs}
      <div class="btn-group mt-12">
        <button class="btn btn-primary" onclick="submitResult('win')">✅ Зашёл</button>
        <button class="btn btn-danger" onclick="submitResult('lose')">❌ Мимо</button>
      </div>
    </div>`;
}

async function submitResult(result) {
  const n = resultType === 'double' ? 2 : 3;
  const coefs = [];
  for (let i = 0; i < n; i++) {
    const v = parseFloat($(`#coef${i}`)?.value?.replace(',', '.'));
    if (!v || v <= 1) return toast('Некорректные коэффициенты', 'error');
    coefs.push(v);
  }
  try {
    await Api.adminAddResult({ type: resultType, coefs, result });
    toast('Результат сохранён!');
    navigate('adminExpress');
  } catch (e) { toast(e.message, 'error'); }
}

async function renderAdminPremium() {
  setHeader('Premium (админ)', false);
  $('#main').innerHTML = `
    <div class="page">
      <button class="back-btn" onclick="goBack()">← Назад</button>
      <div class="section-title">Выдать Premium</div>
      <input type="text" id="premUid" placeholder="User ID" style="min-height:auto;margin-bottom:8px" />
      <input type="text" id="premDays" placeholder="Дней (30)" style="min-height:auto;margin-bottom:8px" value="30" />
      <button class="btn btn-primary" onclick="grantPrem()">⭐ Выдать</button>
      <div class="section-title">Снять Premium</div>
      <input type="text" id="revUid" placeholder="User ID" style="min-height:auto;margin-bottom:8px" />
      <button class="btn btn-danger" onclick="revokePrem()">🚫 Снять</button>
    </div>`;
}

async function grantPrem() {
  const uid = parseInt($('#premUid')?.value);
  const days = parseInt($('#premDays')?.value) || 30;
  if (!uid) return toast('Введите ID', 'error');
  try {
    await Api.adminGrantPremium(uid, days);
    toast(`Premium выдан на ${days} дн.`);
  } catch (e) { toast(e.message, 'error'); }
}

async function revokePrem() {
  const uid = parseInt($('#revUid')?.value);
  if (!uid) return toast('Введите ID', 'error');
  try {
    await Api.adminRevokePremium(uid);
    toast('Premium снят');
  } catch (e) { toast(e.message, 'error'); }
}

async function renderAdminSupport() {
  setHeader('Поддержка', false);
  const data = await Api.adminSupport();
  let html = `<div class="page"><button class="back-btn" onclick="goBack()">← Назад</button>
    <div class="section-title">Обращения (${data.threads.length})</div>`;
  if (!data.threads.length) {
    html += `<div class="empty-state"><p>Сообщений нет</p></div>`;
  } else {
    for (const t of data.threads) {
      html += `
        <div class="card card-clickable" onclick="openThread(${t.thread_id})">
          <div class="card-title" style="font-size:14px">${t.category}</div>
          <div class="card-sub">${t.user_name} · ${t.created_at}</div>
        </div>`;
    }
  }
  html += '</div>';
  $('#main').innerHTML = html;
}

async function openThread(tid) {
  const data = await Api.adminSupportThread(tid);
  let html = `<div class="page"><button class="back-btn" onclick="navigate('adminSupport')">← Назад</button>
    <div class="card mt-12">`;
  for (const m of data.messages) {
    const who = m.sender === 'user' ? '👤 Пользователь' : '🏢 Админ';
    html += `<div style="margin-bottom:12px"><div class="text-muted" style="font-size:11px">[${m.created_at}] ${who}</div>
      <div style="font-size:14px;margin-top:2px">${escapeHtml(m.text)}</div></div>`;
  }
  html += `</div>
    <textarea id="replyText" placeholder="Ответ..." class="mt-8"></textarea>
    <button class="btn btn-primary mt-8" onclick="sendReply(${tid})">Отправить ответ</button>
  </div>`;
  $('#main').innerHTML = html;
}

async function sendReply(tid) {
  const text = $('#replyText')?.value?.trim();
  if (!text) return toast('Введите ответ', 'error');
  try {
    await Api.adminReply(tid, text);
    toast('Ответ отправлен');
    openThread(tid);
  } catch (e) { toast(e.message, 'error'); }
}

async function renderAdminLogs() {
  setHeader('Логи', false);
  const data = await Api.adminLogs();
  let html = `<div class="page"><button class="back-btn" onclick="goBack()">← Назад</button>
    <div class="section-title">Последние действия</div><div class="card">`;
  if (!data.logs.length) {
    html += '<p class="text-muted">Логов нет</p>';
  } else {
    for (const l of data.logs) {
      html += `<div class="history-item"><div><span class="fw-600">${l.action}</span>
        <span class="text-muted"> · ${l.details || ''}</span>
        <div class="text-muted" style="font-size:11px">${l.created_at}</div></div></div>`;
    }
  }
  html += '</div></div>';
  $('#main').innerHTML = html;
}

// ---------- Utils ----------
function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escapeAttr(s) {
  return String(s).replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

// ---------- Boot ----------
async function boot() {
  showLoader();
  try {
    // Handle start param (referral)
    let referrer = null;
    const startParam = tg?.initDataUnsafe?.start_param;
    if (startParam && startParam.startsWith('ref_')) {
      referrer = parseInt(startParam.replace('ref_', ''));
    }

    const startRes = await Api.start(referrer);
    if (startRes.is_new && startRes.bonus_end) {
      state.welcomeBonus = startRes.bonus_end;
    }

    state.user = await Api.me();
    navigate('home', false);
  } catch (e) {
    console.error('Boot error:', e);
    $('#main').innerHTML = `
      <div class="empty-state">
        <div class="icon">⚽</div>
        <p style="margin-bottom:8px"><b>Не удалось загрузить</b></p>
        <p style="font-size:13px;color:#8b9bb4;word-break:break-word">${escapeHtml(e.message || String(e))}</p>
        <p style="font-size:12px;color:#5a6a82;margin-top:12px">Проверьте, что сервер запущен и BOT_TOKEN задан</p>
        <button class="btn btn-primary mt-16" onclick="location.reload()">Повторить</button>
      </div>`;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
