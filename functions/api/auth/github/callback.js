/**
 * GET /api/auth/github/callback
 * GitHub OAuth 回调：校验 state → 换取 access_token → 读取公开资料
 * → 写入/更新 users → 创建会话 → 跳回文章页。
 */
import {
  authErrorRedirect,
  createSession,
  githubCredentials,
  nowIso,
  readCookie,
  requireDb,
  roleForUser,
  sanitizeReturnTo,
  sessionCookieHeader
} from '../../_lib/auth';

function clearCookie(name, secure) {
  return name + '=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' + (secure ? '; Secure' : '');
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const returnTo = sanitizeReturnTo(readCookie(request, 'omi_oauth_return'));
  const secure = url.protocol === 'https:';

  try {
    if (url.searchParams.has('error')) {
      return authErrorRedirect(returnTo, url.searchParams.get('error') || 'denied');
    }

    const state = url.searchParams.get('state');
    const expectedState = readCookie(request, 'omi_oauth_state');
    if (!state || !expectedState || state !== expectedState) {
      return authErrorRedirect(returnTo, 'state_mismatch');
    }

    const code = url.searchParams.get('code');
    if (!code) return authErrorRedirect(returnTo, 'missing_code');
    const github = githubCredentials(env);
    if (!github.configured) {
      return authErrorRedirect(returnTo, 'unconfigured');
    }

    const origin = String(env.PUBLIC_ORIGIN || url.origin).replace(/\/+$/, '');
    const redirectUri = origin + '/api/auth/github/callback';

    // 1) code → access_token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'omia-blog-comments'
      },
      body: JSON.stringify({
        client_id: github.clientId,
        client_secret: github.clientSecret,
        code: code,
        redirect_uri: redirectUri
      })
    });
    const tokenData = await tokenResponse.json().catch(function () { return {}; });
    if (!tokenData.access_token) {
      console.error('github token exchange failed:', tokenData.error || tokenData.error_description || tokenResponse.status);
      return authErrorRedirect(returnTo, 'token_exchange_failed');
    }

    // 2) access_token → GitHub 公开资料
    const profileResponse = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': 'Bearer ' + tokenData.access_token,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'omia-blog-comments'
      }
    });
    if (!profileResponse.ok) {
      console.error('github profile request failed:', profileResponse.status);
      return authErrorRedirect(returnTo, 'profile_failed');
    }
    const profile = await profileResponse.json();
    if (!profile || !profile.id || !profile.login) {
      return authErrorRedirect(returnTo, 'profile_invalid');
    }

    // 3) 找到/创建用户。
    //    如果浏览器里已经用同一个用户名注册过原生账号（github_id 为空），
    //    这里直接把 GitHub 账号绑定到那个账号，避免用户名唯一约束冲突。
    const db = requireDb(env);
    const now = nowIso();
    const username = String(profile.login).slice(0, 39);
    const githubDisplayName = String(profile.name || profile.login).slice(0, 100);
    const email = profile.email ? String(profile.email).slice(0, 255) : null;
    const avatarUrl = profile.avatar_url ? String(profile.avatar_url).slice(0, 500) : '';
    const requestedRole = roleForUser(username, env);

    let existing = await db.prepare(
      'SELECT id, username, display_name, avatar_url, email, github_id, role ' +
      'FROM users WHERE github_id = ?'
    ).bind(profile.id).first();

    if (!existing) {
      existing = await db.prepare(
        'SELECT id, username, display_name, avatar_url, email, github_id, role ' +
        'FROM users WHERE username = ?'
      ).bind(username).first();
      if (existing && existing.github_id !== null &&
          Number(existing.github_id) !== Number(profile.id)) {
        return authErrorRedirect(returnTo, 'username_conflict');
      }
    }

    let userId;
    if (existing) {
      // 保留用户自己设置的昵称和管理员角色，只补上 GitHub 资料。
      const role = existing.role === 'admin' ? 'admin' : requestedRole;
      const displayName = existing.display_name || githubDisplayName;
      await db.prepare(
        'UPDATE users SET github_id = ?, username = ?, display_name = ?, ' +
        'email = COALESCE(?, email), avatar_url = ?, role = ?, last_login_at = ? ' +
        'WHERE id = ?'
      ).bind(
        profile.id, username, displayName, email, avatarUrl, role, now, existing.id
      ).run();
      userId = existing.id;
    } else {
      const result = await db.prepare(
        'INSERT INTO users (github_id, username, display_name, email, avatar_url, role, created_at, last_login_at) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        profile.id, username, githubDisplayName, email, avatarUrl, requestedRole, now, now
      ).run();
      userId = result && result.meta && result.meta.last_row_id;
    }

    if (!userId) return authErrorRedirect(returnTo, 'user_save_failed');
    const user = await db.prepare(
      'SELECT id, username, display_name, avatar_url, role FROM users WHERE id = ?'
    ).bind(userId).first();
    if (!user) return authErrorRedirect(returnTo, 'user_save_failed');

    // 4) 创建会话并回跳
    const token = await createSession(context, user.id);
    const headers = new Headers({ Location: returnTo });
    headers.append('Set-Cookie', sessionCookieHeader(token, request));
    headers.append('Set-Cookie', clearCookie('omi_oauth_state', secure));
    headers.append('Set-Cookie', clearCookie('omi_oauth_return', secure));
    return new Response(null, { status: 302, headers });
  } catch (error) {
    const message = String((error && error.message) || error);
    console.error('github oauth callback error:', message);
    if (/UNIQUE constraint failed: users\.username/i.test(message)) {
      return authErrorRedirect(returnTo, 'username_conflict');
    }
    return authErrorRedirect(returnTo, 'oauth_failed');
  }
}
