/**
 * GET /api/bg
 * ===========
 * Proxies the 雫API (https://api.imlazy.ink/img) wallpaper.
 * The API key is read from the SHIZUKU_API_KEY secret (Pages env var /
 * .dev.vars) so it is never exposed to the client or committed to the repo.
 */

const UPSTREAM = 'https://api.imlazy.ink/img?apikey=';

export async function onRequestGet(context) {
  const { env } = context;
  const key = (env && env.SHIZUKU_API_KEY) || '';

  try {
    const res = await fetch(UPSTREAM + encodeURIComponent(key), { redirect: 'manual' });

    // 上游返回 3xx → 直接 302 到不带密钥的 CDN 图床地址
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('Location');
      if (loc) return Response.redirect(loc, 302);
    }

    // 上游直接返回图片 → 原样透传
    if (res.ok) {
      return new Response(res.body, {
        status: res.status,
        headers: {
          'Content-Type': res.headers.get('Content-Type') || 'image/jpeg',
          'Cache-Control': 'public, max-age=3600'
        }
      });
    }

    return new Response(JSON.stringify({ error: 'upstream status ' + res.status }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'proxy error' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}