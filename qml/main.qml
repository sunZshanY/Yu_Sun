/**
 * main.qml — Omiaちゃん Blog Admin 桌面客户端入口
 * ==================================================
 * 由 Python RinUIWindow 加载，提供 Fluent Design 风格的管理界面。
 *
 * 启动方式: cd python && python main.py --qml
 */

import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Window
import RinUI

import "services/ApiService.js" as Api
import "components/"
import "pages/"

ApplicationWindow {
    id: root
    visible: true
    width: 1024
    height: 720
    minimumWidth: 800
    minimumHeight: 600
    title: "Omiaちゃん Blog Admin"

    // ============================================================
    // 全局状态
    // ============================================================
    property bool isLoggedIn: false
    property string authToken: ""
    property string currentUsername: ""
    property bool apiConnected: false
    property int blogCount: 0
    property string apiBaseUrl: "http://127.0.0.1:5000/api"

    // ============================================================
    // 初始化 — 连接检测 + 定时刷新
    // ============================================================
    Component.onCompleted: {
        checkApiConnection();
        // 每 30 秒检测一次连接状态
        healthTimer.start();
    }

    Timer {
        id: healthTimer
        interval: 30000
        repeat: true
        running: false
        onTriggered: checkApiConnection()
    }

    function checkApiConnection() {
        Api.ApiService.checkHealth(function (status, response) {
            root.apiConnected = (status === 200 && response.status === "ok");
            if (root.apiConnected && response.blog_count !== undefined) {
                root.blogCount = response.blog_count;
            }
        });
    }

    // ============================================================
    // 布局
    // ============================================================
    ColumnLayout {
        anchors.fill: parent
        spacing: 0

        // ---- 顶部标题栏 ----
        Rectangle {
            id: titleBar
            Layout.fillWidth: true
            Layout.preferredHeight: 48
            color: "#1a1a2e"

            RowLayout {
                anchors.fill: parent
                anchors.leftMargin: 16
                anchors.rightMargin: 16

                // Logo + 标题
                Text {
                    text: "🌸 Omiaちゃん Blog Admin"
                    color: "#ffffff"
                    font.pixelSize: 16
                    font.bold: true
                    font.family: "Microsoft YaHei"
                }

                Item { Layout.fillWidth: true }

                // 博客总数
                Text {
                    text: root.apiConnected ? "📄 " + root.blogCount + " 篇博客" : ""
                    color: "#a0a0b8"
                    font.pixelSize: 13
                    font.family: "Microsoft YaHei"
                    visible: root.apiConnected
                }

                // 连接状态指示灯
                Rectangle {
                    width: 10; height: 10; radius: 5
                    color: root.apiConnected ? "#4caf50" : "#f44336"
                }
                Text {
                    text: root.apiConnected ? "已连接" : "未连接"
                    color: root.apiConnected ? "#4caf50" : "#f44336"
                    font.pixelSize: 12
                    font.family: "Microsoft YaHei"
                }

                Item { Layout.preferredWidth: 16 }

                // 登录/登出 按钮
                Button {
                    id: authBtn
                    text: root.isLoggedIn ? "🚪 登出" : "🔑 登录"
                    flat: true
                    font.family: "Microsoft YaHei"
                    onClicked: {
                        if (root.isLoggedIn) {
                            doLogout();
                        } else {
                            loginDialog.open();
                        }
                    }
                }
            }
        }

        // ---- 主内容区 ----
        RowLayout {
            Layout.fillWidth: true
            Layout.fillHeight: true
            spacing: 0

            // 侧边导航
            Rectangle {
                id: sidebar
                Layout.preferredWidth: 200
                Layout.fillHeight: true
                color: "#16213e"

                ColumnLayout {
                    anchors.fill: parent
                    anchors.margins: 8
                    spacing: 4

                    Text {
                        text: "导航菜单"
                        color: "#808090"
                        font.pixelSize: 11
                        font.family: "Microsoft YaHei"
                        Layout.leftMargin: 8
                        Layout.topMargin: 4
                    }

                    // 导航按钮列表
                    Repeater {
                        model: [
                            { name: "📋 博客列表", page: 0 },
                            { name: "✏️ 新建博客", page: 1, auth: true },
                            { name: "⚙️ 设置", page: 2 }
                        ]
                        delegate: Button {
                            Layout.fillWidth: true
                            Layout.preferredHeight: 40
                            flat: true
                            highlighted: mainStack.currentIndex === modelData.page
                            enabled: !modelData.auth || root.isLoggedIn

                            contentItem: Text {
                                text: modelData.name
                                color: parent.enabled
                                       ? (parent.highlighted ? "#ffffff" : "#c0c0d0")
                                       : "#606070"
                                font.pixelSize: 14
                                font.family: "Microsoft YaHei"
                                verticalAlignment: Text.AlignVCenter
                                leftPadding: 12
                            }

                            background: Rectangle {
                                color: parent.highlighted ? "#0f3460" : "transparent"
                                radius: 6
                            }

                            onClicked: mainStack.currentIndex = modelData.page
                        }
                    }

                    Item { Layout.fillHeight: true }

                    // 底部版本信息
                    Text {
                        text: "v1.0.0"
                        color: "#505060"
                        font.pixelSize: 11
                        font.family: "JetBrains Mono"
                        Layout.leftMargin: 8
                        Layout.bottomMargin: 8
                    }
                }
            }

            // 内容区
            StackLayout {
                id: mainStack
                Layout.fillWidth: true
                Layout.fillHeight: true
                currentIndex: 0

                BlogListPage {
                    id: blogListPage
                }

                BlogEditPage {
                    id: blogEditPage
                }

                SettingsPage {
                    id: settingsPage
                }
            }
        }

        // ---- 底部状态栏 ----
        Rectangle {
            id: statusBar
            Layout.fillWidth: true
            Layout.preferredHeight: 24
            color: "#0f0f23"

            RowLayout {
                anchors.fill: parent
                anchors.leftMargin: 10
                anchors.rightMargin: 10

                Text {
                    text: "API: " + root.apiBaseUrl
                    color: "#707080"
                    font.pixelSize: 11
                    font.family: "JetBrains Mono"
                }
                Item { Layout.fillWidth: true }
                Text {
                    text: root.isLoggedIn ? ("👤 " + root.currentUsername) : "🔒 未登录"
                    color: root.isLoggedIn ? "#4caf50" : "#707080"
                    font.pixelSize: 11
                    font.family: "Microsoft YaHei"
                }
            }
        }
    }

    // ============================================================
    // 全局弹窗
    // ============================================================
    LoginDialog { id: loginDialog }
    ToastNotification { id: toast }

    // ============================================================
    // 全局函数
    // ============================================================

    function doLogout() {
        root.isLoggedIn = false;
        root.authToken = "";
        root.currentUsername = "";
        toast.show("已登出", "info");
    }

    function showToast(message, type) {
        toast.show(message, type || "info");
    }
}
