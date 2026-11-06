/**
 * POST /api/auth/register
 * 原生账号注册：用户名 + 昵称 + 可选邮箱 + 浏览器端 PBKDF2 verifier。
 * 服务端只保存加盐 SHA-256，不接触明文密码。
 */
import {
  apiError,
  assertSameOrigin,
  createSession,
  hashPasswordVerifier,
  isValidEmail,
  isValidSalt,
  isValidUsername,
  isValidVerifier,
  json,
  normalizeUsername,
  nowIso,
  rateLimit,
  readJsonBody,
  requireDb,
  roleForUser,
  sessionCookieHeader
} from '../_lib/auth';

export async function onRequestPost(context) {
  try {
    assertSameOrigin(context.request);
    const body = await readJsonBody(context.request);

    const username = normalizeUsername(body.username);
    if (!isValidUsername(username)) {
      return json({
        error: 'invalid_username',
        message: '用户名需为 3-20 位中文、字母、数字、下划线或短横线'
      }, 400);
    }

    const displayName = String(body.displayName || username).trim().slice(0, 30) || username;
    const email = String(body.email || '').trim();
    if (email && (!isValidEmail(email) || email.length > 255)) {
      return json({ error: 'invalid_email', message: '邮箱格式不正确' }, 400);
    }

    const salt = String(body.salt || '');
    const verifier = String(body.verifier || '');
    if (!isValidSalt(salt) || !isValidVerifier(verifier)) {
      return json({ error: 'invalid_credentials', message: '注册参数不完整' }, 400);
    }

    const ip = context.request.headers.get('CF-Connecting-IP') || 'unknown';
    if (!(await rateLimit(context, 'register:' + ip, 5, 3600))) {
      return json({ error: 'rate_limited', message: '注册太频繁，请稍后再试' }, 429);
    }

    const db = requireDb(context.env);
    const existing = await db.prepare('SELECT id FROM users WHERE username = ?')
      .bind(username).first();
    if (existing) {
      return json({ error: 'username_taken', message: '这个用户名已经被占用了' }, 409);
    }

    const now = nowIso();
    const role = roleForUser(username, context.env);
    const passwordHash = await hashPasswordVerifier(verifier, salt, context.env);

    const result = await db.prepare(
      'INSERT INTO users (github_id, username, display_name, email, avatar_url, ' +
      'password_hash, password_salt, role, created_at, last_login_at) ' +
      'VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      username, displayName, email || null, '', passwordHash, salt, role, now, now
    ).run();

    const userId = result && result.meta && result.meta.last_row_id;
    if (!userId) {
      return json({ error: 'register_failed', message: '注册失败，请稍后再试' }, 500);
    }

    const token = await createSession(context, userId);
    return json({
      ok: true,
      user: {
        id: userId,
        username: username,
        displayName: displayName,
        avatarUrl: '',
        role: role
      }
    }, 201, {
      'Set-Cookie': sessionCookieHeader(token, context.request)
    });
  } catch (error) {
    if (/UNIQUE constraint failed/i.test(String(error && error.message))) {
      return json({ error: 'username_taken', message: '这个用户名已经被占用了' }, 409);
    }
    return apiError(error);
  }
}
