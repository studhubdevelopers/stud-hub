// Раздел «Профили»: каталог студентов с поиском.
// Supabase: функция list_profiles (supabase/people.sql), запасной путь — chat_find_profiles / public_profiles.
// Без Supabase: аккаунты, зарегистрированные на этом устройстве.
let peopleRows = [], peopleQuery = '', peopleTimer = null, peopleReq = 0, peopleLimit = 24, peopleCanMore = false, peopleLoading = false;

function peopleOpen() {
  peopleLimit = 24;
  const inp = document.getElementById('peopleSearch'); if (inp) inp.value = peopleQuery;
  peopleLoad();
}
function peopleSearchInput(v) {
  peopleQuery = v;
  clearTimeout(peopleTimer);
  peopleTimer = setTimeout(() => { peopleLimit = 24; peopleLoad(); }, 250);
}
function peopleMore() { peopleLimit += 24; peopleLoad(); }

async function peopleFetch(q, limit) {
  const clean = String(q || '').trim().replace(/^@/, '').replace(/[%_\\]/g, '');
  if (typeof BACKEND !== 'undefined' && BACKEND && typeof sb !== 'undefined' && sb) {
    const me = activeUserId();
    const r = await sb.rpc('list_profiles', { q: clean, lim: limit + 1 });
    if (!r.error) return { rows: r.data || [], total: null };
    const f = await sbFindProfiles(clean, Math.min(limit, 20));       // без people.sql — максимум 20 человек
    return { rows: (f.rows || []).filter(x => x.id !== me), error: f.error, limited: true };
  }
  const me = activeUserId(), cu = getCurrentUser();
  const rows = getAccounts().filter(a => a.id !== me).map(a => ({ id: a.id, name: a.name, username: a.username || '', subtitle: '', city: '', created_at: new Date(a.createdAt || Date.now()).toISOString() }));
  const k = clean.toLowerCase();
  return { rows: rows.filter(x => !k || (x.name || '').toLowerCase().includes(k) || (x.username || '').toLowerCase().includes(k)).slice(0, limit + 1) };
}

async function peopleLoad() {
  const grid = document.getElementById('peopleGrid'); if (!grid) return;
  const req = ++peopleReq;
  if (!peopleRows.length) grid.innerHTML = '<div class="people-empty">Загружаем профили…</div>';
  peopleLoading = true;
  let res;
  try { res = await peopleFetch(peopleQuery, peopleLimit); } catch (e) { res = { rows: [], error: e }; }
  if (req !== peopleReq) return;
  peopleLoading = false;
  peopleCanMore = !res.limited && res.rows.length > peopleLimit;
  peopleRows = res.rows.slice(0, peopleLimit);
  peopleRender(res.error);
}

function peopleCard(p, i) {
  const ini = getInitials(p.name || p.username || '?');
  const av = p.avatar_url ? `<div class="people-ava" style="background-image:url('${String(p.avatar_url).replace(/['"\\()]/g, '')}')"></div>` : `<div class="people-ava">${escapeHtml(ini)}</div>`;
  const sub = [p.subtitle, (p.city && !String(p.subtitle || '').includes(p.city)) ? p.city : ''].filter(Boolean).join(' · ');
  return `<article class="people-card">
<div class="people-top">${av}<div class="people-id"><div class="people-name">${escapeHtml(p.name || 'Студент')}</div><div class="people-user">${p.username ? '@' + escapeHtml(p.username) : ''}</div></div></div>
<div class="people-sub">${escapeHtml(sub || 'Студент')}</div>
${p.bio ? `<p class="people-bio">${escapeHtml(p.bio)}</p>` : ''}
<div class="people-actions"><button class="btn-submit" onclick="peopleOpenProfile(${i})">Профиль</button><button class="btn-cancel" onclick="peopleWrite(${i})">Написать</button></div></article>`;
}
function peopleRender(error) {
  const grid = document.getElementById('peopleGrid'), more = document.getElementById('peopleMore'); if (!grid) return;
  if (error && !peopleRows.length) grid.innerHTML = '<div class="people-empty">Не удалось загрузить профили. Проверьте соединение и попробуйте ещё раз.</div>';
  else if (!peopleRows.length) grid.innerHTML = `<div class="people-empty">${peopleQuery.trim() ? 'Никого не нашли по запросу «' + escapeHtml(peopleQuery.trim()) + '».' : 'Пока здесь никого нет. Пригласите друзей на StudHub.'}</div>`;
  else grid.innerHTML = peopleRows.map(peopleCard).join('');
  if (more) more.innerHTML = peopleCanMore ? '<button class="btn-cancel" onclick="peopleMore()">Показать ещё</button>' : '';
}
function peopleOpenProfile(i) { const p = peopleRows[i]; if (p) openPublicProfile(p); }
function peopleWrite(i) {
  const p = peopleRows[i]; if (!p) return;
  if (typeof sbOnlineMode === 'function' && sbOnlineMode()) { sbAddPeer(sbPeerFromRow(p)); openChat(p.id); }
  else showToast('Личные сообщения доступны после подключения к базе', 'error');
}
