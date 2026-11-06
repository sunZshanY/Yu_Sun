/**
 * DELETE /api/comments/:id
 * 作者本人或管理员可以删除评论（软删除，保留回复结构）。
 */
import {
  apiError,
  assertSameOrigin,
  getSessionUser,
  json,
  nowIso,
  requireDb
} from '../_lib/auth';

export async function onRequestDelete(context) {
  try {
    assertSameOrigin(context.request);

    const user = await getSessionUser(context);
    if (!user) {
      return json({ error: 'unauthorized', message: '请先登录后再操作' }, 401);
    }

    const id = Number(context.params && context.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return json({ error: 'invalid_comment', message: '评论编号无效' }, 400);
    }

    const db = requireDb(context.env);
    const comment = await db.prepare('SELECT id, user_id, status FROM comments WHERE id = ?')
      .bind(id).first();
    if (!comment) {
      return json({ error: 'not_found', message: '评论不存在' }, 404);
    }
    if (Number(comment.user_id) !== Number(user.id) && user.role !== 'admin') {
      return json({ error: 'forbidden', message: '你不能删除这条评论' }, 403);
    }
    if (comment.status === 'deleted') {
      return json({ ok: true });
    }

    await db.prepare(
      "UPDATE comments SET status = 'deleted', content = '', updated_at = ? WHERE id = ?"
    ).bind(nowIso(), id).run();

    return json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
