/**
 * LoginDialog.qml — 管理员登录弹窗
 * =================================
 * 模态对话框，输入用户名和密码进行认证。
 *
 * 用法:
 *   loginDialog.open()    — 打开
 *   loginDialog.close()   — 关闭（登录成功自动关闭）
 */

import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import "../services/ApiService.js" as Api

Dialog {
    id: loginDialog
    title: "🔑 管理员登录"
    modal: true
    standardButtons: Dialog.Cancel

    width: 400
    height: 280

    // ---- 内容 ----
    ColumnLayout {
        anchors.fill: parent
        spacing: 12

        // 用户名
        Text {
            text: "用户名"
            color: "#c0c0d0"
            font.pixelSize: 13
            font.family: "Microsoft YaHei"
        }
        TextField {
            id: usernameField
            Layout.fillWidth: true
            placeholderText: "请输入用户名"
            font.family: "Microsoft YaHei"
            font.pixelSize: 14
        }

        // 密码
        Text {
            text: "密码"
            color: "#c0c0d0"
            font.pixelSize: 13
            font.family: "Microsoft YaHei"
        }
        TextField {
            id: passwordField
            Layout.fillWidth: true
            placeholderText: "请输入密码"
            echoMode: TextInput.Password
            font.family: "Microsoft YaHei"
            font.pixelSize: 14
        }

        // 错误提示
        Text {
            id: errorText
            color: "#f44336"
            font.pixelSize: 12
            font.family: "Microsoft YaHei"
            visible: false
            Layout.fillWidth: true
        }

        Item { Layout.preferredHeight: 4 }

        // 登录按钮
        Button {
            id: loginBtn
            text: "登录"
            Layout.fillWidth: true
            Layout.preferredHeight: 40
            font.family: "Microsoft YaHei"
            font.pixelSize: 14
            font.bold: true
            enabled: usernameField.text.trim() !== "" && passwordField.text !== ""

            onClicked: {
                errorText.visible = false;
                loginBtn.enabled = false;
                loginBtn.text = "登录中...";

                Api.ApiService.login(
                    usernameField.text.trim(),
                    passwordField.text,
                    function (status, response) {
                        loginBtn.enabled = true;
                        loginBtn.text = "登录";

                        if (status === 200 && response.token) {
                            // 登录成功
                            root.authToken = response.token;
                            root.isLoggedIn = true;
                            root.currentUsername = response.username || usernameField.text.trim();
                            root.showToast("✅ 登录成功，欢迎 " + root.currentUsername, "success");

                            // 清空输入
                            usernameField.text = "";
                            passwordField.text = "";
                            loginDialog.close();

                            // 刷新博客列表
                            if (blogListPage) {
                                blogListPage.refresh();
                            }
                        } else {
                            // 登录失败
                            errorText.text = response.message || "用户名或密码错误";
                            errorText.visible = true;
                        }
                    }
                );
            }
        }
    }

    // ---- 按回车提交 ----
    Keys.onReturnPressed: {
        if (loginBtn.enabled) {
            loginBtn.clicked();
        }
    }

    // ---- 打开时聚焦用户名 ----
    onOpened: {
        usernameField.forceActiveFocus();
        errorText.visible = false;
    }

    // ---- 关闭标准按钮 ----
    onRejected: {
        // 用户点击取消
    }
}
