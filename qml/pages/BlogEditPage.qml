/**
 * BlogEditPage.qml — 博客编辑页
 * ==============================
 * 支持两种模式：
 *   - 创建模式: loadBlog(0, false) 或直接使用
 *   - 编辑模式: loadBlog(id, false)
 *   - 查看模式: loadBlog(id, true) → 只读
 */

import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import "../services/ApiService.js" as Api
import "../components/"

Page {
    id: page
    padding: 20

    // ---- 状态 ----
    property int currentBlogId: 0
    property bool viewOnly: false
    property bool saving: false

    // ---- 加载博客数据 ----
    function loadBlog(blogId, readOnly) {
        currentBlogId = blogId;
        viewOnly = readOnly || false;

        if (blogId === 0) {
            // 新建模式
            titleField.text = "";
            dateField.text = new Date().toISOString().slice(0, 10);
            contentArea.text = "";
            tagsField.text = "";
            imagePicker.imageUrl = "";
            titleLabel.text = "✏️ 新建博客";
        } else {
            // 加载已有博客
            titleLabel.text = viewOnly ? "📖 查看博客" : "✏️ 编辑博客";
            Api.ApiService.getBlog(blogId, function (status, response) {
                if (status === 200 && response.blog) {
                    var blog = response.blog;
                    titleField.text = blog.title || "";
                    dateField.text = blog.date || "";
                    contentArea.text = blog.content || "";
                    tagsField.text = (blog.tags || []).join(", ");
                    imagePicker.imageUrl = blog.image || "";
                } else {
                    root.showToast("⚠️ 加载博客失败", "error");
                }
            });
        }
    }

    // 重置为新建模式
    function resetToCreate() {
        loadBlog(0, false);
        titleLabel.text = "✏️ 新建博客";
    }

    // ---- 布局 ----
    ColumnLayout {
        anchors.fill: parent
        spacing: 16

        // 标题行
        RowLayout {
            Layout.fillWidth: true

            Text {
                id: titleLabel
                text: "✏️ 新建博客"
                color: "#ffffff"
                font.pixelSize: 22
                font.bold: true
                font.family: "Microsoft YaHei"
                Layout.fillWidth: true
            }

            Button {
                text: "← 返回列表"
                font.family: "Microsoft YaHei"
                flat: true
                onClicked: {
                    mainStack.currentIndex = 0;
                }
            }
        }

        // 表单区（只读模式下禁用输入）
        ScrollView {
            Layout.fillWidth: true
            Layout.fillHeight: true
            clip: true

            ColumnLayout {
                width: parent ? parent.width - 4 : 600
                spacing: 12

                // 标题
                Text {
                    text: "标题 *"
                    color: "#c0c0d0"
                    font.pixelSize: 13
                    font.family: "Microsoft YaHei"
                }
                TextField {
                    id: titleField
                    Layout.fillWidth: true
                    placeholderText: "请输入博客标题"
                    readOnly: page.viewOnly
                    maximumLength: 100
                    font.family: "Microsoft YaHei"
                    font.pixelSize: 14
                }

                // 日期
                Text {
                    text: "日期 *"
                    color: "#c0c0d0"
                    font.pixelSize: 13
                    font.family: "Microsoft YaHei"
                }
                TextField {
                    id: dateField
                    Layout.fillWidth: true
                    placeholderText: "YYYY-MM-DD"
                    readOnly: page.viewOnly
                    font.family: "JetBrains Mono"
                    font.pixelSize: 14
                    validator: RegularExpressionValidator {
                        regularExpression: /^\d{4}-\d{2}-\d{2}$/
                    }
                }

                // 内容
                Text {
                    text: "内容"
                    color: "#c0c0d0"
                    font.pixelSize: 13
                    font.family: "Microsoft YaHei"
                }
                ScrollView {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 200
                    TextArea {
                        id: contentArea
                        width: parent.width
                        placeholderText: "请输入博客内容..."
                        readOnly: page.viewOnly
                        wrapMode: TextEdit.WordWrap
                        font.family: "Microsoft YaHei"
                        font.pixelSize: 14
                    }
                }

                // 标签
                Text {
                    text: "标签（用逗号分隔）"
                    color: "#c0c0d0"
                    font.pixelSize: 13
                    font.family: "Microsoft YaHei"
                }
                TextField {
                    id: tagsField
                    Layout.fillWidth: true
                    placeholderText: "例如：Python, Flask, CSS, Linux"
                    readOnly: page.viewOnly
                    font.family: "Microsoft YaHei"
                    font.pixelSize: 14
                }

                // 图片
                Text {
                    text: "图片（可选）"
                    color: "#c0c0d0"
                    font.pixelSize: 13
                    font.family: "Microsoft YaHei"
                }
                ImagePicker {
                    id: imagePicker
                    enabled: !page.viewOnly
                }

                // 操作按钮（仅编辑模式显示）
                RowLayout {
                    visible: !page.viewOnly
                    spacing: 8

                    Item { Layout.fillWidth: true }

                    Button {
                        text: "取消"
                        font.family: "Microsoft YaHei"
                        flat: true
                        onClicked: {
                            mainStack.currentIndex = 0;
                        }
                    }

                    Button {
                        id: saveBtn
                        text: page.saving ? "保存中..." : "💾 保存"
                        font.family: "Microsoft YaHei"
                        font.bold: true
                        enabled: !page.saving && titleField.text.trim() !== "" && dateField.text.trim() !== ""
                        onClicked: saveBlog()
                    }
                }
            }
        }
    }

    // ---- 保存逻辑 ----
    function saveBlog() {
        page.saving = true;

        // 标签解析
        var tags = [];
        var rawTags = tagsField.text.trim();
        if (rawTags) {
            tags = rawTags.split(",").map(function (t) { return t.trim(); }).filter(function (t) { return t !== ""; });
        }

        var blogData = {
            title: titleField.text.trim(),
            date: dateField.text.trim(),
            content: contentArea.text.trim(),
            tags: tags,
            image: imagePicker.imageUrl
        };

        var callback = function (status, response) {
            page.saving = false;
            if (status === 200 || status === 201) {
                root.showToast(
                    page.currentBlogId > 0 ? "✅ 博客更新成功" : "✅ 博客创建成功",
                    "success"
                );
                mainStack.currentIndex = 0;
                if (blogListPage) blogListPage.refresh();
            } else {
                var msg = response.message || "保存失败";
                var errs = response.errors || [];
                if (errs.length > 0) {
                    msg += "\n• " + errs.join("\n• ");
                }
                root.showToast("❌ " + msg, "error");
            }
        };

        if (page.currentBlogId > 0) {
            // 更新
            Api.ApiService.updateBlog(page.currentBlogId, blogData, root.authToken, callback);
        } else {
            // 创建
            Api.ApiService.createBlog(blogData, root.authToken, callback);
        }
    }
}
