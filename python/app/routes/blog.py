"""
博客 CRUD 路由模块
==================
提供博客文章的增删改查 API。

所有写操作（创建/更新/删除）需要认证。
"""

from flask import Blueprint, request, jsonify, current_app

from ..models import BlogPost
from ..utils.errors import NotFoundError, ValidationError
from ..utils.validators import validate_blog_input
from .auth import login_required

blog_bp = Blueprint("blog", __name__)


# ============================================================
# 辅助函数
# ============================================================


def _get_store():
    """获取 BlogStore 实例"""
    return current_app.extensions["blog_store"]


def _blog_to_response(post: BlogPost) -> dict:
    """将 BlogPost 转为 API 响应格式"""
    return post.to_dict()


# ============================================================
# 查询端点（公开）
# ============================================================


@blog_bp.route("/blogs", methods=["GET"])
def list_blogs():
    """
    获取博客列表。

    Query Params:
        search  - 搜索关键词（匹配标题、内容、标签）
        page    - 页码（从 1 开始，默认 1）
        size    - 每页数量（默认 20，最大 100）

    Response (200):
        {
            "blogs": [...],
            "count": 42,
            "page": 1,
            "size": 20
        }
    """
    store = _get_store()
    search_query = request.args.get("search", "").strip()

    # 搜索 或 全量获取
    if search_query:
        posts = store.search(search_query)
    else:
        posts = store.get_all()

    total_count = len(posts)

    # 简单分页
    try:
        page = max(1, int(request.args.get("page", 1)))
        size = min(
            current_app.config.get("MAX_PAGE_SIZE", 100),
            max(1, int(request.args.get("size", current_app.config.get("DEFAULT_PAGE_SIZE", 20)))),
        )
    except (ValueError, TypeError):
        page, size = 1, 20

    start = (page - 1) * size
    end = start + size
    paged_posts = posts[start:end]

    return jsonify(
        {
            "blogs": [_blog_to_response(p) for p in paged_posts],
            "count": total_count,
            "page": page,
            "size": size,
            "pages": max(1, (total_count + size - 1) // size),
        }
    )


@blog_bp.route("/blogs/<int:blog_id>", methods=["GET"])
def get_blog(blog_id: int):
    """
    获取单篇博客详情。

    Response (200):
        { "blog": {...} }

    Response (404):
        { "error": "...", "message": "博客不存在" }
    """
    store = _get_store()
    post = store.get_by_id(blog_id)

    if not post:
        raise NotFoundError(f"博客 #{blog_id} 不存在")

    return jsonify({"blog": _blog_to_response(post)})


# ============================================================
# 写操作端点（需认证）
# ============================================================


@blog_bp.route("/blogs", methods=["POST"])
@login_required
def create_blog():
    """
    创建新博客。

    Request Body:
        {
            "title": "标题",
            "date": "2026-07-06",
            "content": "正文内容",
            "tags": ["标签1", "标签2"],
            "image": "可选图片URL或base64"
        }

    Response (201):
        { "blog": {...}, "message": "博客创建成功" }
    """
    data = request.get_json(silent=True) or {}

    # 输入校验
    errors = validate_blog_input(data, is_update=False)
    if errors:
        raise ValidationError("数据校验失败", errors=errors)

    # 构造对象
    post = BlogPost(
        title=data["title"].strip(),
        date=data["date"].strip(),
        content=data.get("content", "").strip(),
        tags=data.get("tags", []),
        image=data.get("image", "").strip(),
    )

    # 持久化
    store = _get_store()
    created = store.create(post)

    return jsonify({"blog": _blog_to_response(created), "message": "博客创建成功"}), 201


@blog_bp.route("/blogs/<int:blog_id>", methods=["PUT"])
@login_required
def update_blog(blog_id: int):
    """
    更新已有博客（支持部分更新）。

    Response (200):
        { "blog": {...}, "message": "博客更新成功" }

    Response (404):
        { "error": "...", "message": "博客不存在" }
    """
    store = _get_store()
    existing = store.get_by_id(blog_id)

    if not existing:
        raise NotFoundError(f"博客 #{blog_id} 不存在")

    data = request.get_json(silent=True) or {}

    # 输入校验（更新模式：只校验提供的字段）
    errors = validate_blog_input(data, is_update=True)
    if errors:
        raise ValidationError("数据校验失败", errors=errors)

    # 合并更新（提供的字段覆盖，未提供的保留原值）
    merged = BlogPost(
        title=data.get("title", existing.title).strip() if "title" in data else existing.title,
        date=data.get("date", existing.date).strip() if "date" in data else existing.date,
        content=data.get("content", existing.content) if "content" in data else existing.content,
        tags=data.get("tags", existing.tags) if "tags" in data else existing.tags,
        image=data.get("image", existing.image) if "image" in data else existing.image,
    )

    updated = store.update(blog_id, merged)

    if not updated:
        raise NotFoundError(f"博客 #{blog_id} 更新失败")

    return jsonify({"blog": _blog_to_response(updated), "message": "博客更新成功"})


@blog_bp.route("/blogs/<int:blog_id>", methods=["DELETE"])
@login_required
def delete_blog(blog_id: int):
    """
    删除博客。

    Response (200):
        { "message": "博客删除成功" }

    Response (404):
        { "error": "...", "message": "博客不存在" }
    """
    store = _get_store()
    success = store.delete(blog_id)

    if not success:
        raise NotFoundError(f"博客 #{blog_id} 不存在")

    return jsonify({"message": "博客删除成功"})
