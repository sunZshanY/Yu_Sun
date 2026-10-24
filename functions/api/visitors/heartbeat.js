/**
 * POST /api/visitors/heartbeat
 * =============================
 * Called silently by every page visitor every 30s.
 * Body: { sessionId, page, referrer }
 *
 * Headers auto-added by Cloudflare:
 *   CF-Connecting-IP  → visitor IP
 *   CF-IPCountry      → visitor country code
 *   User-Agent        → browser info
 */

import { recordHeartbeat, simplifyUA, requireStore } from './_utils';

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: 'invalid_json' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const sessionId = body && body.sessionId;
  if (!sessionId) {
    return new Response(JSON.stringify({ error: 'Missing sessionId' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    requireStore(env);
  } catch (e) {
    // KV 未绑定：访客监控整体不可用（前端静默忽略响应）
    return new Response(JSON.stringify({ error: 'kv_unbound', message: 'VISITOR_STORE 未绑定' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const data = {
      ip: request.headers.get('CF-Connecting-IP') || '未知',
      country: request.headers.get('CF-IPCountry') || '未知',
      userAgent: simplifyUA(request.headers.get('User-Agent') || ''),
      page: body.page || '/',
      referrer: body.referrer || '',
    };

    await recordHeartbeat(env, sessionId, data);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Invalid request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
