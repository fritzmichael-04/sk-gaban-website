const express = require('express');
const crypto = require('node:crypto');
const path = require('node:path');

// Load .env for local development. Vercel supplies environment variables itself.
try { process.loadEnvFile(path.join(__dirname, '.env')); } catch { /* optional */ }

const { pool, initDb } = require('./db');
const PORT = process.env.PORT || 8080;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) {
  throw new Error('ADMIN_PASSWORD is not set. Configure it in your local .env file and in Vercel Environment Variables.');
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '20kb' }));
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  });
  next();
});

// Initialize schema/seeds once per warm serverless instance before API requests.
app.use(async (req, res, next) => {
  try { await initDb(); next(); }
  catch (error) {
    console.error('Database initialization failed:', error);
    res.status(500).json({ error: 'Database connection failed. Check DATABASE_URL in Vercel.' });
  }
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

const clean = (v, max) => String(v ?? '').trim().slice(0, max);
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const safeEqual = (a, b) => {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
};

// Lightweight per-instance rate limiter. For high traffic, use a shared store.
const hits = new Map();
const limit = (bucket, max, windowMs) => (req, res, next) => {
  const key = `${bucket}:${req.ip}`;
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((time) => now - time < windowMs);
  if (recent.length >= max) return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  recent.push(now);
  hits.set(key, recent);
  next();
};

// Stateless signed admin token: unlike an in-memory session Map, it works
// across separate Vercel function instances. Tokens expire after eight hours.
const SESSION_MS = 8 * 60 * 60 * 1000;
const signToken = (expiresAt) => crypto.createHmac('sha256', ADMIN_PASSWORD).update(String(expiresAt)).digest('hex');
const makeToken = () => {
  const expiresAt = Date.now() + SESSION_MS;
  return `${expiresAt}.${signToken(expiresAt)}`;
};
const validToken = (token) => {
  const [expiresText, signature] = String(token || '').split('.');
  const expiresAt = Number(expiresText);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now() || !signature) return false;
  return safeEqual(signature, signToken(expiresAt));
};
const requireAdmin = (req, res, next) => {
  const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!validToken(token)) return res.status(401).json({ error: 'Please log in again.' });
  next();
};

// ---------- public API ----------
app.get('/api/announcements', async (req, res, next) => {
  try {
    const result = await pool.query('SELECT id, title, body, created_at FROM announcements ORDER BY id DESC LIMIT 20');
    res.json(result.rows);
  } catch (error) { next(error); }
});

app.get('/api/events', async (req, res, next) => {
  try {
    const result = await pool.query('SELECT id, title, description, location, event_date FROM events WHERE event_date >= CURRENT_DATE ORDER BY event_date ASC LIMIT 20');
    res.json(result.rows.map((row) => ({ ...row, event_date: String(row.event_date).slice(0, 10) })));
  } catch (error) { next(error); }
});

app.get('/api/officials', async (req, res, next) => {
  try {
    const result = await pool.query('SELECT id, name, position, committee FROM officials ORDER BY sort_order ASC, id ASC');
    res.json(result.rows);
  } catch (error) { next(error); }
});

app.post('/api/messages', limit('msg', 5, 60 * 60 * 1000), async (req, res, next) => {
  try {
    const name = clean(req.body.name, 100);
    const email = clean(req.body.email, 150);
    const message = clean(req.body.message, 2000);
    if (req.body.website) return res.json({ ok: true });
    if (!name || !isEmail(email) || message.length < 5) {
      return res.status(400).json({ error: 'Please enter your name, a valid email, and a message.' });
    }
    await pool.query('INSERT INTO messages (name, email, message) VALUES ($1, $2, $3)', [name, email, message]);
    res.status(201).json({ ok: true });
  } catch (error) { next(error); }
});

// ---------- admin ----------
app.post('/api/admin/login', limit('login', 8, 15 * 60 * 1000), (req, res) => {
  if (!safeEqual(String(req.body.password ?? ''), ADMIN_PASSWORD)) {
    return res.status(401).json({ error: 'Incorrect password.' });
  }
  res.json({ token: makeToken() });
});

