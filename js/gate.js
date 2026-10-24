/**
 * Omiaちゃん Blog — 管理门禁 v2.0 「おまもり」
 * ======================================================
 * 只存密码的 SHA-256 哈希，源码里不再出现明文密码。
 * 匹配成功 → 写入 adm_sesFlag → 跳转 _p/index.html
 */
(function () {
    'use strict';

    if (!/[\?&]admin/.test(location.search)) return;

    var EXPECT_USER_HASH = 'de55d960aa290c1290fbdb2d5899abb9b85ce6fbc059661fb340783c9e4416bb';
    var EXPECT_PASS_HASH = 'a32861ede76217e567c65be9d0f7098ab7a019fa711ca988624b3a9d77fe8245';

    function sha256hex(s) {
        return window.crypto.subtle
            .digest('SHA-256', new TextEncoder().encode(s))
            .then(function (buf) {
                var out = '';
                new Uint8Array(buf).forEach(function (b) {
                    out += b.toString(16).padStart(2, '0');
                });
                return out;
            });
    }

    function go() {
        var err = document.getElementById('admErr');
        var u = document.getElementById('admUser').value.trim();
        var p = document.getElementById('admPass').value;

        Promise.all([sha256hex(u), sha256hex(p)]).then(function (hs) {
            if (hs[0] === EXPECT_USER_HASH && hs[1] === EXPECT_PASS_HASH) {
                localStorage.setItem('adm_sesFlag', '1');
                location.href = '_p/index.html';
            } else {
                err.textContent = '凭证错误';
            }
        }).catch(function () {
            err.textContent = '当前环境不支持加密校验，请使用现代浏览器（需 HTTPS）';
        });
    }

    document.addEventListener('DOMContentLoaded', function () {
        var gate = document.getElementById('adminGate');
        if (gate) gate.style.display = 'flex';
        document.getElementById('admBtn').addEventListener('click', go);
        document.getElementById('admPass').addEventListener('keydown', function (e) {
            if (e.key === 'Enter') go();
        });
    });
})();
