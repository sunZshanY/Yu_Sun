# 评论系统数据库说明

## 先回答：要不要搞一台 Linux 主机？

**不用。** 线上评论系统使用 Cloudflare D1（SQLite），免费额度对个人博客完全够用：

- 500 MB 存储（纯文字评论能用非常久）
- 每天 500 万行读取 / 10 万行写入（免费额度）
- 不需要公网 IP、不需要 7×24 开机、不需要自己配 HTTPS、不用备份服务器

MySQL 需要一台一直开机的机器（或者付费云数据库），还要处理公网访问、防火墙、备份、升级，成本反而更高。你的 Debian 主机可以留着学习、跑实验；等以后真的想全站自托管，再用 `schema.mysql.sql` 迁移。

## 方案 A：Cloudflare D1（线上使用，推荐）

> **当前状态**：本仓库已经创建了 D1 数据库 `omia-comments`
> （ID `9322d96a-f82a-4da8-9dc0-6a698195da5a`），并已执行 `db/schema.d1.sql` 建表。
> 如果你继续使用同一个 Cloudflare 账号，可以跳过第 1～3 步。
> 用户名/密码注册登录已部署可用；GitHub 登录是可选项，配置后才会出现 GitHub 按钮。
>
> 如果你换了账号、删了数据库，或者想在别的环境重建，再按下面步骤来。

### 1. 创建数据库（重建时）

```sh
npx wrangler d1 create omia-comments
```

命令会返回一个 `database_id`，复制下来。

### 2. 绑定到 Pages（重建时）

把 `database_id` 填到根目录 `wrangler.jsonc` 的 `d1_databases` 中：

```jsonc
"d1_databases": [
  {
    "binding": "COMMENT_DB",
    "database_name": "omia-comments",
    "database_id": "粘贴上一步返回的 database_id",
    "preview_database_id": "COMMENT_DB"
  }
]
```

如果通过控制台手动上传部署，请到：

> Cloudflare Pages 控制台 → 你的项目 → Settings → Bindings → Add → D1 database

绑定变量名填 **`COMMENT_DB`**，选择 `omia-comments`，保存后重新部署一次。

### 3. 建表（重建时）

```sh
npx wrangler d1 execute COMMENT_DB --remote --file=db/schema.d1.sql
```

### 4. 配置账号登录

用户名/密码登录不需要额外账号，只要 D1 可用即可。建议在 Cloudflare Pages → Settings → Environment variables 设置：

| 变量名 | 值 | 说明 |
| --- | --- | --- |
| `PASSWORD_PEPPER` | 随机长字符串 | 建议设置一次后不要再改；不设置会回退到 `ADMIN_AUTH_SECRET` |
| `COMMENT_ADMIN_USER` | `sunZshanY` | 可选，逗号分隔的管理员用户名，可删除任意评论 |
| `GITHUB_CLIENT_ID` | OAuth App 的 Client ID | 可选，启用 GitHub 登录时填写 |
| `GITHUB_CLIENT_SECRET` | OAuth App 的 Client Secret | 可选，启用 GitHub 登录时填写，注意保密 |
| `PUBLIC_ORIGIN` | `https://omiasun.pages.dev` | 可选，自定义域名时固定 OAuth 回调来源 |

> 变量名不要带前导/尾随空格。线上曾出现 `" GITHUB_CLIENT_ID"`（前面多一个空格），后端已做兼容，但建议在控制台修正为 `GITHUB_CLIENT_ID`。

如果要启用 GitHub 登录：

1. 打开 <https://github.com/settings/developers> → **OAuth Apps** → **New OAuth App**
2. 填写：
   - Application name：`Omia Blog Comments`（随意）
   - Homepage URL：`https://omiasun.pages.dev`
   - Authorization callback URL：`https://omiasun.pages.dev/api/auth/github/callback`
3. 创建后复制 **Client ID**，再生成 **Client Secret**，填入上面的环境变量。

> 如果用自定义域名，OAuth App 的 Homepage URL 和 callback URL 也要改成自定义域名，并设置 `PUBLIC_ORIGIN`。

### 5. 本地开发

```sh
# 建本地表（注意用绑定名 COMMENT_DB，才能和 pages dev 的本地库对上）
npx wrangler d1 execute COMMENT_DB --local --file=db/schema.d1.sql

# 启动 Pages（带 D1 绑定）
npx wrangler pages dev . --d1 COMMENT_DB
```

打开 `http://127.0.0.1:8787`。本地的用户名/密码注册登录可以直接使用；没有配置 GitHub OAuth 时，登录弹窗只会显示账号密码表单，文章和评论读取不受影响。

### 6. 常用维护 SQL

```sh
# 查看用户
npx wrangler d1 execute omia-comments --remote --command="SELECT id, username, display_name, role FROM users"

# 旧库补 password_salt 列（本仓库的库已经加过，重建环境时才需要）
npx wrangler d1 execute omia-comments --remote --command="ALTER TABLE users ADD COLUMN password_salt TEXT"

# 删除一条评论（软删除，保留回复）
npx wrangler d1 execute omia-comments --remote --command="UPDATE comments SET status='deleted', content='' WHERE id=1"

# 设置管理员
npx wrangler d1 execute omia-comments --remote --command="UPDATE users SET role='admin' WHERE username='sunZshanY'"
```

## 方案 B：Debian + MySQL / MariaDB（以后可选）

当你有了一台长期在线的 Debian 主机，并且确实想自己维护数据库时：

```sh
sudo apt update
sudo apt install mariadb-server
sudo mysql < db/schema.mysql.sql
```

然后创建低权限账号：

```sql
CREATE USER 'omia'@'localhost' IDENTIFIED BY '换成强密码';
GRANT SELECT, INSERT, UPDATE, DELETE ON omia_blog.* TO 'omia'@'localhost';
FLUSH PRIVILEGES;
```

注意：当前 `functions/api/` 使用的是 Cloudflare D1 驱动。搬到 MySQL 时，需要把 `functions/api/_lib/auth.js` 和 `functions/api/comments/*` 里的 D1 查询换成 MySQL 驱动（例如 Node.js 的 `mysql2`），或者保留 Cloudflare Pages 只做静态托管、另写一个 Node API 并让 Nginx 反代 `/api/`。表结构和接口字段已经按同一套设计，迁移时不用改前端。

## 数据表

| 表 | 作用 |
| --- | --- |
| `users` | GitHub 公开资料 / 原生账号哈希、盐、角色（user/admin） |
| `sessions` | 登录会话，只保存 token 的 SHA-256 摘要 |
| `comments` | 评论与回复，软删除保留结构 |

## 安全设计

- 支持 GitHub OAuth 与用户名/密码两种登录；两者共用同一套会话
- 密码在浏览器端用 PBKDF2-SHA256（310000 次）派生，服务端只保存 `SHA-256(pepper + salt + verifier)`
- `PASSWORD_PEPPER` 只放在服务端环境变量里，不写进数据库
- 会话 Cookie：`HttpOnly` + `SameSite=Lax`（线上自动加 `Secure`）
- 数据库只存会话 token 的 SHA-256 摘要，泄库也无法直接登录
- 注册 5 次/小时/IP、登录 10 次/10 分钟/IP
- 发表评论必须登录，同一用户 10 秒冷却、每天最多 50 条
- 评论内容前端全部按纯文本渲染，避免 XSS
- 作者可删除自己的评论，管理员可删除任意评论
