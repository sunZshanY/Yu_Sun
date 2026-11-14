"""
输入校验模块
============
纯函数，无副作用，可在路由层或模型层复用。
"""

import re
from datetime import datetime


def validate_required(value, field_name: str) -> str | None:
    """必填字段校验，返回错误信息或 None"""
    if not value or (isinstance(value, str) and not value.strip()):
        return f"{field_name} 不能为空"
    return None


def validate_length(value: str, max_len: int, field_name: str) -> str | None:
    """字符串长度校验"""
    if value and len(value) > max_len:
        return f"{field_name} 不能超过 {max_len} 个字符"
    return None


def validate_date(date_str: str) -> str | None:
    """日期格式校验 (YYYY-MM-DD)"""
    if not date_str:
        return "日期不能为空"
    try:
        datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        return "日期格式不正确，应为 YYYY-MM-DD"
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", date_str):
        return "日期格式不正确，应为 YYYY-MM-DD"
    return None


def validate_tags(tags: list) -> str | None:
    """标签校验"""
    if not isinstance(tags, list):
        return "标签应为字符串数组"
    if len(tags) > 10:
        return "标签数量不能超过 10 个"
    for tag in tags:
        if not isinstance(tag, str):
            return "每个标签必须是字符串"
        if len(tag) > 30:
            return f"单个标签不能超过 30 个字符: '{tag[:20]}...'"
    return None


def validate_image_url(url: str) -> str | None:
    """图片 URL / base64 校验"""
    if not url:
        return None  # 图片为可选字段
    if len(url) > 500000:  # base64 可能很长，放宽到 500KB
        return "图片数据过大"
    return None


def validate_blog_input(data: dict, is_update: bool = False) -> list[str]:
    """
    综合校验博客输入数据。
    返回错误信息列表，空列表表示通过。

    Args:
        data: 请求中的 JSON 数据
        is_update: 是否为更新操作（更新时某些字段可选）
    """
    errors = []

    # 标题（创建时必填）
    if not is_update or "title" in data:
        err = validate_required(data.get("title"), "标题")
        if err:
            errors.append(err)
        else:
            err = validate_length(data.get("title", ""), 100, "标题")
            if err:
                errors.append(err)

    # 日期
    if "date" in data:
        err = validate_date(data.get("date", ""))
        if err:
            errors.append(err)

    # 内容
    if "content" in data:
        err = validate_length(data.get("content", ""), 5000, "内容")
        if err:
            errors.append(err)

    # 标签
    if "tags" in data:
        err = validate_tags(data.get("tags", []))
        if err:
            errors.append(err)

    # 图片
    if "image" in data:
        err = validate_image_url(data.get("image", ""))
        if err:
            errors.append(err)

    return errors
