CREATE TABLE IF NOT EXISTS downloads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id TEXT NOT NULL,
  title TEXT,
  audio_itag INTEGER,
  audio_size INTEGER,
  status TEXT NOT NULL,
  error_msg TEXT,
  ip_hash TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_downloads_created ON downloads(created_at);
CREATE INDEX IF NOT EXISTS idx_downloads_ip ON downloads(ip_hash);

CREATE TABLE IF NOT EXISTS rate_limits (
  ip_hash TEXT PRIMARY KEY,
  count INTEGER DEFAULT 1,
  window_start INTEGER DEFAULT (unixepoch())
);
