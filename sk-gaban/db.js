// Supabase PostgreSQL connection. Set DATABASE_URL in Vercel environment variables.
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Add your Supabase PostgreSQL connection string to Vercel Environment Variables.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Supabase hosted databases require TLS. This setting is suitable for their
  // standard connection strings and transaction/session pooler URLs.
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000,
});

let initPromise;
async function initDb() {
  if (!initPromise) {
    initPromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS announcements (
          id BIGSERIAL PRIMARY KEY,
          title TEXT NOT NULL,
          body TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS events (
          id BIGSERIAL PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          location TEXT NOT NULL DEFAULT '',
          event_date DATE NOT NULL
        );
        CREATE TABLE IF NOT EXISTS officials (
          id BIGSERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          position TEXT NOT NULL,
          committee TEXT NOT NULL DEFAULT '',
          sort_order INTEGER NOT NULL DEFAULT 100
        );
        CREATE TABLE IF NOT EXISTS messages (
          id BIGSERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT NOT NULL,
          message TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      const officialsCount = await pool.query('SELECT COUNT(*)::int AS n FROM officials');
      const placeholders = await pool.query("SELECT COUNT(*)::int AS n FROM officials WHERE name <> 'Your Name Here'");
      const officials = [
        ['Hon. Floremae Kaye D. Gales', 'SK Chairperson', '', 1],
        ['Hon. Elaine Mae G. Gallentes', 'SK Councilor', '', 2],
        ['Hon. Jimrose Olarte', 'SK Councilor', '', 3],
        ['Hon. Paolo Nanagad', 'SK Councilor', '', 4],
        ['Hon. Rodan Gem Machado', 'SK Councilor', '', 5],
        ['Ms. Princess Kaye Gabayeron', 'SK Secretary', '', 6],
        ['Ms. Allen Mae G. Tabiano', 'SK Treasurer', '', 7],
      ];
      if (officialsCount.rows[0].n === 0 || placeholders.rows[0].n === 0) {
        await pool.query('DELETE FROM officials');
        for (const official of officials) {
          await pool.query('INSERT INTO officials (name, position, committee, sort_order) VALUES ($1, $2, $3, $4)', official);
        }
      }

      const announcementsCount = await pool.query('SELECT COUNT(*)::int AS n FROM announcements');
      if (announcementsCount.rows[0].n === 0) {
        await pool.query(
          'INSERT INTO announcements (title, body) VALUES ($1, $2)',
          ['Welcome to the SK Gaban website', 'This is the official home of the Sangguniang Kabataan of Barangay Gaban. Announcements, programs, and events will be posted here.']
        );
      }

      const eventsCount = await pool.query('SELECT COUNT(*)::int AS n FROM events');
      if (eventsCount.rows[0].n === 0) {
        const eventDate = new Date();
        eventDate.setDate(eventDate.getDate() + 21);
        await pool.query(
          'INSERT INTO events (title, description, location, event_date) VALUES ($1, $2, $3, $4)',
          ['Youth Assembly', 'Open to all youth of Barangay Gaban. Share your ideas and help shape our programs.', 'Barangay Gaban Hall', eventDate.toISOString().slice(0, 10)]
        );
      }
    })().catch((error) => {
      initPromise = null;
      throw error;
    });
  }
  return initPromise;
}

module.exports = { pool, initDb };