// Signed tokens are stateless; logout is completed client-side by discarding the token.
app.post('/api/admin/logout', requireAdmin, (req, res) => res.json({ ok: true }));

app.post('/api/admin/announcements', requireAdmin, async (req, res, next) => {
  try {
    const title = clean(req.body.title, 150);
    const body = clean(req.body.body, 3000);
    if (!title || !body) return res.status(400).json({ error: 'Title and body are required.' });
    const result = await pool.query('INSERT INTO announcements (title, body) VALUES ($1, $2) RETURNING id', [title, body]);
    res.status(201).json({ id: Number(result.rows[0].id) });
  } catch (error) { next(error); }
});
app.delete('/api/admin/announcements/:id', requireAdmin, async (req, res, next) => {
  try { await pool.query('DELETE FROM announcements WHERE id = $1', [Number(req.params.id)]); res.json({ ok: true }); }
  catch (error) { next(error); }
});

app.post('/api/admin/events', requireAdmin, async (req, res, next) => {
  try {
    const title = clean(req.body.title, 150);
    const description = clean(req.body.description, 1000);
    const location = clean(req.body.location, 150);
    const eventDate = clean(req.body.event_date, 10);
    if (!title || !isDate(eventDate)) return res.status(400).json({ error: 'Title and a valid date are required.' });
    const result = await pool.query('INSERT INTO events (title, description, location, event_date) VALUES ($1, $2, $3, $4) RETURNING id', [title, description, location, eventDate]);
    res.status(201).json({ id: Number(result.rows[0].id) });
  } catch (error) { next(error); }
});
app.delete('/api/admin/events/:id', requireAdmin, async (req, res, next) => {
  try { await pool.query('DELETE FROM events WHERE id = $1', [Number(req.params.id)]); res.json({ ok: true }); }
  catch (error) { next(error); }
});

app.post('/api/admin/officials', requireAdmin, async (req, res, next) => {
  try {
    const name = clean(req.body.name, 100);
    const position = clean(req.body.position, 100);
    const committee = clean(req.body.committee, 100);
    if (!name || !position) return res.status(400).json({ error: 'Name and position are required.' });
    const max = await pool.query('SELECT COALESCE(MAX(sort_order), 0)::int AS m FROM officials');
    const result = await pool.query('INSERT INTO officials (name, position, committee, sort_order) VALUES ($1, $2, $3, $4) RETURNING id', [name, position, committee, max.rows[0].m + 1]);
    res.status(201).json({ id: Number(result.rows[0].id) });
  } catch (error) { next(error); }
});
app.put('/api/admin/officials/:id', requireAdmin, async (req, res, next) => {
  try {
    const name = clean(req.body.name, 100);
    const position = clean(req.body.position, 100);
    const committee = clean(req.body.committee, 100);
    if (!name || !position) return res.status(400).json({ error: 'Name and position are required.' });
    await pool.query('UPDATE officials SET name = $1, position = $2, committee = $3 WHERE id = $4', [name, position, committee, Number(req.params.id)]);
    res.json({ ok: true });
  } catch (error) { next(error); }
});
app.delete('/api/admin/officials/:id', requireAdmin, async (req, res, next) => {
  try { await pool.query('DELETE FROM officials WHERE id = $1', [Number(req.params.id)]); res.json({ ok: true }); }
  catch (error) { next(error); }
});

app.get('/api/admin/messages', requireAdmin, async (req, res, next) => {
  try {
    const result = await pool.query('SELECT id, name, email, message, created_at FROM messages ORDER BY id DESC LIMIT 200');
    res.json(result.rows);
  } catch (error) { next(error); }
});
app.delete('/api/admin/messages/:id', requireAdmin, async (req, res, next) => {
  try { await pool.query('DELETE FROM messages WHERE id = $1', [Number(req.params.id)]); res.json({ ok: true }); }
  catch (error) { next(error); }
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
  console.error('Request failed:', err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ error: err.status === 400 ? 'Bad request' : 'Something went wrong.' });
});

// Vercel imports this Express app as a serverless function. Run a listener only locally.
if (require.main === module) {
  app.listen(PORT, () => console.log(`SK Gaban site running at http://localhost:${PORT}`));
}
module.exports = app;
