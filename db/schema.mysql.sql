-- ============================================================================
-- Omia Blog 评论系统 — MySQL / MariaDB 表结构
-- ============================================================================
-- 说明：
--   线上目前跑在 Cloudflare D1（见 schema.d1.sql），因为 D1 免费且不需要
--   一台 7x24 小时的 Linux 主机。这个文件是给以后想搬到 Debian + MySQL/
--   MariaDB 自托管时用的，字段与 D1 版本一一对应，迁移成本很低。
--
-- Debian 初始化示例：
--   sudo apt install mariadb-server
--   sudo mysql < db/schema.mysql.sql
--
-- 建议单独建一个低权限账号给博客使用：
--   CREATE USER 'omia'@'localhost' IDENTIFIED BY '换成强密码';
--   GRANT SELECT, INSERT, UPDATE, DELETE ON omia_blog.* TO 'omia'@'localhost';
--   FLUSH PRIVILEGES;
-- ============================================================================

CREATE DATABASE IF NOT EXISTS omia_blog
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE omia_blog;

-- 用户：GitHub OAuth 登录后写入公开资料。
CREATE TABLE IF NOT EXISTS users (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  github_id     BIGINT UNSIGNED NULL,
  username      VARCHAR(39) NOT NULL,
  display_name  VARCHAR(100) NOT NULL,
  email         VARCHAR(255) NULL,
  avatar_url    VARCHAR(500) NULL,
  password_hash VARCHAR(255) NULL,
  password_salt VARCHAR(64) NULL,
  role          ENUM('user', 'admin') NOT NULL DEFAULT 'user',
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_login_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_users_github (github_id),
  UNIQUE KEY uk_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 会话：只存 token 的 SHA-256 摘要，原始 token 仅存在于 HttpOnly Cookie。
CREATE TABLE IF NOT EXISTS sessions (
  token_hash CHAR(64) NOT NULL,
  user_id    BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at DATETIME(3) NOT NULL,
  ip         VARCHAR(45) NULL,
  user_agent VARCHAR(255) NULL,
  PRIMARY KEY (token_hash),
  KEY idx_sessions_user (user_id),
  KEY idx_sessions_expires (expires_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 评论：parent_id 为空是一级评论；软删除时保留行，回复不会丢失。
CREATE TABLE IF NOT EXISTS comments (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  post_id    INT UNSIGNED NOT NULL,
  user_id    BIGINT UNSIGNED NOT NULL,
  parent_id  BIGINT UNSIGNED NULL,
  content    TEXT NOT NULL,
  status     ENUM('visible', 'deleted') NOT NULL DEFAULT 'visible',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_comments_post (post_id, status, created_at),
  KEY idx_comments_user (user_id, created_at),
  KEY idx_comments_parent (parent_id),
  CONSTRAINT fk_comments_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_comments_parent FOREIGN KEY (parent_id)
    REFERENCES comments (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 把某个已登录过的 GitHub 用户设为管理员（也可以设置环境变量
-- COMMENT_ADMIN_USER=sunZshanY，登录时会自动更新角色）：
-- UPDATE users SET role = 'admin' WHERE username = 'sunZshanY';
