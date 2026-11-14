/**
 * SettingsPage.qml — 设置页
 * ==========================
 * 配置 API 服务器地址、查看连接状态、显示版本信息。
 */

import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import "../services/ApiService.js" as Api
import "../components/"

Page {
    id: page
    padding: 20

    // ---- 布局 ----
    ColumnLayout {
        anchors.fill: parent
        spacing: 20

        Text {
            text: "⚙️ 设置"
            color: "#ffffff"
            font.pixelSize: 22
            font.bold: true
            font.family: "Microsoft YaHei"
        }

        // ---- API 服务器地址 ----
        GroupBox {
            title: "API 服务器地址"
            Layout.fillWidth: true

            background: Rectangle {
                color: "#16213e"
                radius: 8
                border.color: "#2a2a4a"
            }

            ColumnLayout {
                anchors.fill: parent
                spacing: 8

                Text {
                    text: "Flask API 服务器地址（QML 客户端通过此地址与后端通信）"
                    color: "#808090"
                    font.pixelSize: 12
                    font.family: "Microsoft YaHei"
                    wrapMode: Text.WordWrap
                    Layout.fillWidth: true
                }

                RowLayout {
                    Layout.fillWidth: true
                    spacing: 8

                    TextField {
                        id: apiUrlField
                        Layout.fillWidth: true
                        text: root.apiBaseUrl
                        font.family: "JetBrains Mono"
                        font.pixelSize: 13
                        placeholderText: "http://127.0.0.1:5000/api"
                    }

                    Button {
                        text: "💾 保存"
                        font.family: "Microsoft YaHei"
                        onClicked: {
                            var newUrl = apiUrlField.text.trim().replace(/\/+$/, "");
                            root.apiBaseUrl = newUrl;
                            Api.ApiService.setBaseUrl(newUrl);
                            root.checkApiConnection();
                            root.showToast("✅ API 地址已更新", "success");
                        }
                    }
                }
            }
        }

        // ---- 连接状态 ----
        GroupBox {
            title: "连接状态"
            Layout.fillWidth: true

            background: Rectangle {
                color: "#16213e"
                radius: 8
                border.color: "#2a2a4a"
            }

            ColumnLayout {
                spacing: 8

                RowLayout {
                    spacing: 8
                    Text { text: "状态:"; color: "#808090"; font.family: "Microsoft YaHei" }
                    Rectangle {
                        width: 12; height: 12; radius: 6
                        color: root.apiConnected ? "#4caf50" : "#f44336"
                    }
                    Text {
                        text: root.apiConnected ? "已连接 ✅" : "未连接 ❌"
                        color: root.apiConnected ? "#4caf50" : "#f44336"
                        font.family: "Microsoft YaHei"
                    }
                }

                Text {
                    text: "博客总数: " + root.blogCount + " 篇"
                    color: "#a0a0b8"
                    font.family: "Microsoft YaHei"
                }

                Text {
                    text: "当前地址: " + root.apiBaseUrl
                    color: "#707080"
                    font.family: "JetBrains Mono"
                    font.pixelSize: 11
                }

                Button {
                    text: "🔄 检测连接"
                    font.family: "Microsoft YaHei"
                    onClicked: {
                        root.checkApiConnection();
                        root.showToast(
                            root.apiConnected ? "✅ 连接正常" : "❌ 无法连接到服务器",
                            root.apiConnected ? "success" : "error"
                        );
                    }
                }
            }
        }

        // ---- 关于 ----
        GroupBox {
            title: "关于"
            Layout.fillWidth: true

            background: Rectangle {
                color: "#16213e"
                radius: 8
                border.color: "#2a2a4a"
            }

            ColumnLayout {
                spacing: 4

                Text {
                    text: "🌸 Omiaちゃん Blog Admin v1.0.0"
                    color: "#c0c0d0"
                    font.pixelSize: 14
                    font.family: "Microsoft YaHei"
                }
                Text {
                    text: "技术栈: QML + RinUI (Fluent Design) + Flask + Python"
                    color: "#808090"
                    font.pixelSize: 12
                    font.family: "Microsoft YaHei"
                }
                Text {
                    text: "RinUI 提供 Fluent Design 风格界面主题"
                    color: "#707080"
                    font.pixelSize: 11
                    font.family: "Microsoft YaHei"
                }
            }
        }

        // 填充底部
        Item { Layout.fillHeight: true }
    }
}
