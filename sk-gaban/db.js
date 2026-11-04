// SQLite storage using Node's built-in node:sqlite (no native build needed).
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const dir = path.join(__dirname, 'data');
fs.mkdirSync(dir, { recursive: true });
const db = new DatabaseSync(path.join(dir, 'sk-gaban.db'));

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS announcements (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT NOT NULL,
    body       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    location    TEXT NOT NULL DEFAULT '',
    event_date  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS officials (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    position   TEXT NOT NULL,
    committee  TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 100
  );

  CREATE TABLE IF NOT EXISTS messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    email      TEXT NOT NULL,
    message    TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Seed placeholder content on first run so the site never looks empty.
// Replace these from the admin page (/admin).
const count = (t) => db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;

// The SK Gaban officials. Used on a fresh database, and also to replace the old
// "Your Name Here" placeholders if nobody has edited the officials list yet.
// After that, manage officials from the admin page (/admin).
const OFFICIALS = [
  ['Hon. Floremae Kaye D. Gales', 'SK Chairperson', '', 1],
  ['Hon. Elaine Mae G. Gallentes', 'SK Councilor', '', 2],
  ['Hon. Jimrose Olarte', 'SK Councilor', '', 3],
  ['Hon. Paolo Nanagad', 'SK Councilor', '', 4],
  ['Hon. Rodan Gem Machado', 'SK Councilor', '', 5],
  ['Ms. Princess Kaye Gabayeron', 'SK Secretary', '', 6],
  ['Ms. Allen Mae G. Tabiano', 'SK Treasurer', '', 7],
];

const untouchedPlaceholders =
  db.prepare("SELECT COUNT(*) AS n FROM officials WHERE name <> 'Your Name Here'").get().n === 0;

if (count('officials') === 0 || untouchedPlaceholders) {
  db.exec('DELETE FROM officials');
  const ins = db.prepare('INSERT INTO officials (name, position, committee, sort_order) VALUES (?, ?, ?, ?)');
  OFFICIALS.forEach((o) => ins.run(...o));
}

if (count('announcements') === 0) {
  db.prepare('INSERT INTO announcements (title, body) VALUES (?, ?)').run(
    'Welcome to the SK Gaban website',
    'This is the official home of the Sangguniang Kabataan of Barangay Gaban. Announcements, programs, and events will be posted here.'
  );
}

if (count('events') === 0) {
  const d = new Date();
  d.setDate(d.getDate() + 21);
  db.prepare('INSERT INTO events (title, description, location, event_date) VALUES (?, ?, ?, ?)').run(
    'Youth Assembly',
    'Open to all youth of Barangay Gaban. Share your ideas and help shape our programs.',
    'Barangay Gaban Hall',
    d.toISOString().slice(0, 10)
  );
}

module.exports = db;
