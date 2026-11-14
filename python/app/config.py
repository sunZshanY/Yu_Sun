"""
应用配置模块
============
集中管理所有配置项，支持环境变量覆盖。
"""

import os
from pathlib import Path


class Config:
    """基础配置（适用于所有环境）"""

    # --- 安全密钥 ---
    SECRET_KEY: str = os.environ.get("SECRET_KEY", "dev-secret-change-in-production")

    # --- 数据存储路径 ---
    DATA_DIR: Path = Path(os.path.dirname(os.path.dirname(__file__))) / "data"
    BLOGS_FILE: Path = DATA_DIR / "blogs.json"
    STATS_FILE: Path = DATA_DIR / "stats.json"

    # --- 管理员凭据 ---
    ADMIN_USERNAME: str = os.environ.get("ADMIN_USERNAME", "admin")
    ADMIN_PASSWORD: str = os.environ.get("ADMIN_PASSWORD", "123456")

    # --- 服务器绑定 ---
    API_HOST: str = os.environ.get("API_HOST", "127.0.0.1")
    API_PORT: int = int(os.environ.get("API_PORT", "5000"))

    # --- 上传限制 ---
    MAX_CONTENT_LENGTH: int = 2 * 1024 * 1024  # 2 MB

    # --- 图片上传白名单 ---
    ALLOWED_EXTENSIONS: set = {"png", "jpg", "jpeg", "gif", "webp"}

    # --- CORS 跨域 ---
    CORS_ORIGINS: list = [
        "http://127.0.0.1:5000",
        "http://localhost:5000",
        "http://127.0.0.1:5500",   # VS Code Live Server
        "http://localhost:5500",
        "https://sunzshany.github.io",
    ]

    # --- 令牌过期时间（秒） ---
    TOKEN_EXPIRATION: int = 86400 * 7  # 7 天

    # --- 博客分页 ---
    DEFAULT_PAGE_SIZE: int = 20
    MAX_PAGE_SIZE: int = 100


class DevelopmentConfig(Config):
    """开发环境配置"""
    DEBUG: bool = True
    TESTING: bool = False


class ProductionConfig(Config):
    """生产环境配置"""
    DEBUG: bool = False
    TESTING: bool = False


class TestingConfig(Config):
    """测试环境配置"""
    DEBUG: bool = False
    TESTING: bool = True


# 配置映射表
config: dict = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
    "testing": TestingConfig,
    "default": DevelopmentConfig,
}
