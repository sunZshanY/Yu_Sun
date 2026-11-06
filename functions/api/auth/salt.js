/**
 * GET /api/auth/salt?username=<用户名>
 * 返回该用户的密码盐；用户不存在时返回固定假盐，避免用户名枚举。
 */
import { apiError, isValidUsername, json, normalizeUsername, requireDb } from '../_lib/auth';

const FAKE_SALT = 'AAAAAAAAAAAAAAAAAAAAAA';

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const username = normalizeUsername(url.searchParams.get('username'));
    if (!isValidUsername(username)) return json({ salt: FAKE_SALT });

    const db = requireDb(context.env);
    const row = await db.prepare('SELECT password_salt FROM users WHERE username = ?')
      .bind(username).first();
    return json({ salt: row && row.password_salt ? row.password_salt : FAKE_SALT });
  } catch (error) {
    return apiError(error);
  }
}
