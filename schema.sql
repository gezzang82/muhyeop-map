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
  -- 경쟁률/썸네일 공간(2026-09-19): 컬럼만 만들어둠, 아직 수집·표시 안 함. 레뷰 등에서 나중에 채울 예정.
  apply_count INTEGER,     -- 신청 인원(경쟁률 분자)
  recruit_limit INTEGER,   -- 모집 인원(경쟁률 분모)
  thumbnail TEXT,          -- 캠페인 대표 이미지 URL
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_campaigns_place_id ON campaigns(place_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_platform ON campaigns(platform);

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

-- 데이터 자동수집 스테이징 (어드민 데이터수집 Phase 1) — api/campaigns.js ?action=scrape|staged|runs|review
CREATE TABLE IF NOT EXISTS scraped_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL,            -- 'dinnerqueen'/'디너의여왕'
  source_id INTEGER,                 -- 플랫폼 캠페인 id (커서/멱등키)
  source_url TEXT,
  name TEXT, address TEXT, category TEXT, channel TEXT, content TEXT, deadline TEXT,
  hours TEXT, days TEXT, exclude_holiday INTEGER DEFAULT 0,
  flags TEXT,                        -- 규칙검증 플래그(카테고리확인 등)
  dedupe_status TEXT,                -- new_place | add_channel | renew | dup_active
  matched_place_id INTEGER,          -- 기존 매장 매칭 시 place.id
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected | registered
  created_campaign_id INTEGER,       -- 등록완료 시 생성된 campaign.id
  -- 경쟁률/썸네일 공간(2026-09-19): 컬럼만 만들어둠, 아직 수집 안 함(나중에 채워 campaigns로 넘길 예정)
  apply_count INTEGER,               -- 신청 인원(경쟁률 분자)
  recruit_limit INTEGER,             -- 모집 인원(경쟁률 분모)
  thumbnail TEXT,                    -- 캠페인 대표 이미지 URL
  created_at TEXT DEFAULT (datetime('now','+9 hours')),
  reviewed_at TEXT,
  UNIQUE(platform, source_id)
);

CREATE TABLE IF NOT EXISTS scrape_state (
  platform TEXT PRIMARY KEY,
  last_max_id INTEGER,               -- 증분 커서(마지막 처리한 최대 source_id)
  last_run_at TEXT
);

CREATE TABLE IF NOT EXISTS scrape_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL,
  run_at TEXT DEFAULT (datetime('now','+9 hours')),
  cursor_from INTEGER, cursor_to INTEGER,
  fetched INTEGER, staged INTEGER, excluded INTEGER, note TEXT
);

-- 레이트리밋 고정 윈도우 카운터 (api/_ratelimit.js가 런타임 생성)
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket TEXT PRIMARY KEY,       -- "<name>:<ip>:<windowStart>"
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL    -- epoch초, 지난 버킷은 opportunistic 삭제
);

-- 어드민 대시보드 통계 DB 캐시 (api/_stats.js). 10만 캠페인 집계(~2s)를 매 요청 대신
-- 미리 계산해 1행에 저장 → 엔드포인트는 이 행만 읽음(~190ms, 콜드스타트에도). 로컬 크롤러가 매 패스 갱신.
CREATE TABLE IF NOT EXISTS stats_cache (
  cache_key TEXT PRIMARY KEY,    -- 'dashboard'
  data TEXT NOT NULL,            -- 집계 결과 JSON
  updated_at INTEGER NOT NULL    -- epoch ms
);

-- 앱 푸시(FCM) — api/users.js ?push=register/?push=prefs가 런타임 생성. 설계: docs/product/16-push-notifications.md
CREATE TABLE IF NOT EXISTS push_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,               -- 로그인 사용자면 users.id(nullable)
  device_id TEXT,
  platform TEXT,                 -- 'ios' | 'android'
  token TEXT UNIQUE,             -- FCM 토큰
  enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS push_prefs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT UNIQUE,
  user_id INTEGER,
  lat REAL, lng REAL,
  radius_km REAL DEFAULT 5,       -- 관심위치 반경
  categories TEXT,               -- 예 '숙박/여가,뷰티' (비우면 전체)
  digest TEXT DEFAULT 'instant', -- 'instant' | 'daily'
  enabled INTEGER DEFAULT 1,
  updated_at TEXT DEFAULT (datetime('now'))
);
