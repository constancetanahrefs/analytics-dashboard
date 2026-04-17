CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS widgets (
  id          TEXT PRIMARY KEY,
  tab         TEXT NOT NULL,
  title       TEXT NOT NULL,
  endpoint    TEXT NOT NULL,
  params      TEXT NOT NULL DEFAULT '{}',
  description TEXT NOT NULL DEFAULT '',
  pinned      INTEGER NOT NULL DEFAULT 0,
  paused      INTEGER NOT NULL DEFAULT 0,
  hidden      INTEGER NOT NULL DEFAULT 0,
  order_index INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS cache (
  widget_id  TEXT PRIMARY KEY,
  data       TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  expires_at TEXT
);

CREATE TABLE IF NOT EXISTS fetch_logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  widget_id     TEXT,
  endpoint      TEXT,
  params        TEXT,
  status        TEXT,
  http_code     INTEGER,
  duration_ms   INTEGER,
  error_message TEXT,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sync_state (
  id                 INTEGER PRIMARY KEY CHECK (id = 1),
  in_progress        INTEGER NOT NULL DEFAULT 0,
  started_at         TEXT,
  last_widget_synced TEXT,
  total_widgets      INTEGER NOT NULL DEFAULT 0,
  synced_count       INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO sync_state (id) VALUES (1);

CREATE TABLE IF NOT EXISTS insights_widgets (
  id          TEXT PRIMARY KEY,
  page        TEXT NOT NULL,
  title       TEXT NOT NULL,
  endpoint    TEXT NOT NULL DEFAULT '',
  params      TEXT NOT NULL DEFAULT '{}',
  description TEXT NOT NULL DEFAULT '',
  starred     INTEGER NOT NULL DEFAULT 0,
  order_index INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS insights_cache (
  widget_id  TEXT PRIMARY KEY,
  data       TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);

INSERT OR IGNORE INTO insights_widgets VALUES
  ('p1-sov-ai',          'performance',   'SoV Over Time — AI Answers',          'brand-radar/sov-history',           '{}', '', 0, 0),
  ('p2-sov-organic',     'performance',   'SoV — Organic Search',                'rank-tracker/competitors-stats',    '{}', '', 0, 1),
  ('p3-impressions-ai',  'performance',   'Impressions Over Time — AI Answers',  'brand-radar/impressions-history',   '{}', '', 0, 2),
  ('p4-impressions-gsc', 'performance',   'Impressions Over Time — Organic',     'gsc/performance-history',           '{}', '', 0, 3),
  ('p5-clicks-organic',  'performance',   'Clicks Over Time — Organic',          'gsc/performance-history',           '{}', '', 0, 4),
  ('p6-clicks-ai',       'performance',   'Clicks Over Time — AI Traffic',       'web-analytics/referrers-chart',     '{}', '', 0, 5),
  ('p7-cited-pages-ai',  'performance',   'Top Cited Pages — AI (Custom Prompts)','brand-radar/cited-pages',          '{}', '', 0, 6),
  ('p8-aio-pages',       'performance',   'Top Pages in AI Overviews',           'rank-tracker/overview+serp-overview','{}','', 0, 7),
  ('p9-organic-pages',   'performance',   'Top Organic Pages',                   'gsc/pages',                        '{}', '', 0, 8),
  ('o1-third-domains',   'opportunities', '3rd-Party Domains — AI Search',       'brand-radar/cited-domains',         '{}', '', 0, 0),
  ('o2-aio-gaps',        'opportunities', '3rd-Party URLs in AI Overviews',      'rank-tracker/overview+serp-overview','{}','', 0, 1),
  ('o3-question-kw',     'opportunities', 'Question Keywords — Organic',         'gsc/keywords',                     '{}', '', 0, 2),
  ('o4-longtail-kw',     'opportunities', 'Long-tail Keywords (5+ words)',       'gsc/keywords',                     '{}', '', 0, 3),
  ('o5-paa',             'opportunities', 'People Also Ask — Top Questions',     'rank-tracker/overview+serp-overview','{}','', 0, 4),
  ('o6-discussions',     'opportunities', 'Popular Discussions & Forums',        'rank-tracker/serp-overview',        '{}', '', 0, 5),
  ('o7-reddit-quora',    'opportunities', 'Cited Reddit & Quora Pages',          'brand-radar/cited-pages',           '{}', '', 0, 6),
  ('o8-videos',          'opportunities', 'Popular Video Topics',                'rank-tracker/serp-overview',        '{}', '', 0, 7),
  ('o9-video-ai',        'opportunities', 'Videos Cited in AI Answers',          'brand-radar/cited-pages',           '{}', '', 0, 8);
