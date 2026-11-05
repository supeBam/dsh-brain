# AGENTS.md — 给 AI Agent 的安装与维护手册

本文件写给读代码的 Agent：这个仓库是一个 DSH（DeepSeek Harness）cordis 插件 bundle，装上后左侧边栏会出现「第二大脑」写作页，并注册 brain_save / brain_search 两个工具。

## 包结构

| 文件 | 作用 |
| --- | --- |
| `index.js` | 宿主半边。注册精确路由 `POST /brain/api`，代理 GitHub Contents API，并注册 `brain_save` / `brain_search`；令牌存在 credentials 记录（键 `brain`），页面拿不到。 |
| `client.js` | 浏览器半边。`window.__ModuleLoader__.load()` 注册 `main` 面板与 `sidebar.panellist` 入口；内含无依赖 Markdown 渲染器（含 [[双链]] 与 callout）。 |
| `cordis.patch.yml` | 把 bundle 行插入 Cordis 树。 |
| `locale/*.json` | 插件列表里的标题/描述（`meta.title` / `meta.description`）。 |
| `icon.svg` | 侧边栏与插件列表图标。 |

`package.json` 里两处声明缺一不可：`dsh.bundle.patch`（宿主行）与 `dsh.client`（让 web app 加载 `./client.js`）。

## 安装

```bash
DSH_CLI="$(command -v dsh || echo '/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh')"
"$DSH_CLI" plugin --profile desktop add link:"$HOME/code/dsh-plugins/dsh-brain"
```

或用 `plugin_manager` 的 `install_bundle`，`target` 传包目录绝对路径。

## 生效

- Web：刷新页面。
- Desktop：`⌘Q` 完全退出再打开；只关窗口不会重新加载 client bundle。
- 只改 `client.js` 时，页面刷新即可；改 `index.js` 需要重载插件（重启应用最稳）。

## 验证

```bash
# 1. 宿主路由在不在
curl -s -X POST http://127.0.0.1:<port>/brain/api \
  -H 'content-type: application/json' -d '{"action":"status"}'
# 期望：{"ok":true,"data":{"configured":false,...}} 或 configured:true

# 2. 客户端槽位
#    cordis_inspect_query platform=client provider=Slots method=listSubTree
#    root=sidebar.panellist 应出现 registrant=@local/brain, id=brain
#    root=main            应有 key=brain 的占位项
```

## 关键约束

- 面板 key、locale 命名空间、`main` 注册 key、`sidebar.panellist` id、`client.js` 里返回的 `name` 必须都是 `brain`，否则页面空白或标签不显示。
- 不要在 `client.js` 里直接 `fetch` GitHub API：令牌会进页面。所有 GitHub 调用走宿主路由；工具同样复用宿主侧的 gh 封装。
- 令牌只经 `credentials.modifyRecord('brain', ...)` 写入；不要写进 `cordis.patch.yml` 或 localStorage。
- 样式只用 `--dsw-alias-*` 主题变量，不要写死颜色（图标与 Markdown 预览的代码块背景除外，都用 token 派生）。
- 路由路径或 action 名变更时，同步改 `client.js` 里的 `API_ROUTE` 和 `callHost` 调用。

## 排障

| 现象 | 原因与处理 |
| --- | --- |
| 侧边栏没有图标 | profile 的 `dsh.profile.bundles` 未包含 `@local/brain`；或软链指向的目录已移动 |
| 面板空白/崩溃 | `client.js` 语法错误或注册 id 不匹配；看 console 的 `slot entry crashed in 'main'` |
| 「尚未配置令牌」 | 设置页粘贴 token，或点「使用 gh CLI 令牌」（宿主会用补全后的 PATH 调 `gh auth token`） |
| 提交报 409 同名文件 | 目标路径已存在且当前草稿没有 sha；换文件名，或先打开仓库里的那篇文章再更新 |
| 提交成功但网页没变 | 站点需要重新构建，见 README「站点需要构建」 |
| 403 / 未授权 | token 缺少 Contents 写权限；fine-grained token 需要 Contents: Read and write |

## 不要做

- 不要改包名 `@local/brain`：profile 的 dependencies、bundles 与软链都依赖它。
- 不要在页面里存 token 副本（localStorage/sessionStorage 都不要）。
- 不要为本插件引入需要构建步骤的依赖；`client.js` 必须是可直接加载的普通 JS。
