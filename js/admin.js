/**
 * Omiaちゃん Blog — 管理后台脚本 v4.0 「ぺんぎん」
 * ======================================================
 * 功能清单：
 *   1. 登录门禁 —— 和主站共享 adm_sesFlag
 *   2. 总览仪表盘 —— 博文/留言/访客/精选 四项统计
 *   3. 博文管理 —— 表格CRUD
 *   4. 留言审核 —— 删除/加精/去精
 *   5. 访客清零 —— 双重确认安全锁
 *   6. 数据导出/导入 —— JSON文件读写
 *   7. 核弹级清除 —— 整站数据抹除
 *
 * 思路：这坨代码是控制台专用，跟主站 js/alert.js 各走各的
 * 但是它们共享同一套 localStorage 键名，靠 storage 事件同步
 */
(function () {
  "use strict";

  // ==================== 键名常量（必须和主站一致！） ====================
  var BOX_KEY = "omiblog_z";
  var NOTE_KEY = "omi_comments";
  var EYE_KEY = "kaze_count";
  var EYE_FLAG = "kaze_flag";
  var BOSS_KEY = "adm_sesFlag";
  var RESET_KEY = "kaze_lastReset";

  // 管理员凭证（和主站同一套，只存哈希）
  var BOSS_NAME_HASH =
    "8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918";
  var BOSS_PASS_HASH =
    "1d58f2649917f5da75f62da2ecb2ec0021b76960f965b0e19c9f8eddc5f6f833";

  // 管理员单会话限制（30分钟超时自动释放）
  var SES_TOKEN_KEY = "adm_sesToken";
  var SES_TIMEOUT = 30 * 60 * 1000;

  // ==================== 全局态 ====================
  var g_postHeap = [];
  var g_noteHeap = [];
  var g_confirmCB = null; // 确认弹层的回调

  // ==================== DOM抓取 ====================
  function $(sel) {
    return document.querySelector(sel);
  }
  function $$(sel) {
    return document.querySelectorAll(sel);
  }

  var E = {
    // 门禁
    gateLock: $("#gateLock"),
    gateUser: $("#gateUser"),
    gatePass: $("#gatePass"),
    gateFlash: $("#gateFlash"),
    btnGateGo: $("#btnGateGo"),
    // 外壳
    dashShell: $("#dashShell"),
    btnDashExit: $("#btnDashExit"),
    // 统计
    statPosts: $("#statPosts"),
    statNotes: $("#statNotes"),
    statEyes: $("#statEyes"),
    statStars: $("#statStars"),
    // 博文
    postTableBody: $("#postTableBody"),
    postTableVoid: $("#postTableVoid"),
    btnNewPostAdmin: $("#btnNewPostAdmin"),
    // 留言
    noteTableBody: $("#noteTableBody"),
    noteTableVoid: $("#noteTableVoid"),
    btnNukeAllNotes: $("#btnNukeAllNotes"),
    // 设置
    cfgEyeCount: $("#cfgEyeCount"),
    cfgLastReset: $("#cfgLastReset"),
    btnResetEye: $("#btnResetEye"),
    btnExport: $("#btnExport"),
    btnImport: $("#btnImport"),
    importFile: $("#importFile"),
    btnNukeAll: $("#btnNukeAll"),
    // 快捷键
    btnQuickPost: $("#btnQuickPost"),
    btnQuickExport: $("#btnQuickExport"),
    // 弹层
    postDlg: $("#postDlg"),
    postDlgHead: $("#postDlgHead"),
    postId: $("#postId"),
    postTitle: $("#postTitle"),
    postDate: $("#postDate"),
    postBody: $("#postBody"),
    postTags: $("#postTags"),
    postTally: $("#postTally"),
    postPicFile: $("#postPicFile"),
    postPicUrl: $("#postPicUrl"),
    picPreview: $("#picPreview"),
    picPreviewImg: $("#picPreviewImg"),
    picClearBtn: $("#picClearBtn"),
    confirmDlg: $("#confirmDlg"),
    confirmHead: $("#confirmHead"),
    confirmBody: $("#confirmBody"),
    btnConfirmYes: $("#btnConfirmYes"),
  };

  var pendingPic = null;

  // ==================== 工具 ====================
  function _safeHTML(d) {
    var x = document.createElement("div");
    x.textContent = d;
    return x.innerHTML;
  }
  function _safeAttr(d) {
    return d
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
  function _pop(msg, flavor) {
    // 简单的alert提示 —— 管理后台不需要花哨toast
    flavor = flavor || "info";
    var icons = { ok: "✅", bad: "❌", info: "ℹ️" };
    alert((icons[flavor] || "") + " " + msg);
  }

  // ==================== 数据IO ====================
  function _loadPosts() {
    try {
      var r = localStorage.getItem(BOX_KEY);
      g_postHeap = r ? JSON.parse(r) : [];
    } catch (e) {
      g_postHeap = [];
    }
  }
  function _dumpPosts() {
    try {
      localStorage.setItem(BOX_KEY, JSON.stringify(g_postHeap));
    } catch (e) {
      _pop("存储空间不足", "bad");
    }
  }
  function _loadNotes() {
    try {
      var r = localStorage.getItem(NOTE_KEY);
      g_noteHeap = r ? JSON.parse(r) : [];
    } catch (e) {
      g_noteHeap = [];
    }
  }
  function _dumpNotes() {
    try {
      localStorage.setItem(NOTE_KEY, JSON.stringify(g_noteHeap));
    } catch (e) {
      _pop("存储空间不足", "bad");
    }
  }
  function _reloadAll() {
    _loadPosts();
    _loadNotes();
  }

  // ---- 管理员单会话限制 ----
  function _checkAdminSession() {
    try {
      var raw = localStorage.getItem(SES_TOKEN_KEY);
      if (!raw) return { active: false };
      var data = JSON.parse(raw);
      if (!data || !data.ts) return { active: false };
      if (Date.now() - data.ts > SES_TIMEOUT) {
        localStorage.removeItem(SES_TOKEN_KEY);
        return { active: false };
      }
      return { active: true, token: data.token, ts: data.ts };
    } catch (e) {
      return { active: false };
    }
  }
  function _setAdminSession() {
    var token = Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(
      SES_TOKEN_KEY,
      JSON.stringify({ token: token, ts: Date.now() }),
    );
    sessionStorage.setItem("adm_myToken", token);
    return token;
  }
  function _clearAdminSession() {
    localStorage.removeItem(SES_TOKEN_KEY);
    sessionStorage.removeItem("adm_myToken");
  }

  // ==================== 门禁 ====================
  function _gateCheck() {
    if (localStorage.getItem(BOSS_KEY) === "1") {
      // 已登录 → 直接进
      E.gateLock.classList.add("is-off");
      E.dashShell.classList.remove("is-off");
      _refreshAll();
      return true;
    }
    return false;
  }

  function _sha256hex(s) {
    return window.crypto.subtle
      .digest("SHA-256", new TextEncoder().encode(s))
      .then(function (buf) {
        var out = "";
        new Uint8Array(buf).forEach(function (b) {
          out += b.toString(16).padStart(2, "0");
        });
        return out;
      });
  }

  function _gateGo() {
    var u = E.gateUser.value.trim();
    var p = E.gatePass.value;
    Promise.all([_sha256hex(u), _sha256hex(p)])
      .then(function (hs) {
        if (hs[0] !== BOSS_NAME_HASH || hs[1] !== BOSS_PASS_HASH) {
          E.gateFlash.textContent = "凭证错误,请重新输入!";
          return;
        }
        // 单会话检查
        var ses = _checkAdminSession();
        var myToken = sessionStorage.getItem("adm_myToken");
        if (ses.active && (!myToken || myToken !== ses.token)) {
          if (
            !confirm(
              "管理员账号已在其他浏览器/设备登录（或上次未正常退出）。\n\n是否强制登录并踢掉其他会话？",
            )
          ) {
            return;
          }
        }
        _setAdminSession();
        localStorage.setItem(BOSS_KEY, "1");
        E.gateLock.classList.add("is-off");
        E.dashShell.classList.remove("is-off");
        E.gateFlash.textContent = "";
        E.gateUser.value = "";
        E.gatePass.value = "";
        _refreshAll();
      })
      .catch(function () {
        E.gateFlash.textContent = "当前环境不支持加密校验";
      });
  }

  function _gateExit() {
    localStorage.removeItem(BOSS_KEY);
    _clearAdminSession();
    E.dashShell.classList.add("is-off");
    E.gateLock.classList.remove("is-off");
  }

  // ==================== 标签切换 ====================
  function _wireTabs() {
    var tabs = $$(".dash-tab");
    var panes = $$(".dash-pane");
    tabs.forEach(function (t) {
      t.addEventListener("click", function () {
        tabs.forEach(function (x) {
          x.classList.remove("is-hot");
        });
        this.classList.add("is-hot");
        var tid = this.dataset.tab;
        panes.forEach(function (p) {
          p.classList.remove("is-hot");
        });
        var tgt = document.getElementById(tid);
        if (tgt) {
          tgt.classList.add("is-hot");
          // 切换到对应面板时刷新
          if (tid === "overview") _paintOverview();
          if (tid === "posts") _paintPostTable();
          if (tid === "notes") _paintNoteTable();
          if (tid === "config") _paintConfig();
        }
      });
    });
  }

  // ==================== 总览 ====================
  function _paintOverview() {
    _reloadAll();
    E.statPosts.textContent = g_postHeap.length;
    E.statNotes.textContent = g_noteHeap.length;
    E.statEyes.textContent = localStorage.getItem(EYE_KEY) || "0";
    E.statStars.textContent = g_noteHeap.filter(function (n) {
      return n.star === 1;
    }).length;
  }

  // ==================== 博文管理 ====================
  function _paintPostTable() {
    _loadPosts();
    E.postTableBody.innerHTML = "";

    if (!g_postHeap.length) {
      E.postTableBody.innerHTML = "";
      E.postTableVoid.classList.remove("is-off");
      return;
    }
    E.postTableVoid.classList.add("is-off");

    g_postHeap.forEach(function (b) {
      var tr = document.createElement("tr");
      var tagsStr = b.tags
        .map(function (t) {
          return _safeHTML(t);
        })
        .join(", ");
      tr.innerHTML =
        '<td class="col-narrow">' +
        b.id +
        "</td>" +
        "<td>" +
        _safeHTML(b.title) +
        "</td>" +
        '<td class="col-mid">' +
        _safeHTML(b.date) +
        "</td>" +
        '<td class="col-wide">' +
        tagsStr +
        "</td>" +
        '<td class="col-acts"><div class="act-group">' +
        '<button class="act-btn act-edit" data-edit="' +
        b.id +
        '">编辑</button>' +
        '<button class="act-btn act-del" data-del="' +
        b.id +
        '">删除</button>' +
        "</div></td>";
      E.postTableBody.appendChild(tr);
    });

    // 事件委托
    E.postTableBody.querySelectorAll(".act-edit").forEach(function (btn) {
      btn.addEventListener("click", function () {
        _editPost(parseInt(this.dataset.edit));
      });
    });
    E.postTableBody.querySelectorAll(".act-del").forEach(function (btn) {
      btn.addEventListener("click", function () {
        _nukePost(parseInt(this.dataset.del));
      });
    });
  }

  function _newPost() {
    E.postDlgHead.textContent = "新建博文";
    _resetForm();
    E.postDate.value = new Date().toISOString().split("T")[0];
    _openOverlay("postDlg");
  }

  function _editPost(id) {
    var b = g_postHeap.find(function (x) {
      return x.id === id;
    });
    if (!b) return;
    E.postDlgHead.textContent = "编辑博文";
    E.postId.value = b.id;
    E.postTitle.value = b.title;
    E.postDate.value = b.date;
    E.postBody.value = b.content;
    E.postTags.value = b.tags.join(", ");
    _loadPic(b.image || "");
    _updateTallyPost();
    _openOverlay("postDlg");
  }

  window.savePost = function () {
    var id = E.postId.value;
    var title = E.postTitle.value.trim();
    var date = E.postDate.value;
    var body = E.postBody.value.trim();
    var tags = E.postTags.value
      .split(/[,，]/)
      .map(function (t) {
        return t.trim();
      })
      .filter(Boolean);
    var pic = _getPic();

    if (!title) {
      _pop("标题不能为空", "bad");
      return;
    }
    if (!date) {
      _pop("请选择日期", "bad");
      return;
    }
    if (!body) {
      _pop("内容不能为空", "bad");
      return;
    }

    if (id) {
      var idx = g_postHeap.findIndex(function (b) {
        return b.id === parseInt(id);
      });
      if (~idx) {
        g_postHeap[idx] = Object.assign({}, g_postHeap[idx], {
          title: title,
          date: date,
          content: body,
          tags: tags,
          image: pic,
        });
        _pop("已更新", "ok");
      }
    } else {
      var nid = g_postHeap.length
        ? Math.max.apply(
            null,
            g_postHeap.map(function (b) {
              return b.id;
            }),
          ) + 1
        : 1;
      g_postHeap.unshift({
        id: nid,
        title: title,
        date: date,
        content: body,
        tags: tags,
        image: pic,
      });
      _pop("新建成功", "ok");
    }

    _dumpPosts();
    _paintPostTable();
    _paintOverview();
    _closeOverlay("postDlg");
  };

  function _nukePost(id) {
    _showConfirm(
      "删除博文",
      "确定删除 ID=" + id + " 的博文吗？此操作不可恢复。",
      function () {
        g_postHeap = g_postHeap.filter(function (b) {
          return b.id !== id;
        });
        _dumpPosts();
        _paintPostTable();
        _paintOverview();
        _pop("博文已删除", "info");
      },
    );
  }

  // ==================== 留言审核 ====================
  function _paintNoteTable() {
    _loadNotes();
    E.noteTableBody.innerHTML = "";

    if (!g_noteHeap.length) {
      E.noteTableVoid.classList.remove("is-off");
      return;
    }
    E.noteTableVoid.classList.add("is-off");

    g_noteHeap.forEach(function (n) {
      var tr = document.createElement("tr");
      var timeStr = new Date(n.ts).toLocaleString("zh-CN");
      var starLabel = n.star ? "已精选" : "—";
      var starBtnHTML = n.star
        ? '<button class="act-btn act-unstar" data-unstar="' +
          n.cid +
          '">去精</button>'
        : '<button class="act-btn act-star" data-star="' +
          n.cid +
          '">加精</button>';

      tr.innerHTML =
        '<td class="col-narrow">' +
        n.cid +
        "</td>" +
        "<td>" +
        _safeHTML(n.nick) +
        "</td>" +
        '<td class="col-wide">' +
        _safeHTML(n.msg) +
        "</td>" +
        '<td class="col-mid">' +
        timeStr +
        "</td>" +
        "<td>" +
        starLabel +
        "</td>" +
        '<td class="col-acts"><div class="act-group">' +
        starBtnHTML +
        '<button class="act-btn act-del" data-delnote="' +
        n.cid +
        '">删除</button>' +
        "</div></td>";
      E.noteTableBody.appendChild(tr);
    });

    // 事件委托
    E.noteTableBody.querySelectorAll(".act-star").forEach(function (btn) {
      btn.addEventListener("click", function () {
        _starNote(parseInt(this.dataset.star), 1);
      });
    });
    E.noteTableBody.querySelectorAll(".act-unstar").forEach(function (btn) {
      btn.addEventListener("click", function () {
        _starNote(parseInt(this.dataset.unstar), 0);
      });
    });
    E.noteTableBody.querySelectorAll(".act-del").forEach(function (btn) {
      btn.addEventListener("click", function () {
        _nukeNote(parseInt(this.dataset.delnote));
      });
    });
  }

  function _starNote(cid, val) {
    var n = g_noteHeap.find(function (x) {
      return x.cid === cid;
    });
    if (n) {
      n.star = val;
      _dumpNotes();
      _paintNoteTable();
      _paintOverview();
    }
  }

  function _nukeNote(cid) {
    g_noteHeap = g_noteHeap.filter(function (n) {
      return n.cid !== cid;
    });
    _dumpNotes();
    _paintNoteTable();
    _paintOverview();
    _pop("留言已删除", "info");
  }

  function _nukeAllNotes() {
    _showConfirm(
      "清空留言",
      "确定删除全部留言吗？这操作没法撤销。",
      function () {
        g_noteHeap = [];
        _dumpNotes();
        _paintNoteTable();
        _paintOverview();
        _pop("全部留言已清除", "info");
      },
    );
  }

  // ==================== 设置面板 ====================
  function _paintConfig() {
    E.cfgEyeCount.textContent = localStorage.getItem(EYE_KEY) || "0";
    var last = localStorage.getItem(RESET_KEY);
    E.cfgLastReset.textContent = last
      ? new Date(last).toLocaleString("zh-CN")
      : "从未";
  }

  /** 访客清零 —— 双重确认 */
  function _resetEye() {
    var cur = localStorage.getItem(EYE_KEY) || "0";
    _showConfirm(
      "清零访客人数",
      "当前浏览人数：" + cur + "\n\n确定要归零吗？此操作不可撤销。",
      function () {
        // 二次确认
        if (!confirm("最后确认：真的要清零访客人数吗？")) return;
        localStorage.setItem(EYE_KEY, "0");
        localStorage.setItem(RESET_KEY, new Date().toISOString());
        _paintConfig();
        _paintOverview();
        _pop("访客人数已清零！刷新主站即可看到变化。", "ok");
      },
    );
  }

  /** 导出全部数据 */
  function _exportAll() {
    _reloadAll();
    var blob = {
      version: "4.0",
      exportedAt: new Date().toISOString(),
      posts: g_postHeap,
      notes: g_noteHeap,
      eyeCount: localStorage.getItem(EYE_KEY) || "0",
      lastReset: localStorage.getItem(RESET_KEY) || "",
    };
    var jsonStr = JSON.stringify(blob, null, 2);
    var file = new Blob([jsonStr], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(file);
    a.download =
      "omia_backup_" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    URL.revokeObjectURL(a.href);
    _pop("数据已导出", "ok");
  }

  /** 导入数据 */
  function _importAll(file) {
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var data = JSON.parse(e.target.result);
        if (data.posts && Array.isArray(data.posts)) {
          g_postHeap = data.posts;
          _dumpPosts();
        }
        if (data.notes && Array.isArray(data.notes)) {
          g_noteHeap = data.notes;
          _dumpNotes();
        }
        if (typeof data.eyeCount !== "undefined") {
          localStorage.setItem(EYE_KEY, "" + data.eyeCount);
        }
        if (data.lastReset) {
          localStorage.setItem(RESET_KEY, data.lastReset);
        }
        _refreshAll();
        _pop("数据导入成功！", "ok");
      } catch (err) {
        _pop("文件格式不对，导入失败", "bad");
      }
    };
    reader.onerror = function () {
      _pop("文件读取失败", "bad");
    };
    reader.readAsText(file);
  }

  /** 核弹：清除全部 */
  function _nukeEverything() {
    _showConfirm(
      "💣 清除全部数据",
      "这将删除所有博文、留言、访客计数。\n\n此操作不可逆！确定要继续吗？",
      function () {
        if (!confirm("⚡ 最后警告：真的要清除一切吗？")) return;
        localStorage.removeItem(BOX_KEY);
        localStorage.removeItem(NOTE_KEY);
        localStorage.setItem(EYE_KEY, "0");
        localStorage.removeItem(RESET_KEY);
        g_postHeap = [];
        g_noteHeap = [];
        _refreshAll();
        _pop("全部数据已清除", "info");
      },
    );
  }

  // ==================== 确认弹层 ====================
  function _showConfirm(title, body, cb) {
    E.confirmHead.textContent = title;
    E.confirmBody.textContent = body;
    g_confirmCB = cb;
    _openOverlay("confirmDlg");
  }

  function _doConfirm() {
    if (g_confirmCB) {
      g_confirmCB();
      g_confirmCB = null;
    }
    _closeOverlay("confirmDlg");
  }

  // ==================== 弹层管理 ====================
  function _openOverlay(id) {
    var m = document.getElementById(id);
    if (!m) return;
    m.classList.remove("is-off");
    document.body.style.overflow = "hidden";
  }
  function _closeOverlay(id) {
    var m = document.getElementById(id);
    if (!m) return;
    m.classList.add("is-off");
    document.body.style.overflow = "";
    if (id === "postDlg") _resetForm();
  }
  window.shutOverlay = _closeOverlay;

  function _backdropClick(e) {
    if (e.target.classList.contains("overlay")) {
      _closeOverlay(e.target.id);
    }
  }

  // ==================== 图片 ====================
  function _clearPic() {
    pendingPic = null;
    if (E.postPicUrl) E.postPicUrl.value = "";
    if (E.postPicFile) E.postPicFile.value = "";
    if (E.picPreview) E.picPreview.classList.add("is-off");
    if (E.picPreviewImg) E.picPreviewImg.src = "";
  }
  function _getPic() {
    return pendingPic || (E.postPicUrl ? E.postPicUrl.value.trim() : "");
  }
  function _loadPic(d) {
    _clearPic();
    if (!d) return;
    if (~d.indexOf("data:image/")) {
      pendingPic = d;
      _showPreview(d);
    } else {
      if (E.postPicUrl) E.postPicUrl.value = d;
      pendingPic = d;
      _showPreview(d);
    }
  }
  function _showPreview(src) {
    if (!E.picPreview || !E.picPreviewImg) return;
    E.picPreview.classList.remove("is-off");
    E.picPreviewImg.src = src;
  }
  function _onFilePick() {
    var f = E.postPicFile.files[0];
    if (!f) return;
    if (!~f.type.indexOf("image/")) {
      _pop("请选择图片文件", "bad");
      E.postPicFile.value = "";
      return;
    }
    if (f.size > 2 * 1024 * 1024) {
      _pop("图片不能超过2MB", "bad");
      E.postPicFile.value = "";
      return;
    }
    var reader = new FileReader();
    reader.onload = function (e) {
      pendingPic = e.target.result;
      _showPreview(pendingPic);
      if (E.postPicUrl) E.postPicUrl.value = "";
    };
    reader.onerror = function () {
      _pop("读取失败", "bad");
    };
    reader.readAsDataURL(f);
  }
  function _onUrlInput() {
    var u = E.postPicUrl.value.trim();
    if (u) {
      pendingPic = u;
      _showPreview(u);
      if (E.postPicFile) E.postPicFile.value = "";
    } else {
      pendingPic = null;
      if (E.picPreview) E.picPreview.classList.add("is-off");
    }
  }
  function _updateTallyPost() {
    if (!E.postTally) return;
    E.postTally.textContent = E.postBody.value.length + " / 5000";
  }
  function _resetForm() {
    E.postId.value = "";
    E.postTitle.value = "";
    E.postDate.value = "";
    E.postBody.value = "";
    E.postTags.value = "";
    E.postTally.textContent = "0 / 5000";
    _clearPic();
  }

  // ==================== 刷新全部 ====================
  function _refreshAll() {
    _paintOverview();
    // 根据当前活跃标签刷新对应面板
    var hotPane = document.querySelector(".dash-pane.is-hot");
    if (hotPane) {
      switch (hotPane.id) {
        case "posts":
          _paintPostTable();
          break;
        case "notes":
          _paintNoteTable();
          break;
        case "config":
          _paintConfig();
          break;
        default:
          break;
      }
    }
  }

  // ==================== 事件绑线 ====================
  function _wireUp() {
    // 门禁
    E.btnGateGo.addEventListener("click", _gateGo);
    E.gatePass.addEventListener("keydown", function (e) {
      if (e.key === "Enter") _gateGo();
    });
    E.btnDashExit.addEventListener("click", _gateExit);

    // 标签
    _wireTabs();

    // 快捷操作
    E.btnQuickPost.addEventListener("click", _newPost);
    E.btnQuickExport.addEventListener("click", _exportAll);
    E.btnNewPostAdmin.addEventListener("click", _newPost);

    // 留言
    E.btnNukeAllNotes.addEventListener("click", _nukeAllNotes);

    // 设置
    E.btnResetEye.addEventListener("click", _resetEye);
    E.btnExport.addEventListener("click", _exportAll);
    E.btnImport.addEventListener("click", function () {
      E.importFile.click();
    });
    E.importFile.addEventListener("change", function () {
      if (this.files[0]) {
        _importAll(this.files[0]);
        this.value = "";
      }
    });
    E.btnNukeAll.addEventListener("click", _nukeEverything);

    // 确认弹层
    E.btnConfirmYes.addEventListener("click", _doConfirm);

    // 博文编辑
    E.postBody.addEventListener("input", _updateTallyPost);
    E.postPicFile.addEventListener("change", _onFilePick);
    E.postPicUrl.addEventListener("input", function () {
      setTimeout(_onUrlInput, 400);
    });
    E.picClearBtn.addEventListener("click", _clearPic);

    // 弹层遮罩
    $$(".overlay").forEach(function (m) {
      m.addEventListener("click", _backdropClick);
    });

    // 键盘
    window.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        if (E.postDlg && !E.postDlg.classList.contains("is-off"))
          _closeOverlay("postDlg");
        else if (E.confirmDlg && !E.confirmDlg.classList.contains("is-off"))
          _closeOverlay("confirmDlg");
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key === "s" &&
        E.postDlg &&
        !E.postDlg.classList.contains("is-off")
      ) {
        e.preventDefault();
        window.savePost();
      }
    });
  }

  // ==================== 启动 ====================
  function _boot() {
    _wireUp();
    if (!_gateCheck()) {
      // 尚未登录 —— 显示门禁
      E.gateLock.classList.remove("is-off");
      E.dashShell.classList.add("is-off");
    }
  }

  window.addEventListener("DOMContentLoaded", _boot);

  // 暴露全局
  window.savePost = window.savePost;
  window.shutOverlay = window.shutOverlay;
})();
