/**
 * 评论系统共享工具（Cloudflare Pages Functions）
 * ===============================================
 * - 会话：随机 token 存 HttpOnly Cookie，数据库只存 SHA-256 摘要
 * - 用户：GitHub OAuth 登录，公开资料写入 D1
 * - 数据库：D1（SQLite）。MySQL 版表结构见 db/schema.mysql.sql
 */

const SESSION_COOKIE = 'omi_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 天
const RETURN_ORIGIN = 'https://omia.invalid';

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = 'ApiError';
    this.status = status || 500;
    this.code = code || 'error';
  }
}

export function json(data, status, extraHeaders) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign({}, JSON_HEADERS, extraHeaders || {})
  });
}

/** 把异常统一转换为前端可读的 JSON。 */
export function apiError(error) {
  if (error instanceof ApiError) {
    return json({ error: error.code, message: error.message }, error.status);
  }
  const message = String((error && error.message) || error);
  if (/no such table/i.test(message)) {
    return json({
      error: 'db_not_initialized',
      message: '评论数据库尚未初始化，请执行 db/schema.d1.sql'
    }, 503);
  }
  console.error('comments api error:', message);
  return json({ error: 'server_error', message: '服务器开小差了，请稍后再试' }, 500);
}

export function requireDb(env) {
  if (!env || !env.COMMENT_DB) {
    throw new ApiError(
      '评论数据库尚未绑定，请在 Cloudflare Pages 控制台绑定 D1 数据库 COMMENT_DB',
      503,
      'db_unbound'
    );
  }
  return env.COMMENT_DB;
}

export function readCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) {
      try {
        return decodeURIComponent(part.slice(index + 1).trim());
      } catch (error) {
        return part.slice(index + 1).trim();
      }
    }
  }
  return null;
}

function toBase64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function randomToken(byteLength) {
  const bytes = new Uint8Array(byteLength || 32);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

export async function sha256Hex(value) {
  const data = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), function (byte) {
    return byte.toString(16).padStart(2, '0');
  }).join('');
}

export function publicUser(row) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url || '',
    role: row.role === 'admin' ? 'admin' : 'user'
  };
}

/** 从 Cookie 恢复当前登录用户；未登录返回 null。 */
export async function getSessionUser(context) {
  const token = readCookie(context.request, SESSION_COOKIE);
  if (!token) return null;

  const db = requireDb(context.env);
  const tokenHash = await sha256Hex(token);
  const row = await db.prepare(
    'SELECT u.id, u.username, u.display_name, u.avatar_url, u.role, s.expires_at ' +
    'FROM sessions s JOIN users u ON u.id = s.user_id ' +
    'WHERE s.token_hash = ?'
  ).bind(tokenHash).first();

  if (!row) return null;
  if (Date.parse(row.expires_at) <= Date.now()) {
    await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
    return null;
  }
  return publicUser(row);
}

/** 创建会话并返回原始 token（Cookie 里保存的值）。 */
export async function createSession(context, userId) {
  const db = requireDb(context.env);
  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);
  const ip = context.request.headers.get('CF-Connecting-IP') || '';
  const userAgent = (context.request.headers.get('User-Agent') || '').slice(0, 255);

  await db.prepare(
    'INSERT INTO sessions (token_hash, user_id, created_at, expires_at, ip, user_agent) ' +
    'VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(tokenHash, userId, now.toISOString(), expires.toISOString(), ip, userAgent).run();

  // 顺手清理该用户已经过期的会话，避免表无限增长。
  await db.prepare('DELETE FROM sessions WHERE user_id = ? AND expires_at <= ?')
    .bind(userId, now.toISOString()).run();

  return token;
}

export function sessionCookieHeader(token, request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return SESSION_COOKIE + '=' + token +
    '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + SESSION_TTL_SECONDS + secure;
}

export function clearSessionCookieHeader(request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return SESSION_COOKIE + '=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' + secure;
}

export async function destroySession(context) {
  const token = readCookie(context.request, SESSION_COOKIE);
  if (!token) return;
  const db = requireDb(context.env);
  await db.prepare('DELETE FROM sessions WHERE token_hash = ?')
    .bind(await sha256Hex(token)).run();
}

/** 只允许同站请求修改数据（配合 SameSite=Lax Cookie）。 */
export function assertSameOrigin(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return;
  let originHost;
  let requestHost;
  try {
    originHost = new URL(origin).host;
    requestHost = new URL(request.url).host;
  } catch (error) {
    throw new ApiError('请求来源无效', 403, 'bad_origin');
  }
  if (originHost !== requestHost) {
    throw new ApiError('跨站请求已拒绝', 403, 'bad_origin');
  }
}

