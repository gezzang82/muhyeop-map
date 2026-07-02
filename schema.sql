CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  nickname TEXT DEFAULT '',
  email TEXT DEFAULT '',
  url_platform TEXT DEFAULT '',
  url_id TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(provider, provider_user_id)
);

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
  founder_user_id INTEGER REFERENCES users(id),
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
  source TEXT DEFAULT 'user',
  hidden INTEGER DEFAULT 0,
  user_id INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_campaigns_place_id ON campaigns(place_id);

CREATE TABLE IF NOT EXISTS banners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  image_url TEXT NOT NULL,
  link_url TEXT DEFAULT '',
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 신고: 매장/캠페인/후기 3종 (target_type + 해당 id, 모두 nullable)
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_type TEXT NOT NULL DEFAULT 'campaign',
  campaign_id INTEGER,
  place_id INTEGER,
  review_id INTEGER,
  reason TEXT NOT NULL,
  detail TEXT DEFAULT '',
  user_id INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reports_campaign_id ON reports(campaign_id);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  place_id INTEGER NOT NULL REFERENCES places(id),
  url TEXT NOT NULL,
  blog_id TEXT DEFAULT '',
  log_no TEXT DEFAULT '',
  title TEXT DEFAULT '',
  thumbnail TEXT DEFAULT '',
  excerpt TEXT DEFAULT '',
  author TEXT DEFAULT '',
  user_id INTEGER REFERENCES users(id),
  like_count INTEGER DEFAULT 0,
  hidden INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reviews_place_id ON reviews(place_id, hidden, id);

CREATE TABLE IF NOT EXISTS review_likes (
  review_id INTEGER NOT NULL REFERENCES reviews(id),
  voter_key TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(review_id, voter_key)
);

CREATE INDEX IF NOT EXISTS idx_review_likes_review_id ON review_likes(review_id);
