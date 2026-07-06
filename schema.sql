-- Anonymous Chat schema
-- Run automatically on boot by db.js (safe to run multiple times).

CREATE TABLE IF NOT EXISTS visitors (
  id            TEXT PRIMARY KEY,        -- anonymous session id (uuid, not a real identity)
  tg_id         TEXT,                     -- telegram user id, if opened from Telegram
  first_seen    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rooms (
  id            TEXT PRIMARY KEY,        -- room id, shared by both participants
  visitor_a     TEXT NOT NULL REFERENCES visitors(id),
  visitor_b     TEXT NOT NULL REFERENCES visitors(id),
  status        TEXT NOT NULL DEFAULT 'active', -- active | ended
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS messages (
  id            BIGSERIAL PRIMARY KEY,
  room_id       TEXT NOT NULL REFERENCES rooms(id),
  sender        TEXT NOT NULL,           -- visitor id of sender
  body          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reports (
  id            BIGSERIAL PRIMARY KEY,
  room_id       TEXT,
  reporter      TEXT NOT NULL,
  reason        TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_room ON messages(room_id);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);