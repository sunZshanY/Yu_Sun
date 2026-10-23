# Yu Sun 的小博客

原生 HTML、CSS、JavaScript 构建的个人博客，无需前端构建步骤。v6.0 起以 Mizuki（Material Design 3 博客主题）为**设计参考**（仅借鉴视觉语言，代码全部原创，未复制模板源码）进行了全面重构：OKLCH 色相驱动设计令牌、16px 大圆角卡片、悬浮毛玻璃顶栏、MD3 侧栏导航指示条、横幅 Hero、柔和层级阴影与入场动画。v6.1 新增：博客标签筛选、右侧悬浮音乐播放器，并移除全站表情符号。v6.2 新增：**开屏画面**（`index.html` 作为站点入口），主站移至 `home.html`。

## 页面入口

- `index.html` — **开屏画面**：全屏壁纸轮播，中央标题「Hello Yu Sun I'm OK」，底部小字「欢迎来到我的网页」。点击屏幕、按 Enter/空格或等待 3.2 秒自动进入主站。
- `home.html` — 主站（博客、项目、技术栈、友链、讨论、关于）。
- `read.html?post=<id>` — 文章阅读页（可从任意入口直达，不经过开屏）。

## 前端结构

| 文件 | 职责 |
| --- | --- |
| `index.html`（开屏）/ `home.html` / `read.html` | 页面结构与可访问的浅色／深色切换控件（开屏无主题切换） |
| `css/splash.css` | 开屏画面样式（壁纸轮播、标题与底部文字动画） |
| `css/theme.css` | 设计令牌（OKLCH 色相驱动，浅色／深色）、Flex 主题开关与滑块动画 |
| `css/style.css` / `css/read.css` | 主站／阅读页的 MD3 布局与组件样式（含筛选条与音乐播放器） |
| `js/theme.js` | 首屏主题恢复、按钮状态、键盘操作与跨标签页同步 |
| `js/services/posts.js` | 统一文章加载、超时、缓存和并发请求合并 |
| `js/alert.js` / `js/read.js` | 主站交互（背景壁纸、博客渲染、标签筛选、弹窗）／文章渲染 |
| `js/music.js` | 右侧悬浮音乐播放器（原创，无依赖，读取 `data/music.json`） |
| `js/discussion.js` | 按需加载 GitHub Discussions 评论、同步主题及处理登录回跳 |
| `js/gate.js` | `?admin` 管理门禁 |

设计令牌全部集中在 `css/theme.css` 的 `--rinui-*` 变量，主色相由 `--hue`（默认 268 靛蓝）一键控制，浅色／深色通过 `html[data-theme]` 切换。新增页面时，在 `<head>` 中同步加载 `js/theme.js`，并依次引入 `css/theme.css` 和页面样式。

## 博客搜索与标签筛选

博客面板顶部为搜索框，下方为自动生成的标签筛选条（全部/各标签胶囊）。搜索关键词与已选标签**同时生效**（取交集），点击「全部」清空筛选。标签来自 `data/posts.json` 中各文章的 `tags` 字段，无需手动维护。

## 音乐播放器

右下角圆形按钮展开悬浮播放器（无表情符号、无第三方库）。播放列表在 `data/music.json` 中维护，格式：

```json
{
  "playlist": [
    { "title": "歌名", "artist": "歌手", "url": "https://.../song.mp3", "cover": "images/xxx.jpg" }
  ]
}
```

`url` 为音频直链（mp3/ogg/m4a 等浏览器可播放格式），`cover` 可选（留空显示渐变占位）。占位示例条目可直接替换或删除。播放器支持播放/暂停、上一首/下一首、进度拖动（键盘左右方向键 +/-5 秒）、列表点选与当前曲目高亮。

## 背景壁纸

主站背景优先请求雫API（`/api/bg`，密钥由 Workers 环境变量 `SHIZUKU_API_KEY` 提供），失败时自动回退到 `images/` 下的本地壁纸轮播（60s 换一张），状态与当前壁纸信息显示在顶栏状态胶囊和底部状态栏中。主站 Hero 为透明窗口，透出背景壁纸并叠加渐变遮罩，中间显示站点标题。开屏画面的壁纸轮播由 `index.html` 内联的四张本地图片构成（6s 切换一次）。

## 文章数据

文章依次从实时 API（`/api/posts-data`）→ 静态 JSON（`data/posts.json`）→ 本地缓存加载，最多等待 8 秒。管理面板入口为 `?admin`（见 `_p/`），发布经 `POST /api/posts` 写入 KV 并推送到 GitHub 仓库触发部署。

## GitHub Discussions

主站的「Discussion 讨论」使用 giscus，绑定公开仓库 `sunZshanY/personal_website` 的 `General` 分类和现有首页讨论 [#5](https://github.com/sunZshanY/personal_website/discussions/5)，按讨论编号映射，因此域名、`/`、`/home.html` 的变化不会拆散留言。仓库 ID、分类 ID 集中在 `js/discussion.js`，前端不需要 GitHub Token。

## 本地预览

在项目根目录执行 `python -m http.server 8000 --bind 127.0.0.1`，打开 `http://127.0.0.1:8000`（先见开屏，点击进入主站）。此方式使用静态文章与本地壁纸回退；线上 API 由 Cloudflare Pages 的 `functions/` 提供。

## 浏览器回归验证

首次运行：

```sh
python -m pip install -r requirements-test.txt
python -m playwright install chromium
```

执行 `python -m unittest discover -s tests -v`。测试自动启动临时本地服务器，覆盖开屏进入、滑块中间状态、键盘操作、首屏恢复、跨标签页同步、移动端、减少动画、存储不可用以及文章加载回退；不会请求外部评论或统计服务。
