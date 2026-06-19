CREATE TABLE IF NOT EXISTS places (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  category TEXT NOT NULL,
  founder_nickname TEXT DEFAULT '',
  founder_email TEXT DEFAULT '',
  founder_url TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_places_lat_lng ON places(lat, lng);

CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  place_id INTEGER NOT NULL REFERENCES places(id),
  platform TEXT NOT NULL,
  channels TEXT NOT NULL DEFAULT '[]',
  content TEXT NOT NULL,
  deadline TEXT NOT NULL,
  link TEXT DEFAULT '',
  operating_days TEXT DEFAULT '[]',
  operating_hours TEXT DEFAULT '',
  exclude_holiday INTEGER DEFAULT 0,
  reporter_nickname TEXT DEFAULT '',
  reporter_email TEXT DEFAULT '',
  reporter_blog TEXT DEFAULT '',
  reporter_instagram TEXT DEFAULT '',
  reporter_url TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_campaigns_place_id ON campaigns(place_id);
