-- ============================================================================
-- Omia Blog 评论系统 — Cloudflare D1 (SQLite) 表结构
-- ============================================================================
-- 线上使用 D1 的原因：免费、免运维、无需 Linux 主机 / 公网 IP / MySQL 服务。
-- 执行方式：
--   npx wrangler d1 execute omia-comments --remote --file=db/schema.d1.sql
-- 本地：
--   npx wrangler d1 execute omia-comments --local --file=db/schema.d1.sql
--
-- 如果以后迁移到 Debian + MySQL，请使用同目录下的 schema.mysql.sql。
-- ============================================================================

PRAGMA foreign_keys = ON;

-- 用户：GitHub OAuth 登录后写入公开资料。
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  github_id     INTEGER UNIQUE,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name  TEXT NOT NULL,
  email         TEXT,
  avatar_url    TEXT,
  password_hash TEXT,
  password_salt TEXT,
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at    TEXT NOT NULL,
  last_login_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_github ON users (github_id);

-- 会话：只存 token 的 SHA-256 摘要，原始 token 仅存在于 HttpOnly Cookie。
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  ip         TEXT,
  user_agent TEXT,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);

-- 评论：parent_id 为空是一级评论；软删除时保留行，回复不会丢失。
CREATE TABLE IF NOT EXISTS comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id    INTEGER NOT NULL,
  user_id    INTEGER NOT NULL,
  parent_id  INTEGER,
  content    TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'deleted')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES comments (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_comments_post ON comments (post_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_user ON comments (user_id, created_at);
