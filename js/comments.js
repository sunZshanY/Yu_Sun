/**
 * 文章评论区 — 原创实现，无第三方依赖
 * ====================================
 * - 登录：GitHub OAuth（/api/auth/github/start）
 * - 评论：/api/comments（Cloudflare D1）
 * - 回复、删除、登录态恢复、主题跟随均由本文件处理
 */
(function () {
    'use strict';

    var section = document.getElementById('comments');
    if (!section) return;

    var countEl = document.getElementById('commentsCount');
    var accountEl = document.getElementById('commentsAccount');
    var authEl = document.getElementById('commentsAuth');
    var composeEl = document.getElementById('commentCompose');
    var composeAvatar = document.getElementById('composeAvatar');
    var composeName = document.getElementById('composeName');
    var replyHint = document.getElementById('commentReplyHint');
    var replyName = document.getElementById('commentReplyName');
    var replyCancel = document.getElementById('commentReplyCancel');
    var inputEl = document.getElementById('commentInput');
    var charCount = document.getElementById('commentCharCount');
    var submitEl = document.getElementById('commentSubmit');
    var errorEl = document.getElementById('commentError');
    var statusEl = document.getElementById('commentsStatus');
    var listEl = document.getElementById('commentsList');
    var emptyEl = document.getElementById('commentsEmpty');

    var state = {
        postId: null,
        user: null,
        authLoading: true,
        authNotice: '',
        comments: [],
        total: 0,
        replyTo: null,
        serviceDown: false,
        bound: false
    };

    // ---------- 工具 ----------

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

    function setStatus(message, kind) {
        if (!message) {
            statusEl.hidden = true;
            statusEl.textContent = '';
            statusEl.className = 'comments-status';
            return;
        }
        statusEl.hidden = false;
        statusEl.textContent = message;
        statusEl.className = 'comments-status' + (kind === 'error' ? ' is-error' : '');
    }

    function showError(message) {
        errorEl.textContent = message;
        errorEl.hidden = false;
    }

    function clearError() {
        errorEl.textContent = '';
        errorEl.hidden = true;
    }

    function formatTime(value) {
        var date = new Date(value);
        if (isNaN(date.getTime())) return value || '';
        var diff = Date.now() - date.getTime();
        if (diff < 60 * 1000) return '刚刚';
        if (diff < 60 * 60 * 1000) return Math.floor(diff / 60000) + ' 分钟前';
        if (diff < 24 * 60 * 60 * 1000) return Math.floor(diff / 3600000) + ' 小时前';
        if (diff < 7 * 24 * 60 * 60 * 1000) return Math.floor(diff / 86400000) + ' 天前';
        return date.getFullYear() + '-' +
            String(date.getMonth() + 1).padStart(2, '0') + '-' +
            String(date.getDate()).padStart(2, '0');
    }

    function fallbackAvatar(name, size) {
        var span = el('span', 'comment-avatar comment-avatar-fallback');
        span.style.width = size + 'px';
        span.style.height = size + 'px';
        span.textContent = String(name || '?').trim().slice(0, 1).toUpperCase() || '?';
        span.setAttribute('aria-hidden', 'true');
        return span;
    }

    function makeAvatar(user, size) {
        var name = (user && (user.displayName || user.username)) || '?';
        if (user && user.avatarUrl) {
            var img = document.createElement('img');
            img.className = 'comment-avatar';
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

    // ---------- 渲染 ----------

    function updateCharCount() {
        charCount.textContent = inputEl.value.length + ' / 2000';
    }

    function updateSubmitLabel() {
        if (submitEl.disabled) return;
        submitEl.textContent = state.replyTo ? '发表回复' : '发表评论';
    }

    function renderComposeAvatar() {
        composeAvatar.textContent = '';
        if (state.user) composeAvatar.appendChild(makeAvatar(state.user, 34));
    }

    function renderAuth() {
        accountEl.textContent = '';
        authEl.textContent = '';

        if (state.user) {
            var chip = el('span', 'comments-user-chip');
            chip.appendChild(makeAvatar(state.user, 26));
            chip.appendChild(el('span', 'comments-user-name', state.user.displayName || state.user.username));
            if (state.user.role === 'admin') {
                chip.appendChild(el('span', 'comment-admin-badge', '管理员'));
            }
            accountEl.appendChild(chip);

            var logoutButton = el('button', 'comment-text-btn', '退出');
            logoutButton.type = 'button';
            logoutButton.addEventListener('click', logout);
            accountEl.appendChild(logoutButton);

            authEl.hidden = true;
            composeEl.hidden = false;
            composeName.textContent = state.user.displayName || state.user.username;
            renderComposeAvatar();
            updateSubmitLabel();
            return;
        }

        composeEl.hidden = true;
        authEl.hidden = false;

        if (state.authLoading) {
            authEl.appendChild(el('p', 'comments-auth-note', '正在检查登录状态…'));
            return;
        }

        if (state.authNotice) {
            authEl.appendChild(el('p', 'comments-auth-error', state.authNotice));
        }

        authEl.appendChild(el('p', 'comments-auth-title', '登录后参与评论'));

        var login = el('button', 'comment-login-btn', '登录 / 注册');
        login.type = 'button';
        login.addEventListener('click', function () { openAuth('login'); });
        authEl.appendChild(login);
        authEl.appendChild(el('p', 'comments-auth-note',
            '支持 GitHub 或用户名密码登录，首次登录自动创建账号。'));
    }

    function findComment(list, id) {
        for (var i = 0; i < list.length; i++) {
            if (list[i].id === id) return list[i];
            if (list[i].replies && list[i].replies.length) {
                var found = findComment(list[i].replies, id);
                if (found) return found;
            }
        }
        return null;
    }

    function startReply(comment) {
        if (!state.user) return;
        state.replyTo = {
            id: comment.id,
            name: comment.user.displayName || comment.user.username
        };
        replyName.textContent = state.replyTo.name;
        replyHint.hidden = false;
        updateSubmitLabel();
        inputEl.focus();
        inputEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function cancelReply() {
        state.replyTo = null;
        replyHint.hidden = true;
        replyName.textContent = '';
        updateSubmitLabel();
    }

    function removeComment(comment) {
        if (!state.user) return;
        if (!window.confirm('确定删除这条评论吗？')) return;

        api('/api/comments/' + encodeURIComponent(comment.id), { method: 'DELETE' })
            .then(function () {
                comment.status = 'deleted';
                comment.content = '';
                renderComments();
            })
            .catch(function (failure) {
                window.alert((failure.data && failure.data.message) || '删除失败，请稍后再试');
            });
    }

    function renderComment(comment, isReply) {
        var item = el('article', 'comment-item' + (isReply ? ' comment-reply' : ''));
        item.dataset.commentId = String(comment.id);
        if (comment.status === 'deleted') item.classList.add('is-deleted');

        var body = el('div', 'comment-main');
        var meta = el('div', 'comment-meta');
        meta.appendChild(el('span', 'comment-author', comment.user.displayName || comment.user.username));
        meta.appendChild(el('span', 'comment-handle', '@' + comment.user.username));
        if (comment.user.role === 'admin') {
            meta.appendChild(el('span', 'comment-admin-badge', '管理员'));
        }
        var time = el('time', 'comment-time', formatTime(comment.created_at));
        time.dateTime = comment.created_at || '';
        meta.appendChild(time);
        body.appendChild(meta);

        body.appendChild(el('p', 'comment-content',
            comment.status === 'deleted' ? '该评论已删除' : comment.content));

        var actions = el('div', 'comment-actions');
        if (state.user && !isReply && comment.status !== 'deleted') {
            var replyButton = el('button', 'comment-text-btn', '回复');
            replyButton.type = 'button';
            replyButton.addEventListener('click', function () { startReply(comment); });
            actions.appendChild(replyButton);
        }
        if (state.user && comment.status !== 'deleted' &&
            (state.user.id === comment.user.id || state.user.role === 'admin')) {
            var deleteButton = el('button', 'comment-text-btn comment-text-danger', '删除');
            deleteButton.type = 'button';
            deleteButton.addEventListener('click', function () { removeComment(comment); });
            actions.appendChild(deleteButton);
        }
        if (actions.children.length) body.appendChild(actions);

        if (comment.replies && comment.replies.length) {
            var replies = el('div', 'comment-replies');
            comment.replies.forEach(function (reply) {
                replies.appendChild(renderComment(reply, true));
            });
            body.appendChild(replies);
        }

        item.appendChild(makeAvatar(comment.user, isReply ? 32 : 40));
        item.appendChild(body);
        return item;
    }

    function renderComments() {
        countEl.textContent = String(state.total);
        listEl.textContent = '';
        if (!state.comments.length) {
            emptyEl.hidden = state.serviceDown;
            return;
        }
        emptyEl.hidden = true;
        state.comments.forEach(function (comment) {
            listEl.appendChild(renderComment(comment, false));
        });
    }

    // ---------- 数据 ----------

    function loadComments() {
        state.serviceDown = false;
        setStatus('正在加载评论…');
        return api('/api/comments?post=' + encodeURIComponent(state.postId))
            .then(function (data) {
                state.comments = Array.isArray(data.comments) ? data.comments : [];
                state.total = Number(data.total) || 0;
                setStatus('');
                renderComments();
            })
            .catch(function (failure) {
                state.comments = [];
                state.total = 0;
                state.serviceDown = true;
                renderComments();

                if (failure.data && failure.data.error === 'db_unbound') {
                    setStatus('评论数据库尚未绑定，请按 db/README.md 配置 COMMENT_DB。', 'error');
                } else if (failure.data && failure.data.error === 'db_not_initialized') {
                    setStatus('评论数据库尚未初始化，请执行 db/schema.d1.sql。', 'error');
                } else {
                    setStatus('评论服务暂不可用，请稍后再试。', 'error');
                }
            });
    }

    function submitComment(event) {
        event.preventDefault();
        clearError();

        if (!state.user) {
            renderAuth();
            return;
        }

        var content = inputEl.value.trim();
        if (!content) {
            showError('写点什么再发吧');
            return;
        }
        if (content.length > 2000) {
            showError('评论最多 2000 个字符');
            return;
        }

        submitEl.disabled = true;
        submitEl.textContent = '发表中…';

        api('/api/comments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                postId: state.postId,
                content: content,
                parentId: state.replyTo ? state.replyTo.id : null
            })
        }).then(function (data) {
            var comment = data && data.comment;
            if (!comment) throw new Error('返回数据异常');

            if (comment.parent_id) {
                var parent = findComment(state.comments, comment.parent_id);
                if (parent) parent.replies = parent.replies || [];
                if (parent) parent.replies.push(comment);
                else state.comments.push(comment);
            } else {
                state.comments.push(comment);
            }
            state.total += 1;

            inputEl.value = '';
            updateCharCount();
            cancelReply();
            renderComments();

            var target = listEl.querySelector('[data-comment-id="' + comment.id + '"]');
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }).catch(function (failure) {
            if (failure.status === 401) {
                if (window.OmiAuth) window.OmiAuth.refresh();
                else {
                    state.user = null;
                    renderAuth();
                }
                showError('登录已过期，请重新登录');
            } else {
                showError((failure.data && failure.data.message) || '发表失败，请稍后再试');
            }
        }).finally(function () {
            submitEl.disabled = false;
            updateSubmitLabel();
        });
    }

    function logout() {
        state.replyTo = null;
        cancelReply();
        if (window.OmiAuth) {
            window.OmiAuth.logout();
        } else {
            state.user = null;
            renderAuth();
        }
    }

    function openAuth(tab) {
        if (window.OmiAuth) {
            window.OmiAuth.open(tab || 'login');
        } else {
            window.alert('登录组件加载失败，请刷新页面');
        }
    }

    function connectAuth() {
        if (!window.OmiAuth) {
            state.authLoading = false;
            state.user = null;
            renderAuth();
            return;
        }
        var snapshot = window.OmiAuth.getState();
        state.user = snapshot.user;
        state.authLoading = snapshot.loading;
        renderAuth();
        window.OmiAuth.onChange(function (next) {
            state.user = next.user;
            state.authLoading = next.loading;
            if (next.user) state.authNotice = '';
            renderAuth();
        });
    }

    function bindEvents() {
        if (state.bound) return;
        state.bound = true;
        inputEl.addEventListener('input', updateCharCount);
        composeEl.addEventListener('submit', submitComment);
        replyCancel.addEventListener('click', cancelReply);
    }

    function readAuthNotice() {
        var params = new URLSearchParams(location.search);
        var code = params.get('comment_auth');
        if (!code) return '';
        var messages = {
            unconfigured: 'GitHub 登录尚未配置，请先在 Cloudflare 设置 GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET。',
            state_mismatch: '登录状态已过期，请重新点击登录。',
            access_denied: '你取消了 GitHub 授权。',
            token_exchange_failed: 'GitHub 登录失败，请稍后再试。',
            profile_failed: '读取 GitHub 资料失败，请稍后再试。',
            username_conflict: '这个用户名已经关联了另一个 GitHub 账号，请换一个用户名或联系站长。',
            oauth_failed: '登录未完成，请稍后再试。'
        };
        var clean = new URL(location.href);
        clean.searchParams.delete('comment_auth');
        history.replaceState(null, '', clean.pathname + clean.search + clean.hash);
        return messages[code] || '登录未完成，请稍后再试。';
    }

    function init(post) {
        if (!post || !post.id || state.postId === post.id) return;
        state.postId = post.id;
        state.authNotice = readAuthNotice();
        section.hidden = false;
        bindEvents();
        updateCharCount();
        connectAuth();
        loadComments();
    }

    document.addEventListener('omi:article-loaded', function (event) {
        var post = event.detail && event.detail.post;
        init(post);
    });

    // 兜底：如果 read.js 在监听器挂载前就完成了渲染，直接按 URL 里的 post 初始化。
    document.addEventListener('DOMContentLoaded', function () {
        if (state.postId) return;
        var id = parseInt(new URLSearchParams(location.search).get('post'), 10);
        if (id && document.querySelector('#articleContent .article-title')) {
            init({ id: id });
        }
    });
})();
