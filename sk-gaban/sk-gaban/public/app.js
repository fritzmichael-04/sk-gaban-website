(() => {
  const $ = (id) => document.getElementById(id);

  // Build DOM safely: all text goes through textContent, never innerHTML.
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };

  const fmtDate = (iso) =>
    new Date(iso.replace(' ', 'T') + (iso.length > 10 ? 'Z' : 'T00:00:00')).toLocaleDateString('en-PH', {
      year: 'numeric', month: 'short', day: 'numeric',
    });

  const get = (url) => fetch(url).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });

  function fill(container, items, build, emptyText) {
    container.replaceChildren();
    if (!items.length) return container.append(el('p', 'empty', emptyText));
    items.forEach((i) => container.append(build(i)));
  }

  function fail(container, what) {
    container.replaceChildren(el('p', 'empty', `We could not load ${what} right now. Please try again later.`));
  }

  // Announcements
  get('/api/announcements')
    .then((rows) =>
      fill($('announcementList'), rows, (a) => {
        const post = el('article', 'post');
        post.append(el('time', '', fmtDate(a.created_at)));
        const body = el('div');
        body.append(el('h3', '', a.title), el('p', '', a.body));
        post.append(body);
        return post;
      }, 'No announcements yet. Please check back soon.')
    )
    .catch(() => fail($('announcementList'), 'announcements'));

  // Events
  get('/api/events')
    .then((rows) =>
      fill($('eventList'), rows, (e) => {
        const d = new Date(e.event_date + 'T00:00:00');
        const card = el('article', 'card event');
        const chip = el('div', 'date-chip');
        chip.append(el('b', '', String(d.getDate())), el('span', '', d.toLocaleDateString('en-PH', { month: 'short' })));
        const info = el('div');
        info.append(el('h3', '', e.title));
        if (e.description) info.append(el('p', '', e.description));
        if (e.location) info.append(el('div', 'where', e.location));
        card.append(chip, info);
        return card;
      }, 'No upcoming events right now.')
    )
    .catch(() => fail($('eventList'), 'events'));

  // Officials
  // Initials = first and last name, skipping titles such as "Hon." or "Ms."
  const initials = (name) => {
    const w = name.replace(/^(hon|ms|mr|mrs|dr|engr|atty)\.?\s+/i, '').split(/\s+/).filter(Boolean);
    if (!w.length) return '';
    return (w[0][0] + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase();
  };
  get('/api/officials')
    .then((rows) =>
      fill($('officialList'), rows, (o) => {
        const card = el('article', 'card official');
        card.append(el('div', 'avatar', initials(o.name) || 'SK'), el('h3', '', o.name), el('div', 'role', o.position));
        if (o.committee) card.append(el('p', 'committee', o.committee));
        return card;
      }, 'Officials will be listed here soon.')
    )
    .catch(() => fail($('officialList'), 'officials'));

  // Contact form
  const form = $('contactForm');
  const status = $('formStatus');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    status.className = 'status';
    status.textContent = '';
    const data = Object.fromEntries(new FormData(form));
    if (!data.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email) || data.message.trim().length < 5) {
      status.classList.add('err');
      status.textContent = 'Please enter your name, a valid email, and a message.';
      return;
    }
    const btn = $('sendBtn');
    btn.disabled = true;
    try {
      const r = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Something went wrong.');
      form.reset();
      status.classList.add('ok');
      status.textContent = 'Thank you! Your message has been sent to the SK.';
    } catch (err) {
      status.classList.add('err');
      status.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });

  // Mobile menu
  const btn = $('menuBtn');
  const list = $('navList');
  btn.addEventListener('click', () => {
    const open = list.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(open));
  });
  list.addEventListener('click', (e) => {
    if (e.target.tagName === 'A') { list.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); }
  });

  $('year').textContent = new Date().getFullYear();
})();
