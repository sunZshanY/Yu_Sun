"""
访客统计路由模块
================
提供访客计数的读取和递增 API。
"""

import json
import threading
from datetime import date
from pathlib import Path

from flask import Blueprint, jsonify, current_app

stats_bp = Blueprint("stats", __name__)

# 统计存储的线程锁
_stats_lock = threading.Lock()


def _get_stats_file() -> Path:
    """获取统计文件路径"""
    return current_app.config["STATS_FILE"]


def _read_stats() -> dict:
    """读取统计数据"""
    filepath = _get_stats_file()
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"total_visits": 0, "daily_visits": {}}


def _write_stats(stats: dict) -> None:
    """写入统计数据（原子写入）"""
    filepath = _get_stats_file()
    filepath.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = filepath.with_suffix(".tmp")
    try:
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(stats, f, ensure_ascii=False, indent=2)
        import os

        os.replace(tmp_path, filepath)
    except Exception:
        if tmp_path.exists():
            tmp_path.unlink(missing_ok=True)
        raise


@stats_bp.route("/stats/visitors", methods=["GET"])
def get_visitors():
    """
    获取访客统计数据。

    Response (200):
        {
            "total_visits": 128,
            "today_visits": 5,
            "date": "2026-07-06",
            "daily_visits": {"2026-07-05": 3, "2026-07-06": 5}
        }
    """
    stats = _read_stats()
    today_str = date.today().isoformat()

    return jsonify(
        {
            "total_visits": stats.get("total_visits", 0),
            "today_visits": stats.get("daily_visits", {}).get(today_str, 0),
            "date": today_str,
            "daily_visits": stats.get("daily_visits", {}),
        }
    )


@stats_bp.route("/stats/visitors", methods=["POST"])
def increment_visitors():
    """
    递增访客计数（每次访问调用一次）。

    Response (200):
        {
            "total_visits": 129,
            "today_visits": 6,
            "date": "2026-07-06"
        }
    """
    with _stats_lock:
        stats = _read_stats()
        today_str = date.today().isoformat()

        stats["total_visits"] = stats.get("total_visits", 0) + 1

        daily = stats.setdefault("daily_visits", {})
        daily[today_str] = daily.get(today_str, 0) + 1

        # 只保留最近 90 天的日数据
        sorted_days = sorted(daily.keys(), reverse=True)
        if len(sorted_days) > 90:
            for old_day in sorted_days[90:]:
                del daily[old_day]

        _write_stats(stats)

    return jsonify(
        {
            "total_visits": stats["total_visits"],
            "today_visits": daily[today_str],
            "date": today_str,
        }
    )
