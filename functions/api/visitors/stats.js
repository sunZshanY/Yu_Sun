/**
 * GET /api/visitors/stats
 * ========================
 * Admin-only traffic stats: all-time total + daily visits for the last 7 days.
 * Requires the same X-Admin-Auth header as /api/visitors/online.
 */

import { getVisitorStats, requireStore } from './_utils';

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache, no-store, must-revalidate' }
  });
}

export async function onRequestGet(context) {
  const { request, env } = context;

  const ADMIN_AUTH_SECRET = env.ADMIN_AUTH_SECRET || '';
  if (!ADMIN_AUTH_SECRET) {
    return json({ error: 'auth_not_configured', message: '服务器未配置 ADMIN_AUTH_SECRET' }, 503);
  }

  const authHeader = request.headers.get('X-Admin-Auth');
  if (authHeader !== ADMIN_AUTH_SECRET) {
    return json({ error: 'unauthorized', message: '鉴权失败' }, 401);
  }

  try {
    requireStore(env);
    const stats = await getVisitorStats(env, 7);
    return json({ ok: true, ...stats, timestamp: Date.now() }, 200);
  } catch (err) {
    const kvUnbound = /not configured/i.test(err.message || '');
    return json({
      error: kvUnbound ? 'kv_unbound' : 'internal_error',
      message: kvUnbound ? 'KV 命名空间 VISITOR_STORE 未绑定到 Cloudflare Pages' : (err.message || 'Internal error')
    }, kvUnbound ? 503 : 500);
  }
}
