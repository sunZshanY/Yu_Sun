/**
 * POST /api/auth/logout
 * 删除当前会话并清除 Cookie。
 */
import {
  apiError,
  assertSameOrigin,
  clearSessionCookieHeader,
  destroySession,
  json
} from '../_lib/auth';

export async function onRequestPost(context) {
  try {
    assertSameOrigin(context.request);
    await destroySession(context);
    return json({ ok: true }, 200, {
      'Set-Cookie': clearSessionCookieHeader(context.request)
    });
  } catch (error) {
    return apiError(error);
  }
}
