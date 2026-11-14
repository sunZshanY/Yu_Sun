"""
数据模型模块
============
BlogPost 数据类 + BlogStore JSON 文件存储层。

特点：
- 原子写入（临时文件 + os.replace）防止写入中断导致数据损坏
- 线程锁保护并发访问
- 自动创建数据目录
"""

import json
import os
import threading
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Optional

# ============================================================
# 数据模型
# ============================================================


@dataclass
class BlogPost:
    """博客文章数据类"""

    title: str
    date: str  # ISO 格式日期 "YYYY-MM-DD"
    content: str
    tags: list = field(default_factory=list)
    image: str = ""  # URL 或 base64 data URI
    id: int = 0  # 创建时自动分配
    created_at: str = ""  # ISO 时间戳
    updated_at: str = ""  # ISO 时间戳

    # --- 字段约束 ---
    MAX_TITLE_LEN: int = field(default=100, repr=False, compare=False)
    MAX_CONTENT_LEN: int = field(default=5000, repr=False, compare=False)
    MAX_TAGS: int = field(default=10, repr=False, compare=False)
    MAX_IMAGE_LEN: int = field(default=500, repr=False, compare=False)

    def to_dict(self) -> dict:
        """序列化为字典（仅输出业务字段，排除内部常量）"""
        return {
            "id": self.id,
            "title": self.title,
            "date": self.date,
            "content": self.content,
            "tags": self.tags,
            "image": self.image,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "BlogPost":
        """从字典反序列化"""
        return cls(
            id=data.get("id", 0),
            title=data.get("title", ""),
            date=data.get("date", ""),
            content=data.get("content", ""),
            tags=data.get("tags", []),
            image=data.get("image", ""),
            created_at=data.get("created_at", ""),
            updated_at=data.get("updated_at", ""),
        )

    def validate(self) -> list[str]:
        """
        校验数据合法性，返回错误列表（空列表表示通过）。
        """
        errors = []

        if not self.title or not self.title.strip():
            errors.append("标题不能为空")
        elif len(self.title) > self.MAX_TITLE_LEN:
            errors.append(f"标题不能超过 {self.MAX_TITLE_LEN} 个字符")

        if not self.date:
            errors.append("日期不能为空")
        else:
            try:
                datetime.strptime(self.date, "%Y-%m-%d")
            except ValueError:
                errors.append("日期格式不正确，应为 YYYY-MM-DD")

        if self.content and len(self.content) > self.MAX_CONTENT_LEN:
            errors.append(f"内容不能超过 {self.MAX_CONTENT_LEN} 个字符")

        if len(self.tags) > self.MAX_TAGS:
            errors.append(f"标签数量不能超过 {self.MAX_TAGS} 个")

        if self.image and len(self.image) > self.MAX_IMAGE_LEN:
            errors.append(f"图片 URL 不能超过 {self.MAX_IMAGE_LEN} 个字符")

        return errors


# ============================================================
# 数据存储层
# ============================================================


class BlogStore:
    """
    JSON 文件博客存储。

    线程安全，支持原子写入。
    """

    def __init__(self, filepath: Path):
        self._filepath = filepath
        self._lock = threading.Lock()
        self._ensure_file()

    # --- 文件初始化 ---

    def _ensure_file(self) -> None:
        """确保数据文件及目录存在"""
        self._filepath.parent.mkdir(parents=True, exist_ok=True)
        if not self._filepath.exists():
            self._write_all([])

    # --- 底层 I/O ---

    def _read_all(self) -> list[dict]:
        """从 JSON 文件读取全部数据"""
        try:
            with open(self._filepath, "r", encoding="utf-8") as f:
                data = json.load(f)
            if not isinstance(data, list):
                return []
            return data
        except (json.JSONDecodeError, FileNotFoundError):
            return []

    def _write_all(self, data: list[dict]) -> None:
        """
        原子写入：先写临时文件，再替换目标文件。
        防止写入过程中断导致数据损坏。
        """
        tmp_path = self._filepath.with_suffix(".tmp")
        try:
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            os.replace(tmp_path, self._filepath)
        except Exception:
            # 清理临时文件
            if tmp_path.exists():
                tmp_path.unlink(missing_ok=True)
            raise

    def _next_id(self, data: list[dict]) -> int:
        """生成下一个 ID"""
        if not data:
            return 1
        return max(item.get("id", 0) for item in data) + 1

    # --- 公开接口 ---

    def get_all(self) -> list[BlogPost]:
        """获取全部博客（按日期降序 + ID 降序排序）"""
        with self._lock:
            raw = self._read_all()
        posts = [BlogPost.from_dict(item) for item in raw]
        posts.sort(key=lambda p: (p.date, p.id), reverse=True)
        return posts

    def get_by_id(self, blog_id: int) -> Optional[BlogPost]:
        """根据 ID 获取单篇博客"""
        with self._lock:
            raw = self._read_all()
        for item in raw:
            if item.get("id") == blog_id:
                return BlogPost.from_dict(item)
        return None

    def create(self, post: BlogPost) -> BlogPost:
        """创建新博客，返回带 ID 和时间戳的完整对象"""
        with self._lock:
            raw = self._read_all()
            post.id = self._next_id(raw)
            now = datetime.now().isoformat(timespec="seconds")
            post.created_at = now
            post.updated_at = now
            raw.append(post.to_dict())
            self._write_all(raw)
        return post

    def update(self, blog_id: int, post: BlogPost) -> Optional[BlogPost]:
        """更新已有博客，返回更新后对象；不存在则返回 None"""
        with self._lock:
            raw = self._read_all()
            for i, item in enumerate(raw):
                if item.get("id") == blog_id:
                    post.id = blog_id
                    post.created_at = item.get("created_at", "")
                    post.updated_at = datetime.now().isoformat(timespec="seconds")
                    raw[i] = post.to_dict()
                    self._write_all(raw)
                    return post
        return None

    def delete(self, blog_id: int) -> bool:
        """删除博客，返回是否成功"""
        with self._lock:
            raw = self._read_all()
            for i, item in enumerate(raw):
                if item.get("id") == blog_id:
                    raw.pop(i)
                    self._write_all(raw)
                    return True
        return False

    def search(self, query: str) -> list[BlogPost]:
        """
        搜索博客：匹配标题、内容、标签。
        大小写不敏感。
        """
        query_lower = query.strip().lower()
        if not query_lower:
            return self.get_all()

        with self._lock:
            raw = self._read_all()

        results = []
        for item in raw:
            title = item.get("title", "").lower()
            content = item.get("content", "").lower()
            tags = " ".join(item.get("tags", [])).lower()

            if query_lower in title or query_lower in content or query_lower in tags:
                results.append(BlogPost.from_dict(item))

        results.sort(key=lambda p: (p.date, p.id), reverse=True)
        return results

    def count(self) -> int:
        """返回博客总数"""
        with self._lock:
            raw = self._read_all()
        return len(raw)
