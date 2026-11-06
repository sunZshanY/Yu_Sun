# Yu Sun 的小博客

原生 HTML、CSS、JavaScript 构建的个人博客，无需前端构建步骤。v6.0 起以 Mizuki（Material Design 3 博客主题）为**设计参考**（仅借鉴视觉语言，代码全部原创，未复制模板源码）进行了全面重构：OKLCH 色相驱动设计令牌、16px 大圆角卡片、悬浮毛玻璃顶栏、MD3 侧栏导航指示条、横幅 Hero、柔和层级阴影与入场动画。v6.1 新增：博客标签筛选、右侧悬浮音乐播放器，并移除全站表情符号。v6.2 新增：**开屏画面**（`index.html` 作为站点入口），主站移至 `home.html`。v6.3 新增：**文章评论区 + GitHub 登录 + Cloudflare D1 评论数据库**，移除首页 Discussion 面板。v6.4 新增：**右上角胶囊登录按钮 + 原生用户名/密码注册登录**（GitHub OAuth 仍保留）。

## 页面入口

- `index.html` — **开屏画面**：全屏壁纸轮播，中央标题「Hello Yu Sun I'm OK」，底部小字「欢迎来到我的网页」。点击屏幕、按 Enter/空格或等待 3.2 秒自动进入主站。
- `home.html` — 主站（博客、项目、技术栈、友链、关于）。
- `read.html?post=<id>` — 文章阅读页（可从任意入口直达，不经过开屏），文章下方即为评论区。

## 前端结构

| 文件 | 职责 |
| --- | --- |
| `index.html`（开屏）/ `home.html` / `read.html` | 页面结构与可访问的浅色／深色切换控件（开屏无主题切换） |
| `css/splash.css` | 开屏画面样式（壁纸轮播、标题与底部文字动画） |
| `css/theme.css` | 设计令牌（OKLCH 色相驱动，浅色／深色）、Flex 主题开关与滑块动画 |
| `css/style.css` / `css/read.css` | 主站／阅读页的 MD3 布局与组件样式（含筛选条与音乐播放器） |
| `css/comments.css` | 文章评论区样式（登录卡片、发表框、评论树、移动端适配） |
| `css/auth.css` | 右上角胶囊登录按钮、登录/注册弹窗样式 |
| `js/theme.js` | 首屏主题恢复、按钮状态、键盘操作与跨标签页同步 |
| `js/services/posts.js` | 统一文章加载、超时、缓存和并发请求合并 |
| `js/alert.js` / `js/read.js` | 主站交互（背景壁纸、博客渲染、标签筛选、弹窗）／文章渲染 |
| `js/music.js` | 右侧悬浮音乐播放器（原创，无依赖，读取 `data/music.json`） |
| `js/auth.js` | 全站登录状态、右上角按钮、登录/注册弹窗、GitHub 与密码登录 |
| `js/comments.js` | 文章评论区：登录态、发表、回复、删除、空状态与错误处理 |
| `js/gate.js` | `?admin` 管理门禁 |
| `functions/api/auth/*` | GitHub OAuth、用户名/密码注册登录、会话、退出、当前用户 |
| `functions/api/comments/*` | 评论读取、发表、软删除 |
| `db/schema.d1.sql` | 线上 Cloudflare D1 表结构 |
| `db/schema.mysql.sql` | 以后迁移到 Debian + MySQL/MariaDB 用的表结构 |

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

## 评论系统与登录

评论区位于每篇文章底部（`read.html`），首页不再保留 Discussion 面板。评论系统为原创实现，不依赖 giscus：

- **登录**：右上角胶囊按钮打开登录/注册弹窗，支持两种方式：
  - **GitHub OAuth**：首次登录自动创建账号，只保存 GitHub 公开资料（用户名、昵称、头像；邮箱仅在公开时保存）。
  - **用户名 / 密码**：原生注册登录，不依赖 GitHub。密码在浏览器端用 PBKDF2-SHA256（310000 次）派生，服务端只保存加 pepper 的 SHA-256 摘要。
- **评论**：必须登录后才能发表；支持一级回复；作者可删除自己的评论，管理员可删除任意评论。
- **数据**：Cloudflare D1（SQLite），免费额度足够个人博客；表结构见 `db/schema.d1.sql`。
- **安全**：会话 token 存 `HttpOnly` Cookie，数据库只存 SHA-256 摘要；注册 5 次/小时/IP、登录 10 次/10 分钟/IP；同用户 10 秒发言冷却、每天最多 50 条；前端按纯文本渲染，防 XSS。

> 评论 API 依赖 Cloudflare Pages Functions。如果同一份代码还部署到 GitHub Pages（纯静态），那边不会提供 `/api`，评论区会显示服务不可用；请以 Cloudflare Pages 的域名为准。

### 启用步骤

> **当前状态**：D1 数据库 `omia-comments` 已创建并完成建表，`wrangler.jsonc` 也已写好真实 `database_id`；线上已部署，右上角登录按钮和用户名/密码注册登录可用。GitHub 登录是可选项，配置了两个 OAuth 环境变量后才会显示 GitHub 按钮。

1. **创建 D1 数据库（换账号/重建时才需要）**

   ```sh
   npx wrangler d1 create omia-comments
   ```

2. **绑定 `COMMENT_DB`**：本项目已在 `wrangler.jsonc` 的 `d1_databases` 中绑定；如果用控制台上传，请到 Cloudflare Pages → Settings → Bindings → D1 database 手动绑定，变量名 `COMMENT_DB`。

3. **建表（重建时才需要）**

   ```sh
   npx wrangler d1 execute COMMENT_DB --remote --file=db/schema.d1.sql
   ```

