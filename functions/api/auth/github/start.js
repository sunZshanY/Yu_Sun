/**
 * GET /api/auth/github/start?return=<站内路径>
 * 跳转到 GitHub OAuth 授权页。state 与回跳地址放在短期 HttpOnly Cookie 中，
 * 不依赖服务端会话，避免 KV/D1 最终一致性带来的回调失败。
 */
import {
  authErrorRedirect,
  githubCredentials,
  randomToken,
  sanitizeReturnTo
} from '../../_lib/auth';

function cookie(name, value, maxAge, secure) {
  return name + '=' + encodeURIComponent(value) +
    '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + maxAge + (secure ? '; Secure' : '');
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const returnTo = sanitizeReturnTo(url.searchParams.get('return'));

  const github = githubCredentials(env);
  if (!github.configured) {
    return authErrorRedirect(returnTo, 'unconfigured');
  }

  const secure = url.protocol === 'https:';
  const state = randomToken(16);
  const origin = String(env.PUBLIC_ORIGIN || url.origin).replace(/\/+$/, '');
  const redirectUri = origin + '/api/auth/github/callback';

  const authorize = new URL('https://github.com/login/oauth/authorize');
  authorize.searchParams.set('client_id', github.clientId);
  authorize.searchParams.set('redirect_uri', redirectUri);
  authorize.searchParams.set('scope', 'read:user');
  authorize.searchParams.set('state', state);
  authorize.searchParams.set('allow_signup', 'true');

  const headers = new Headers({ Location: authorize.toString() });
  headers.append('Set-Cookie', cookie('omi_oauth_state', state, 600, secure));
  headers.append('Set-Cookie', cookie('omi_oauth_return', returnTo, 600, secure));

  return new Response(null, { status: 302, headers });
}
