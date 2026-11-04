const express = require('express');
const crypto = require('node:crypto');
const path = require('node:path');

// Settings come from a local .env file, which is kept out of Git.
// Real environment variables take priority over the file.
try { process.loadEnvFile(path.join(__dirname, '.env')); } catch { /* no .env file */ }

const db = require('./db');

const PORT = process.env.PORT || 8080;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) {
  console.error('\n  ADMIN_PASSWORD is not set.');
  console.error('  Copy .env.example to .env, put your admin password in it, then run npm start again.\n');
  process.exit(1);
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '20kb' }));
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  });
  next();
});
app.use(express.static(path.join(__dirname, 'public')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// ---------- helpers ----------
const clean = (v, max) => String(v ?? '').trim().slice(0, max);
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const safeEqual = (a, b) => {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
};

// Tiny in-memory rate limiter (per IP, per bucket).
const hits = new Map();
const limit = (bucket, max, windowMs) => (req, res, next) => {
  const key = `${bucket}:${req.ip}`;
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (recent.length >= max) return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  recent.push(now);
  hits.set(key, recent);
  next();
};
setInterval(() => hits.clear(), 60 * 60 * 1000).unref();

// ---------- public API ----------
app.get('/api/announcements', (req, res) => {
  res.json(db.prepare('SELECT id, title, body, created_at FROM announcements ORDER BY id DESC LIMIT 20').all());
});

app.get('/api/events', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  res.json(
    db.prepare('SELECT id, title, description, location, event_date FROM events WHERE event_date >= ? ORDER BY event_date ASC LIMIT 20').all(today)
  );
});

app.get('/api/officials', (req, res) => {
  res.json(db.prepare('SELECT id, name, position, committee FROM officials ORDER BY sort_order ASC, id ASC').all());
});

app.post('/api/messages', limit('msg', 5, 60 * 60 * 1000), (req, res) => {
  const name = clean(req.body.name, 100);
  const email = clean(req.body.email, 150);
  const message = clean(req.body.message, 2000);
  // Honeypot: real people leave this empty.
  if (req.body.website) return res.json({ ok: true });
  if (!name || !isEmail(email) || message.length < 5) {
    return res.status(400).json({ error: 'Please enter your name, a valid email, and a message.' });
  }
  db.prepare('INSERT INTO messages (name, email, message) VALUES (?, ?, ?)').run(name, email, message);
  res.status(201).json({ ok: true });
});

// ---------- admin ----------
const sessions = new Map(); // token -> expiry
const SESSION_MS = 8 * 60 * 60 * 1000;

app.post('/api/admin/login', limit('login', 8, 15 * 60 * 1000), (req, res) => {
  if (!safeEqual(String(req.body.password ?? ''), ADMIN_PASSWORD)) {
    return res.status(401).json({ error: 'Incorrect password.' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_MS);
  res.json({ token });
});

const requireAdmin = (req, res, next) => {
  const token = (req.get('authorization') || '').replace(/^Bearer /, '');
  const exp = sessions.get(token);
  if (!exp || exp < Date.now()) {
    sessions.delete(token);
    return res.status(401).json({ error: 'Please log in again.' });
  }
  next();
};

app.post('/api/admin/logout', requireAdmin, (req, res) => {
  sessions.delete((req.get('authorization') || '').replace(/^Bearer /, ''));
  res.json({ ok: true });
});

app.post('/api/admin/announcements', requireAdmin, (req, res) => {
  const title = clean(req.body.title, 150);
  const body = clean(req.body.body, 3000);
  if (!title || !body) return res.status(400).json({ error: 'Title and body are required.' });
  const r = db.prepare('INSERT INTO announcements (title, body) VALUES (?, ?)').run(title, body);
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});
app.delete('/api/admin/announcements/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM announcements WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

app.post('/api/admin/events', requireAdmin, (req, res) => {
  const title = clean(req.body.title, 150);
  const description = clean(req.body.description, 1000);
  const location = clean(req.body.location, 150);
  const event_date = clean(req.body.event_date, 10);
  if (!title || !isDate(event_date)) return res.status(400).json({ error: 'Title and a valid date are required.' });
  const r = db.prepare('INSERT INTO events (title, description, location, event_date) VALUES (?, ?, ?, ?)').run(title, description, location, event_date);
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});
app.delete('/api/admin/events/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM events WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

app.post('/api/admin/officials', requireAdmin, (req, res) => {
  const name = clean(req.body.name, 100);
  const position = clean(req.body.position, 100);
  const committee = clean(req.body.committee, 100);
  if (!name || !position) return res.status(400).json({ error: 'Name and position are required.' });
  const max = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM officials').get().m;
  const r = db.prepare('INSERT INTO officials (name, position, committee, sort_order) VALUES (?, ?, ?, ?)').run(name, position, committee, max + 1);
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});
app.put('/api/admin/officials/:id', requireAdmin, (req, res) => {
  const name = clean(req.body.name, 100);
  const position = clean(req.body.position, 100);
  const committee = clean(req.body.committee, 100);
  if (!name || !position) return res.status(400).json({ error: 'Name and position are required.' });
  db.prepare('UPDATE officials SET name = ?, position = ?, committee = ? WHERE id = ?').run(name, position, committee, Number(req.params.id));
  res.json({ ok: true });
});
app.delete('/api/admin/officials/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM officials WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

app.get('/api/admin/messages', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT id, name, email, message, created_at FROM messages ORDER BY id DESC LIMIT 200').all());
});
app.delete('/api/admin/messages/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM messages WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.status === 400 ? 'Bad request' : 'Something went wrong.' });
});

app.listen(PORT, () => console.log(`SK Gaban site running at http://localhost:${PORT}`));
