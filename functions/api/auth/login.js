/**
 * POST /api/auth/login
 * 原生账号登录：浏览器端 PBKDF2 派生 verifier → 服务端加盐 SHA-256 比对。
 */
import {
  apiError,
  assertSameOrigin,
  constantTimeEqual,
  createSession,
  hashPasswordVerifier,
  isValidUsername,
  isValidVerifier,
  json,
  normalizeUsername,
  nowIso,
  publicUser,
  rateLimit,
  readJsonBody,
  requireDb,
  sessionCookieHeader
} from '../_lib/auth';

export async function onRequestPost(context) {
  try {
    assertSameOrigin(context.request);
    const body = await readJsonBody(context.request);

    const username = normalizeUsername(body.username);
    const verifier = String(body.verifier || '');
    if (!isValidUsername(username) || !isValidVerifier(verifier)) {
      return json({ error: 'invalid_credentials', message: '用户名或密码错误' }, 401);
    }

    const ip = context.request.headers.get('CF-Connecting-IP') || 'unknown';
    if (!(await rateLimit(context, 'login:' + ip, 10, 600))) {
      return json({ error: 'rate_limited', message: '尝试太频繁，请 10 分钟后再试' }, 429);
    }

    const db = requireDb(context.env);
    const row = await db.prepare(
      'SELECT id, username, display_name, avatar_url, role, password_hash, password_salt ' +
      'FROM users WHERE username = ?'
    ).bind(username).first();

    // GitHub-only 账号没有 password_hash，同样返回通用错误，避免泄露账号类型。
    if (!row || !row.password_hash || !row.password_salt) {
      return json({ error: 'invalid_credentials', message: '用户名或密码错误' }, 401);
    }

    const computed = await hashPasswordVerifier(verifier, row.password_salt, context.env);
    if (!constantTimeEqual(computed, row.password_hash)) {
      return json({ error: 'invalid_credentials', message: '用户名或密码错误' }, 401);
    }

    await db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?')
      .bind(nowIso(), row.id).run();

    const token = await createSession(context, row.id);
    return json({ ok: true, user: publicUser(row) }, 200, {
      'Set-Cookie': sessionCookieHeader(token, context.request)
    });
  } catch (error) {
    return apiError(error);
  }
}
