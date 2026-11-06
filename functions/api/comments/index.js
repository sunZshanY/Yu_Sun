/**
 * /api/comments
 * =============
 * GET  ?post=<文章 id>   读取某篇文章的评论（公开）
 * POST                   发表评论 / 回复（必须登录）
 *
 * 评论按「一级评论 + 一级回复」组织：回复某条回复时，自动挂到它的根评论下。
 */
import {
  apiError,
  assertSameOrigin,
  getSessionUser,
  json,
  nowIso,
  readJsonBody,
  requireDb
} from '../_lib/auth';

const MAX_COMMENTS = 200;
const MAX_LENGTH = 2000;
const COOLDOWN_MS = 10 * 1000;
const DAILY_LIMIT = 50;

const COMMENT_SELECT =
  'SELECT c.id, c.post_id, c.parent_id, c.content, c.status, c.created_at, c.updated_at, ' +
  'u.id AS user_id, u.username, u.display_name, u.avatar_url, u.role ' +
  'FROM comments c JOIN users u ON u.id = c.user_id ';

function mapComment(row) {
  return {
    id: row.id,
    post_id: row.post_id,
    parent_id: row.parent_id,
    content: row.status === 'deleted' ? '' : row.content,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    user: {
      id: row.user_id,
      username: row.username,
      displayName: row.display_name,
      avatarUrl: row.avatar_url || '',
      role: row.role === 'admin' ? 'admin' : 'user'
    },
    replies: []
  };
}

function buildTree(rows) {
  const byId = new Map();
  const roots = [];
  rows.forEach(function (row) {
    const comment = mapComment(row);
    byId.set(comment.id, comment);
  });
  byId.forEach(function (comment) {
    if (comment.parent_id && byId.has(comment.parent_id)) {
      byId.get(comment.parent_id).replies.push(comment);
    } else {
      roots.push(comment);
    }
  });
  return roots;
}

function parsePostId(value) {
  const postId = Number(value);
  return Number.isInteger(postId) && postId > 0 ? postId : null;
}

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const postId = parsePostId(url.searchParams.get('post'));
    if (!postId) {
      return json({ error: 'invalid_post', message: '文章编号无效' }, 400);
    }

    const db = requireDb(context.env);
    const [listResult, countResult] = await db.batch([
      db.prepare(
        COMMENT_SELECT +
        'WHERE c.post_id = ? ORDER BY c.created_at ASC, c.id ASC LIMIT ?'
      ).bind(postId, MAX_COMMENTS),
      db.prepare('SELECT COUNT(*) AS total FROM comments WHERE post_id = ?').bind(postId)
    ]);

    const rows = (listResult && listResult.results) || [];
    const countRow = countResult && countResult.results && countResult.results[0];
    return json({
      comments: buildTree(rows),
      total: countRow ? Number(countRow.total) || 0 : rows.length,
      limited: rows.length >= MAX_COMMENTS
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function onRequestPost(context) {
  try {
    assertSameOrigin(context.request);

    const user = await getSessionUser(context);
    if (!user) {
      return json({ error: 'unauthorized', message: '请先登录后再发表评论' }, 401);
    }

    const body = await readJsonBody(context.request);
    const postId = parsePostId(body && body.postId);
    if (!postId) {
      return json({ error: 'invalid_post', message: '文章编号无效' }, 400);
    }

    let content = String((body && body.content) || '').replace(/\u0000/g, '').trim();
    if (!content) {
      return json({ error: 'empty_comment', message: '评论内容不能为空' }, 400);
    }
    if (content.length > MAX_LENGTH) {
      return json({ error: 'comment_too_long', message: '评论最多 ' + MAX_LENGTH + ' 个字符' }, 400);
    }

    const db = requireDb(context.env);

    // 只允许回复本篇文章下的评论；回复的回复自动提升到根评论。
    let parentId = Number(body && body.parentId) || null;
    if (parentId) {
      const parent = await db.prepare(
        'SELECT id, post_id, parent_id FROM comments WHERE id = ? AND status = ?'
      ).bind(parentId, 'visible').first();
      if (!parent || Number(parent.post_id) !== postId) {
        return json({ error: 'invalid_parent', message: '回复的评论不存在' }, 400);
      }
      parentId = parent.parent_id || parent.id;
    }

    // 防刷：同一用户 10 秒冷却 + 每天最多 50 条。
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [lastResult, dailyResult] = await db.batch([
      db.prepare('SELECT created_at FROM comments WHERE user_id = ? ORDER BY id DESC LIMIT 1')
        .bind(user.id),
      db.prepare('SELECT COUNT(*) AS total FROM comments WHERE user_id = ? AND created_at > ?')
        .bind(user.id, dayAgo)
    ]);
    const last = lastResult && lastResult.results && lastResult.results[0];
    if (last && Date.now() - Date.parse(last.created_at) < COOLDOWN_MS) {
      return json({ error: 'too_fast', message: '发言太快了，请稍后再试' }, 429);
    }
    const daily = dailyResult && dailyResult.results && dailyResult.results[0];
    if (daily && Number(daily.total) >= DAILY_LIMIT) {
      return json({ error: 'daily_limit', message: '今天已经发了太多评论，明天再来吧' }, 429);
    }

    const now = nowIso();
    const result = await db.prepare(
      'INSERT INTO comments (post_id, user_id, parent_id, content, status, created_at, updated_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(postId, user.id, parentId, content, 'visible', now, now).run();

    const commentId = result && result.meta && result.meta.last_row_id;
    if (!commentId) {
      return json({ error: 'insert_failed', message: '评论保存失败，请稍后再试' }, 500);
    }

    const row = await db.prepare(COMMENT_SELECT + 'WHERE c.id = ?')
      .bind(commentId).first();
    return json({ ok: true, comment: mapComment(row) }, 201);
  } catch (error) {
    return apiError(error);
  }
}
