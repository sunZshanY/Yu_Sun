/**
 * POST /api/posts
 * ===============
 * TXT / Markdown 提交博客入口（管理面板专用）。
 *
 * 支持格式：
 *   1. TXT 纯文本（带 --- 头部 或 首行标题）
 *   2. Markdown（带 YAML frontmatter 或纯 Markdown）
 *   3. JSON 对象（{ txt: "..." } 或完整 post 对象）
 *
 * Markdown 格式（推荐带头部）：
 *   ---
 *   title: 文章标题
 *   date: 2026-08-15
 *   tags: 标签1, 标签2
 *   images: images/xx.jpg（可选）
 *   ---
 *   # 正文内容
 *   支持完整 Markdown 语法……
 *
 * 也可以不带头部：第一行作为标题（支持 # 前缀），其余为正文。
 *
 * 流程：
 *   1. 校验 X-Admin-Auth
 *   2. 解析 TXT/Markdown → post 对象
 *   3. 写入 KV（blog:posts / blog:main）→ 网站即时生效
 *   4. 通过 GitHub Contents API 更新仓库 data/posts.json 与 main.json
 *      → 触发 Cloudflare Pages 自动部署，仓库与线上保持一致
 */

const KV_POSTS_KEY = 'blog:posts';
const KV_MAIN_KEY = 'blog:main';
const GH_OWNER = 'sunZshanY';
const GH_REPO = 'personal_website';
const GH_BRANCH = 'main';

export async function onRequestPost(context) {
  const { request, env } = context;

  const ADMIN_AUTH_SECRET = env.ADMIN_AUTH_SECRET || '';
  if (!ADMIN_AUTH_SECRET || (request.headers.get('X-Admin-Auth') || '') !== ADMIN_AUTH_SECRET) {
    return _json({ ok: false, error: '未授权' }, 401);
  }

  let body = '';
  try { body = await request.text(); } catch (e) {}

  let post = null;
  let txt = body;
  // 兼容两种提交：纯 TXT 文本，或 { txt: "..." } / 完整 post 对象的 JSON
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed === 'object' && (parsed.txt || parsed.title)) {
      if (typeof parsed.txt === 'string') {
        txt = parsed.txt;
      } else {
        post = parsed;
        txt = '';
      }
    }
  } catch (e) {}

  try {
    if (!post) post = parseTxt(txt);
    validatePost(post);
  } catch (err) {
    return _json({ ok: false, error: err.message }, 400);
  }

  // 当前文章：KV 优先（可能有未部署的提交），其次拉取站点静态文件
  const current = await loadCurrentPosts(env, request);
  const posts = current.posts.slice();
  const maxId = posts.reduce((m, p) => Math.max(m, Number(p.id) || 0), 0);
  post.id = maxId + 1;
  posts.push(post);

  const updatedAt = new Date().toISOString();
  const dataJson = {
    version: '5.1',
    updatedAt,
    logo: current.logo || 'images/misaka.jpg',
    posts
  };
  const mainJson = { version: '5.1', updatedAt, posts: posts.map(summarize) };

  // 1) KV → 网站即时更新
  try {
    if (!env.VISITOR_STORE) throw new Error('KV 命名空间 VISITOR_STORE 未绑定到 Cloudflare Pages');
    await env.VISITOR_STORE.put(KV_POSTS_KEY, JSON.stringify(dataJson));
    await env.VISITOR_STORE.put(KV_MAIN_KEY, JSON.stringify(mainJson));
  } catch (e) {
    return _json({ ok: false, error: 'KV 写入失败: ' + e.message }, 500);
  }

  // 2) GitHub → 自动部署
  const token = env.GITHUB_TOKEN || (request.headers.get('X-GitHub-Token') || '').trim();
  let github = null;
  let warning = '';
  if (token) {
    try {
      await pushToGitHub(token, 'data/posts.json', JSON.stringify(dataJson, null, 2), '发布博文：' + post.title);
      await pushToGitHub(token, 'main.json', JSON.stringify(mainJson, null, 2), '发布博文：' + post.title + '（摘要）');
      github = { pushed: true, files: ['data/posts.json', 'main.json'], repo: GH_OWNER + '/' + GH_REPO };
    } catch (err) {
      warning = err.message;
      github = { pushed: false };
    }
  } else {
    warning = '未配置 GitHub Token：网站数据已更新，但仓库尚未同步';
  }

  return _json({
    ok: true,
    post,
    count: posts.length,
    data: dataJson,
    github,
    warning: warning || undefined
  });
}

// ==================== 工具 ====================

function _json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

function validatePost(p) {
  if (!p || typeof p !== 'object') throw new Error('文章格式错误');
  if (!p.title || !String(p.title).trim()) throw new Error('缺少 title');
  if (!p.content || !String(p.content).trim()) throw new Error('正文为空');
  p.title = String(p.title).trim();
  p.content = String(p.content).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date || '')) p.date = new Date().toISOString().slice(0, 10);
  if (!Array.isArray(p.tags)) p.tags = [];
  p.tags = p.tags.map(t => String(t).trim()).filter(Boolean);
}