export async function readJsonBody(request, maxBytes) {
  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (contentLength > (maxBytes || 32 * 1024)) {
    throw new ApiError('请求内容过大', 413, 'payload_too_large');
  }
  try {
    return await request.json();
  } catch (error) {
    throw new ApiError('请求格式错误', 400, 'invalid_json');
  }
}

/**
 * 读取 GitHub OAuth 配置。
 * 兼容一个常见的手误：在 Cloudflare 变量名前面多打了一个空格。
 * 正常名称优先；如果只存在带前导空格的名称，也能继续工作。
 */
export function githubCredentials(env) {
  const source = env || {};
  const clientId = source.GITHUB_CLIENT_ID || source[' GITHUB_CLIENT_ID'] || '';
  const clientSecret = source.GITHUB_CLIENT_SECRET || source[' GITHUB_CLIENT_SECRET'] || '';
  return {
    clientId: String(clientId),
    clientSecret: String(clientSecret),
    configured: Boolean(clientId && clientSecret)
  };
}

export function roleForUser(username, env) {
  const admins = String((env && env.COMMENT_ADMIN_USER) || '')
    .split(',')
    .map(function (value) { return value.trim().toLowerCase(); })
    .filter(Boolean);
  return admins.indexOf(String(username || '').toLowerCase()) !== -1 ? 'admin' : 'user';
}

/* ==========================================================================
   账号密码登录（浏览器端 PBKDF2 + 服务端加盐 SHA-256）
   --------------------------------------------------------------------------
   免费版 Workers 只有 10ms CPU，服务端跑 PBKDF2/bcrypt 很容易超时。
   因此密码在浏览器里用 PBKDF2-SHA256（310000 次）派生出一个 verifier，
   服务端只保存 SHA-256(pepper + salt + verifier)。浏览器端慢一点没关系，
   服务端只做一次快速哈希。
   ========================================================================== */

export function passwordPepper(env) {
  return (env && env.PASSWORD_PEPPER) ||
    (env && env.ADMIN_AUTH_SECRET) ||
    'omia-blog-password-pepper-v1';
}

export async function hashPasswordVerifier(verifier, salt, env) {
  return sha256Hex(passwordPepper(env) + ':' + String(salt) + ':' + String(verifier));
}

/** 防止通过响应时间猜密码哈希。 */
export function constantTimeEqual(left, right) {
  const a = String(left || '');
  const b = String(right || '');
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export function normalizeUsername(value) {
  return String(value || '').trim();
}

export function isValidUsername(username) {
  return /^[A-Za-z0-9_\-\u4e00-\u9fa5]{3,20}$/.test(username);
}

export function isValidSalt(salt) {
  return /^[A-Za-z0-9_-]{20,64}$/.test(String(salt || ''));
}

export function isValidVerifier(verifier) {
  return /^[A-Za-z0-9_-]{43}$/.test(String(verifier || ''));
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ''));
}

/**
 * 基于 KV 的简易限流（KV 未绑定时放行，不影响主流程）。
 * 返回 true 表示允许本次请求。
 */
export async function rateLimit(context, key, limit, windowSeconds) {
  const store = context.env && context.env.VISITOR_STORE;
  if (!store) return true;
  const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
  const kvKey = 'rate:' + key + ':' + bucket;
  try {
    const count = parseInt(await store.get(kvKey), 10) || 0;
    if (count >= limit) return false;
    await store.put(kvKey, String(count + 1), {
      expirationTtl: windowSeconds + 60
    });
  } catch (error) {
    return true;
  }
  return true;
}

/** 只接受站内相对路径，防止 OAuth 回跳被用于开放重定向。 */
export function sanitizeReturnTo(value) {
  if (!value) return '/home.html';
  try {
    const url = new URL(value, RETURN_ORIGIN);
    if (url.origin !== RETURN_ORIGIN) return '/home.html';
    return (url.pathname || '/home.html') + url.search + url.hash;
  } catch (error) {
    return '/home.html';
  }
}

export function authErrorRedirect(returnTo, code) {
  const url = new URL(sanitizeReturnTo(returnTo), RETURN_ORIGIN);
  url.searchParams.set('comment_auth', code || 'error');
  return new Response(null, {
    status: 302,
    headers: { Location: url.pathname + url.search + url.hash }
  });
}

export function nowIso() {
  return new Date().toISOString();
}
