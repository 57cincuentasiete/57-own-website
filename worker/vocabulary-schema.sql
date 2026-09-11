CREATE TABLE IF NOT EXISTS vocab_users (id TEXT PRIMARY KEY, lookup TEXT NOT NULL UNIQUE, credentials TEXT NOT NULL, progress TEXT, revision INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS vocab_sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES vocab_users(id), expires INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS vocab_sessions_expiry ON vocab_sessions(expires);
CREATE TABLE IF NOT EXISTS vocab_limits (id TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