4. **（可选）启用 GitHub 登录**：打开 <https://github.com/settings/developers> → OAuth Apps → New OAuth App
   - Homepage URL：`https://omiasun.pages.dev`
   - Authorization callback URL：`https://omiasun.pages.dev/api/auth/github/callback`

5. **配置环境变量**（Cloudflare Pages → Settings → Environment variables）：

   | 变量名 | 说明 |
   | --- | --- |
   | `PASSWORD_PEPPER` | 原生密码的 pepper，建议设置一个随机长字符串并妥善保存；不设置会回退到 `ADMIN_AUTH_SECRET` |
   | `GITHUB_CLIENT_ID` | GitHub OAuth App 的 Client ID（可选，启用 GitHub 登录时必填） |
   | `GITHUB_CLIENT_SECRET` | GitHub OAuth App 的 Client Secret（可选，启用 GitHub 登录时必填） |
   | `COMMENT_ADMIN_USER` | 管理员用户名，逗号分隔（可选） |
   | `PUBLIC_ORIGIN` | 自定义域名时固定 OAuth 回调来源（可选） |

6. 重新部署一次，右上角就会出现胶囊形「登录」按钮，点开即可注册/登录。修改 `COMMENT_ADMIN_USER` 后需要退出并重新登录一次，角色才会刷新。

> 变量名要完全精确，不要带前导或尾随空格（例如误写成 `" GITHUB_CLIENT_ID"`）。后端对前导空格做了兼容，但建议在控制台修正。

> `PASSWORD_PEPPER` 设置后不要随意修改，否则已有密码账号会全部登录失败。忘记密码目前需要管理员在数据库里重置（可让用户重新注册新账号，或把 `users.password_hash/password_salt` 清空后让用户用 GitHub 登录）。

更详细的操作步骤、维护 SQL、本地 D1 调试方式见 [`db/README.md`](db/README.md)。

## 要不要一台 Linux 主机？MySQL 怎么办？

**不需要。** 线上评论系统使用 Cloudflare D1：免费、免运维，不用买服务器、不用公网 IP、不用自己配 HTTPS，个人博客的评论量远远用不完免费额度。

本项目已经写了 MySQL 版表结构 [`db/schema.mysql.sql`](db/schema.mysql.sql)，等以后你有了长期在线的 Debian 主机、确实想全站自托管时再迁移即可。当前 `functions/api/` 的查询代码使用 D1 驱动；搬到 MySQL 时需要把数据访问层换成 `mysql2` 之类的驱动（表结构和接口字段已经按同一套设计）。在那之前，Debian 主机更适合拿来学习、做实验。

## 本地预览

只预览静态页面：

```sh
python -m http.server 8000 --bind 127.0.0.1
```

打开 `http://127.0.0.1:8000`（先见开屏，点击进入主站）。此方式没有 Pages Functions，评论区会显示「评论服务暂不可用」。

要连评论 API / D1 一起调试：

```sh
npx wrangler d1 execute COMMENT_DB --local --file=db/schema.d1.sql
npx wrangler pages dev . --d1 COMMENT_DB
```

## Cloudflare Pages 部署配置

`functions/` 提供文章、壁纸、访客与评论 API。线上至少要绑定 D1，否则评论与登录不可用；其余按需配置：

| 配置项 | 位置 | 说明 |
| --- | --- | --- |
| KV 命名空间绑定 `VISITOR_STORE` | Pages 控制台 → Settings → Bindings → KV namespace | 访客监控、KV 文章缓存与登录/注册限流。**若通过 GitHub 集成自动部署，`wrangler.jsonc` 里的 `kv_namespaces` 不会自动生效，必须在此手动绑定** |
| D1 数据库绑定 `COMMENT_DB` | Pages 控制台 → Settings → Bindings → D1 database | 评论与用户数据的存储。先执行 `db/schema.d1.sql` 建表 |
| 环境变量 `PASSWORD_PEPPER` | Settings → Environment variables（建议） | 原生密码的 pepper，设置一次后不要改；不设置会回退到 `ADMIN_AUTH_SECRET` |
| 环境变量 `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | 同上（可选） | 启用 GitHub 登录时必填；不配置则只显示用户名/密码登录 |
| 环境变量 `COMMENT_ADMIN_USER` | 同上（可选） | 管理员用户名，逗号分隔；GitHub 登录与原生账号都适用 |
| 环境变量 `PUBLIC_ORIGIN` | 同上（可选） | 自定义域名时固定 OAuth 回调来源，例如 `https://blog.example.com` |
| 环境变量 `ADMIN_AUTH_SECRET` | 同上（可选） | 管理员接口共享密钥，**默认已内置**与 `_p/index.html` 一致的密钥，未配置也能正常工作；设置后需与前端 `ADMIN_AUTH` 常量一致 |
| 环境变量 `SHIZUKU_API_KEY` | 同上（可选） | 雫API 壁纸密钥，缺失时自动回退本地壁纸 |
| 环境变量 `GITHUB_TOKEN` | 同上（可选） | 发布博文时自动推送 `data/posts.json` + `main.json` 触发部署 |

首次发布博文时 `main.json` 若仓库中不存在会自动创建。备案检查（萌ICP/假ICP）抓取的是**根页面**，因此备案号已同时放在 `index.html`（开屏页）与 `home.html` 页脚，删除前请确认检查器要求。

## 浏览器回归验证

首次运行：

```sh
python -m pip install -r requirements-test.txt
python -m playwright install chromium
```

执行 `python -m unittest discover -s tests -v`。测试自动启动临时本地服务器，覆盖开屏进入、滑块中间状态、键盘操作、首屏恢复、跨标签页同步、移动端、减少动画、存储不可用、文章加载回退、右上角登录按钮 / 注册登录弹窗、密码登录以及评论区登录态 / 发表 / 离线状态；不会请求外部评论或统计服务。
