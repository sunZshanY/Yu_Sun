"""
Flask 应用工厂
==============
create_app() 负责组装 Flask 应用：
注册蓝图、配置 CORS、注册错误处理器、初始化存储层。
"""

from flask import Flask
from flask_cors import CORS

from .config import config


def create_app(config_name: str = "default") -> Flask:
    """
    创建并配置 Flask 应用实例。

    Args:
        config_name: 配置名称 (development / production / testing / default)

    Returns:
        配置完成的 Flask 应用实例
    """
    app = Flask(__name__)

    # --- 加载配置 ---
    cfg = config.get(config_name, config["default"])
    app.config.from_object(cfg)

    # --- CORS 跨域 ---
    CORS(
        app,
        resources={r"/api/*": {"origins": cfg.CORS_ORIGINS}},
        supports_credentials=True,
    )

    # --- 初始化存储层（挂载到 app.extensions） ---
    from .models import BlogStore

    # 确保数据目录存在
    cfg.DATA_DIR.mkdir(parents=True, exist_ok=True)
    app.extensions["blog_store"] = BlogStore(cfg.BLOGS_FILE)

    # --- 注册蓝图 ---
    from .routes.blog import blog_bp
    from .routes.auth import auth_bp
    from .routes.stats import stats_bp

    app.register_blueprint(blog_bp, url_prefix="/api")
    app.register_blueprint(auth_bp, url_prefix="/api")
    app.register_blueprint(stats_bp, url_prefix="/api")

    # --- 注册错误处理器 ---
    from .utils.errors import register_error_handlers

    register_error_handlers(app)

    # --- 健康检查路由（不归属任何蓝图） ---
    @app.route("/api/health")
    def health_check():
        store = app.extensions["blog_store"]
        return {
            "status": "ok",
            "service": "Omia Blog API",
            "version": "1.0.0",
            "blog_count": store.count(),
        }

    return app
