/**
 * GET /api/auth/config
 * 告诉前端当前启用了哪些登录方式。
 * 线上（Cloudflare）使用 GitHub OAuth；密码登录需要自建服务器，故为 false。
 */
import { githubCredentials, json } from '../_lib/auth';

export async function onRequestGet(context) {
  const env = context.env || {};
  return json({
    github: githubCredentials(env).configured,
    password: true
  });
}