/**
 * 解析 TXT / Markdown：
 *  - 带 --- 头部（YAML frontmatter）：解析 title/date/tags/images
 *  - 无头部：首行作为标题（支持 # Markdown 标题前缀），其余为正文
 *  - 正文保留完整 Markdown 格式（标题、列表、代码块、链接等）
 *  - 支持标签格式：
 *    逗号分隔：tags: tag1, tag2
 *    YAML 列表：tags:\n  - tag1\n  - tag2
 */
export function parseTxt(txt) {
  if (typeof txt !== 'string' || !txt.replace(/^\uFEFF/, '').trim()) {
    throw new Error('内容为空');
  }
  txt = txt.replace(/^\uFEFF/, '');
  const m = txt.match(/^\s*---+\s*\r?\n([\s\S]*?)\r?\n---+\s*(?:\r?\n)?([\s\S]*)$/);
  const meta = {};
  let content;

  if (m) {
    content = (m[2] || '').trim();
    const lines = m[1].split(/\r?\n/);
    let currentKey = null;
    let listItems = [];
    for (const line of lines) {
      // 检查是否是 YAML 列表项（以 - 开头）
      const listMatch = line.match(/^\s+-\s+(.+)$/);
      if (listMatch && currentKey) {
        listItems.push(listMatch[1].trim());
        meta[currentKey] = listItems;
        continue;
      }
      // 普通 key: value 行
      const idx = line.indexOf(':');
      if (idx === -1) continue;
      const k = line.slice(0, idx).trim();
      const v = line.slice(idx + 1).trim();
      if (k) {
        currentKey = k;
        listItems = [];
        if (!v) {
          meta[k] = '';
        } else {
          meta[k] = v;
        }
      }
    }
  } else {
    const lines = txt.trim().split(/\r?\n/);
    const first = (lines.shift() || '').replace(/^#+\s*/, '').trim();
    if (!first) throw new Error('内容为空');
    meta.title = first;
    content = lines.join('\n').trim();
    if (!content) throw new Error('正文为空');
  }

  if (!meta.title) throw new Error('缺少 title（请在头部填写或首行写标题）');
  if (!content) throw new Error('正文为空');

  const post = {
    title: meta.title,
    date: /^\d{4}-\d{2}-\d{2}$/.test(meta.date || '') ? meta.date : new Date().toISOString().slice(0, 10),
    content
  };
  // 处理标签 - 支持多种格式
  let tags = [];
  if (Array.isArray(meta.tags)) {
    // YAML 列表格式：tags:\n- tag1\n- tag2
    tags = meta.tags.map(t => t.trim()).filter(Boolean);
  } else if (typeof meta.tags === 'string' && meta.tags) {
    // 逗号分隔格式：tags: tag1, tag2
    tags = meta.tags.split(/[,，]/).map(t => t.trim()).filter(Boolean);
  }
  if (tags.length) post.tags = tags;
  if (meta.images || meta.image) post.images = meta.images || meta.image;
  return post;
}

function excerpt(content, maxLen) {
  if (!content) return '';
  const firstPara = content.split('\n').filter(p => p.trim())[0] || content;
  if (firstPara.length <= maxLen) return firstPara;
  return firstPara.slice(0, maxLen).replace(/\s+\S*$/, '') + '...';
}

function summarize(p) {
  const out = { id: p.id, title: p.title, date: p.date, content: excerpt(p.content, 150) };
  if (Array.isArray(p.tags) && p.tags.length) out.tags = p.tags;
  if (p.images) out.images = p.images;
  return out;
}

async function loadCurrentPosts(env, request) {
  try {
    const cached = await env.VISITOR_STORE.get(KV_POSTS_KEY, 'json');
    if (cached && Array.isArray(cached.posts)) return cached;
  } catch (e) {}

  try {
    const url = new URL(request.url);
    const res = await fetch(url.origin + '/data/posts.json?_t=' + Date.now(), { cf: { cacheTtl: 0 } });
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.posts)) return data;
    }
  } catch (e) {}

  return { version: '5.1', logo: 'images/misaka.jpg', posts: [] };
}

function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

async function pushToGitHub(token, path, content, message) {
  const api = 'https://api.github.com/repos/' + GH_OWNER + '/' + GH_REPO + '/contents/' + encodeURIComponent(path);
  const headers = {
    'Authorization': 'Bearer ' + token,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'omia-blog-admin'
  };

  // 文件不存在（404）→ 走创建流程；已存在 → 携带 sha 更新
  let sha = null;
  const cur = await fetch(api + '?ref=' + GH_BRANCH, { headers });
  if (cur.ok) {
    const info = await cur.json();
    sha = info.sha;
  } else if (cur.status !== 404) {
    throw new Error('GitHub 读取失败（' + path + '）: HTTP ' + cur.status);
  }

  const payload = {
    message,
    content: b64encode(content),
    branch: GH_BRANCH
  };
  if (sha) payload.sha = sha;

  const put = await fetch(api, {
    method: 'PUT',
    headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
    body: JSON.stringify(payload)
  });
  if (!put.ok) {
    const e = await put.json().catch(() => ({}));
    throw new Error('GitHub 提交失败（' + path + '）: HTTP ' + put.status + (e.message ? ' ' + e.message : ''));
  }
}
