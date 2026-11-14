"""
错误处理模块
============
自定义异常类 + Flask 错误处理器（全部返回 JSON）。
"""

from flask import jsonify


# ============================================================
# 自定义异常
# ============================================================


class AppError(Exception):
    """应用基础异常"""

    def __init__(self, message: str, status_code: int = 400, payload: dict = None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.payload = payload or {}


class ValidationError(AppError):
    """数据校验失败"""

    def __init__(self, message: str = "数据校验失败", errors: list = None):
        super().__init__(message, status_code=400)
        self.errors = errors or []


class AuthenticationError(AppError):
    """认证失败"""

    def __init__(self, message: str = "未登录或登录已过期"):
        super().__init__(message, status_code=401)


class ForbiddenError(AppError):
    """权限不足"""

    def __init__(self, message: str = "没有权限执行此操作"):
        super().__init__(message, status_code=403)


class NotFoundError(AppError):
    """资源不存在"""

    def __init__(self, message: str = "请求的资源不存在"):
        super().__init__(message, status_code=404)


class ConflictError(AppError):
    """资源冲突"""

    def __init__(self, message: str = "资源冲突"):
        super().__init__(message, status_code=409)


# ============================================================
# Flask 错误处理器注册
# ============================================================


def register_error_handlers(app):
    """将错误处理注册到 Flask 应用实例"""

    @app.errorhandler(AppError)
    def handle_app_error(error: AppError):
        response = {
            "error": type(error).__name__,
            "message": error.message,
            **error.payload,
        }
        if isinstance(error, ValidationError) and error.errors:
            response["errors"] = error.errors
        return jsonify(response), error.status_code

    @app.errorhandler(400)
    def handle_bad_request(error):
        return jsonify({"error": "BadRequest", "message": str(error)}), 400

    @app.errorhandler(404)
    def handle_not_found(error):
        return jsonify({"error": "NotFound", "message": "请求的资源不存在"}), 404

    @app.errorhandler(405)
    def handle_method_not_allowed(error):
        return jsonify({"error": "MethodNotAllowed", "message": "不支持的请求方法"}), 405

    @app.errorhandler(413)
    def handle_too_large(error):
        return jsonify({"error": "PayloadTooLarge", "message": "上传文件超过大小限制（最大 2 MB）"}), 413

    @app.errorhandler(500)
    def handle_internal_error(error):
        app.logger.error(f"Internal Server Error: {error}")
        return jsonify({"error": "InternalServerError", "message": "服务器内部错误"}), 500
