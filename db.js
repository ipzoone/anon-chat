const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Railway injects DATABASE_URL automatically once a Postgres plugin is attached.
// Locally, copy .env.example to .env and fill it in.
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('[db] DATABASE_URL is not set. Add a Postgres plugin on Railway, or set it in .env locally.');
}

const pool = new Pool({
  connectionString,
  ssl: connectionString && !connectionString.includes('localhost')
    ? { rejectUnauthorized: false }
    : false
});

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('[db] schema is up to date');
}

async function upsertVisitor(id, tgId) {
  await pool.query(
    `INSERT INTO visitors (id, tg_id) VALUES ($1, $2)
     ON CONFLICT (id) DO UPDATE SET last_seen = now(), tg_id = COALESCE(EXCLUDED.tg_id, visitors.tg_id)`,
    [id, tgId || null]
  );
}

async function createRoom(id, visitorA, visitorB) {
  await pool.query(
    `INSERT INTO rooms (id, visitor_a, visitor_b) VALUES ($1, $2, $3)`,
    [id, visitorA, visitorB]
  );
}

async function endRoom(id) {
  await pool.query(
    `UPDATE rooms SET status = 'ended', ended_at = now() WHERE id = $1 AND status = 'active'`,
    [id]
  );
}

async function saveMessage(roomId, sender, body) {
  await pool.query(
    `INSERT INTO messages (room_id, sender, body) VALUES ($1, $2, $3)`,
    [roomId, sender, body]
  );
}

async function saveReport(roomId, reporter, reason) {
  await pool.query(
    `INSERT INTO reports (room_id, reporter, reason) VALUES ($1, $2, $3)`,
    [roomId || null, reporter, reason]
  );
}

async function countVisitorsToday() {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM visitors WHERE last_seen > now() - interval '1 day'`
  );
  return rows[0]?.n || 0;
}

module.exports = {
  pool,
  migrate,
  upsertVisitor,
  createRoom,
  endRoom,
  saveMessage,
  saveReport,
  countVisitorsToday
};