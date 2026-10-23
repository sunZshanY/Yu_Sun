/**
 * Omiaちゃん Blog — 音乐播放器 v1.0
 * =====================================
 * 原创实现：右侧悬浮播放器，无第三方依赖。
 * 播放列表：data/music.json（数组 playlist，字段 title/artist/url/cover）。
 * url 为空串的条目会被跳过并显示为占位提示。
 */
(function () {
    'use strict';

    var LIST_URL = 'data/music.json';
    var playlist = [];
    var index = -1;
    var audio = null;
    var seeking = false;

    function $(s) { return document.querySelector(s); }

    var panel = $('#musicPanel');
    var fab = $('#musicFab');
    var cover = $('#musicCover');
    var titleEl = $('#musicTitle');
    var artistEl = $('#musicArtist');
    var progress = $('#musicProgress');
    var fill = $('#musicProgressFill');
    var curEl = $('#musicCur');
    var durEl = $('#musicDur');
    var playBtn = $('#musicPlay');
    var playIcon = $('#musicPlayIcon');
    var prevBtn = $('#musicPrev');
    var nextBtn = $('#musicNext');
    var listEl = $('#musicList');

    var ICON_PLAY = '<path d="M8 5v14l11-7z"></path>';
    var ICON_PAUSE = '<path d="M6 5h4v14H6zM14 5h4v14h-4z"></path>';

    function fmt(sec) {
        if (!isFinite(sec) || sec < 0) sec = 0;
        sec = Math.floor(sec);
        var m = Math.floor(sec / 60);
        var s = sec % 60;
        return m + ':' + (s < 10 ? '0' : '') + s;
    }

    function setPlaying(on) {
        if (!fab || !playIcon) return;
        fab.classList.toggle('playing', on);
        playIcon.innerHTML = on ? ICON_PAUSE : ICON_PLAY;
        playBtn.setAttribute('aria-label', on ? '暂停' : '播放');
    }

    function setCurrent(i) {
        var items = listEl ? listEl.querySelectorAll('li') : [];
        items.forEach(function (li, n) { li.classList.toggle('current', n === i); });
    }

    function renderList() {
        if (!listEl) return;
        listEl.innerHTML = '';
        if (!playlist.length) {
            var empty = document.createElement('li');
            empty.className = 'music-empty';
            empty.textContent = '播放列表为空，编辑 data/music.json 添加歌曲';
            empty.style.cursor = 'default';
            listEl.appendChild(empty);
            return;
        }
        playlist.forEach(function (t, i) {
            var li = document.createElement('li');
            li.title = t.title + ' - ' + t.artist;
            li.innerHTML = '<span class="music-item-title"></span><span class="music-item-artist"></span>';
            li.querySelector('.music-item-title').textContent = t.title || ('曲目 ' + (i + 1));
            li.querySelector('.music-item-artist').textContent = t.artist || '';
            li.addEventListener('click', function () { loadTrack(i, true); });
            listEl.appendChild(li);
        });
        setCurrent(index);
    }

    function updateMeta() {
        var t = playlist[index];
        if (!t) {
            if (titleEl) titleEl.textContent = '未在播放';
            if (artistEl) artistEl.textContent = '点击下方曲目开始';
            if (cover) { cover.style.backgroundImage = ''; cover.querySelector('svg').style.display = ''; }
            return;
        }
        if (titleEl) titleEl.textContent = t.title || ('曲目 ' + (index + 1));
        if (artistEl) artistEl.textContent = t.artist || '';
        if (cover) {
            cover.style.backgroundImage = t.cover ? "url('" + t.cover + "')" : '';
            var note = cover.querySelector('svg');
            if (note) note.style.display = t.cover ? 'none' : '';
        }
    }

    function updateProgress() {
        if (!audio || !fill || !progress) return;
        var d = audio.duration || 0;
        var c = audio.currentTime || 0;
        var pct = d ? (c / d) * 100 : 0;
        fill.style.width = pct + '%';
        if (curEl) curEl.textContent = fmt(c);
        if (durEl) durEl.textContent = d ? fmt(d) : '0:00';
        if (progress) progress.setAttribute('aria-valuenow', String(Math.round(pct)));
    }

    function loadTrack(i, autoplay) {
        var t = playlist[i];
        if (!t) return;
        if (!t.url) {
            setPlaying(false);
            updateMeta();
            return;
        }
        if (audio) {
            audio.pause();
            audio.src = '';
        }
        index = i;
        audio = new Audio(t.url);
        audio.preload = 'metadata';
        audio.addEventListener('timeupdate', updateProgress);
        audio.addEventListener('loadedmetadata', updateProgress);
        audio.addEventListener('ended', function () { next(); });
        audio.addEventListener('error', function () {
            setPlaying(false);
            if (titleEl) titleEl.textContent = '加载失败：' + (t.title || '');
            if (artistEl) artistEl.textContent = '请检查 url 是否可访问';
        });
        updateMeta();
        setCurrent(index);
        if (autoplay) {
            audio.play().then(function () {
                setPlaying(true);
            }).catch(function () {
                setPlaying(false);
            });
        } else {
            setPlaying(false);
        }
    }

    function playPause() {
        if (!audio || !playlist[index] || !playlist[index].url) {
            if (playlist.length && index < 0) loadTrack(0, true);
            return;
        }
        if (audio.paused) {
            audio.play().then(function () { setPlaying(true); }).catch(function () {});
        } else {
            audio.pause();
            setPlaying(false);
        }
    }

    function next() {
        if (!playlist.length) return;
        var n = (index + 1) % playlist.length;
        loadTrack(n, index >= 0);
    }

    function prev() {
        if (!playlist.length) return;
        var n = (index - 1 + playlist.length) % playlist.length;
        loadTrack(n, index >= 0);
    }

    function seekTo(clientX) {
        if (!audio || !progress) return;
        var d = audio.duration;
        if (!d || !isFinite(d)) return;
        var rect = progress.getBoundingClientRect();
        var ratio = (clientX - rect.left) / rect.width;
        ratio = Math.max(0, Math.min(1, ratio));
        seeking = true;
        audio.currentTime = ratio * d;
        seeking = false;
        updateProgress();
    }

    function openPanel(on) {
        if (!panel || !fab) return;
        panel.classList.toggle('open', on);
        fab.setAttribute('aria-expanded', String(on));
        fab.setAttribute('aria-label', on ? '收起音乐播放器' : '打开音乐播放器');
    }

    function wire() {
        if (fab) fab.addEventListener('click', function () { openPanel(!panel.classList.contains('open')); });
        if (playBtn) playBtn.addEventListener('click', playPause);
        if (prevBtn) prevBtn.addEventListener('click', prev);
        if (nextBtn) nextBtn.addEventListener('click', next);
        if (progress) {
            progress.addEventListener('click', function (e) { seekTo(e.clientX); });
            progress.addEventListener('keydown', function (e) {
                if (!audio) return;
                var d = audio.duration || 0;
                if (e.key === 'ArrowRight') audio.currentTime = Math.min(d, audio.currentTime + 5);
                if (e.key === 'ArrowLeft') audio.currentTime = Math.max(0, audio.currentTime - 5);
                updateProgress();
            });
        }
    }

    function load() {
        fetch(LIST_URL, { cache: 'no-store' })
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(function (d) {
                if (d && Array.isArray(d.playlist)) {
                    playlist = d.playlist.filter(function (t) {
                        return t && (t.url || t.title);
                    });
                }
                renderList();
            })
            .catch(function () {
                playlist = [];
                renderList();
            });
    }

    wire();
    load();
})();
