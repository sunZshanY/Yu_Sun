(function() {
    'use strict';

    function safeHTML(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
    function safeAttr(s) { return s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    function imgList(post) {
        var out = [];
        if (Array.isArray(post.images)) out = out.concat(post.images);
        else if (post.image || post.images) out.push(post.image || post.images);
        if (post.images1) out.push(post.images1);
        return out.filter(function(x){ return typeof x === 'string' && x.trim(); });
    }

    // Both pages use the same freshness and fallback rules.
    function getPost(id, cb) {
        window.OmiBlog.posts.load().then(function (data) {
            cb(data.posts.find(function (post) { return post.id === id; }) || null);
        });
    }

    function getReadingLen(content) {
        if (!content) return '短篇';
        var len = content.replace(/\s/g, '').length;
        if (len < 200) return '短篇';
        if (len < 800) return '中篇';
        return '长文';
    }

    function render() {
        var params = new URLSearchParams(location.search);
        var id = parseInt(params.get('post'), 10);
        if (!id) {
            show404();
            return;
        }

        var main = document.getElementById('articleContent');
        var footer = document.getElementById('articleFooter');
        var topTitle = document.getElementById('topTitle');

        // 显示加载中
        main.innerHTML = '<div class="read-404"><h2>加载中...</h2><p>正在获取文章内容</p></div>';

        getPost(id, function(post) {
            if (!post) {
                show404();
                return;
            }

            // 更新页面元信息
            document.title = post.title + ' — Omiaちゃん的小博客';
            if (topTitle) topTitle.textContent = post.title;

            // 更新 OG 标签
            var ogTitle = document.getElementById('ogTitle');
            var ogDesc = document.getElementById('ogDesc');
            var ogUrl = document.getElementById('ogUrl');
            if (ogTitle) ogTitle.setAttribute('content', post.title);
            if (ogDesc) ogDesc.setAttribute('content', (post.content || '').replace(/\s+/g, ' ').trim().slice(0, 120));
            if (ogUrl) ogUrl.setAttribute('content', location.href);

            // 正文
            var bodyText = (post.content || '').trim() || post.title;
            var paragraphs = bodyText.split('\n').filter(function(p) { return p.trim(); })
                .map(function(p) { return '<p>' + safeHTML(p.trim()) + '</p>'; }).join('');

            // 题图（支持多图）
            var imgs = imgList(post);
            var heroHTML = '';
            if (imgs.length === 1) {
                heroHTML = '<div class="article-hero">'
                    + '<img src="' + safeAttr(imgs[0]) + '" alt="' + safeAttr(post.title) + '" '
                    + 'onclick="window.open(\'' + safeAttr(imgs[0]) + '\')" loading="eager" '
                    + 'onerror="this.parentElement.style.display=\'none\'">'
                    + '</div>';
            } else if (imgs.length > 1) {
                heroHTML = '<div class="article-hero-grid">'
                    + imgs.map(function(src) {
                        return '<img src="' + safeAttr(src) + '" alt="' + safeAttr(post.title) + '" loading="lazy" '
                            + 'onclick="window.open(\'' + safeAttr(src) + '\')" '
                            + 'onerror="this.style.display=\'none\'">';
                    }).join('')
                    + '</div>';
            }

            // 标签
            var tagsHTML = '';
            if (post.tags && post.tags.length) {
                tagsHTML = post.tags.map(function(t) {
                    return '<span class="article-tag">' + safeHTML(t) + '</span>';
                }).join('');
            }

            // 元信息
            var metaHTML = '<span class="article-meta-item">日期 ' + safeHTML(post.date) + '</span>'
                + '<span class="article-meta-sep">│</span>'
                + '<span class="article-meta-item">作者 Omiaちゃん</span>'
                + '<span class="article-meta-sep">│</span>'
                + '<span class="article-meta-item">篇幅 ' + getReadingLen(post.content) + '</span>';

            // 渲染
            main.innerHTML = '<article>'
                + '<header class="article-header">'
                + '<h1 class="article-title">' + safeHTML(post.title) + '</h1>'
                + '<div class="article-meta">' + metaHTML + '</div>'
                + '</header>'
                + heroHTML
                + '<div class="article-body">' + paragraphs + '</div>'
                + '<div class="article-tags">' + tagsHTML + '</div>'
                + '</article>';

            // 底栏
            footer.innerHTML = '<span class="read-footer-note">© sunZshanY.inc · CC BY-NC-SA 4.0</span>'
                + '<div style="display:flex;gap:10px;flex-wrap:wrap;">'
                + '<button class="read-footer-btn" onclick="copyLink()">复制链接</button>'
                + '<a href="home.html" class="read-footer-btn">返回首页</a>'
                + '</div>';
            footer.style.display = '';
        });
    }

    function show404() {
        var main = document.getElementById('articleContent');
        var footer = document.getElementById('articleFooter');
        main.innerHTML = '<div class="read-404"><h2>文章未找到</h2>'
            + '<p>这篇文章可能已被删除，或者链接地址不正确。</p>'
            + '<a href="home.html" class="read-footer-btn">← 返回首页</a>'
            + '</div>';
        if (footer) footer.style.display = 'none';
        document.title = '404 — Omiaちゃん的小博客';
    }

    // 复制链接
    window.copyLink = function() {
        navigator.clipboard.writeText(location.href).then(function() {
            var btn = document.querySelector('.read-footer-btn');
            if (btn) { var t = btn.textContent; btn.textContent = '已复制'; setTimeout(function(){ btn.textContent = t; }, 1800); }
        }).catch(function() {
            alert('复制失败，请手动复制地址栏链接');
        });
    };

    // 启动
    render();
})();
