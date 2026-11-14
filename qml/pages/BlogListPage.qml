/**
 * BlogListPage.qml — 博客列表页
 * ==============================
 * 展示博客卡片列表 + 搜索栏。
 * 管理员可在此页面编辑/删除博客。
 */

import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import "../services/ApiService.js" as Api
import "../components/"

Page {
    id: page
    padding: 20

    // ---- 数据 ----
    property var blogs: []
    property bool loading: false
    property string searchQuery: ""

    // ---- 初次加载 ----
    Component.onCompleted: refresh()

    function refresh() {
        loading = true;
        Api.ApiService.getBlogs(searchQuery, function (status, response) {
            loading = false;
            if (status === 200 && response.blogs) {
                page.blogs = response.blogs;
                root.blogCount = response.count;
            } else {
                root.showToast("⚠️ 加载博客列表失败", "error");
            }
        });
    }

    // ---- 布局 ----
    ColumnLayout {
        anchors.fill: parent
        spacing: 16

        // 页面标题
        Text {
            text: "📋 博客列表"
            color: "#ffffff"
            font.pixelSize: 22
            font.bold: true
            font.family: "Microsoft YaHei"
        }

        // 搜索栏
        RowLayout {
            Layout.fillWidth: true
            spacing: 8

            TextField {
                id: searchField
                Layout.fillWidth: true
                placeholderText: "搜索博客标题、内容或标签..."
                font.family: "Microsoft YaHei"
                font.pixelSize: 14

                onAccepted: {
                    page.searchQuery = text.trim();
                    page.refresh();
                }
            }

            Button {
                text: "🔍 搜索"
                font.family: "Microsoft YaHei"
                onClicked: {
                    page.searchQuery = searchField.text.trim();
                    page.refresh();
                }
            }

            Button {
                text: "↻ 刷新"
                font.family: "Microsoft YaHei"
                flat: true
                onClicked: {
                    searchField.text = "";
                    page.searchQuery = "";
                    page.refresh();
                }
            }
        }

        // 加载指示器
        BusyIndicator {
            Layout.alignment: Qt.AlignCenter
            running: page.loading
            visible: page.loading
        }

        // 博客列表 / 空状态
        StackLayout {
            Layout.fillWidth: true
            Layout.fillHeight: true

            // 空状态
            currentIndex: page.blogs.length === 0 ? 0 : 1

            Item {
                // 空状态占位
                ColumnLayout {
                    anchors.centerIn: parent
                    spacing: 8

                    Text {
                        text: "📭"
                        font.pixelSize: 48
                        Layout.alignment: Qt.AlignCenter
                    }
                    Text {
                        text: page.searchQuery ? "没有找到匹配的博客" : "暂无博客文章"
                        color: "#808090"
                        font.pixelSize: 16
                        font.family: "Microsoft YaHei"
                        Layout.alignment: Qt.AlignCenter
                    }
                    Text {
                        text: page.searchQuery ? "请尝试其他关键词" : "登录后点击「新建博客」开始创作吧！"
                        color: "#606070"
                        font.pixelSize: 13
                        font.family: "Microsoft YaHei"
                        Layout.alignment: Qt.AlignCenter
                        visible: !page.loading
                    }
                }
            }

            // 博客列表
            ScrollView {
                id: scrollView
                Layout.fillWidth: true
                Layout.fillHeight: true
                clip: true

                ListView {
                    id: listView
                    anchors.fill: parent
                    spacing: 12
                    model: page.blogs
                    delegate: BlogCard {
                        id: blogCard
                        width: listView.width - 4
                        blogData: modelData
                        isAdmin: root.isLoggedIn

                        onClicked: function (blogId) {
                            // 查看详情：切换到编辑页的预览模式
                            mainStack.currentIndex = 1;
                            blogEditPage.loadBlog(blogId, true);
                        }
                        onEditRequested: function (blogId) {
                            mainStack.currentIndex = 1;
                            blogEditPage.loadBlog(blogId, false);
                        }
                        onDeleteRequested: function (blogId) {
                            confirmDeleteDialog.blogIdToDelete = blogId;
                            confirmDeleteDialog.open();
                        }
                    }
                }
            }
        }
    }

    // ---- 删除确认弹窗 ----
    Dialog {
        id: confirmDeleteDialog
        title: "⚠️ 确认删除"
        modal: true
        standardButtons: Dialog.No | Dialog.Yes

        property int blogIdToDelete: 0

        Text {
            text: "确定要删除这篇博客吗？\n此操作不可撤销！"
            color: "#c0c0d0"
            font.pixelSize: 14
            font.family: "Microsoft YaHei"
        }

        onAccepted: {
            if (confirmDeleteDialog.blogIdToDelete > 0) {
                Api.ApiService.deleteBlog(
                    confirmDeleteDialog.blogIdToDelete,
                    root.authToken,
                    function (status, response) {
                        if (status === 200) {
                            root.showToast("✅ 博客已删除", "success");
                            page.refresh();
                        } else {
                            root.showToast("❌ " + (response.message || "删除失败"), "error");
                        }
                    }
                );
            }
            confirmDeleteDialog.blogIdToDelete = 0;
        }
    }
}
