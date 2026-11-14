/**
 * ToastNotification.qml — 通知提示组件
 * ======================================
 * 从顶部滑入的消息提示，3 秒后自动消失。
 *
 * 用法:
 *   toast.show("保存成功", "success");
 *   toast.show("网络错误", "error");
 *   toast.show("正在加载...", "info");
 */

import QtQuick
import QtQuick.Controls

Rectangle {
    id: toastRoot

    // ---- 外观 ----
    width: parent ? Math.min(parent.width * 0.5, 400) : 400
    height: 48
    radius: 8
    visible: false
    z: 9999
    anchors.horizontalCenter: parent ? parent.horizontalCenter : undefined
    y: -60

    // 颜色根据类型变化
    property string toastType: "info"
    color: {
        switch (toastType) {
            case "success": return "#2e7d32";
            case "error":   return "#c62828";
            case "warning": return "#e65100";
            default:        return "#1565c0";
        }
    }

    // ---- 内容 ----
    RowLayout {
        anchors.centerIn: parent
        anchors.margins: 12
        spacing: 8

        Text {
            id: iconText
            text: {
                switch (toastRoot.toastType) {
                    case "success": return "✅";
                    case "error":   return "❌";
                    case "warning": return "⚠️";
                    default:        return "ℹ️";
                }
            }
            color: "#ffffff"
            font.pixelSize: 18
        }

        Text {
            id: messageText
            text: ""
            color: "#ffffff"
            font.pixelSize: 14
            font.family: "Microsoft YaHei"
            Layout.fillWidth: true
        }
    }

    // ---- 动画 ----
    PropertyAnimation {
        id: slideIn
        target: toastRoot
        property: "y"
        to: 20
        duration: 300
        easing.type: Easing.OutCubic
    }

    PropertyAnimation {
        id: slideOut
        target: toastRoot
        property: "y"
        to: -60
        duration: 300
        easing.type: Easing.InCubic
    }

    Timer {
        id: hideTimer
        interval: 3000
        onTriggered: hide()
    }

    // ---- 公开方法 ----
    function show(message, type) {
        messageText.text = message;
        toastType = type || "info";
        visible = true;
        slideIn.start();
        hideTimer.restart();
    }

    function hide() {
        slideOut.start();
        // 动画结束后隐藏
        slideOut.finished.connect(function () {
            toastRoot.visible = false;
        });
    }
}
