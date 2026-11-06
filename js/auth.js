/**
 * 全站账号模块 — 右上角胶囊登录按钮 + 登录/注册弹窗
 * ==================================================
 * - GitHub OAuth + 用户名/密码（浏览器端 PBKDF2，服务端加盐 SHA-256）
 * - 首页与文章页共用同一份登录状态
 * - 评论区通过 window.OmiAuth.onChange 同步
 */
(function () {
    'use strict';

    var PBKDF2_ITERATIONS = 310000;
    var listeners = [];
    var state = {
        user: null,
        loading: true,
        config: { github: false, password: true },
        configError: false
    };
    var modal = null;
    var activeTab = 'login';
    var ready = null;
    var authVersion = 0;

    // ---------- 基础工具 ----------

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = text;
        return node;
    }

    function api(path, options) {
        var opts = options || {};
        var headers = new Headers(opts.headers || {});
        if (!headers.has('Accept')) headers.set('Accept', 'application/json');
        return fetch(path, {
            method: opts.method || 'GET',
            credentials: 'same-origin',
            headers: headers,
            body: opts.body
        }).then(function (response) {
            return response.text().then(function (text) {
                var data = {};
                if (text) {
                    try { data = JSON.parse(text); } catch (error) { data = {}; }
                }
                if (!response.ok) {
                    var failure = new Error(data.message || data.error || ('HTTP ' + response.status));
                    failure.status = response.status;
                    failure.data = data;
                    throw failure;
                }
                return data;
            });
        });
    }

    function base64UrlToBytes(value) {
        var base64 = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4) base64 += '=';
        var binary = atob(base64);
        var bytes = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    function bytesToBase64Url(bytes) {
        var binary = '';
        for (var i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    }

    function randomSalt() {
        var bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        return bytesToBase64Url(bytes);
    }

    /** 浏览器端 PBKDF2-SHA256，避免在 Workers 免费版里消耗服务端 CPU。 */
    async function deriveVerifier(password, salt) {
        if (!window.crypto || !window.crypto.subtle) {
            throw new Error('当前环境不支持安全登录，请使用 HTTPS');
        }
        var key = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(password),
            'PBKDF2',
            false,
            ['deriveBits']
        );
        var bits = await crypto.subtle.deriveBits({
            name: 'PBKDF2',
            salt: base64UrlToBytes(salt),
            iterations: PBKDF2_ITERATIONS,
            hash: 'SHA-256'
        }, key, 256);
        return bytesToBase64Url(new Uint8Array(bits));
    }

    function userIcon(size) {
        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('width', size || 17);
        svg.setAttribute('height', size || 17);
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '1.9');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        svg.setAttribute('aria-hidden', 'true');
        var circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', '12');
        circle.setAttribute('cy', '8');
        circle.setAttribute('r', '3.5');
        var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M4.5 20a7.5 7.5 0 0 1 15 0');
        svg.appendChild(circle);
        svg.appendChild(path);
        return svg;
    }

    function githubIcon(size) {
        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('width', size || 18);
        svg.setAttribute('height', size || 18);
        svg.setAttribute('aria-hidden', 'true');
        var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('fill', 'currentColor');
        path.setAttribute('d', 'M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.385-1.335-1.755-1.335-1.755-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12z');
        svg.appendChild(path);
        return svg;
    }

    function makeAvatar(user, size) {
        var name = (user && (user.displayName || user.username)) || '?';
        if (user && user.avatarUrl) {
            var img = document.createElement('img');
            img.className = 'auth-avatar';
            img.src = user.avatarUrl;
            img.alt = '';
            img.width = size;
            img.height = size;
            img.loading = 'lazy';
            img.referrerPolicy = 'no-referrer';
            img.style.width = size + 'px';
            img.style.height = size + 'px';
            img.addEventListener('error', function () {
                if (img.parentNode) img.parentNode.replaceChild(fallbackAvatar(name, size), img);
            }, { once: true });
            return img;
        }
        return fallbackAvatar(name, size);
    }

    function fallbackAvatar(name, size) {
        var span = el('span', 'auth-avatar auth-avatar-fallback');
        span.style.width = size + 'px';
        span.style.height = size + 'px';
        span.style.fontSize = Math.max(11, Math.round(size * 0.42)) + 'px';
        span.textContent = String(name || '?').trim().slice(0, 1).toUpperCase() || '?';
        span.setAttribute('aria-hidden', 'true');
        return span;
    }

    // ---------- 状态与订阅 ----------

    function snapshot() {
        return {
            user: state.user,
            loading: state.loading,
            config: state.config,
            configError: state.configError
        };
    }

    function notify() {
        listeners.slice().forEach(function (listener) {
            try { listener(snapshot()); } catch (error) {}
        });
    }

    function render() {
        renderButtons();
        renderModal();
        notify();
    }

    function setUser(user) {
        authVersion += 1;
        state.user = user || null;
        state.loading = false;
        render();
    }

    function onChange(listener) {
        if (typeof listener !== 'function') return function () {};
        listeners.push(listener);
        try { listener(snapshot()); } catch (error) {}
        return function () {
            var index = listeners.indexOf(listener);
            if (index !== -1) listeners.splice(index, 1);
        };
    }

    function loadAuth() {
        var version = authVersion;
        state.loading = true;
        renderButtons();
        return Promise.all([
            api('/api/auth/config').catch(function () {
                state.configError = true;
                return null;
            }),
            api('/api/auth/me').catch(function () {
                return { user: null };
            })
        ]).then(function (results) {
            // 如果等待期间用户已经通过弹窗登录/退出，别把新状态覆盖掉。
            if (version !== authVersion) return;
            state.config = results[0] || { github: false, password: true };
            state.user = results[1] && results[1].user ? results[1].user : null;
            state.loading = false;
            render();
        }).catch(function () {
            if (version !== authVersion) return;
            state.loading = false;
            render();
        });
    }

    function logout() {
        return api('/api/auth/logout', { method: 'POST' })
            .catch(function () {})
            .then(function () {
                setUser(null);
                return true;
            });
    }

    // ---------- 右上角胶囊按钮 ----------

    function renderButtons() {
        document.querySelectorAll('[data-auth-slot]').forEach(function (slot) {
            slot.textContent = '';
            var button = el('button', 'auth-pill');
            button.type = 'button';

            if (state.loading) {
                button.classList.add('auth-pill-loading');
                button.disabled = true;
                button.appendChild(el('span', 'auth-pill-spinner'));
                button.appendChild(el('span', 'auth-pill-label', '登录'));
                button.setAttribute('aria-label', '正在检查登录状态');
            } else if (state.user) {
                button.classList.add('auth-pill-user');
                button.appendChild(makeAvatar(state.user, 22));
                button.appendChild(el('span', 'auth-pill-label',
                    state.user.displayName || state.user.username));
                if (state.user.role === 'admin') {
                    button.appendChild(el('span', 'auth-pill-admin', '管理'));
                }
                button.setAttribute('aria-label',
                    '账号：' + (state.user.displayName || state.user.username));
            } else {
                button.classList.add('auth-pill-login');
                button.appendChild(userIcon(17));
                button.appendChild(el('span', 'auth-pill-label', '登录'));
                button.setAttribute('aria-label', '登录或注册');
            }

            button.addEventListener('click', function () {
                open(state.user ? 'account' : 'login');
            });
            slot.appendChild(button);
        });
    }

    // ---------- 弹窗 ----------

    function buildModal() {
        if (modal) return;
        modal = document.createElement('div');
        modal.className = 'auth-overlay';
        modal.id = 'authModal';
        modal.hidden = true;
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'authModalTitle');
        modal.innerHTML =
            '<div class="auth-backdrop" data-auth-close></div>' +
            '<div class="auth-card" role="document">' +
              '<button type="button" class="auth-close" data-auth-close aria-label="关闭">&times;</button>' +
              '<div class="auth-head">' +
                '<span class="auth-head-icon" id="authHeadIcon" aria-hidden="true"></span>' +
                '<h2 class="auth-heading" id="authModalTitle">登录 / 注册</h2>' +
                '<p class="auth-subtitle" id="authSubtitle">登录后即可参与文章评论</p>' +
              '</div>' +
              '<div class="auth-section" id="authLoggedOut">' +
                '<div class="auth-github" id="authGithubBlock">' +
                  '<button type="button" class="auth-github-btn" id="authGithubBtn"></button>' +
                  '<p class="auth-github-note">首次登录会自动创建账号，只保存公开资料。</p>' +
                '</div>' +
                '<div class="auth-divider" id="authDivider"><span>或使用账号密码</span></div>' +
                '<div class="auth-tabs" role="tablist" aria-label="登录方式">' +
                  '<button type="button" class="auth-tab" data-auth-tab="login" role="tab" aria-selected="true">登录</button>' +
                  '<button type="button" class="auth-tab" data-auth-tab="register" role="tab" aria-selected="false">注册</button>' +
                '</div>' +
                '<form class="auth-form" id="authLoginForm" novalidate>' +
                  '<label class="auth-field"><span>用户名</span>' +
                    '<input name="username" autocomplete="username" maxlength="20" placeholder="你的用户名" required>' +
                  '</label>' +
                  '<label class="auth-field"><span>密码</span>' +
                    '<input name="password" type="password" autocomplete="current-password" maxlength="128" placeholder="输入密码" required>' +
                  '</label>' +
                  '<p class="auth-form-error" id="authLoginError" role="alert" hidden></p>' +
                  '<button type="submit" class="auth-submit" id="authLoginSubmit">登录</button>' +
                  '<p class="auth-form-note">之前用 GitHub 注册的账号，请点上方 GitHub 按钮登录。</p>' +
                '</form>' +
                '<form class="auth-form" id="authRegisterForm" novalidate hidden>' +
                  '<label class="auth-field"><span>用户名</span>' +
                    '<input name="username" autocomplete="username" maxlength="20" placeholder="3-20 位，支持中文" required>' +
                  '</label>' +
                  '<label class="auth-field"><span>昵称（可选）</span>' +
                    '<input name="displayName" autocomplete="nickname" maxlength="30" placeholder="显示在评论区的名字">' +
                  '</label>' +
                  '<label class="auth-field"><span>邮箱（可选）</span>' +
                    '<input name="email" type="email" autocomplete="email" maxlength="255" placeholder="用于以后找回账号">' +
                  '</label>' +
                  '<label class="auth-field"><span>密码</span>' +
                    '<input name="password" type="password" autocomplete="new-password" maxlength="128" placeholder="至少 8 位" required>' +
                  '</label>' +
                  '<label class="auth-field"><span>确认密码</span>' +
                    '<input name="confirm" type="password" autocomplete="new-password" maxlength="128" placeholder="再输一次" required>' +
                  '</label>' +
                  '<p class="auth-form-error" id="authRegisterError" role="alert" hidden></p>' +
                  '<button type="submit" class="auth-submit" id="authRegisterSubmit">注册并登录</button>' +
                  '<p class="auth-form-note">密码在浏览器端完成 PBKDF2 派生，服务端只保存不可逆摘要。</p>' +
                '</form>' +
              '</div>' +
              '<div class="auth-section" id="authLoggedIn" hidden>' +
                '<div class="auth-account">' +
                  '<span class="auth-account-avatar" id="authAccountAvatar"></span>' +
                  '<div class="auth-account-info">' +
                    '<strong id="authAccountName"></strong>' +
                    '<span id="authAccountHandle"></span>' +
                  '</div>' +
                  '<span class="auth-account-role" id="authAccountRole" hidden>管理员</span>' +
                '</div>' +
                '<p class="auth-account-note">你已登录，可以回到文章页发表评论。</p>' +
                '<button type="button" class="auth-logout" id="authLogoutBtn">退出登录</button>' +
              '</div>' +
              '<p class="auth-footnote">登录即表示你同意本站保存公开资料与会话信息。</p>' +
            '</div>';

        document.body.appendChild(modal);

        // GitHub 按钮内容
        var githubBtn = modal.querySelector('#authGithubBtn');
        githubBtn.appendChild(githubIcon(18));
        githubBtn.appendChild(document.createTextNode('使用 GitHub 登录'));

        // 关闭
        modal.querySelectorAll('[data-auth-close]').forEach(function (node) {
            node.addEventListener('click', close);
        });

        // 标签切换
        modal.querySelectorAll('[data-auth-tab]').forEach(function (tab) {
            tab.addEventListener('click', function () {
                activeTab = tab.dataset.authTab === 'register' ? 'register' : 'login';
                clearFormErrors();
                renderModal();
                var form = modal.querySelector(activeTab === 'register' ? '#authRegisterForm' : '#authLoginForm');
                var input = form && form.querySelector('input');
                if (input) input.focus();
            });
        });

        // GitHub 登录
        githubBtn.addEventListener('click', function () {
            window.location.href = '/api/auth/github/start?return=' +
                encodeURIComponent(location.pathname + location.search + location.hash);
        });

        modal.querySelector('#authLoginForm').addEventListener('submit', onLoginSubmit);
        modal.querySelector('#authRegisterForm').addEventListener('submit', onRegisterSubmit);
        modal.querySelector('#authLogoutBtn').addEventListener('click', function () {
            var button = modal.querySelector('#authLogoutBtn');
            button.disabled = true;
            button.textContent = '退出中…';
            logout().finally(function () {
                button.disabled = false;
                button.textContent = '退出登录';
                close();
            });
        });

        // Esc 关闭
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && modal && !modal.hidden) close();
        });
    }

    function renderModal() {
        if (!modal) return;
        var loggedIn = !!state.user;
        var loggedOutSection = modal.querySelector('#authLoggedOut');
        var loggedInSection = modal.querySelector('#authLoggedIn');
        var title = modal.querySelector('#authModalTitle');
        var subtitle = modal.querySelector('#authSubtitle');
        var headIcon = modal.querySelector('#authHeadIcon');

        loggedOutSection.hidden = loggedIn;
        loggedInSection.hidden = !loggedIn;

        headIcon.textContent = '';
        if (loggedIn) {
            headIcon.appendChild(makeAvatar(state.user, 46));
        } else {
            headIcon.appendChild(userIcon(24));
        }

        if (loggedIn) {
            title.textContent = '我的账号';
            subtitle.textContent = '登录状态已同步到评论区';
            var avatarSlot = modal.querySelector('#authAccountAvatar');
            avatarSlot.textContent = '';
            avatarSlot.appendChild(makeAvatar(state.user, 52));
            modal.querySelector('#authAccountName').textContent =
                state.user.displayName || state.user.username;
            modal.querySelector('#authAccountHandle').textContent = '@' + state.user.username;
            modal.querySelector('#authAccountRole').hidden = state.user.role !== 'admin';
            return;
        }

        title.textContent = activeTab === 'register' ? '注册账号' : '登录';
        subtitle.textContent = activeTab === 'register'
            ? '创建账号后即可参与文章评论'
            : '登录后即可参与文章评论';

        var githubAvailable = !!(state.config && state.config.github);
        var passwordAvailable = !state.config || state.config.password !== false;
        modal.querySelector('#authGithubBlock').hidden = !githubAvailable;
        modal.querySelector('#authDivider').hidden = !githubAvailable || !passwordAvailable;
        modal.querySelector('.auth-tabs').hidden = !passwordAvailable;
        modal.querySelector('#authLoginForm').hidden = !passwordAvailable || activeTab !== 'login';
        modal.querySelector('#authRegisterForm').hidden = !passwordAvailable || activeTab !== 'register';

        modal.querySelectorAll('[data-auth-tab]').forEach(function (tab) {
            var selected = tab.dataset.authTab === activeTab;
            tab.setAttribute('aria-selected', selected ? 'true' : 'false');
            tab.classList.toggle('is-active', selected);
        });
    }

    function open(tab) {
        buildModal();
        activeTab = tab === 'register' ? 'register' : (tab === 'account' && state.user ? 'account' : 'login');
        if (state.user) activeTab = 'account';
        modal.hidden = false;
        document.body.style.overflow = 'hidden';
        clearFormErrors();
        renderModal();
        setTimeout(function () {
            if (state.user) {
                var logoutButton = modal.querySelector('#authLogoutBtn');
                if (logoutButton) logoutButton.focus();
                return;
            }
            var form = modal.querySelector(activeTab === 'register' ? '#authRegisterForm' : '#authLoginForm');
            var input = form && form.querySelector('input');
            if (input) input.focus();
        }, 40);
    }

    function close() {
        if (!modal) return;
        modal.hidden = true;
        document.body.style.overflow = '';
        clearFormErrors();
    }

    function setFormError(id, message) {
        var node = modal && modal.querySelector(id);
        if (!node) return;
        node.textContent = message || '';
        node.hidden = !message;
    }

    function clearFormErrors() {
        setFormError('#authLoginError', '');
        setFormError('#authRegisterError', '');
    }

    function setSubmitBusy(button, busy, text) {
        if (!button) return;
        if (busy) {
            button.dataset.label = button.textContent;
            button.textContent = text || '处理中…';
            button.disabled = true;
        } else {
            button.textContent = button.dataset.label || '提交';
            button.disabled = false;
        }
    }

    async function onLoginSubmit(event) {
        event.preventDefault();
        if (!modal) return;
        var form = modal.querySelector('#authLoginForm');
        var username = form.username.value.trim();
        var password = form.password.value;
        var button = modal.querySelector('#authLoginSubmit');
        clearFormErrors();

        if (!username || !password) {
            setFormError('#authLoginError', '请填写用户名和密码');
            return;
        }

        setSubmitBusy(button, true, '登录中…');
        try {
            var saltResponse = await api('/api/auth/salt?username=' + encodeURIComponent(username));
            var verifier = await deriveVerifier(password, saltResponse.salt);
            var result = await api('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: username, verifier: verifier })
            });
            setUser(result.user);
            close();
        } catch (failure) {
            setFormError('#authLoginError',
                (failure.data && failure.data.message) || failure.message || '登录失败，请稍后再试');
        } finally {
            setSubmitBusy(button, false);
        }
    }

    async function onRegisterSubmit(event) {
        event.preventDefault();
        if (!modal) return;
        var form = modal.querySelector('#authRegisterForm');
        var username = form.username.value.trim();
        var displayName = form.displayName.value.trim();
        var email = form.email.value.trim();
        var password = form.password.value;
        var confirm = form.confirm.value;
        var button = modal.querySelector('#authRegisterSubmit');
        clearFormErrors();

        if (!/^[A-Za-z0-9_\-\u4e00-\u9fa5]{3,20}$/.test(username)) {
            setFormError('#authRegisterError', '用户名需为 3-20 位中文、字母、数字、下划线或短横线');
            return;
        }
        if (password.length < 8) {
            setFormError('#authRegisterError', '密码至少 8 位');
            return;
        }
        if (password !== confirm) {
            setFormError('#authRegisterError', '两次输入的密码不一致');
            return;
        }

        setSubmitBusy(button, true, '注册中…');
        try {
            var salt = randomSalt();
            var verifier = await deriveVerifier(password, salt);
            var result = await api('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: username,
                    displayName: displayName,
                    email: email,
                    salt: salt,
                    verifier: verifier
                })
            });
            setUser(result.user);
            close();
        } catch (failure) {
            setFormError('#authRegisterError',
                (failure.data && failure.data.message) || failure.message || '注册失败，请稍后再试');
        } finally {
            setSubmitBusy(button, false);
        }
    }

    // ---------- 启动 ----------

    function boot() {
        document.querySelectorAll('[data-auth-slot]').forEach(function (slot) {
            if (!slot.firstChild) slot.textContent = '';
        });
        renderButtons();
        ready = loadAuth();
    }

    window.OmiAuth = {
        getState: snapshot,
        getUser: function () { return state.user; },
        onChange: onChange,
        open: open,
        close: close,
        refresh: loadAuth,
        setUser: setUser,
        logout: logout,
        ready: function () { return ready || loadAuth(); }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
