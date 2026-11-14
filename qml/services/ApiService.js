/**
 * ApiService.js — QML 端 HTTP 请求封装
 * ========================================
 * 使用 QML 内置 XMLHttpRequest 与 Flask API 通信。
 * 通过 Qt.include() 或内联方式在 QML 中使用。
 *
 * 用法:
 *   ApiService.getBlogs(function(status, data) { ... });
 *   ApiService.createBlog(blogData, token, function(status, data) { ... });
 */

var ApiService = (function () {
    "use strict";

    // ---- 配置 ----
    var _baseUrl = "http://127.0.0.1:5000/api";
    var _timeout = 10000; // 10 秒超时

    // ---- 公共方法 ----

    /**
     * 设置 API 基础地址
     * @param {string} url - 例如 "http://192.168.1.100:5000/api"
     */
    function setBaseUrl(url) {
        if (url && typeof url === "string") {
            _baseUrl = url.replace(/\/+$/, ""); // 去掉末尾斜杠
        }
    }

    /**
     * 获取当前 API 基础地址
     * @returns {string}
     */
    function getBaseUrl() {
        return _baseUrl;
    }

    /**
     * 底层通用请求
     * @param {string} method   - HTTP 方法 (GET/POST/PUT/DELETE)
     * @param {string} path     - API 路径 (如 "/blogs")
     * @param {object} body     - 请求体 (GET 请求传 null)
     * @param {string} token    - Bearer 认证令牌 (可选)
     * @param {function} callback - function(statusCode: int, response: object)
     */
    function request(method, path, body, token, callback) {
        var xhr = new XMLHttpRequest();
        xhr.open(method, _baseUrl + path, true);
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.setRequestHeader("Accept", "application/json");

        if (token) {
            xhr.setRequestHeader("Authorization", "Bearer " + token);
        }

        xhr.timeout = _timeout;

        xhr.onreadystatechange = function () {
            if (xhr.readyState === XMLHttpRequest.DONE) {
                var response = null;
                try {
                    response = JSON.parse(xhr.responseText);
                } catch (e) {
                    response = { error: "ParseError", message: "响应解析失败" };
                }
                callback(xhr.status, response);
            }
        };

        xhr.ontimeout = function () {
            callback(0, { error: "Timeout", message: "请求超时，请检查服务器是否运行" });
        };

        xhr.onerror = function () {
            callback(0, { error: "NetworkError", message: "网络连接失败，请检查 API 地址" });
        };

        if (body !== null && body !== undefined) {
            xhr.send(JSON.stringify(body));
        } else {
            xhr.send();
        }
    }

    // ---- 博客 API ----

    /**
     * 健康检查
     */
    function checkHealth(callback) {
        request("GET", "/health", null, null, callback);
    }

    /**
     * 获取博客列表
     * @param {string} search  - 搜索关键词 (可选)
     * @param {function} callback
     */
    function getBlogs(search, callback) {
        var path = "/blogs";
        if (search && search.trim()) {
            path += "?search=" + encodeURIComponent(search.trim());
        }
        request("GET", path, null, null, callback);
    }

    /**
     * 获取单篇博客
     */
    function getBlog(id, callback) {
        request("GET", "/blogs/" + id, null, null, callback);
    }

    /**
     * 创建博客
     */
    function createBlog(data, token, callback) {
        request("POST", "/blogs", data, token, callback);
    }

    /**
     * 更新博客
     */
    function updateBlog(id, data, token, callback) {
        request("PUT", "/blogs/" + id, data, token, callback);
    }

    /**
     * 删除博客
     */
    function deleteBlog(id, token, callback) {
        request("DELETE", "/blogs/" + id, null, token, callback);
    }

    // ---- 认证 API ----

    /**
     * 管理员登录
     */
    function login(username, password, callback) {
        request("POST", "/auth/login", {
            username: username,
            password: password
        }, null, callback);
    }

    /**
     * 检查令牌状态
     */
    function checkAuth(token, callback) {
        request("GET", "/auth/status", null, token, callback);
    }

    /**
     * 登出
     */
    function logout(token, callback) {
        request("POST", "/auth/logout", null, token, callback);
    }

    // ---- 统计 API ----

    /**
     * 获取访客统计
     */
    function getVisitors(callback) {
        request("GET", "/stats/visitors", null, null, callback);
    }

    /**
     * 递增访客计数
     */
    function incrementVisitors(callback) {
        request("POST", "/stats/visitors", null, null, callback);
    }

    // ---- 公开接口 ----
    return {
        setBaseUrl: setBaseUrl,
        getBaseUrl: getBaseUrl,
        request: request,
        checkHealth: checkHealth,
        getBlogs: getBlogs,
        getBlog: getBlog,
        createBlog: createBlog,
        updateBlog: updateBlog,
        deleteBlog: deleteBlog,
        login: login,
        checkAuth: checkAuth,
        logout: logout,
        getVisitors: getVisitors,
        incrementVisitors: incrementVisitors
    };
})();
