/**
 * ImagePicker.qml — 图片选择器组件
 * ==================================
 * 支持本地文件选择和 URL 输入两种方式。
 *
 * 属性:
 *   imageUrl: string  — 当前选中的图片 URL/路径
 *
 * 信号:
 *   imageChanged(string newUrl) — 图片变更时触发
 */

import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Dialogs

ColumnLayout {
    id: picker
    spacing: 8

    property string imageUrl: ""
    signal imageChanged(string newUrl)

    // ---- 预览区 ----
    Rectangle {
        Layout.preferredWidth: 200
        Layout.preferredHeight: 150
        Layout.alignment: Qt.AlignLeft
        color: "#0a0a1a"
        radius: 8
        border.color: "#2a2a4a"
        border.width: 1

        // 有图片时显示预览
        Image {
            anchors.fill: parent
            anchors.margins: 4
            source: picker.imageUrl || ""
            fillMode: Image.PreserveAspectFit
            visible: picker.imageUrl !== ""
        }

        // 无图片时显示占位符
        Text {
            anchors.centerIn: parent
            text: "🖼️ 无图片"
            color: "#505070"
            font.pixelSize: 14
            font.family: "Microsoft YaHei"
            visible: picker.imageUrl === ""
        }
    }

    // ---- 控制区 ----
    RowLayout {
        spacing: 8

        // 选择本地文件
        Button {
            text: "📁 选择本地图片"
            font.family: "Microsoft YaHei"
            onClicked: fileDialog.open()
        }

        // 清除图片
        Button {
            text: "✕ 清除"
            font.family: "Microsoft YaHei"
            flat: true
            enabled: picker.imageUrl !== ""
            onClicked: {
                picker.imageUrl = "";
                picker.imageChanged("");
            }
        }
    }

    // URL 输入框
    RowLayout {
        Layout.fillWidth: true
        spacing: 8

        Text {
            text: "或输入URL:"
            color: "#808090"
            font.pixelSize: 12
            font.family: "Microsoft YaHei"
        }

        TextField {
            id: urlField
            Layout.fillWidth: true
            placeholderText: "https://example.com/image.jpg"
            text: picker.imageUrl || ""
            font.family: "JetBrains Mono"
            font.pixelSize: 12

            onEditingFinished: {
                var val = text.trim();
                picker.imageUrl = val;
                picker.imageChanged(val);
            }
        }
    }

    // 文件选择对话框
    FileDialog {
        id: fileDialog
        title: "选择图片"
        nameFilters: ["图片文件 (*.png *.jpg *.jpeg *.gif *.webp)", "所有文件 (*)"]
        onAccepted: {
            if (selectedFile) {
                var filePath = selectedFile.toString();
                // 移除 Windows 路径前缀 "file:///"
                filePath = filePath.replace(/^file:\/\/\//, "");
                // 也处理 Linux/macOS 路径 "file://"
                filePath = filePath.replace(/^file:\/\//, "");
                picker.imageUrl = decodeURIComponent(filePath);
                picker.imageChanged(picker.imageUrl);
                urlField.text = picker.imageUrl;
            }
        }
    }
}
