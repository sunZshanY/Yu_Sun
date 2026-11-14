"""
Flask 应用入口
==============
启动方式:
    python main.py              # Flask 开发服务器
    python main.py --prod       # Flask 生产服务器 (waitress)
    python main.py --qml        # QML/RinUI 桌面客户端
    python main.py --all        # Flask (后台线程) + QML (前台窗口)
"""

import sys
import os

# Windows GBK 编码兼容：强制 stdout/stderr 使用 UTF-8
if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

# 将 python 目录加入路径，确保导入正确
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import create_app


def run_flask(mode: str = "dev"):
    """启动 Flask 服务器"""
    app = create_app("development" if mode == "dev" else "production")

    host = app.config["API_HOST"]
    port = app.config["API_PORT"]

    print("=" * 56)
    print("  🌸  Omiaちゃん Blog API Server")
    print(f"  地址: http://{host}:{port}")
    print(f"  健康检查: http://{host}:{port}/api/health")
    print(f"  博客列表: http://{host}:{port}/api/blogs")
    print("=" * 56)

    if mode == "prod":
        from waitress import serve

        print("  运行模式: 生产 (waitress)")
        print("=" * 56)
        serve(app, host=host, port=port)
    else:
        print("  运行模式: 开发 (Flask debug)")
        print("=" * 56)
        app.run(debug=True, host=host, port=port)


def run_qml():
    """启动 QML/RinUI 桌面客户端"""
    print("=" * 56)
    print("  🌸  Omiaちゃん Blog Admin Desktop")
    print("  正在启动桌面客户端...")
    print("=" * 56)

    try:
        from PySide6.QtWidgets import QApplication
        from RinUI import RinUIWindow

        qml_app = QApplication(sys.argv)

        # QML 文件路径（相对于项目根目录）
        qml_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "qml",
            "main.qml",
        )

        if not os.path.exists(qml_path):
            print(f"  [错误] QML 文件不存在: {qml_path}")
            sys.exit(1)

        window = RinUIWindow(qml_path)
        window.setWidth(1024)
        window.setHeight(720)
        window.setTitle("Omiaちゃん Blog Admin")

        sys.exit(qml_app.exec())

    except ImportError as e:
        print(f"  [错误] 缺少依赖: {e}")
        print("  请先安装: pip install PySide6 RinUI")
        sys.exit(1)


def run_all():
    """同时启动 Flask（后台线程）+ QML（前台窗口）"""
    import threading

    # 在后台线程启动 Flask
    flask_thread = threading.Thread(target=run_flask, args=("dev",), daemon=True)
    flask_thread.start()

    import time

    time.sleep(1)  # 等待 Flask 启动

    # 前台启动 QML 客户端
    run_qml()


# ============================================================
# CLI 入口
# ============================================================

if __name__ == "__main__":
    args = sys.argv[1:]

    if "--prod" in args:
        run_flask(mode="prod")
    elif "--qml" in args:
        run_qml()
    elif "--all" in args:
        run_all()
    elif "--help" in args or "-h" in args:
        print("Omiaちゃん Blog — 启动选项:")
        print("  (无参数)      启动 Flask 开发服务器")
        print("  --prod        启动 Flask 生产服务器 (waitress)")
        print("  --qml         启动 QML/RinUI 桌面客户端")
        print("  --all         同时启动 Flask + QML 桌面客户端")
        print("  --help, -h    显示此帮助信息")
    else:
        run_flask(mode="dev")
