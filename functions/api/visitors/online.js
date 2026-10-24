/**
 * GET /api/visitors/online
 * ==========================
 * Called by the admin panel to fetch currently online visitors.
 * Requires X-Admin-Auth header for basic protection.
 * Polling interval: 3–5 seconds from admin panel.
 */

import { getOnlineVisitors, requireStore } from './_utils';

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache, no-store, must-revalidate' }
  });
}

export async function onRequestGet(context) {
  const { request, env } = context;

  // Shared secret — must match the one in admin panel（从环境变量读取）
  const ADMIN_AUTH_SECRET = env.ADMIN_AUTH_SECRET || '';

  // 服务器未配置密钥 → 无法鉴权，直接拒绝并明确告知
  if (!ADMIN_AUTH_SECRET) {
    return json({
      error: 'auth_not_configured',
      message: '服务器未配置 ADMIN_AUTH_SECRET，管理员访客监控不可用',
      online: 0, visitors: []
    }, 503);
  }

  const authHeader = request.headers.get('X-Admin-Auth');
  if (authHeader !== ADMIN_AUTH_SECRET) {
    return json({ error: 'unauthorized', message: '鉴权失败：X-Admin-Auth 与服务器密钥不一致', online: 0, visitors: [] }, 401);
  }

  try {
    requireStore(env);
    const visitors = await getOnlineVisitors(env);

    return json({
      online: visitors.length,
      visitors: visitors,
      timestamp: Date.now()
    }, 200);
  } catch (err) {
    const kvUnbound = /not configured/i.test(err.message || '');
    return json({
      error: kvUnbound ? 'kv_unbound' : 'internal_error',
      message: kvUnbound ? 'KV 命名空间 VISITOR_STORE 未绑定到 Cloudflare Pages' : (err.message || 'Internal error'),
      online: 0,
      visitors: []
    }, kvUnbound ? 503 : 500);
  }
}
