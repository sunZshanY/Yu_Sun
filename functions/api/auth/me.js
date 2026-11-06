/**
 * GET /api/auth/me
 * 返回当前登录用户；未登录时 user 为 null。
 */
import { apiError, getSessionUser, json } from '../_lib/auth';

export async function onRequestGet(context) {
  try {
    const user = await getSessionUser(context);
    return json({ user: user || null });
  } catch (error) {
    return apiError(error);
  }
}
