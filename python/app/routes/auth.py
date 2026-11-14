"""
认证路由模块
============
提供管理员登录/登出/状态查询 + 认证装饰器。

认证方式：itsdangerous 签名的 Bearer Token（无状态）。
"""

from functools import wraps
from flask import Blueprint, request, jsonify, current_app, g
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired

from ..utils.errors import AuthenticationError, ForbiddenError

auth_bp = Blueprint("auth", __name__)


# ============================================================
# Token 工具
# ============================================================


def _get_serializer() -> URLSafeTimedSerializer:
    """获取序列化器实例（依赖应用上下文）"""
    return URLSafeTimedSerializer(current_app.config["SECRET_KEY"])


def generate_token(username: str) -> str:
    """生成签名的认证令牌，有效期由配置决定"""
    s = _get_serializer()
    max_age = current_app.config.get("TOKEN_EXPIRATION", 86400 * 7)
    return s.dumps({"username": username, "role": "admin"})


def verify_token(token: str) -> dict | None:
    """
    验证令牌，成功返回 payload，失败返回 None。
    """
    try:
        s = _get_serializer()
        max_age = current_app.config.get("TOKEN_EXPIRATION", 86400 * 7)
        return s.loads(token, max_age=max_age)
    except (SignatureExpired, BadSignature):
        return None


# ============================================================
# 认证装饰器
# ============================================================


def login_required(f):
    """
    路由装饰器：要求请求携带有效的 Bearer Token。

    用法:
        @blog_bp.route("/blogs", methods=["POST"])
        @login_required
        def create_blog():
            ...
    """

    @wraps(f)
    def decorated(*args, **kwargs):
        token = _extract_token()
        if not token:
            raise AuthenticationError("缺少认证令牌，请在 Authorization 头中提供 Bearer Token")

        payload = verify_token(token)
        if not payload:
            raise AuthenticationError("令牌无效或已过期，请重新登录")

        g.current_user = payload
        return f(*args, **kwargs)

    return decorated


def _extract_token() -> str | None:
    """从请求头提取 Bearer Token"""
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[7:]
    return None


# ============================================================
# 路由端点
# ============================================================


@auth_bp.route("/auth/login", methods=["POST"])
def login():
    """
    管理员登录。

    Request Body:
        { "username": "admin", "password": "123456" }

    Response (200):
        { "token": "...", "message": "登录成功" }

    Response (401):
        { "error": "...", "message": "用户名或密码错误" }
    """
    data = request.get_json(silent=True) or {}

    username = data.get("username", "").strip()
    password = data.get("password", "")

    if not username or not password:
        raise AuthenticationError("用户名和密码不能为空")

    cfg = current_app.config

    if username != cfg["ADMIN_USERNAME"] or password != cfg["ADMIN_PASSWORD"]:
        raise AuthenticationError("用户名或密码错误")

    token = generate_token(username)

    return jsonify({"token": token, "message": "登录成功", "username": username})


@auth_bp.route("/auth/logout", methods=["POST"])
@login_required
def logout():
    """
    登出（令牌由客户端丢弃，服务端无状态）。

    Response (200):
        { "message": "已登出" }
    """
    # 无状态令牌：客户端负责丢弃 token
    return jsonify({"message": "已登出"})


@auth_bp.route("/auth/status", methods=["GET"])
@login_required
def status():
    """
    检查认证状态。

    Response (200):
        { "authenticated": true, "username": "admin" }
    """
    return jsonify(
        {
            "authenticated": True,
            "username": g.current_user.get("username"),
            "role": g.current_user.get("role"),
        }
    )
