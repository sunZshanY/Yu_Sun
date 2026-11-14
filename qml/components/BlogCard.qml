/**
 * BlogCard.qml — 博客卡片组件
 * ============================
 * 显示博客摘要信息：标题、日期、标签、内容预览、操作按钮。
 *
 * 属性:
 *   blogData: var   — 博客数据对象 {id, title, date, content, tags, image}
 *   isAdmin: bool   — 是否显示编辑/删除按钮
 *
 * 信号:
 *   clicked(int blogId)     — 点击卡片
 *   editRequested(int blogId) — 请求编辑
 *   deleteRequested(int blogId) — 请求删除
 */

import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Frame {
    id: card

    // ---- 属性 ----
    property var blogData: ({})
    property bool isAdmin: false

    // ---- 信号 ----
    signal clicked(int blogId)
    signal editRequested(int blogId)
    signal deleteRequested(int blogId)

    // ---- 外观 ----
    padding: 16
    Layout.fillWidth: true
    implicitHeight: Math.max(120, contentColumn.implicitHeight + 32)

    background: Rectangle {
        color: "#16213e"
        radius: 10
        border.color: mouseArea.containsMouse ? "#3a3a5c" : "#2a2a4a"
        border.width: 1

        // 悬停效果
        Behavior on border.color { ColorAnimation { duration: 200 } }
    }

    // ---- 布局 ----
    ColumnLayout {
        id: contentColumn
        anchors.fill: parent
        spacing: 8

        // 标题行
        RowLayout {
            Layout.fillWidth: true

            Text {
                text: card.blogData.title || "无标题"
                color: "#ffffff"
                font.pixelSize: 16
                font.bold: true
                font.family: "Microsoft YaHei"
                elide: Text.ElideRight
                Layout.fillWidth: true
            }

            // 日期标签
            Text {
                text: card.blogData.date || ""
                color: "#808090"
                font.pixelSize: 12
                font.family: "JetBrains Mono"
            }
        }

        // 内容预览
        Text {
            text: {
                var c = card.blogData.content || "";
                return c.length > 120 ? c.substring(0, 120) + "..." : c;
            }
            color: "#a0a0b8"
            font.pixelSize: 13
            font.family: "Microsoft YaHei"
            elide: Text.ElideRight
            maximumLineCount: 2
            wrapMode: Text.WordWrap
            Layout.fillWidth: true
            visible: text !== ""
        }

        // 标签 + 操作按钮
        RowLayout {
            Layout.fillWidth: true

            // 标签流
            Flow {
                Layout.fillWidth: true
                spacing: 4

                Repeater {
                    model: card.blogData.tags || []
                    delegate: Rectangle {
                        width: tagText.implicitWidth + 12
                        height: 22
                        radius: 11
                        color: "#0f3460"

                        Text {
                            id: tagText
                            anchors.centerIn: parent
                            text: "#" + modelData
                            color: "#80b0e0"
                            font.pixelSize: 11
                            font.family: "JetBrains Mono"
                        }
                    }
                }
            }

            // 编辑/删除按钮（仅管理员可见）
            RowLayout {
                visible: card.isAdmin
                spacing: 4

                Button {
                    text: "✏️"
                    flat: true
                    font.pixelSize: 14
                    onClicked: card.editRequested(card.blogData.id)
                    ToolTip.text: "编辑"
                    ToolTip.visible: hovered
                }

                Button {
                    text: "🗑️"
                    flat: true
                    font.pixelSize: 14
                    onClicked: card.deleteRequested(card.blogData.id)
                    ToolTip.text: "删除"
                    ToolTip.visible: hovered
                }
            }
        }
    }

    // ---- 鼠标交互 ----
    MouseArea {
        id: mouseArea
        anchors.fill: parent
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        onClicked: card.clicked(card.blogData.id)
    }
}
