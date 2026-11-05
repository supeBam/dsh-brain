# 第二大脑 · Second Brain

DeepSeek Harness 的侧边栏第二大脑：随手记想法、剪藏外部信息，AI 在对话里主动帮你归档，全部落成一个 **Obsidian 兼容的 Markdown 仓库**，随时能换成网站。

```
左侧边栏「第二大脑」→ 写/收 → 提交到私有仓库 → （可选）用 Obsidian / 站点读
```

## 为什么是仓库，不是数据库

- **一份真相**：所有笔记都是纯文本 `.md`，用 git 管版本，不锁在任何 App 里。
- **Obsidian 可直接打开**：YAML front matter + `[[双链]]` + `#标签` + 文件夹，就是 vault 格式，克隆下来 `Open folder as vault` 即可。
- **以后能变成网站**：同一个仓库接 Quartz / MkDocs / VitePress 就能发布，不需要迁移。

## 功能

### 写作与捕获
- 侧边栏独立面板，不占会话；顶部写标题和正文，`⌘Enter` 提交。
- 四种笔记类型：**想法 / 剪藏 / 引用 / 待办**，配 `tags` 和 `source`（来源 URL）。
- 完整 Markdown 渲染：标题、强调、删除线、行内/围栏/缩进代码、嵌套引用、嵌套列表、任务列表、对齐表格、脚注、自动链接、HTML、转义。
- Obsidian 扩展：`[[双链]]` 渲染成可点击的链接（点击会在收件箱里搜索该标题），`> [!note]` 这类 callout 渲染成提示块。
- 编辑 / 双栏 / 预览三态，双栏滚动同步；工具栏 + `⌘B` `⌘I` `⌘K`。
- 本地草稿自动保存，`Tab` 缩进，`Enter` 续写列表。

### 主动收集（AI 侧）
插件注册两个工具，模型在对话里可以直接调用：

| 工具 | 作用 |
| --- | --- |
| `brain_save` | 把值得长期保留的想法/结论/链接/待办写成一条笔记，带类型、标签、来源，直接提交到仓库 |
| `brain_search` | 在仓库里检索历史笔记，回答「上次那个结论」这类问题前先翻一遍 |

这就是「第二大脑」和「博客」的区别：不是等你打开编辑器才记录，而是对话里产生的东西当场沉淀。

### 仓库侧
- 文章列表读取收件箱目录，点开即在编辑器里打开（解析 front matter），改完提交是更新同一文件。
- 新笔记路径：`<收件箱>/YYYY-MM-DD-slug.md`，日期前缀保证文件名唯一（Obsidian 双链靠文件名解析）。
- 设置保存在插件 config（宿主侧），页面与工具读同一份；令牌存在 credentials 记录里，页面拿不到。

## 笔记格式

```markdown
---
title: 第二大脑的结构
type: thought
created: 2026-11-05T15:30:00+08:00
tags: [设计, 工具]
source: https://example.com/article
---

正文，可以用 [[另一条笔记]] 建立双链。
```

## 安装

```bash
git clone git@github.com:supeBam/dsh-brain.git ~/code/dsh-plugins/dsh-brain

DSH_CLI="$(command -v dsh || echo '/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh')"
"$DSH_CLI" plugin --profile desktop add link:"$HOME/code/dsh-plugins/dsh-brain"
```

装完 `⌘Q` 完全退出 DeepSeek Harness 再打开，左侧边栏出现大脑图标。

## 首次使用

1. 打开面板 → 右上角齿轮 → 填仓库 `owner` / 仓库名 / 分支 / 收件箱目录（默认 `inbox`）。
2. 令牌：点「使用 gh CLI 令牌」复用本机登录，或粘贴一个有 `repo` 写权限的 PAT。
3. 保存设置（会重载插件），回到编辑页开始写。

## 配置项

| 字段 | 说明 | 默认 |
| --- | --- | --- |
| 仓库所有者 / 仓库名 | `owner/repo` | `supeBam/brain` |
| 分支 | 提交目标分支 | `main` |
| 收件箱目录 | 新笔记落点，留空为根目录 | `inbox` |
| 站点地址 | 可选，用于「打开站点」 | 空 |

## 安全

- 令牌只写入宿主 credentials 记录（键 `brain`），不出现在页面、配置或日志里。
- 页面通过同源 `POST /brain/api` 发指令；令牌每次请求时解析，轮换后下一次提交立即生效。
- 环境变量 `GITHUB_TOKEN` / `GH_TOKEN` 可作为后备。

## 路线图

- **阶段一（当前）**：捕获 + AI 归档 + 仓库同步。
- **阶段二**：仓库里内容够多后，接 Quartz（双链、反链、图谱、搜索）用 GitHub Actions 构建成可浏览的站点；公开范围到那时再定。
- 阶段三：每日视图、批量整理（收件箱 → 主题笔记）、附件上传。

## 目录结构

```
index.js          宿主半边：GitHub 代理、config、令牌、brain_save / brain_search
client.js         浏览器半边：侧边栏、写作页、Markdown 渲染器
cordis.patch.yml  bundle 行与默认 config
locale/           插件列表标题与描述
icon.svg          侧边栏图标
```

## 许可

MIT，见 [LICENSE](LICENSE)。

Copyright (c) 2026 superfox (github.com/supeBam)
