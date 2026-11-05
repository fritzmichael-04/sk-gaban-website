(() => {
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const fmt = (iso) => new Date(iso.replace(' ', 'T') + (iso.length > 10 ? 'Z' : 'T00:00:00')).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });

  // Token lives in sessionStorage so it clears when the tab closes.
  let token = null;
  try { token = sessionStorage.getItem('sk_token'); } catch {}

  async function api(method, url, body) {
    const r = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && token) { signOut(); }
    if (!r.ok) throw new Error(j.error || 'Request failed.');
    return j;
  }

  const say = (msg, ok) => {
    const s = $('appStatus');
    s.className = 'status ' + (ok ? 'ok' : 'err');
    s.textContent = msg;
    if (ok) setTimeout(() => { if (s.textContent === msg) s.textContent = ''; }, 3000);
  };
  const guard = (fn) => async (...a) => { try { await fn(...a); } catch (e) { say(e.message, false); } };

  function showApp(on) {
    $('loginView').hidden = on;
    $('appView').hidden = !on;
    if (on) loadAll();
  }
  function signOut() {
    token = null;
    try { sessionStorage.removeItem('sk_token'); } catch {}
    showApp(false);
  }

  // Login
  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('loginStatus').textContent = '';
    try {
      const j = await api('POST', '/api/admin/login', { password: $('pw').value });
      token = j.token;
      try { sessionStorage.setItem('sk_token', token); } catch {}
      $('pw').value = '';
      showApp(true);
    } catch (err) { $('loginStatus').textContent = err.message; }
  });
  $('logoutBtn').addEventListener('click', async () => { try { await api('POST', '/api/admin/logout'); } catch {} signOut(); });

  // Tabs
  document.querySelectorAll('.tab').forEach((t) =>
    t.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === t));
      document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === 'panel-' + t.dataset.tab));
    })
  );

  const render = (container, rows, build, empty) => {
    container.replaceChildren();
    if (!rows.length) return container.append(el('p', 'empty', empty));
    rows.forEach((r) => container.append(build(r)));
  };
  const btn = (label, fn, danger) => {
    const b = el('button', 'mini' + (danger ? ' danger' : ''), label);
    b.type = 'button';
    b.addEventListener('click', guard(fn));
    return b;
  };
  const confirmDel = (what) => window.confirm(`Delete this ${what}? This cannot be undone.`);

  // Announcements
  async function loadAnn() {
    const rows = await (await fetch('/api/announcements')).json();
    render($('annList'), rows, (a) => {
      const row = el('div', 'row');
      const info = el('div');
      info.append(el('div', 'meta', fmt(a.created_at)), el('h3', '', a.title), el('p', '', a.body));
      const act = el('div', 'actions');
      act.append(btn('Delete', async () => { if (confirmDel('announcement')) { await api('DELETE', `/api/admin/announcements/${a.id}`); await loadAnn(); } }, true));
      row.append(info, act);
      return row;
    }, 'No announcements yet.');
  }
  $('annForm').addEventListener('submit', guard(async (e) => {
    e.preventDefault();
    await api('POST', '/api/admin/announcements', { title: $('annTitle').value, body: $('annBody').value });
    e.target.reset();
    say('Announcement posted.', true);
    await loadAnn();
  }));

  // Events
  async function loadEv() {
    const rows = await (await fetch('/api/events')).json();
    render($('evList'), rows, (ev) => {
      const row = el('div', 'row');
      const info = el('div');
      info.append(el('div', 'meta', fmt(ev.event_date) + (ev.location ? ' · ' + ev.location : '')), el('h3', '', ev.title));
      if (ev.description) info.append(el('p', '', ev.description));
      const act = el('div', 'actions');
      act.append(btn('Delete', async () => { if (confirmDel('event')) { await api('DELETE', `/api/admin/events/${ev.id}`); await loadEv(); } }, true));
      row.append(info, act);
      return row;
    }, 'No upcoming events. Past events are hidden automatically.');
  }
  $('evForm').addEventListener('submit', guard(async (e) => {
    e.preventDefault();
    await api('POST', '/api/admin/events', {
      title: $('evTitle').value, event_date: $('evDate').value, location: $('evLoc').value, description: $('evDesc').value,
    });
    e.target.reset();
    say('Event added.', true);
    await loadEv();
  }));

  // Officials
  const resetOff = () => { $('offForm').reset(); $('offId').value = ''; $('offSubmit').textContent = 'Add official'; $('offCancel').hidden = true; };
  async function loadOff() {
    const rows = await (await fetch('/api/officials')).json();
    render($('offList'), rows, (o) => {
      const row = el('div', 'row');
      const info = el('div');
      info.append(el('div', 'meta', o.position), el('h3', '', o.name));
      if (o.committee) info.append(el('p', '', o.committee));
      const act = el('div', 'actions');
      act.append(
        btn('Edit', async () => {
          $('offId').value = o.id; $('offName').value = o.name; $('offPos').value = o.position; $('offCom').value = o.committee;
          $('offSubmit').textContent = 'Save changes'; $('offCancel').hidden = false;
          $('offName').focus();
        }),
        btn('Delete', async () => { if (confirmDel('official')) { await api('DELETE', `/api/admin/officials/${o.id}`); await loadOff(); } }, true)
      );
      row.append(info, act);
      return row;
    }, 'No officials yet.');
  }
  $('offCancel').addEventListener('click', resetOff);
  $('offForm').addEventListener('submit', guard(async (e) => {
    e.preventDefault();
    const body = { name: $('offName').value, position: $('offPos').value, committee: $('offCom').value };
    const id = $('offId').value;
    await api(id ? 'PUT' : 'POST', id ? `/api/admin/officials/${id}` : '/api/admin/officials', body);
    resetOff();
    say(id ? 'Official updated.' : 'Official added.', true);
    await loadOff();
  }));

  // Messages
  async function loadMsg() {
    const rows = await api('GET', '/api/admin/messages');
    render($('msgList'), rows, (m) => {
      const row = el('div', 'row');
      const info = el('div');
      const mail = el('a', '', m.email);
      mail.href = 'mailto:' + encodeURIComponent(m.email).replace('%40', '@');
      const meta = el('div', 'meta', fmt(m.created_at) + ' · ');
      meta.append(mail);
      info.append(meta, el('h3', '', m.name), el('p', '', m.message));
      const act = el('div', 'actions');
      act.append(btn('Delete', async () => { if (confirmDel('message')) { await api('DELETE', `/api/admin/messages/${m.id}`); await loadMsg(); } }, true));
      row.append(info, act);
      return row;
    }, 'No messages yet.');
  }

  const loadAll = guard(async () => { await Promise.all([loadAnn(), loadEv(), loadOff(), loadMsg()]); });

  window.__adminReady = true;
  showApp(Boolean(token));
})();
