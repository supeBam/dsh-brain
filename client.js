/**
 * Blog Studio — the browser half of the bundle.
 *
 * One identity, two registrations (the same shape the notes panel uses):
 *   - the writing page on the layout's root `main` slot under the panel key, so
 *     selecting the sidebar entry mounts it;
 *   - the sidebar entry on `sidebar.panellist`, whose row the shell owns.
 *
 * Drafts are browser state (localStorage). Publishing is a same-origin POST to
 * /blog-studio/api, the host half that owns the GitHub token: the page never
 * sees a credential and never calls api.github.com directly. The Markdown
 * renderer below covers CommonMark plus the GFM block and inline extensions, so
 * the preview needs no third-party bundle and stays a single plain-JS file.
 */
window.__ModuleLoader__.load({
  id: '@local/brain',
  factory(require) {
    'use strict';
    const React = require('react');
    const { useCallback, useEffect, useMemo, useRef, useState } = React;
    const h = React.createElement;

    const NS = 'brain';
    const PANEL_ID = 'brain';
    const API_ROUTE = '/brain/api';
    const DRAFTS_KEY = 'dsh.brain.v1:drafts';
    const GROUPS_KEY = 'dsh.brain.v1:groups';

    //#region dictionaries
    const DICT_ZH = {
      title: '第二大脑',
      newPost: '新建笔记',
      refresh: '刷新仓库',
      settings: '设置',
      back: '返回编辑',
      search: '搜索草稿与文章',
      drafts: '本地草稿',
      posts: '收件箱',
      emptyDrafts: '还没有本地草稿',
      draftsHint: '编辑器里未提交、或已打开过的笔记会留在这里，刷新也不会丢',
      inboxHint: '仓库 inbox/ 目录里的笔记：新笔记默认提交到这里，整理后再移到 notes/ 或 clips/',
      emptyPosts: '收件箱还是空的',
      untitled: '未命名',
      titlePlaceholder: '这条笔记叫什么',
      slug: '文件名',
      slugHint: '留空则按标题生成',
      date: '日期',
      now: '现在',
      tags: '标签',
      commaHint: '逗号分隔',
      bodyPlaceholder: '写下此刻的想法，⌘Enter 提交…',
      publish: '提交到仓库',
      publishing: '提交中…',
      openSite: '打开站点',
      openOnGitHub: '查看仓库文件',
      modeEdit: '编辑',
      modeSplit: '双栏',
      modePreview: '预览',
      words: '{n} 字',
      savedAt: '草稿已保存 · {time}',
      dirty: '有未提交的修改',
      clean: '已与仓库一致',
      tokenMissing: '请先在设置里配置 GitHub 令牌',
      settingsTitle: '大脑设置',
      repoSection: '大脑仓库（Markdown vault）',
      owner: '仓库所有者',
      repo: '仓库名',
      branch: '分支',
      dir: '收件箱目录',
      siteSection: '站点',
      siteUrl: '站点地址',
      tokenSection: '访问令牌',
      tokenPlaceholder: 'ghp_… / github_pat_…（需要 repo 写权限）',
      tokenStored: '令牌已保存，页面不会读取它',
      tokenValid: '令牌有效：{login}',
      tokenInvalid: '令牌无效或已过期',
      save: '保存设置',
      saved: '设置已保存',
      clearToken: '清除令牌',
      importGh: '使用 gh CLI 令牌',
      importGhBusy: '读取中…',
      importGhHint: '直接复用本机 gh 的登录状态，免去手动创建令牌',
      cancel: '取消',
      delete: '删除',
      confirmDelete: '确认删除',
      deleteTitle: '从仓库删除这篇文章？',
      deleted: '已删除：{path}',
      removeDraftHint: '移除这条本地草稿（仓库里的文件保留）',
      publishOk: '已提交：{path}',
      publishAll: '全部提交（{n}）',
      publishAllHint: '把所有未提交的笔记一次写进仓库并立即同步',
      publishThis: '提交本篇',
      publishAllOk: '已提交 {n} 篇',
      publishAllPartial: '提交了 {ok} 篇，{failed} 篇失败：{msg}',
      publishedTo: '已提交到 {path}',
      failed: '操作失败：{msg}',
      loadFailed: '读取失败：{msg}',
      listFailed: '仓库读取失败：{msg}',
      needRepo: '请先在设置里填写大脑仓库',
      tokenNeedsRepo: '令牌缺少写权限，请使用带 repo 权限的令牌',
      toolbar: 'Markdown 工具栏',
      bold: '加粗',
      italic: '斜体',
      strike: '删除线',
      inlineCode: '行内代码',
      codeBlock: '代码块',
      quote: '引用',
      ul: '无序列表',
      ol: '有序列表',
      task: '任务列表',
      link: '链接',
      image: '图片',
      table: '表格',
      hr: '分隔线',
      heading: '标题',
      shortcut: '⌘/Ctrl+B 加粗 · ⌘/Ctrl+I 斜体 · ⌘/Ctrl+Enter 提交',
      unsavedLeave: '切换文章会保留当前草稿',
      fileExists: '同名文件已存在于仓库',
      retry: '重试',
      justNow: '刚刚',
      minutesAgo: '{n} 分钟前',
      hoursAgo: '{n} 小时前',
      daysAgo: '{n} 天前',
      draftBadge: '草稿',
      remoteBadge: '仓库',
      published: '已发布',
      syntax: '支持的语法',
      syntaxBody: '标题、强调、删除线、行内代码、围栏代码块、缩进代码块、引用、嵌套列表、任务列表、表格（对齐）、链接与图片（行内/引用式）、自动链接、脚注、分隔线、行内 HTML 与 HTML 块、反斜杠转义、硬换行。',
      notPublishedYet: '尚未提交',
      wordCountTip: '按字符统计，不含空白',
      typeLabel: '类型',
      source: '来源',
      sourcePlaceholder: 'https://…',
      created: '创建时间',
      'type.thought': '想法',
      'type.clip': '剪藏',
      'type.quote': '引用',
      'type.task': '待办',
      inboxHint: '新笔记提交到 {dir}/，文件名 YYYY-MM-DD-slug.md',
      configRestart: '保存后会重新加载插件，页面会自动刷新配置',
      obsidianHint: '仓库是纯 Markdown + YAML + [[双链]]，可直接用 Obsidian 打开，也可以作为网站源。',
      vaultPath: '本地 vault',
      vaultHint: '插件直接写这个目录，Obsidian 打开同一目录就能实时看到；留空或目录不存在时自动回退到 GitHub 写接口。',
      modeLocal: '本地',
      modeRemote: '远程',
      openInObsidian: '在 Obsidian 打开',
      syncOk: '已同步',
      syncPending: '同步中…',
      syncFailed: '同步失败',
      syncNow: '立即同步',
      syncIdle: '未同步',
      commit: '提交说明',
      commitHint: '留空自动生成',
      close: '关闭',
      discard: '删除草稿',
      confirmDiscard: '确认删除草稿',
      discardTitle: '删除这条本地草稿？仓库里的文章不受影响',
      renderFailed: '页面渲染出错',
    };

    const DICT_EN = {
      title: 'Second brain',
      newPost: 'New note',
      refresh: 'Refresh repository',
      settings: 'Settings',
      back: 'Back to editor',
      search: 'Search drafts and posts',
      drafts: 'Local drafts',
      posts: 'Inbox',
      emptyDrafts: 'No local drafts yet',
      draftsHint: 'Notes open in this editor that are not committed yet; they survive a refresh',
      inboxHint: 'Notes in the repository inbox/ folder: new captures land here before you file them into notes/ or clips/',
      emptyPosts: 'The inbox is empty',
      untitled: 'Untitled',
      titlePlaceholder: 'Note title',
      slug: 'File name',
      slugHint: 'Empty means derived from the title',
      date: 'Date',
      now: 'Now',
      tags: 'Tags',
      commaHint: 'comma separated',
      bodyPlaceholder: 'Write the thought down; ⌘Enter commits…',
      publish: 'Commit to repo',
      publishing: 'Committing…',
      openSite: 'Open site',
      openOnGitHub: 'View file on GitHub',
      modeEdit: 'Write',
      modeSplit: 'Split',
      modePreview: 'Preview',
      words: '{n} chars',
      savedAt: 'Draft saved · {time}',
      dirty: 'Uncommitted changes',
      clean: 'Matches the repository',
      tokenMissing: 'Add a GitHub token in settings first',
      settingsTitle: 'Brain settings',
      repoSection: 'Brain repository (Markdown vault)',
      owner: 'Owner',
      repo: 'Repository',
      branch: 'Branch',
      dir: 'Inbox directory',
      siteSection: 'Site',
      siteUrl: 'Site URL',
      tokenSection: 'Access token',
      tokenPlaceholder: 'ghp_… / github_pat_… (needs repo write access)',
      tokenStored: 'Token stored on the host; this page never reads it',
      tokenValid: 'Token valid: {login}',
      tokenInvalid: 'Token is invalid or expired',
      save: 'Save settings',
      saved: 'Settings saved',
      clearToken: 'Clear token',
      importGh: 'Use gh CLI token',
      importGhBusy: 'Reading…',
      importGhHint: 'Reuse the local gh login instead of creating a token',
      cancel: 'Cancel',
      delete: 'Delete',
      confirmDelete: 'Delete',
      deleteTitle: 'Delete this post from the repository?',
      deleted: 'Deleted: {path}',
      removeDraftHint: 'Remove this local draft (the repository file stays)',
      publishOk: 'Committed: {path}',
      publishAll: 'Commit all ({n})',
      publishAllHint: 'Write every uncommitted note to the vault and sync now',
      publishThis: 'Commit this note',
      publishAllOk: 'Committed {n} notes',
      publishAllPartial: 'Committed {ok}, {failed} failed: {msg}',
      publishedTo: 'Committed to {path}',
      failed: 'Failed: {msg}',
      loadFailed: 'Could not load: {msg}',
      listFailed: 'Could not read the repository: {msg}',
      needRepo: 'Fill in the brain repository in settings first',
      tokenNeedsRepo: 'The token cannot write: use one with repo scope',
      toolbar: 'Markdown toolbar',
      bold: 'Bold',
      italic: 'Italic',
      strike: 'Strikethrough',
      inlineCode: 'Inline code',
      codeBlock: 'Code block',
      quote: 'Quote',
      ul: 'Bulleted list',
      ol: 'Numbered list',
      task: 'Task list',
      link: 'Link',
      image: 'Image',
      table: 'Table',
      hr: 'Divider',
      heading: 'Heading',
      shortcut: '⌘/Ctrl+B bold · ⌘/Ctrl+I italic · ⌘/Ctrl+Enter commit',
      unsavedLeave: 'Switching posts keeps the current draft',
      fileExists: 'A file with that name already exists',
      retry: 'Retry',
      justNow: 'just now',
      minutesAgo: '{n} min ago',
      hoursAgo: '{n} h ago',
      daysAgo: '{n} d ago',
      draftBadge: 'draft',
      remoteBadge: 'repo',
      published: 'Published',
      syntax: 'Supported syntax',
      syntaxBody: 'Headings, emphasis, strikethrough, inline code, fenced and indented code, blockquotes, nested lists, task lists, tables with alignment, inline and reference links and images, autolinks, footnotes, thematic breaks, inline HTML and HTML blocks, backslash escapes, hard breaks.',
      notPublishedYet: 'Not committed yet',
      wordCountTip: 'Characters, whitespace excluded',
      typeLabel: 'Type',
      source: 'Source',
      sourcePlaceholder: 'https://…',
      created: 'Created',
      'type.thought': 'Thought',
      'type.clip': 'Clip',
      'type.quote': 'Quote',
      'type.task': 'Task',
      inboxHint: 'New notes go to {dir}/ as YYYY-MM-DD-slug.md',
      configRestart: 'Saving reloads the plugin; the page re-reads the config',
      obsidianHint: 'The vault is plain Markdown + YAML + [[wikilinks]]; open it in Obsidian or use it as a site source.',
      vaultPath: 'Local vault',
      vaultHint: 'The plugin writes this folder directly; opening the same folder in Obsidian shows every change live. Empty or missing folder falls back to the GitHub API.',
      modeLocal: 'Local',
      modeRemote: 'Remote',
      openInObsidian: 'Open in Obsidian',
      syncOk: 'Synced',
      syncPending: 'Syncing…',
      syncFailed: 'Sync failed',
      syncNow: 'Sync now',
      syncIdle: 'Not synced',
      commit: 'Commit message',
      commitHint: 'Empty means generated',
      close: 'Close',
      discard: 'Discard draft',
      confirmDiscard: 'Discard draft',
      discardTitle: 'Discard this local draft? The repository file is untouched',
      renderFailed: 'Page failed to render',
    };
    //#endregion

    //#region settings
    /* Non-secret settings live in the plugin config (server side) so the page
       and the agent tools read one source of truth; the page only caches a copy
       for rendering. The token never appears here. */
    const DEFAULT_SETTINGS = {
      owner: 'supeBam',
      repo: 'brain',
      branch: 'main',
      inbox: 'inbox',
      siteUrl: '',
      vaultPath: '~/brain',
    };

    function cleanSettings(value) {
      const base = { ...DEFAULT_SETTINGS };
      if (value === null || typeof value !== 'object') return base;
      for (const key of Object.keys(base)) {
        if (typeof value[key] === 'string') base[key] = value[key];
      }
      return base;
    }
    //#endregion

    function readCollapsed() {
      try {
        const raw = window.localStorage.getItem(GROUPS_KEY);
        const parsed = raw === null ? {} : JSON.parse(raw);
        return { drafts: parsed.drafts === true, inbox: parsed.inbox === true };
      } catch (error) {
        return { drafts: false, inbox: false };
      }
    }

    function writeCollapsed(value) {
      try {
        window.localStorage.setItem(GROUPS_KEY, JSON.stringify(value));
      } catch (error) {
        /* Storage unavailable: collapsing still works for this mount. */
      }
    }

    //#region helpers
    function pad(value) {
      return String(value).padStart(2, '0');
    }

    function nowParts() {
      const date = new Date();
      return {
        date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
        time: `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
      };
    }

    function nowStamp() {
      const parts = nowParts();
      return `${parts.date} ${parts.time}`;
    }

    function makeId() {
      return 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    function slugify(text) {
      return String(text)
        .trim()
        .replace(/[\\/:*?"<>|#%{}$!'`^&+=@~,;\[\]()]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 80);
    }

    function splitList(value) {
      return String(value || '')
        .split(/[,，]/)
        .map((item) => item.trim())
        .filter((item) => item !== '');
    }

    function stampToParts(stamp) {
      const match = String(stamp || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
      if (match === null) {
        const parts = nowParts();
        return { date: parts.date, time: parts.time, stamp: `${parts.date} ${parts.time}` };
      }
      const date = `${match[1]}-${match[2]}-${match[3]}`;
      const time = `${match[4] || '00'}:${match[5] || '00'}:${match[6] || '00'}`;
      return { date, time, stamp: `${date} ${time}` };
    }

    function relTime(ms, t) {
      const diff = Date.now() - ms;
      if (diff < 60 * 1000) return t('justNow');
      if (diff < 60 * 60 * 1000) return t('minutesAgo', { n: Math.floor(diff / 60000) });
      if (diff < 24 * 60 * 60 * 1000) return t('hoursAgo', { n: Math.floor(diff / 3600000) });
      return t('daysAgo', { n: Math.floor(diff / 86400000) });
    }

    function countWords(text) {
      const stripped = String(text || '').replace(/\s+/g, '');
      return stripped.length;
    }

    async function callHost(action, payload) {
      let response;
      try {
        response = await fetch(API_ROUTE, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action, ...(payload || {}) }),
        });
      } catch (error) {
        throw new Error(t2Safe(error));
      }
      let data = null;
      try {
        data = await response.json();
      } catch (error) {
        data = null;
      }
      if (data === null || data.ok !== true) {
        const message = data && data.error && data.error.message ? data.error.message : `HTTP ${response.status}`;
        const failure = new Error(message);
        failure.code = data && data.error ? data.error.code : '';
        throw failure;
      }
      return data.data;
    }

    function t2Safe(error) {
      return error instanceof Error ? error.message : String(error);
    }
    //#endregion

    //#region markdown
    /*
     * A dependency-free Markdown renderer: CommonMark block structure with the
     * GFM extensions a blog actually uses (tables, task lists, strikethrough,
     * autolinks, footnotes). It is a preview aid, so the goal is faithful
     * structure rather than a byte-exact CommonMark reference implementation.
     */
    const HTML_ESCAPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

    function esc(value) {
      return String(value).replace(/[&<>"']/g, (character) => HTML_ESCAPE[character]);
    }

    function escapeRegExp(value) {
      return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    const HTML_BLOCK_TAGS = new Set([
      'address', 'article', 'aside', 'blockquote', 'details', 'div', 'dl', 'dd', 'dt',
      'figure', 'figcaption', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'header', 'hr', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'summary',
      'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul', 'video', 'audio',
      'picture', 'source', 'img', 'center', 'small', 'iframe',
    ]);

    const DANGEROUS_TAGS = /<\/?(?:script|style|iframe|object|embed|form|input|button|textarea|select|option|link|meta|base)\b[^>]*>/gi;

    function sanitizeFragment(html) {
      return String(html)
        .replace(DANGEROUS_TAGS, '')
        .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        .replace(/(\s(?:href|src|xlink:href|poster|data)\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+)/gi, (match, prefix, raw) => {
          const value = String(raw).replace(/^["']|["']$/g, '').trim();
          return /^(?:javascript|vbscript|data):/i.test(value) ? '' : match;
        });
    }

    function safeHref(value) {
      const text = String(value || '').trim().replace(/^<|>$/g, '');
      if (text === '') return '';
      if (/^(?:javascript|vbscript|data):/i.test(text)) return '';
      if (/^[a-z][a-z0-9+.-]*:/i.test(text) && /^(?:https?|mailto|ftp):/i.test(text) === false) return '';
      return esc(text);
    }

    function codeBlock(code, info) {
      const language = String(info || '').split(/\s+/)[0].replace(/[^\w#+.-]/g, '');
      const label = language === '' ? '' : '<span class="bs-code-lang">' + esc(language) + '</span>';
      return (
        '<div class="bs-code">' + label + '<pre><code' + (language === '' ? '' : ' class="language-' + esc(language) + '"') + '>' +
        esc(code) + '</code></pre></div>'
      );
    }

    function normalizeRef(value) {
      return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
    }

    function splitRow(row) {
      const text = String(row).trim().replace(/^\|/, '').replace(/\|$/, '');
      const cells = [];
      let current = '';
      let escaped = false;
      for (const character of text) {
        if (escaped) {
          current += character;
          escaped = false;
          continue;
        }
        if (character === '\\') {
          escaped = true;
          current += character;
          continue;
        }
        if (character === '|') {
          cells.push(current.trim());
          current = '';
          continue;
        }
        current += character;
      }
      cells.push(current.trim());
      return cells;
    }

    function alignOf(separator) {
      const left = separator.startsWith(':');
      const right = separator.endsWith(':');
      if (left && right) return 'center';
      if (right) return 'right';
      if (left) return 'left';
      return '';
    }

    function parseFrontMatter(source) {
      const text = String(source || '');
      const match = text.match(/^(?:\uFEFF)?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
      if (match === null) return { data: {}, body: text };
      const data = {};
      let currentKey = '';
      for (const line of match[1].split(/\r?\n/)) {
        const pair = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
        if (pair !== null) {
          currentKey = pair[1];
          const raw = pair[2].trim();
          if (raw === '') {
            data[currentKey] = [];
            continue;
          }
          if (/^\[.*\]$/.test(raw)) {
            data[currentKey] = raw
              .slice(1, -1)
              .split(',')
              .map((item) => item.trim().replace(/^["']|["']$/g, ''))
              .filter((item) => item !== '');
          } else {
            data[currentKey] = raw.replace(/^["']|["']$/g, '');
          }
          continue;
        }
        const item = line.match(/^\s*-\s+(.*)$/);
        if (item !== null && currentKey !== '') {
          if (!Array.isArray(data[currentKey])) data[currentKey] = [];
          data[currentKey].push(item[1].trim().replace(/^["']|["']$/g, ''));
        }
      }
      return { data, body: text.slice(match[0].length) };
    }

    function yamlScalar(value) {
      const text = String(value == null ? '' : value);
      if (text === '') return '""';
      if (/^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2}(?::\d{2})?)?$/.test(text)) return text;
      if (/^[A-Za-z0-9\u4e00-\u9fff][^#:]*$/.test(text) && !/^\s|\s$/.test(text)) return text;
      return JSON.stringify(text);
    }

    function isoFromStamp(stamp) {
      const parts = stampToParts(stamp);
      const date = new Date(parts.date + 'T' + parts.time);
      const offset = -date.getTimezoneOffset();
      const sign = offset >= 0 ? '+' : '-';
      const hours = pad(Math.floor(Math.abs(offset) / 60));
      const minutes = pad(Math.abs(offset) % 60);
      return parts.date + 'T' + parts.time + sign + hours + ':' + minutes;
    }

    function buildNoteDocument(meta, body) {
      const lines = ['---'];
      lines.push('title: ' + yamlScalar(meta.title));
      lines.push('type: ' + meta.type);
      lines.push('created: ' + yamlScalar(meta.created));
      if (meta.tags.length > 0) lines.push('tags: [' + meta.tags.map(yamlScalar).join(', ') + ']');
      if (meta.source !== '') lines.push('source: ' + yamlScalar(meta.source));
      lines.push('---');
      lines.push('');
      return lines.join('\n') + String(body || '').replace(/^\n+/, '');
    }

    function renderInline(source, st) {
      const store = [];
      const keep = (html) => {
        store.push(html);
        return '\u0000' + (store.length - 1) + '\u0000';
      };
      let text = String(source == null ? '' : source);

      // Code spans first: their content must never be read as markup.
      text = text.replace(/(`+)([\s\S]*?)\1(?!`)/g, (match, ticks, code) => {
        const trimmed = code.replace(/^ ([\s\S]*?) $/, '$1');
        return keep('<code>' + esc(trimmed) + '</code>');
      });

      // Backslash escapes.
      text = text.replace(/\\([\\`*_{}\[\]()#+\-.!~>|$])/g, (match, character) => keep(esc(character)));

      // Footnote references.
      text = text.replace(/\[\^([^\]\s]+)\]/g, (match, id) => {
        if (st.notes[id] === undefined) return keep(esc(match));
        if (!st.noteOrder.includes(id)) st.noteOrder.push(id);
        const index = st.noteOrder.indexOf(id) + 1;
        return keep('<sup class="bs-fn-ref"><a id="bs-fnref-' + esc(id) + '" href="#bs-fn-' + esc(id) + '">' + index + '</a></sup>');
      });

      // Obsidian-style wikilinks [[target]] / [[target|alias]].
      text = text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (match, target, alias) => {
        const name = String(target).trim();
        if (name === '') return keep(esc(match));
        const label = alias === undefined || String(alias).trim() === '' ? name : String(alias).trim();
        return keep('<a class="bs-wikilink" href="#" data-wikilink="' + esc(name) + '" title="' + esc(name) + '">' + esc(label) + '</a>');
      });

      // Images: inline, then reference style.
      text = text.replace(/!\[([^\]]*)\]\(\s*<?([^\s)>]+)>?(?:\s+(?:"([^"]*)"|'([^']*)'))?\s*\)/g, (match, alt, url, title, title2) => {
        const href = safeHref(url);
        if (href === '') return keep(esc(match));
        const titleAttr = title || title2 ? ' title="' + esc(title || title2) + '"' : '';
        return keep('<img src="' + href + '" alt="' + esc(alt) + '"' + titleAttr + ' loading="lazy">');
      });
      text = text.replace(/!\[([^\]]*)\]\[([^\]]*)\]/g, (match, alt, label) => {
        const ref = st.refs[normalizeRef(label === '' ? alt : label)];
        if (ref === undefined) return keep(esc(match));
        const titleAttr = ref.title ? ' title="' + esc(ref.title) + '"' : '';
        return keep('<img src="' + safeHref(ref.url) + '" alt="' + esc(alt) + '"' + titleAttr + ' loading="lazy">');
      });

      // Links: inline, then reference style.
      text = text.replace(/\[([^\]]*)\]\(\s*<?([^\s)>]+)>?(?:\s+(?:"([^"]*)"|'([^']*)'))?\s*\)/g, (match, label, url, title, title2) => {
        const href = safeHref(url);
        if (href === '') return keep(esc(match));
        const titleAttr = title || title2 ? ' title="' + esc(title || title2) + '"' : '';
        return keep('<a href="' + href + '"' + titleAttr + ' target="_blank" rel="noreferrer">' + renderInline(label, st) + '</a>');
      });
      text = text.replace(/\[([^\]]+)\]\[([^\]]*)\]/g, (match, label, id) => {
        const ref = st.refs[normalizeRef(id === '' ? label : id)];
        if (ref === undefined) return keep(esc(match));
        const titleAttr = ref.title ? ' title="' + esc(ref.title) + '"' : '';
        return keep('<a href="' + safeHref(ref.url) + '"' + titleAttr + ' target="_blank" rel="noreferrer">' + renderInline(label, st) + '</a>');
      });
      text = text.replace(/\[([^\]]+)\](?!\()/g, (match, label) => {
        const ref = st.refs[normalizeRef(label)];
        if (ref === undefined) return keep(esc(match));
        return keep('<a href="' + safeHref(ref.url) + '" target="_blank" rel="noreferrer">' + renderInline(label, st) + '</a>');
      });

      // Angle autolinks.
      text = text.replace(/<((?:https?:\/\/|mailto:)[^<>\s]+)>/g, (match, url) => {
        const href = safeHref(url);
        if (href === '') return keep(esc(match));
        return keep('<a href="' + href + '" target="_blank" rel="noreferrer">' + esc(url.replace(/^mailto:/, '')) + '</a>');
      });

      // Raw inline HTML (sanitised, then protected from escaping).
      text = text.replace(/<\/?[a-zA-Z][\w:-]*(?:\s+[^<>]*?)?\/?>/g, (match) => {
        if (/^<br\s*\/?>$/i.test(match)) return keep('<br>');
        return keep(sanitizeFragment(match));
      });

      // Everything still raw is text.
      text = esc(text);

      // Bare URLs (GFM autolink extension) — after escaping, so & is already safe.
      text = text.replace(/(^|[\s(])((?:https?:\/\/)[^\s<>()]+[^\s<>().,;:!?'"])/g, (match, lead, url) => {
        return lead + '<a href="' + url + '" target="_blank" rel="noreferrer">' + url + '</a>';
      });

      // Emphasis: strongest first so the inner single markers stay readable.
      text = text.replace(/\*\*\*([^\s*][\s\S]*?)\*\*\*/g, '<strong><em>$1</em></strong>');
      text = text.replace(/\*\*([^\s*][\s\S]*?)\*\*/g, '<strong>$1</strong>');
      text = text.replace(/(^|[^\w])__([^\s_][\s\S]*?)__(?!\w)/g, '$1<strong>$2</strong>');
      text = text.replace(/\*([^\s*][\s\S]*?)\*/g, '<em>$1</em>');
      text = text.replace(/(^|[^\w])_([^\s_][\s\S]*?)_(?!\w)/g, '$1<em>$2</em>');
      text = text.replace(/~~([^\s~][\s\S]*?)~~/g, '<del>$1</del>');

      // Hard breaks: two trailing spaces or a trailing backslash.
      text = text.replace(/ {2,}\n/g, '<br>\n').replace(/\\\n/g, '<br>\n');

      // Restore protected fragments (a label may itself contain one).
      for (let round = 0; round < 3 && text.indexOf('\u0000') !== -1; round += 1) {
        text = text.replace(/\u0000(\d+)\u0000/g, (match, index) => store[Number(index)] || '');
      }
      return text;
    }

    function startsBlock(lines, index) {
      const line = lines[index];
      if (/^ {0,3}(`{3,}|~{3,})/.test(line)) return true;
      if (/^ {0,3}#{1,6}\s/.test(line)) return true;
      if (/^ {0,3}>/.test(line)) return true;
      if (/^ {0,3}((\*\s*){3,}|(-\s*){3,}|(_\s*){3,})$/.test(line)) return true;
      if (/^ {0,3}([-+*]|\d{1,9}[.)])\s+/.test(line)) return true;
      if (/^ {0,3}<[a-zA-Z]/.test(line)) return true;
      if (/^ {4}/.test(line)) return true;
      return false;
    }

    function parseTable(lines, start, st) {
      const header = splitRow(lines[start]);
      const align = splitRow(lines[start + 1]).map(alignOf);
      const rows = [];
      let index = start + 2;
      while (index < lines.length && lines[index].trim() !== '' && lines[index].includes('|')) {
        rows.push(splitRow(lines[index]));
        index += 1;
      }
      const alignAttr = (column) => (align[column] ? ' style="text-align:' + align[column] + '"' : '');
      const head = header
        .map((cell, column) => '<th' + alignAttr(column) + '>' + renderInline(cell, st) + '</th>')
        .join('');
      const body = rows
        .map((row) => {
          const cells = [];
          for (let column = 0; column < header.length; column += 1) {
            cells.push('<td' + alignAttr(column) + '>' + renderInline(row[column] === undefined ? '' : row[column], st) + '</td>');
          }
          return '<tr>' + cells.join('') + '</tr>';
        })
        .join('');
      return {
        html: '<div class="bs-table-wrap"><table><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>',
        next: index,
      };
    }

    function parseList(lines, start, st) {
      const first = lines[start].match(/^(\s*)([-+*]|\d{1,9}[.)])(\s+)([\s\S]*)$/);
      const baseIndent = first[1].length;
      const ordered = /^\d/.test(first[2]);
      const items = [];
      let index = start;
      let loose = false;

      while (index < lines.length) {
        const line = lines[index];
        if (/^\s*$/.test(line)) {
          let probe = index + 1;
          while (probe < lines.length && /^\s*$/.test(lines[probe])) probe += 1;
          if (probe >= lines.length) {
            index = probe;
            break;
          }
          const nextItem = lines[probe].match(/^(\s*)([-+*]|\d{1,9}[.)])(\s+)([\s\S]*)$/);
          const nextIndent = lines[probe].match(/^\s*/)[0].length;
          if (nextItem !== null && nextIndent === baseIndent && /^\d/.test(nextItem[2]) === ordered) {
            loose = true;
            index = probe;
            continue;
          }
          if (nextIndent > baseIndent) {
            loose = true;
            index = probe;
            continue;
          }
          break;
        }

        const marker = line.match(/^(\s*)([-+*]|\d{1,9}[.)])(\s+)([\s\S]*)$/);
        if (marker !== null && marker[1].length === baseIndent && /^\d/.test(marker[2]) === ordered) {
          items.push([marker[4]]);
          index += 1;
          continue;
        }

        if (items.length === 0) break;
        const indent = line.match(/^\s*/)[0].length;
        if (indent > baseIndent) {
          const strip = baseIndent + 2;
          const stripped = line.replace(new RegExp('^ {0,' + strip + '}'), '');
          items[items.length - 1].push(stripped);
          index += 1;
          continue;
        }
        break;
      }

      const tag = ordered ? 'ol' : 'ul';
      const rendered = items.map((item) => {
        let content = item;
        let task = null;
        const taskMatch = content[0].match(/^\[( |x|X)\]\s+([\s\S]*)$/);
        if (taskMatch !== null) {
          task = taskMatch[1].toLowerCase() === 'x';
          content = [taskMatch[2]].concat(content.slice(1));
        }
        const inner = renderBlocks(content, st);
        const flat = loose ? inner : inner.replace(/^<p>([\s\S]*?)<\/p>/, '$1');
        const checkbox =
          task === null
            ? ''
            : '<input class="bs-task" type="checkbox" disabled' + (task ? ' checked' : '') + '> ';
        return '<li' + (task === null ? '' : ' class="bs-task-item"') + '>' + checkbox + flat + '</li>';
      });

      const startNumber = ordered ? Number(first[2].replace(/[.)]$/, '')) : 1;
      const startAttr = ordered && startNumber !== 1 ? ' start="' + startNumber + '"' : '';
      return { html: '<' + tag + startAttr + '>' + rendered.join('') + '</' + tag + '>', next: index };
    }

    function renderBlocks(lines, st) {
      const out = [];
      let index = 0;

      while (index < lines.length) {
        const line = lines[index];
        if (/^\s*$/.test(line)) {
          index += 1;
          continue;
        }

        const fence = line.match(/^ {0,3}(`{3,}|~{3,})([^`]*)$/);
        if (fence !== null) {
          const marker = fence[1];
          const info = fence[2].trim();
          const body = [];
          index += 1;
          const closing = new RegExp('^ {0,3}' + escapeRegExp(marker[0]) + '{' + marker.length + ',}\\s*$');
          while (index < lines.length && !closing.test(lines[index])) {
            body.push(lines[index]);
            index += 1;
          }
          if (index < lines.length) index += 1;
          out.push(codeBlock(body.join('\n'), info));
          continue;
        }

        const heading = line.match(/^ {0,3}(#{1,6})\s+([\s\S]*?)\s*#*\s*$/);
        if (heading !== null) {
          const level = heading[1].length;
          out.push('<h' + level + '>' + renderInline(heading[2], st) + '</h' + level + '>');
          index += 1;
          continue;
        }

        const setext = index + 1 < lines.length ? lines[index + 1].match(/^ {0,3}(=+|-{2,})\s*$/) : null;
        if (setext !== null && !startsBlock(lines, index) && /^ {0,3}\S/.test(line)) {
          const level = setext[1].startsWith('=') ? 1 : 2;
          out.push('<h' + level + '>' + renderInline(line.trim(), st) + '</h' + level + '>');
          index += 2;
          continue;
        }

        if (/^ {0,3}((\*\s*){3,}|(-\s*){3,}|(_\s*){3,})$/.test(line)) {
          out.push('<hr>');
          index += 1;
          continue;
        }

        if (/^ {0,3}>/.test(line)) {
          const inner = [];
          while (index < lines.length && /^ {0,3}>/.test(lines[index])) {
            inner.push(lines[index].replace(/^ {0,3}>\s?/, ''));
            index += 1;
          }
          const callout = inner.length > 0 ? inner[0].match(/^\[!([\w-]+)\]\+?\s*([\s\S]*)$/) : null;
          if (callout !== null) {
            const kind = callout[1].toLowerCase();
            const title = callout[2].trim();
            inner.shift();
            out.push(
              '<div class="bs-callout bs-callout-' + esc(kind) + '">' +
                (title === '' ? '' : '<div class="bs-callout-title">' + renderInline(title, st) + '</div>') +
                renderBlocks(inner, st) +
                '</div>',
            );
          } else {
            out.push('<blockquote>' + renderBlocks(inner, st) + '</blockquote>');
          }
          continue;
        }

        if (/^ {0,3}([-+*]|\d{1,9}[.)])\s+/.test(line)) {
          const list = parseList(lines, index, st);
          out.push(list.html);
          index = list.next;
          continue;
        }

        if (
          line.includes('|') &&
          index + 1 < lines.length &&
          /^\s*\|?\s*:?-{1,}:?\s*(?:\|\s*:?-{1,}:?\s*)*\|?\s*$/.test(lines[index + 1]) &&
          splitRow(line).length >= 2 &&
          splitRow(lines[index + 1]).length >= 2
        ) {
          const table = parseTable(lines, index, st);
          out.push(table.html);
          index = table.next;
          continue;
        }

        if (/^ {0,3}<!--/.test(line)) {
          const body = [];
          while (index < lines.length) {
            body.push(lines[index]);
            const done = /-->/.test(lines[index]);
            index += 1;
            if (done) break;
          }
          out.push(body.join('\n'));
          continue;
        }

        if (/^ {0,3}<([a-zA-Z][\w-]*)/.test(line)) {
          const tag = line.match(/^ {0,3}<([a-zA-Z][\w-]*)/)[1].toLowerCase();
          if (HTML_BLOCK_TAGS.has(tag)) {
            const body = [];
            while (index < lines.length && !/^\s*$/.test(lines[index])) {
              body.push(lines[index]);
              index += 1;
            }
            out.push(sanitizeFragment(body.join('\n')));
            continue;
          }
        }

        if (/^ {4}/.test(line)) {
          const body = [];
          while (index < lines.length && (/^ {4}/.test(lines[index]) || /^\s*$/.test(lines[index]))) {
            body.push(lines[index].replace(/^ {4}/, ''));
            index += 1;
          }
          out.push(codeBlock(body.join('\n').replace(/\n+$/, ''), ''));
          continue;
        }

        const paragraph = [line];
        index += 1;
        while (index < lines.length && !/^\s*$/.test(lines[index]) && !startsBlock(lines, index)) {
          paragraph.push(lines[index]);
          index += 1;
        }
        out.push('<p>' + renderInline(paragraph.join('\n'), st) + '</p>');
      }

      return out.join('\n');
    }

    function renderMarkdown(source) {
      const st = { refs: Object.create(null), notes: Object.create(null), noteOrder: [] };
      const raw = String(source == null ? '' : source);
      const withoutFrontMatter = /^(?:\uFEFF)?---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/.test(raw) ? parseFrontMatter(raw).body : raw;
      const lines = withoutFrontMatter.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');

      const kept = [];
      for (let index = 0; index < lines.length; index += 1) {
        const definition = lines[index].match(/^ {0,3}\[([^\]^][^\]]*)\]:\s*(\S+)(?:\s+(?:"([^"]*)"|'([^']*)'|\(([^)]*)\)))?\s*$/);
        if (definition !== null) {
          st.refs[normalizeRef(definition[1])] = {
            url: definition[2],
            title: definition[3] || definition[4] || definition[5] || '',
          };
          continue;
        }
        const note = lines[index].match(/^ {0,3}\[\^([^\]\s]+)\]:\s*([\s\S]*)$/);
        if (note !== null) {
          const body = [note[2]];
          let probe = index + 1;
          while (probe < lines.length && (/^ {2,}\S/.test(lines[probe]) || /^\s*$/.test(lines[probe]))) {
            if (/^\s*$/.test(lines[probe]) && probe + 1 < lines.length && !/^ {2,}\S/.test(lines[probe + 1])) break;
            body.push(lines[probe].replace(/^ {1,4}/, ''));
            probe += 1;
          }
          st.notes[note[1]] = body.join('\n').trim();
          index = probe - 1;
          continue;
        }
        kept.push(lines[index]);
      }

      let html = renderBlocks(kept, st);

      if (st.noteOrder.length > 0) {
        const items = st.noteOrder
          .map((id, position) => {
            const text = renderInline(st.notes[id] || '', st);
            return (
              '<li id="bs-fn-' + esc(id) + '">' + text +
              ' <a class="bs-fn-back" href="#bs-fnref-' + esc(id) + '" aria-label="back">↩</a></li>'
            );
          })
          .join('');
        html += '<section class="bs-footnotes"><ol>' + items + '</ol></section>';
      }

      return html;
    }
    //#endregion

    //#region styles
    const PAGE_CSS = `
.bs-page{box-sizing:border-box;display:flex;flex-direction:column;width:100%;height:100%;min-height:0;overflow:hidden;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px}
.bs-top{display:flex;flex:none;flex-wrap:wrap;align-items:center;gap:8px;padding:10px 16px;border-bottom:1px solid var(--dsw-alias-border-l1)}
[data-platform=darwin] .bs-top{padding-top:calc(10px + var(--dsh-frame-top-clearance,0px))}
.bs-brand{display:flex;flex:none;align-items:center;gap:8px;min-width:0}
.bs-brand-mark{display:inline-flex;flex:none;align-items:center;justify-content:center;width:26px;height:26px;border-radius:8px;background:color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, transparent);color:var(--dsw-alias-brand-primary)}
.bs-title{margin:0;font-size:14px;font-weight:600;letter-spacing:.01em;white-space:nowrap}
.bs-chip{display:inline-flex;align-items:center;gap:6px;max-width:38vw;padding:1px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:11px;line-height:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bs-chip-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-idle-primary);flex:none}
.bs-chip-dot-on{background:var(--dsw-alias-state-success-primary)}
.bs-chip-dot-warn{background:var(--dsw-alias-state-warn-primary)}
.bs-spacer{flex:auto;min-width:8px}
.bs-btn{display:inline-flex;flex:none;align-items:center;gap:6px;height:28px;padding:0 11px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:1;white-space:nowrap;cursor:pointer;transition:background-color .15s ease,border-color .15s ease,opacity .15s ease}
.bs-btn:hover:enabled{background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2))}
.bs-btn:disabled{opacity:.45;cursor:default}
.bs-btn-primary{border-color:transparent;background:var(--dsw-alias-button-primary-fill,var(--dsw-alias-brand-primary));color:var(--dsw-alias-label-primary-foreground,#fff);font-weight:500}
.bs-btn-primary:hover:enabled{opacity:.88;background:var(--dsw-alias-button-primary-fill,var(--dsw-alias-brand-primary))}
.bs-btn-quiet{border-color:transparent;color:var(--dsw-alias-label-secondary)}
.bs-btn-quiet:hover:enabled{color:var(--dsw-alias-label-primary)}
.bs-btn-danger{color:var(--dsw-alias-state-error-primary);border-color:color-mix(in srgb, var(--dsw-alias-state-error-primary) 45%, transparent)}
.bs-ico{display:inline-flex;flex:none;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;transition:background-color .15s ease,color .15s ease}
.bs-ico:hover{background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2));color:var(--dsw-alias-label-primary)}
.bs-body{display:flex;flex:auto;min-height:0}
.bs-side{display:flex;flex:none;flex-direction:column;width:250px;min-height:0;border-right:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1)}
.bs-side-head{padding:10px 10px 6px}
.bs-search{box-sizing:border-box;width:100%;padding:5px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:18px;outline:none;transition:border-color .18s ease}
.bs-search:focus{border-color:var(--dsw-alias-label-secondary)}
.bs-search::placeholder{color:var(--dsw-alias-label-secondary)}
.bs-side-scroll{flex:auto;min-height:0;overflow-y:auto;padding:4px 8px 18px;scrollbar-gutter:stable}
.bs-group{display:flex;align-items:center;gap:6px;width:100%;margin:10px 0 4px;padding:4px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;text-align:left;cursor:pointer}
.bs-group:hover{background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2));color:var(--dsw-alias-label-primary)}
.bs-chevron{flex:none;display:inline-block;width:9px;font-size:12px;line-height:1;transition:transform .15s ease;transform:rotate(0)}
.bs-chevron-open{transform:rotate(90deg)}
.bs-group-label{flex:auto;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.bs-group-count{flex:none;margin-left:auto;font-weight:400;letter-spacing:0;text-transform:none;opacity:.75}
.bs-item-wrap{display:flex;align-items:stretch;gap:2px;width:100%}
.bs-item{display:flex;flex:auto;flex-direction:column;gap:2px;min-width:0;width:auto;padding:7px 9px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;text-align:left;cursor:pointer;transition:background-color .15s ease}
.bs-item-del{flex:none;width:20px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:14px;line-height:1;cursor:pointer;opacity:0;transition:opacity .12s ease,background-color .12s ease,color .12s ease}
.bs-item-wrap:hover .bs-item-del,.bs-item-wrap:focus-within .bs-item-del{opacity:1}
.bs-item-del:hover{background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 14%, transparent);color:var(--dsw-alias-state-error-primary)}
.bs-item-del-on{width:auto;padding:0 6px;font-size:10.5px;opacity:1;background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 14%, transparent);color:var(--dsw-alias-state-error-primary)}
.bs-item:hover{background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2))}
.bs-item-on,.bs-item-on:hover{background:color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, transparent)}
.bs-item-top{display:flex;align-items:center;gap:6px;min-width:0}
.bs-item-title{flex:auto;min-width:0;overflow:hidden;font-size:12px;line-height:17px;font-weight:500;white-space:nowrap;text-overflow:ellipsis}
.bs-item-meta{display:flex;align-items:center;gap:6px;color:var(--dsw-alias-label-secondary);font-size:10.5px;line-height:15px;white-space:nowrap}
.bs-item-meta span{overflow:hidden;text-overflow:ellipsis}
.bs-badge{flex:none;padding:0 5px;border-radius:4px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:9.5px;line-height:14px;letter-spacing:.02em}
.bs-badge-live{background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 16%, transparent);color:var(--dsw-alias-state-success-primary)}
.bs-empty{padding:22px 12px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.7;text-align:center}
.bs-main{display:flex;flex:auto;flex-direction:column;min-width:0;min-height:0}
.bs-meta{display:flex;flex:none;flex-direction:column;gap:8px;padding:12px 16px 10px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.bs-title-input{box-sizing:border-box;width:100%;padding:0;border:0;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:19px;font-weight:600;line-height:26px;outline:none}
.bs-title-row{display:flex;align-items:center;gap:10px;min-width:0}
.bs-title-input{flex:auto;min-width:0;width:auto}
.bs-title-dirty{flex:none;padding:0 8px;border-radius:999px;background:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 15%, transparent);color:var(--dsw-alias-state-warn-primary);font-size:10.5px;line-height:18px;white-space:nowrap}
.bs-title-input::placeholder{color:var(--dsw-alias-label-secondary)}
.bs-fields{display:flex;flex-wrap:wrap;gap:6px 8px}
.bs-field{display:flex;flex:none;align-items:center;gap:5px;min-width:0}
.bs-field-label{flex:none;color:var(--dsw-alias-label-secondary);font-size:11px;white-space:nowrap}
.bs-field input{box-sizing:border-box;min-width:0;padding:3px 7px;border:1px solid transparent;border-radius:6px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;font-size:11.5px;line-height:17px;outline:none;transition:border-color .15s ease}
.bs-field input:focus{border-color:var(--dsw-alias-border-l2)}
.bs-field input::placeholder{color:var(--dsw-alias-label-secondary)}
.bs-field-wide input{width:100%}
.bs-field-w-lg input{width:190px}
.bs-field-w-md input{width:130px}
.bs-field-w-sm input{width:110px}
.bs-toolbar{display:flex;flex:none;flex-wrap:wrap;align-items:center;gap:1px;padding:4px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);background:color-mix(in srgb, var(--dsw-alias-bg-layer-1) 60%, transparent)}
.bs-tool{display:inline-flex;align-items:center;justify-content:center;min-width:26px;height:26px;padding:0 5px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;line-height:1;cursor:pointer;transition:background-color .15s ease,color .15s ease}
.bs-tool:hover{background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2));color:var(--dsw-alias-label-primary)}
.bs-tool-sep{width:1px;height:16px;margin:0 3px;background:var(--dsw-alias-border-l1)}
.bs-views{display:inline-flex;flex:none;margin-left:auto;padding:2px;border-radius:8px;background:var(--dsw-alias-bg-layer-2)}
.bs-view{padding:2px 9px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;line-height:18px;cursor:pointer}
.bs-view-on{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);box-shadow:0 0 0 1px var(--dsw-alias-border-l1)}
.bs-panes{display:flex;flex:auto;min-height:0}
.bs-pane{display:flex;flex:1 1 0;flex-direction:column;min-width:0;min-height:0;overflow:hidden}
.bs-pane + .bs-pane{border-left:1px solid var(--dsw-alias-border-l1)}
.bs-textarea{box-sizing:border-box;flex:auto;width:100%;min-height:0;padding:16px 20px 40px;border:0;background:transparent;color:var(--dsw-alias-label-primary);font-family:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;font-size:13px;line-height:1.75;resize:none;outline:none;tab-size:2}
.bs-textarea::placeholder{color:var(--dsw-alias-label-secondary);font-family:inherit}
.bs-preview{flex:auto;min-height:0;overflow-y:auto;padding:16px 22px 48px;font-size:14px;line-height:1.78;overflow-wrap:anywhere}
.bs-foot{display:flex;flex:none;align-items:center;gap:10px;padding:5px 14px;border-top:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);font-size:11px;line-height:18px}
.bs-foot-info{flex:auto;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.bs-foot-info a{color:var(--dsw-alias-brand-primary);text-decoration:none}
.bs-foot-info a:hover{text-decoration:underline}
.bs-notice{position:absolute;left:50%;bottom:18px;z-index:40;display:flex;align-items:center;gap:10px;max-width:min(560px,calc(100% - 40px));padding:8px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-overlay);box-shadow:var(--dsw-shadow-lv3,0 8px 28px rgba(0,0,0,.22));font-size:12px;line-height:18px;transform:translateX(-50%)}
.bs-notice-ok{border-color:color-mix(in srgb, var(--dsw-alias-state-success-primary) 45%, transparent)}
.bs-notice-error{border-color:color-mix(in srgb, var(--dsw-alias-state-error-primary) 55%, transparent);color:var(--dsw-alias-state-error-primary)}
.bs-notice-text{flex:auto;min-width:0;overflow-wrap:anywhere}
.bs-settings{flex:auto;min-height:0;overflow-y:auto}
.bs-settings-inner{max-width:760px;margin:0 auto;padding:22px clamp(18px,4vw,36px) 64px}
.bs-section{margin-bottom:22px;padding:16px 18px 6px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1)}
.bs-section-title{margin:0 0 12px;font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--dsw-alias-label-secondary)}
.bs-form-row{display:grid;grid-template-columns:132px minmax(0,1fr);gap:10px;align-items:center;margin-bottom:12px}
.bs-form-label{color:var(--dsw-alias-label-secondary);font-size:12px;text-align:right}
.bs-input{box-sizing:border-box;width:100%;padding:6px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;line-height:18px;outline:none;transition:border-color .18s ease}
.bs-input:focus{border-color:color-mix(in srgb, var(--dsw-alias-brand-primary) 55%, var(--dsw-alias-border-l2))}
.bs-input::placeholder{color:var(--dsw-alias-label-secondary)}
.bs-hint{margin:-6px 0 12px 142px;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px}
.bs-row-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0 0 14px 142px}
.bs-inline-state{font-size:11px;color:var(--dsw-alias-label-secondary)}
.bs-inline-state-ok{color:var(--dsw-alias-state-success-primary)}
.bs-inline-state-bad{color:var(--dsw-alias-state-error-primary)}
.bs-inline-state-warn{color:var(--dsw-alias-state-warn-primary)}
.bs-md{position:relative;min-height:100%}
.bs-preview h1,.bs-preview h2,.bs-preview h3,.bs-preview h4,.bs-preview h5,.bs-preview h6{margin:1.4em 0 .55em;font-weight:600;line-height:1.35}
.bs-preview h1{font-size:1.62em;padding-bottom:.28em;border-bottom:1px solid var(--dsw-alias-border-l1)}
.bs-preview h2{font-size:1.34em;padding-bottom:.22em;border-bottom:1px solid var(--dsw-alias-border-l1)}
.bs-preview h3{font-size:1.16em}
.bs-preview h4{font-size:1.04em}
.bs-preview h5,.bs-preview h6{font-size:1em;color:var(--dsw-alias-label-secondary)}
.bs-preview p{margin:.75em 0}
.bs-preview ul,.bs-preview ol{margin:.6em 0;padding-left:1.6em}
.bs-preview li{margin:.24em 0}
.bs-preview li>ul,.bs-preview li>ol{margin:.2em 0}
.bs-preview blockquote{margin:.9em 0;padding:.1em 0 .1em 1em;border-left:3px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 60%, transparent);color:var(--dsw-alias-label-secondary)}
.bs-preview blockquote p{margin:.35em 0}
.bs-preview hr{margin:1.6em 0;border:0;border-top:1px solid var(--dsw-alias-border-l1)}
.bs-preview a{color:var(--dsw-alias-brand-primary);text-decoration:none}
.bs-preview a:hover{text-decoration:underline}
.bs-preview code{font-family:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;font-size:.9em;padding:.12em .38em;border-radius:5px;background:var(--dsw-alias-bg-layer-2)}
.bs-preview img{max-width:100%;height:auto;border-radius:8px}
.bs-preview .bs-code{margin:.9em 0;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);overflow:hidden}
.bs-preview .bs-code-lang{display:block;padding:4px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);font-size:10.5px;letter-spacing:.04em;text-transform:uppercase;background:var(--dsw-alias-bg-layer-2)}
.bs-preview .bs-code pre{margin:0;padding:12px 14px;overflow-x:auto}
.bs-preview .bs-code code{padding:0;background:transparent;font-size:12.5px;line-height:1.7;white-space:pre}
.bs-preview .bs-table-wrap{margin:.9em 0;overflow-x:auto}
.bs-preview table{width:100%;border-collapse:collapse;font-size:13px}
.bs-preview th,.bs-preview td{padding:6px 10px;border:1px solid var(--dsw-alias-border-l1)}
.bs-preview th{background:var(--dsw-alias-bg-layer-2);font-weight:600}
.bs-preview .bs-task{margin:0 .45em 0 0;vertical-align:-1px}
.bs-preview .bs-task-item{list-style:none;margin-left:-1.2em}
.bs-preview .bs-footnotes{margin-top:2em;padding-top:.8em;border-top:1px solid var(--dsw-alias-border-l1);font-size:12.5px;color:var(--dsw-alias-label-secondary)}
.bs-preview .bs-footnotes ol{padding-left:1.4em}
.bs-preview .bs-fn-back{text-decoration:none}
.bs-preview .bs-fn-ref a{text-decoration:none;font-size:.8em;padding:0 .15em}
.bs-preview .bs-empty{padding:40px 0;text-align:center}
.bs-types{display:inline-flex;flex:none;align-items:center;gap:2px;padding:2px;border-radius:8px;background:var(--dsw-alias-bg-layer-2)}
.bs-type{padding:2px 9px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;line-height:18px;cursor:pointer;transition:background-color .15s ease,color .15s ease}
.bs-type:hover{color:var(--dsw-alias-label-primary)}
.bs-type-on,.bs-type-on:hover{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 1px var(--dsw-alias-border-l1)}
.bs-preview .bs-wikilink{color:var(--dsw-alias-brand-primary);text-decoration:none;border-bottom:1px dashed color-mix(in srgb, var(--dsw-alias-brand-primary) 55%, transparent);cursor:pointer}
.bs-preview .bs-wikilink:hover{background:color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent)}
.bs-preview .bs-callout{margin:.9em 0;padding:.55em .9em;border-left:3px solid var(--dsw-alias-brand-primary);border-radius:6px;background:color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, transparent)}
.bs-preview .bs-callout-title{margin-bottom:.25em;font-weight:600}
.bs-preview .bs-callout-warning,.bs-preview .bs-callout-caution{border-left-color:var(--dsw-alias-state-warn-primary);background:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 10%, transparent)}
.bs-preview .bs-callout-danger,.bs-preview .bs-callout-error,.bs-preview .bs-callout-bug{border-left-color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 9%, transparent)}
.bs-preview .bs-callout-tip,.bs-preview .bs-callout-success,.bs-preview .bs-callout-done{border-left-color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 10%, transparent)}
.bs-dot{flex:none;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-warn-primary)}
.bs-sync{flex:none;padding:1px 8px;border:0;border-radius:999px;background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 14%, transparent);color:var(--dsw-alias-state-success-primary);font:inherit;font-size:10.5px;line-height:16px;cursor:pointer}
.bs-sync-bad{background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 14%, transparent);color:var(--dsw-alias-state-error-primary)}
.bs-sync-running{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}
@media (max-width:860px){.bs-side{width:200px}.bs-form-row{grid-template-columns:1fr}.bs-form-label{text-align:left}.bs-hint,.bs-row-actions{margin-left:0}}
@media (max-width:640px){.bs-side{display:none}}
`;
    //#endregion

    //#region drafts
    const NOTE_TYPES = ['thought', 'clip', 'quote', 'task'];

    function cleanDraft(value) {
      if (value === null || typeof value !== 'object') return null;
      const id = typeof value.id === 'string' && value.id !== '' ? value.id : makeId();
      const draft = {
        id,
        title: typeof value.title === 'string' ? value.title : '',
        slug: typeof value.slug === 'string' ? value.slug : '',
        date: typeof value.date === 'string' && value.date !== '' ? value.date : nowStamp(),
        type: NOTE_TYPES.includes(value.type) ? value.type : 'thought',
        tags: typeof value.tags === 'string' ? value.tags : '',
        source: typeof value.source === 'string' ? value.source : '',
        body: typeof value.body === 'string' ? value.body : '',
        remotePath: typeof value.remotePath === 'string' ? value.remotePath : '',
        remoteSha: typeof value.remoteSha === 'string' ? value.remoteSha : '',
        remoteUrl: typeof value.remoteUrl === 'string' ? value.remoteUrl : '',
        publishedFingerprint: typeof value.publishedFingerprint === 'string' ? value.publishedFingerprint : '',
        publishedAt: Number.isFinite(value.publishedAt) ? value.publishedAt : 0,
        updatedAt: Number.isFinite(value.updatedAt) ? value.updatedAt : Date.now(),
      };
      if (draft.title.trim() === '' && draft.body.trim() === '' && draft.remotePath === '') return null;
      return draft;
    }

    function readDrafts() {
      try {
        const raw = window.localStorage.getItem(DRAFTS_KEY);
        if (raw === null) return [];
        const parsed = JSON.parse(raw);
        const list = Array.isArray(parsed) ? parsed : [];
        return list.map(cleanDraft).filter((draft) => draft !== null);
      } catch (error) {
        return [];
      }
    }

    function writeDrafts(drafts) {
      try {
        window.localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
      } catch (error) {
        /* Storage unavailable (quota, private mode): the session keeps working in memory. */
      }
    }

    function blankDraft() {
      const parts = nowParts();
      return {
        id: makeId(),
        title: '',
        slug: '',
        date: `${parts.date} ${parts.time}`,
        type: 'thought',
        tags: '',
        source: '',
        body: '',
        remotePath: '',
        remoteSha: '',
        remoteUrl: '',
        publishedFingerprint: '',
        publishedAt: 0,
        updatedAt: Date.now(),
      };
    }

    function isBlank(draft) {
      return draft.title.trim() === '' && draft.body.trim() === '';
    }

    /**
     * The fields that end up in the file. Comparing this against what was last
     * written tells the page whether the open note differs from the vault.
     */
    function draftFingerprint(draft) {
      return JSON.stringify([
        String(draft.title || '').trim(),
        draft.type || 'thought',
        splitList(draft.tags).join(','),
        String(draft.source || '').trim(),
        String(draft.body || ''),
      ]);
    }
    //#endregion

    //#region glyphs
    function svg(paths, extra) {
      const children = paths.map((entry, index) =>
        h('path', { key: 'p' + index, d: entry, fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' }),
      );
      return h(
        'svg',
        { width: 16, height: 16, viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false', ...(extra || {}) },
        children,
      );
    }

    const glyphPlus = () => svg(['M12 5v14', 'M5 12h14']);
    const glyphRefresh = () => svg(['M20 11a8 8 0 1 0-2.3 5.7', 'M20 5v6h-6']);
    const glyphGear = () => svg(['M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z', 'M19.4 13.5a7.7 7.7 0 0 0 .1-1.5 7.7 7.7 0 0 0-.1-1.5l2-1.5-1.9-3.3-2.4 1a7.5 7.5 0 0 0-2.6-1.5L14.2 2h-4.4l-.3 2.7A7.5 7.5 0 0 0 6.9 6.2l-2.4-1L2.6 8.5l2 1.5a7.7 7.7 0 0 0 0 3l-2 1.5 1.9 3.3 2.4-1a7.5 7.5 0 0 0 2.6 1.5l.3 2.7h4.4l.3-2.7a7.5 7.5 0 0 0 2.6-1.5l2.4 1 1.9-3.3Z']);
    const glyphBack = () => svg(['M15 18l-6-6 6-6']);
    const glyphExternal = () => svg(['M14 4h6v6', 'M20 4l-9 9', 'M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5']);
    const glyphTrash = () => svg(['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13h10l1-13']);
    const glyphCloud = () => svg(['M7 18a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17.4 9.5 3.5 3.5 0 0 1 17 18H7Z', 'M12 12v6', 'M9.5 15.5 12 18l2.5-2.5']);
    const glyphPen = () => svg(['M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16v4Z', 'M13.5 6.5l4 4']);
    const glyphCheck = () => svg(['M4 12.5l5 5L20 6.5']);

    function SidebarGlyph() {
      return h(
        'svg',
        { width: 18, height: 18, viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' },
        h('path', { d: 'M6 3.5h8.5L18 7v13.5H6Z', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinejoin: 'round' }),
        h('path', { d: 'M14.2 3.8V7.3H17.7', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinejoin: 'round' }),
        h('path', { d: 'M8.8 11h6.4M8.8 14.4h6.4M8.8 17.8h3.6', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', opacity: 0.75 }),
      );
    }
    //#endregion

    //#region small components
    function Notice(props) {
      const { notice, onDismiss, t } = props;
      if (notice === null) return null;
      return h(
        'div',
        { className: 'bs-notice' + (notice.kind === 'error' ? ' bs-notice-error' : ' bs-notice-ok'), role: 'status' },
        h('span', { className: 'bs-notice-text' }, notice.text),
        h('button', { type: 'button', className: 'bs-ico', title: t('close'), 'aria-label': t('close'), onClick: onDismiss }, '×'),
      );
    }

    function MetaField(props) {
      const { label, wide, size, children } = props;
      const className = 'bs-field' + (wide ? ' bs-field-wide' : '') + (size ? ' bs-field-' + size : '');
      return h('label', { className }, h('span', { className: 'bs-field-label' }, label), children);
    }

    function SettingsView(props) {
      const { t, settings, status, busy, onClose, onSave, onTokenSave, onClearToken, onImportGh } = props;
      const [form, setForm] = useState(settings);
      const [token, setToken] = useState('');

      useEffect(() => {
        setForm(settings);
      }, [settings]);

      const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

      const tokenLine =
        status.configured === true
          ? status.valid === true
            ? t('tokenValid', { login: status.login || '—' })
            : t('tokenInvalid')
          : '';

      const tokenClass =
        'bs-inline-state' +
        (status.configured === true ? (status.valid === true ? ' bs-inline-state-ok' : ' bs-inline-state-bad') : '');

      return h(
        'div',
        { className: 'bs-settings' },
        h(
          'div',
          { className: 'bs-settings-inner' },
          h('h1', { className: 'bs-title', style: { fontSize: '17px', marginBottom: '16px' } }, t('settingsTitle')),
          h(
            'section',
            { className: 'bs-section' },
            h('h2', { className: 'bs-section-title' }, t('repoSection')),
            h(
              'div',
              { className: 'bs-form-row' },
              h('span', { className: 'bs-form-label' }, t('vaultPath')),
              h('input', { className: 'bs-input', value: form.vaultPath, onChange: set('vaultPath'), spellCheck: false, placeholder: '~/brain' }),
            ),
            h('p', { className: 'bs-hint' }, t('vaultHint')),
            h(
              'div',
              { className: 'bs-form-row' },
              h('span', { className: 'bs-form-label' }, t('owner')),
              h('input', { className: 'bs-input', value: form.owner, onChange: set('owner'), spellCheck: false, placeholder: 'supeBam' }),
            ),
            h(
              'div',
              { className: 'bs-form-row' },
              h('span', { className: 'bs-form-label' }, t('repo')),
              h('input', { className: 'bs-input', value: form.repo, onChange: set('repo'), spellCheck: false, placeholder: 'brain' }),
            ),
            h(
              'div',
              { className: 'bs-form-row' },
              h('span', { className: 'bs-form-label' }, t('branch')),
              h('input', { className: 'bs-input', value: form.branch, onChange: set('branch'), spellCheck: false, placeholder: 'main' }),
            ),
            h(
              'div',
              { className: 'bs-form-row' },
              h('span', { className: 'bs-form-label' }, t('dir')),
              h('input', { className: 'bs-input', value: form.inbox, onChange: set('inbox'), spellCheck: false, placeholder: 'inbox' }),
            ),
            h('p', { className: 'bs-hint' }, t('inboxHint', { dir: form.inbox.trim() === '' ? '.' : form.inbox.trim() })),
          ),
          h(
            'section',
            { className: 'bs-section' },
            h('h2', { className: 'bs-section-title' }, t('siteSection')),
            h(
              'div',
              { className: 'bs-form-row' },
              h('span', { className: 'bs-form-label' }, t('siteUrl')),
              h('input', { className: 'bs-input', value: form.siteUrl, onChange: set('siteUrl'), spellCheck: false, placeholder: 'https://example.github.io' }),
            ),
            h('p', { className: 'bs-hint' }, t('obsidianHint')),
          ),
          h(
            'section',
            { className: 'bs-section' },
            h('h2', { className: 'bs-section-title' }, t('tokenSection')),
            h(
              'div',
              { className: 'bs-form-row' },
              h('span', { className: 'bs-form-label' }, 'Token'),
              h('input', {
                className: 'bs-input',
                type: 'password',
                value: token,
                onChange: (event) => setToken(event.target.value),
                spellCheck: false,
                autoComplete: 'off',
                placeholder: t('tokenPlaceholder'),
              }),
            ),
            h(
              'div',
              { className: 'bs-row-actions' },
              h(
                'button',
                {
                  type: 'button',
                  className: 'bs-btn bs-btn-primary',
                  disabled: busy === 'token' || token.trim() === '',
                  onClick: () => {
                    void onTokenSave(token.trim()).then(() => setToken(''));
                  },
                },
                t('save'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'bs-btn',
                  disabled: busy === 'gh',
                  onClick: () => {
                    void onImportGh();
                  },
                },
                busy === 'gh' ? t('importGhBusy') : t('importGh'),
              ),
              status.configured === true
                ? h('button', { type: 'button', className: 'bs-btn bs-btn-danger', disabled: busy === 'token', onClick: () => void onClearToken() }, t('clearToken'))
                : null,
              tokenLine !== '' ? h('span', { className: tokenClass }, tokenLine) : null,
            ),
            h('p', { className: 'bs-hint' }, t('importGhHint') + ' · ' + t('tokenStored')),
          ),
          h(
            'div',
            { className: 'bs-row-actions' },
            h(
              'button',
              {
                type: 'button',
                className: 'bs-btn bs-btn-primary',
                disabled: busy === 'config',
                onClick: () => {
                  onSave(cleanSettings(form));
                },
              },
              busy === 'config' ? '…' : t('save'),
            ),
            h('button', { type: 'button', className: 'bs-btn', onClick: onClose }, t('cancel')),
            h('span', { className: 'bs-inline-state' }, t('configRestart')),
          ),
        ),
      );
    }
    //#endregion

    //#region page
    class PageBoundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { error: null };
      }

      static getDerivedStateFromError(error) {
        return { error };
      }

      componentDidCatch(error, info) {
        if (typeof console !== 'undefined') console.error('[brain] page crashed:', error, info);
      }

      render() {
        if (this.state.error !== null) {
          const t = this.props.t;
          const message = this.state.error && this.state.error.message ? this.state.error.message : String(this.state.error);
          return h(
            'div',
            { className: 'bs-page', style: { padding: '24px' } },
            h(
              'div',
              { className: 'bs-empty' },
              h('div', { style: { marginBottom: '10px' } }, (t ? t('renderFailed') : 'Page failed to render') + '：' + message),
              h('button', { type: 'button', className: 'bs-btn', onClick: () => this.setState({ error: null }) }, t ? t('retry') : 'Retry'),
            ),
          );
        }
        return this.props.children;
      }
    }

    function makePage(t) {
      return function BlogStudioPage() {
        const [settings, setSettings] = useState(() => cleanSettings(null));
        const [status, setStatus] = useState({ phase: 'loading', configured: false, valid: false, login: '', source: 'none', mode: 'remote', vaultPath: '', sync: null });
        const [posts, setPosts] = useState({ phase: 'idle', items: [], error: '' });
        const [drafts, setDrafts] = useState(readDrafts);
        const [activeId, setActiveId] = useState(null);
        const [view, setView] = useState('write');
        const [mode, setMode] = useState('split');
        const [query, setQuery] = useState('');
        const [collapsed, setCollapsed] = useState(readCollapsed);
        const [notice, setNotice] = useState(null);
        const [busy, setBusy] = useState('');
        const [confirmDelete, setConfirmDelete] = useState(false);
        const [deletePath, setDeletePath] = useState('');
        const textRef = useRef(null);
        const previewRef = useRef(null);
        const bootstrapped = useRef(false);
        const backfilled = useRef(new Set());

        // Persist drafts shortly after they settle.
        useEffect(() => {
          const timer = window.setTimeout(() => writeDrafts(drafts), 300);
          return () => window.clearTimeout(timer);
        }, [drafts]);

        // First mount: activate the newest draft, or create the first one.
        useEffect(() => {
          if (bootstrapped.current) return;
          bootstrapped.current = true;
          if (drafts.length > 0) {
            setActiveId(drafts[0].id);
            return;
          }
          const fresh = blankDraft();
          setDrafts([fresh]);
          setActiveId(fresh.id);
        }, [drafts]);

        useEffect(() => {
          setConfirmDelete(false);
        }, [activeId]);

        useEffect(() => {
          writeCollapsed(collapsed);
        }, [collapsed]);

        /*
         * Drafts opened before the fingerprint existed have no baseline, so a
         * modified note would look clean. Read the file once, derive the
         * baseline from its content, and let the comparison speak.
         */
        useEffect(() => {
          if (status.phase !== 'ready') return;
          const pending = drafts.filter(
            (item) =>
              item.remotePath !== '' &&
              item.publishedFingerprint === '' &&
              backfilled.current.has(item.id) === false,
          );
          if (pending.length === 0) return;
          const batch = pending.slice(0, 5);
          for (const item of batch) backfilled.current.add(item.id);
          void (async () => {
            for (const item of batch) {
              try {
                const data = await callHost('note.read', { path: item.remotePath });
                const parsed = parseFrontMatter(data.text);
                const baseline = draftFingerprint({
                  title: typeof parsed.data.title === 'string' ? parsed.data.title : item.title,
                  type: NOTE_TYPES.includes(parsed.data.type) ? parsed.data.type : 'thought',
                  tags: Array.isArray(parsed.data.tags)
                    ? parsed.data.tags.join(', ')
                    : typeof parsed.data.tags === 'string'
                      ? parsed.data.tags
                      : '',
                  source: typeof parsed.data.source === 'string' ? parsed.data.source : '',
                  body: parsed.body.replace(/^\n+/, ''),
                });
                setDrafts((list) =>
                  list.map((draft) => (draft.id === item.id ? { ...draft, publishedFingerprint: baseline } : draft)),
                );
              } catch (error) {
                /* Unavailable or deleted: leave the state unknown instead of guessing. */
              }
            }
          })();
        }, [status.phase, drafts]);

        useEffect(() => {
          if (notice === null) return undefined;
          const timer = window.setTimeout(() => setNotice(null), 6000);
          return () => window.clearTimeout(timer);
        }, [notice]);

        const active = useMemo(() => drafts.find((item) => item.id === activeId) || null, [drafts, activeId]);

        const previewHtml = useMemo(() => {
          if (active === null) return '';
          try {
            return renderMarkdown(active.body);
          } catch (error) {
            return '<pre>' + esc(active.body) + '</pre>';
          }
        }, [active]);

        const patch = useCallback((id, changes) => {
          setDrafts((list) => list.map((item) => (item.id === id ? { ...item, ...changes, updatedAt: Date.now() } : item)));
        }, []);

        const report = useCallback((kind, text) => {
          setNotice({ kind, text, at: Date.now() });
        }, []);

        const reportError = useCallback(
          (prefixKey, error) => {
            report('error', t(prefixKey, { msg: error instanceof Error ? error.message : String(error) }));
          },
          [report, t],
        );

        const refreshStatus = useCallback(async () => {
          try {
            const data = await callHost('status');
            setStatus({
              phase: 'ready',
              configured: data.configured === true,
              valid: data.valid === true,
              login: typeof data.login === 'string' ? data.login : '',
              source: typeof data.source === 'string' ? data.source : 'none',
              mode: data.mode === 'local' ? 'local' : 'remote',
              vaultPath: typeof data.vaultPath === 'string' ? data.vaultPath : '',
              sync: data.sync !== null && typeof data.sync === 'object' ? data.sync : null,
            });
            if (data.config !== undefined && data.config !== null) setSettings(cleanSettings(data.config));
            return data;
          } catch (error) {
            setStatus({ phase: 'error', configured: false, valid: false, login: '', source: 'none' });
            return null;
          }
        }, []);

        const loadPosts = useCallback(async () => {
          if (settings.owner.trim() === '' || settings.repo.trim() === '') return;
          setPosts((current) => ({ ...current, phase: 'loading', error: '' }));
          try {
            const data = await callHost('note.list', {});
            setPosts({ phase: 'ready', items: Array.isArray(data.notes) ? data.notes : [], error: '' });
          } catch (error) {
            setPosts({ phase: 'error', items: [], error: error.message });
          }
        }, [settings.owner, settings.repo, settings.inbox, settings.branch]);

        useEffect(() => {
          void refreshStatus();
        }, [refreshStatus]);

        useEffect(() => {
          if (status.phase !== 'ready' || !status.configured) return;
          void loadPosts();
        }, [status.phase, status.configured, loadPosts]);

        const setField = useCallback(
          (key) => (event) => {
            const value = event.target.value;
            setDrafts((list) =>
              list.map((item) => {
                if (item.id !== activeId) return item;
                if (key === 'title') {
                  const autoSlug = item.slug === '' || item.slug === slugify(item.title);
                  return { ...item, title: value, slug: autoSlug ? '' : item.slug, updatedAt: Date.now() };
                }
                return { ...item, [key]: value, updatedAt: Date.now() };
              }),
            );
          },
          [activeId],
        );

        const newPost = useCallback(() => {
          const blank = drafts.find((item) => isBlank(item) && item.remotePath === '');
          if (blank !== undefined) {
            setActiveId(blank.id);
            setView('write');
            return;
          }
          const fresh = blankDraft();
          setDrafts((list) => [fresh, ...list]);
          setActiveId(fresh.id);
          setView('write');
          window.requestAnimationFrame(() => {
            if (textRef.current !== null) textRef.current.focus();
          });
        }, [drafts]);

        const removeDraft = useCallback(
          (id) => {
            const next = drafts.filter((item) => item.id !== id);
            if (next.length === 0) {
              const fresh = blankDraft();
              setDrafts([fresh]);
              setActiveId(fresh.id);
              return;
            }
            setDrafts(next);
            if (id === activeId) setActiveId(next[0].id);
          },
          [drafts, activeId],
        );

        const openPost = useCallback(
          async (item) => {
            const existing = drafts.find((draft) => draft.remotePath === item.path);
            if (existing !== undefined) {
              setActiveId(existing.id);
              setView('write');
              return;
            }
            setBusy('read');
            try {
              const data = await callHost('note.read', { path: item.path });
              const parsed = parseFrontMatter(data.text);
              const title = typeof parsed.data.title === 'string' && parsed.data.title !== '' ? parsed.data.title : item.name.replace(/\.(md|markdown|mdx)$/i, '');
              const tags = Array.isArray(parsed.data.tags) ? parsed.data.tags.join(', ') : typeof parsed.data.tags === 'string' ? parsed.data.tags : '';
              const created = typeof parsed.data.created === 'string' && parsed.data.created !== ''
                ? parsed.data.created
                : typeof parsed.data.date === 'string' && parsed.data.date !== ''
                  ? parsed.data.date
                  : nowStamp();
              const draft = {
                id: makeId(),
                title,
                slug: item.name.replace(/^(\d{4}-\d{2}-\d{2}-)?/, '').replace(/\.(md|markdown|mdx)$/i, ''),
                date: created.replace('T', ' ').replace(/[+-]\d{2}:\d{2}$/, '').slice(0, 19),
                type: NOTE_TYPES.includes(parsed.data.type) ? parsed.data.type : 'thought',
                tags,
                source: typeof parsed.data.source === 'string' ? parsed.data.source : '',
                body: parsed.body.replace(/^\n+/, ''),
                remotePath: data.path,
                remoteSha: data.sha,
                remoteUrl: '',
                publishedFingerprint: '',
                publishedAt: 0,
                updatedAt: Date.now(),
              };
              draft.publishedFingerprint = draftFingerprint(draft);
              setDrafts((list) => [draft, ...list]);
              setActiveId(draft.id);
              setView('write');
            } catch (error) {
              reportError('loadFailed', error);
            } finally {
              setBusy('');
            }
          },
          [drafts, reportError],
        );

        const postUrl = useMemo(() => {
          if (active === null) return '';
          if (active.remoteUrl !== '') return active.remoteUrl;
          return settings.siteUrl.trim();
        }, [active, settings.siteUrl]);

        const activeDirty = useMemo(() => {
          if (active === null || active.remotePath === '') return false;
          if (active.publishedFingerprint === '') return false;
          return active.publishedFingerprint !== draftFingerprint(active);
        }, [active]);

        const repoUrl = useMemo(() => {
          if (active === null || active.remotePath === '') return '';
          return `https://github.com/${settings.owner}/${settings.repo}/blob/${settings.branch}/${active.remotePath}`;
        }, [active, settings.owner, settings.repo, settings.branch]);

        const repoReady = () =>
          settings.owner.trim() !== '' && settings.repo.trim() !== '' && settings.branch.trim() !== '';

        const describeDraft = (draft) => {
          const title = draft.title.trim() !== '' ? draft.title.trim() : t('untitled');
          const slug = draft.slug.trim() !== '' ? draft.slug.trim() : slugify(title) || 'note';
          const parts = stampToParts(draft.date);
          const dated = draft.remotePath !== '' ? '' : parts.date + '-';
          const dir = settings.inbox.trim().replace(/^\/+|\/+$/g, '');
          const path =
            draft.remotePath !== ''
              ? draft.remotePath
              : (dir === '' ? '' : dir + '/') + dated + slug + '.md';
          const content = buildNoteDocument(
            {
              title,
              type: draft.type,
              created: isoFromStamp(draft.date),
              tags: splitList(draft.tags),
              source: draft.source.trim(),
            },
            draft.body,
          );
          const message = (draft.remotePath !== '' ? 'brain: update ' : 'brain: add ') + title;
          return { title, slug, path, content, message };
        };

        /** Write one draft to the vault and record what was written. */
        const publishDraft = useCallback(
          async (draft) => {
            const built = describeDraft(draft);
            const data = await callHost('note.write', {
              path: built.path,
              content: built.content,
              message: built.message,
              sha: draft.remoteSha || undefined,
            });
            patch(draft.id, {
              title: built.title,
              slug: built.slug,
              remotePath: data.path,
              remoteSha: data.sha,
              remoteUrl: typeof data.url === 'string' ? data.url : draft.remoteUrl,
              publishedFingerprint: draftFingerprint({ ...draft, title: built.title }),
              publishedAt: Date.now(),
            });
            return data;
          },
          [settings, patch, t],
        );

        const guardSubmit = () => {
          if (!status.configured) {
            report('error', t('tokenMissing'));
            setView('settings');
            return false;
          }
          if (!repoReady()) {
            report('error', t('needRepo'));
            setView('settings');
            return false;
          }
          return true;
        };

        const publish = useCallback(async () => {
          if (active === null) return;
          if (!guardSubmit()) return;
          setBusy('publish');
          try {
            const data = await publishDraft(active);
            report('ok', t('publishOk', { path: data.path }));
            void loadPosts();
            window.setTimeout(() => void refreshStatus(), 4500);
          } catch (error) {
            reportError('failed', error);
          } finally {
            setBusy('');
          }
        }, [active, status.configured, settings, publishDraft, report, reportError, t, loadPosts, refreshStatus]);

        /** Notes whose editor content differs from what the vault holds. */
        const pendingDrafts = useMemo(() => {
          return drafts.filter((draft) => {
            if (isBlank(draft) && draft.remotePath === '') return false;
            if (draft.remotePath === '') return true;
            if (draft.publishedFingerprint === '') return true;
            return draft.publishedFingerprint !== draftFingerprint(draft);
          });
        }, [drafts]);

        const publishAll = useCallback(async () => {
          if (pendingDrafts.length === 0) return;
          if (!guardSubmit()) return;
          setBusy('publishAll');
          let done = 0;
          let firstError = null;
          for (const draft of pendingDrafts) {
            try {
              await publishDraft(draft);
              done += 1;
            } catch (error) {
              if (firstError === null) firstError = error;
            }
          }
          try {
            await callHost('sync.now');
          } catch (error) {
            /* the sync badge reports the failure */
          }
          await refreshStatus();
          void loadPosts();
          if (firstError === null) {
            report('ok', t('publishAllOk', { n: done }));
          } else {
            report('error', t('publishAllPartial', { ok: done, failed: pendingDrafts.length - done, msg: firstError.message }));
          }
          setBusy('');
        }, [pendingDrafts, status.configured, settings, publishDraft, report, refreshStatus, loadPosts, t]);

        const deleteRemote = useCallback(async () => {
          if (active === null || active.remotePath === '') return;
          setBusy('delete');
          try {
            await callHost('note.delete', {
              path: active.remotePath,
              sha: active.remoteSha,
            });
            patch(active.id, { remotePath: '', remoteSha: '', remoteUrl: '', publishedAt: 0 });
            report('ok', t('publishedTo', { path: active.remotePath }));
            void loadPosts();
          } catch (error) {
            reportError('failed', error);
          } finally {
            setBusy('');
            setConfirmDelete(false);
          }
        }, [active, patch, report, reportError, t, loadPosts]);

        const deletePost = useCallback(
          async (item) => {
            setBusy('delete');
            try {
              await callHost('note.delete', { path: item.path, sha: item.sha || undefined });
              const remaining = drafts.filter((draft) => draft.remotePath !== item.path);
              if (remaining.length === 0) {
                const fresh = blankDraft();
                setDrafts([fresh]);
                setActiveId(fresh.id);
              } else {
                setDrafts(remaining);
                if (active !== null && active.remotePath === item.path) setActiveId(remaining[0].id);
              }
              report('ok', t('deleted', { path: item.path }));
              try {
                await callHost('sync.now');
              } catch (error) {
                /* the sync badge reports the failure */
              }
              void loadPosts();
              await refreshStatus();
            } catch (error) {
              reportError('failed', error);
            } finally {
              setBusy('');
              setDeletePath('');
            }
          },
          [drafts, active, report, reportError, t, loadPosts, refreshStatus],
        );

        const openInObsidian = useCallback(
          async (relative) => {
            try {
              const data = await callHost('obsidian.url', { path: relative });
              if (typeof data.url === 'string' && data.url !== '') window.location.href = data.url;
            } catch (error) {
              reportError('failed', error);
            }
          },
          [reportError],
        );

        const syncNow = useCallback(async () => {
          try {
            await callHost('sync.now');
            await refreshStatus();
          } catch (error) {
            reportError('failed', error);
          }
        }, [refreshStatus, reportError]);

        const insertText = useCallback(
          (text) => {
            if (active === null) return;
            const element = textRef.current;
            const start = element !== null && element !== undefined ? element.selectionStart : active.body.length;
            const end = element !== null && element !== undefined ? element.selectionEnd : active.body.length;
            const next = active.body.slice(0, start) + text + active.body.slice(end);
            patch(active.id, { body: next });
            window.requestAnimationFrame(() => {
              const field = textRef.current;
              if (field === null) return;
              field.focus();
              field.setSelectionRange(start + text.length, start + text.length);
            });
          },
          [active, patch],
        );

        const tool = useCallback(
          (kind) => {
            if (active === null) return;
            const element = textRef.current;
            const body = active.body;
            const start = element !== null && element !== undefined ? element.selectionStart : body.length;
            const end = element !== null && element !== undefined ? element.selectionEnd : body.length;
            const selected = body.slice(start, end);

            const replace = (before, after, placeholder) => {
              const inner = selected === '' ? placeholder : selected;
              const next = body.slice(0, start) + before + inner + after + body.slice(end);
              patch(active.id, { body: next });
              window.requestAnimationFrame(() => {
                const field = textRef.current;
                if (field === null) return;
                field.focus();
                field.setSelectionRange(start + before.length, start + before.length + inner.length);
              });
            };

            const prefixLines = (prefixMaker) => {
              const lineStart = body.lastIndexOf('\n', start - 1) + 1;
              let lineEnd = body.indexOf('\n', end);
              if (lineEnd === -1) lineEnd = body.length;
              const block = body.slice(lineStart, lineEnd);
              const lines = block.split('\n');
              const next = lines.map((line, index) => prefixMaker(index) + line).join('\n');
              const before = body.slice(0, lineStart);
              const after = body.slice(lineEnd);
              patch(active.id, { body: before + next + after });
              window.requestAnimationFrame(() => {
                const field = textRef.current;
                if (field === null) return;
                field.focus();
                field.setSelectionRange(lineStart, lineStart + next.length);
              });
            };

            const cursor = element !== null && element !== undefined ? start : body.length;

            switch (kind) {
              case 'bold':
                replace('**', '**', '加粗文字');
                break;
              case 'italic':
                replace('*', '*', '斜体文字');
                break;
              case 'strike':
                replace('~~', '~~', '删除线');
                break;
              case 'inlineCode':
                replace('`', '`', 'code');
                break;
              case 'codeBlock': {
                const inner = selected === '' ? '在这里写代码' : selected;
                const text = '```\n' + inner + '\n```';
                patch(active.id, { body: body.slice(0, start) + text + body.slice(end) });
                window.requestAnimationFrame(() => {
                  const field = textRef.current;
                  if (field === null) return;
                  field.focus();
                  const caret = start + 4;
                  field.setSelectionRange(caret, caret + inner.length);
                });
                break;
              }
              case 'quote':
                prefixLines(() => '> ');
                break;
              case 'ul':
                prefixLines(() => '- ');
                break;
              case 'ol':
                prefixLines((index) => String(index + 1) + '. ');
                break;
              case 'task':
                prefixLines(() => '- [ ] ');
                break;
              case 'h1':
                prefixLines(() => '# ');
                break;
              case 'h2':
                prefixLines(() => '## ');
                break;
              case 'h3':
                prefixLines(() => '### ');
                break;
              case 'link':
                replace('[', '](https://)', '链接文字');
                break;
              case 'image':
                replace('![', '](https://)', '图片描述');
                break;
              case 'table': {
                const table = '\n| 列 1 | 列 2 |\n| --- | --- |\n| 内容 | 内容 |\n';
                patch(active.id, { body: body.slice(0, cursor) + table + body.slice(cursor) });
                break;
              }
              case 'hr':
                patch(active.id, { body: body.slice(0, cursor) + '\n\n---\n\n' + body.slice(cursor) });
                break;
              default:
                break;
            }
          },
          [active, patch],
        );

        const onKeyDown = useCallback(
          (event) => {
            const meta = event.metaKey || event.ctrlKey;
            const key = event.key.toLowerCase();
            if (meta && key === 'b') {
              event.preventDefault();
              tool('bold');
              return;
            }
            if (meta && key === 'i') {
              event.preventDefault();
              tool('italic');
              return;
            }
            if (meta && key === 'k') {
              event.preventDefault();
              tool('link');
              return;
            }
            if (meta && event.key === 'Enter') {
              event.preventDefault();
              void publish();
              return;
            }
            if (event.key === 'Tab') {
              event.preventDefault();
              insertText('  ');
              return;
            }
            if (event.key === 'Enter' && active !== null) {
              const body = active.body;
              const element = textRef.current;
              const start = element !== null && element !== undefined ? element.selectionStart : body.length;
              const end = element !== null && element !== undefined ? element.selectionEnd : body.length;
              if (start !== end) return;
              const lineStart = body.lastIndexOf('\n', start - 1) + 1;
              const line = body.slice(lineStart, start);
              const marker = line.match(/^(\s*)([-+*]|\d{1,9}[.)])(\s+)(\[[ xX]\]\s+)?(.*)$/);
              if (marker === null) return;
              event.preventDefault();
              if (marker[5].trim() === '') {
                const next = body.slice(0, lineStart) + body.slice(start);
                patch(active.id, { body: next });
                window.requestAnimationFrame(() => {
                  const field = textRef.current;
                  if (field === null) return;
                  field.focus();
                  field.setSelectionRange(lineStart, lineStart);
                });
                return;
              }
              const ordered = /^\d/.test(marker[2]);
              const bullet = ordered
                ? String(Number(marker[2].replace(/[.)]$/, '')) + 1) + marker[2].slice(-1)
                : marker[2];
              const insert = '\n' + marker[1] + bullet + ' ' + (marker[4] !== undefined && marker[4] !== '' ? '[ ] ' : '');
              insertText(insert);
            }
          },
          [active, tool, publish, insertText, patch],
        );

        const filteredDrafts = useMemo(() => {
          const needle = query.trim().toLowerCase();
          const list = [...drafts].sort((a, b) => b.updatedAt - a.updatedAt);
          if (needle === '') return list;
          return list.filter(
            (item) =>
              item.title.toLowerCase().includes(needle) ||
              item.slug.toLowerCase().includes(needle) ||
              item.body.toLowerCase().includes(needle),
          );
        }, [drafts, query]);

        const filteredPosts = useMemo(() => {
          const needle = query.trim().toLowerCase();
          if (needle === '') return posts.items;
          return posts.items.filter((item) => item.name.toLowerCase().includes(needle) || item.path.toLowerCase().includes(needle));
        }, [posts.items, query]);

        const groupHeader = (key, label, count, hint) =>
          h(
            'button',
            {
              type: 'button',
              className: 'bs-group',
              title: hint || '',
              'aria-expanded': !collapsed[key],
              onClick: () => setCollapsed((current) => ({ ...current, [key]: !current[key] })),
            },
            h('span', { className: 'bs-chevron' + (collapsed[key] ? '' : ' bs-chevron-open'), 'aria-hidden': true }, '›'),
            h('span', { className: 'bs-group-label' }, label),
            h('span', { className: 'bs-group-count' }, count),
          );

        const renderSideItem = (item, kind) => {
          const selected = kind === 'draft' && active !== null && active.id === item.id;
          const itemDirty =
            item.remotePath !== '' &&
            item.publishedFingerprint !== '' &&
            item.publishedFingerprint !== draftFingerprint(item);
          const rowKey = (kind === 'draft' ? 'd:' : 'p:') + (kind === 'draft' ? item.id : item.path);
          const confirming = deletePath === rowKey;
          const openRow =
            kind === 'draft'
              ? () => {
                  setActiveId(item.id);
                  setView('write');
                  setConfirmDelete(false);
                  setDeletePath('');
                }
              : () => {
                  void openPost(item);
                  setDeletePath('');
                };
          const content =
            kind === 'draft'
              ? [
                  h(
                    'span',
                    { className: 'bs-item-top', key: 'top' },
                    itemDirty ? h('span', { className: 'bs-dot', title: t('dirty'), 'aria-hidden': true }) : null,
                    h('span', { className: 'bs-item-title' }, item.title.trim() === '' ? t('untitled') : item.title),
                    item.remotePath !== ''
                      ? h('span', { className: 'bs-badge bs-badge-live' }, t('remoteBadge'))
                      : h('span', { className: 'bs-badge' }, t('draftBadge')),
                  ),
                  h('span', { className: 'bs-item-meta', key: 'meta' }, h('span', null, relTime(item.updatedAt, t))),
                ]
              : [
                  h('span', { className: 'bs-item-top', key: 'top' }, h('span', { className: 'bs-item-title' }, item.name)),
                  h('span', { className: 'bs-item-meta', key: 'meta' }, h('span', null, item.path)),
                ];

          return h(
            'div',
            {
              className: 'bs-item-wrap',
              key: rowKey,
              onContextMenu: (event) => {
                event.preventDefault();
                setDeletePath(rowKey);
              },
            },
            h(
              'button',
              {
                type: 'button',
                className: 'bs-item' + (selected ? ' bs-item-on' : ''),
                onClick: openRow,
              },
              content,
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'bs-item-del' + (confirming ? ' bs-item-del-on' : ''),
                title: kind === 'draft' ? t('removeDraftHint') : t('deleteTitle'),
                'aria-label': kind === 'draft' ? t('removeDraftHint') : t('deleteTitle'),
                onClick: (event) => {
                  event.stopPropagation();
                  if (confirming === false) {
                    setDeletePath(rowKey);
                    return;
                  }
                  if (kind === 'draft') {
                    removeDraft(item.id);
                    setDeletePath('');
                  } else {
                    void deletePost(item);
                  }
                },
              },
              confirming ? (kind === 'draft' ? t('confirmDiscard') : t('confirmDelete')) : '×',
            ),
          );
        };

        const statusDot = status.configured && status.valid ? ' bs-chip-dot-on' : status.configured ? ' bs-chip-dot-warn' : '';
        const chipText = settings.owner.trim() === '' ? t('needRepo') : settings.owner.trim() + '/' + settings.repo.trim() + '@' + settings.branch.trim();

        const settingsProps = {
          t,
          settings,
          status,
          busy,
          onClose: () => setView('write'),
          onSave: async (next) => {
            setBusy('config');
            try {
              const data = await callHost('config.set', next);
              setSettings(cleanSettings(data));
              report('ok', t('saved'));
              setView('write');
              void loadPosts();
            } catch (error) {
              reportError('failed', error);
            } finally {
              setBusy('');
            }
          },
          onTokenSave: async (value) => {
            setBusy('token');
            try {
              const data = await callHost('token.set', { token: value });
              report('ok', t('tokenValid', { login: typeof data.login === 'string' ? data.login : '' }));
              await refreshStatus();
            } catch (error) {
              reportError('failed', error);
            } finally {
              setBusy('');
            }
          },
          onClearToken: async () => {
            setBusy('token');
            try {
              await callHost('token.clear');
              await refreshStatus();
              setPosts({ phase: 'idle', items: [], error: '' });
            } catch (error) {
              reportError('failed', error);
            } finally {
              setBusy('');
            }
          },
          onImportGh: async () => {
            setBusy('gh');
            try {
              const data = await callHost('token.importGh');
              report('ok', t('tokenValid', { login: typeof data.login === 'string' ? data.login : '' }));
              await refreshStatus();
            } catch (error) {
              reportError('failed', error);
            } finally {
              setBusy('');
            }
          },
        };

        const bodyView =
          view === 'settings'
            ? h(SettingsView, settingsProps)
            : h(
                'div',
                { className: 'bs-body' },
                h(
                  'aside',
                  { className: 'bs-side' },
                  h(
                    'div',
                    { className: 'bs-side-head' },
                    h('input', {
                      className: 'bs-search',
                      type: 'search',
                      value: query,
                      placeholder: t('search'),
                      'aria-label': t('search'),
                      onChange: (event) => setQuery(event.target.value),
                    }),
                  ),
                  h(
                    'div',
                    { className: 'bs-side-scroll' },
                    groupHeader('drafts', t('drafts'), '(' + drafts.length + ')', t('draftsHint')),
                    collapsed.drafts
                      ? null
                      : filteredDrafts.length === 0
                        ? h('div', { className: 'bs-empty' }, t('emptyDrafts'))
                        : filteredDrafts.map((item) => renderSideItem(item, 'draft')),
                    groupHeader('inbox', t('posts'), posts.phase === 'loading' ? '…' : '(' + posts.items.length + ')', t('inboxHint')),
                    collapsed.inbox
                      ? null
                      : status.phase === 'ready' && !status.configured
                        ? h(
                            'div',
                            { className: 'bs-empty' },
                            h('div', { style: { marginBottom: '8px' } }, t('tokenMissing')),
                            h('button', { type: 'button', className: 'bs-btn', onClick: () => setView('settings') }, t('settings')),
                          )
                        : posts.phase === 'error'
                          ? h('div', { className: 'bs-empty' }, t('listFailed', { msg: posts.error }))
                          : filteredPosts.length === 0
                            ? h('div', { className: 'bs-empty' }, t('emptyPosts'))
                            : filteredPosts.map((item) => renderSideItem(item, 'post')),
                  ),
                ),
                h(
                  'section',
                  { className: 'bs-main' },
                  active === null
                    ? h(
                        'div',
                        { className: 'bs-empty', style: { marginTop: '64px' } },
                        h('div', { style: { marginBottom: '12px' } }, t('emptyDrafts')),
                        h('button', { type: 'button', className: 'bs-btn bs-btn-primary', onClick: newPost }, t('newPost')),
                      )
                    : [
                        h(
                          'div',
                          { className: 'bs-meta', key: 'meta' },
                          h(
                            'div',
                            { className: 'bs-title-row' },
                            h('input', {
                              className: 'bs-title-input',
                              value: active.title,
                              placeholder: t('titlePlaceholder'),
                              'aria-label': t('titlePlaceholder'),
                              onChange: setField('title'),
                            }),
                            activeDirty ? h('span', { className: 'bs-title-dirty' }, t('dirty')) : null,
                          ),
                          h(
                            'div',
                            { className: 'bs-fields' },
                            h(
                              'div',
                              { className: 'bs-types', role: 'group', 'aria-label': t('typeLabel') },
                              ...NOTE_TYPES.map((key) =>
                                h(
                                  'button',
                                  {
                                    type: 'button',
                                    key,
                                    className: 'bs-type' + (active.type === key ? ' bs-type-on' : ''),
                                    'aria-pressed': active.type === key,
                                    onClick: () => patch(active.id, { type: key }),
                                  },
                                  t('type.' + key),
                                ),
                              ),
                            ),
                            h(
                              MetaField,
                              { key: 'tags', label: t('tags'), size: 'w-md' },
                              h('input', { value: active.tags, placeholder: t('commaHint'), onChange: setField('tags') }),
                            ),
                            h(
                              MetaField,
                              { key: 'source', label: t('source'), size: 'w-lg' },
                              h('input', { value: active.source, placeholder: t('sourcePlaceholder'), spellCheck: false, onChange: setField('source') }),
                            ),
                            h(
                              MetaField,
                              { key: 'slug', label: t('slug'), size: 'w-md' },
                              h('input', {
                                value: active.slug,
                                placeholder: slugify(active.title) || t('slugHint'),
                                spellCheck: false,
                                onChange: setField('slug'),
                              }),
                            ),
                            h(
                              MetaField,
                              { key: 'date', label: t('date'), size: 'w-md' },
                              h('input', { value: active.date, spellCheck: false, onChange: setField('date') }),
                              h(
                                'button',
                                {
                                  type: 'button',
                                  className: 'bs-tool',
                                  title: t('now'),
                                  onClick: () => patch(active.id, { date: nowStamp() }),
                                },
                                '⟳',
                              ),
                            ),
                          ),
                        ),
                        h(
                          'div',
                          { className: 'bs-toolbar', key: 'tools', role: 'toolbar', 'aria-label': t('toolbar') },
                          ...['h1', 'h2', 'h3'].map((kind) =>
                            h(
                              'button',
                              { type: 'button', key: kind, className: 'bs-tool', title: t('heading') + ' ' + kind.slice(1), onClick: () => tool(kind) },
                              kind.toUpperCase(),
                            ),
                          ),
                          h('span', { className: 'bs-tool-sep', key: 'sep1' }),
                          h('button', { type: 'button', className: 'bs-tool', title: t('bold') + ' (⌘B)', style: { fontWeight: 700 }, onClick: () => tool('bold') }, 'B'),
                          h('button', { type: 'button', className: 'bs-tool', title: t('italic') + ' (⌘I)', style: { fontStyle: 'italic' }, onClick: () => tool('italic') }, 'I'),
                          h('button', { type: 'button', className: 'bs-tool', title: t('strike'), style: { textDecoration: 'line-through' }, onClick: () => tool('strike') }, 'S'),
                          h('span', { className: 'bs-tool-sep', key: 'sep2' }),
                          h('button', { type: 'button', className: 'bs-tool', title: t('inlineCode'), onClick: () => tool('inlineCode') }, '`code`'),
                          h('button', { type: 'button', className: 'bs-tool', title: t('codeBlock'), onClick: () => tool('codeBlock') }, '```'),
                          h('span', { className: 'bs-tool-sep', key: 'sep3' }),
                          h('button', { type: 'button', className: 'bs-tool', title: t('quote'), onClick: () => tool('quote') }, '❝'),
                          h('button', { type: 'button', className: 'bs-tool', title: t('ul'), onClick: () => tool('ul') }, '•'),
                          h('button', { type: 'button', className: 'bs-tool', title: t('ol'), onClick: () => tool('ol') }, '1.'),
                          h('button', { type: 'button', className: 'bs-tool', title: t('task'), onClick: () => tool('task') }, '☑'),
                          h('span', { className: 'bs-tool-sep', key: 'sep4' }),
                          h('button', { type: 'button', className: 'bs-tool', title: t('link') + ' (⌘K)', onClick: () => tool('link') }, '↗'),
                          h('button', { type: 'button', className: 'bs-tool', title: t('image'), onClick: () => tool('image') }, '▣'),
                          h('button', { type: 'button', className: 'bs-tool', title: t('table'), onClick: () => tool('table') }, '▦'),
                          h('button', { type: 'button', className: 'bs-tool', title: t('hr'), onClick: () => tool('hr') }, '—'),
                          h(
                            'div',
                            { className: 'bs-views', key: 'views', role: 'group' },
                            ...[['edit', t('modeEdit')], ['split', t('modeSplit')], ['preview', t('modePreview')]].map(([key, label]) =>
                              h(
                                'button',
                                {
                                  type: 'button',
                                  key,
                                  className: 'bs-view' + (mode === key ? ' bs-view-on' : ''),
                                  'aria-pressed': mode === key,
                                  onClick: () => setMode(key),
                                },
                                label,
                              ),
                            ),
                          ),
                        ),
                        h(
                          'div',
                          { className: 'bs-panes', key: 'panes' },
                          mode === 'preview'
                            ? null
                            : h(
                                'div',
                                { className: 'bs-pane' },
                                h('textarea', {
                                  ref: textRef,
                                  className: 'bs-textarea',
                                  value: active.body,
                                  placeholder: t('bodyPlaceholder'),
                                  spellCheck: false,
                                  'aria-label': t('bodyPlaceholder'),
                                  onChange: setField('body'),
                                  onKeyDown,
                                  onScroll: (event) => {
                                    if (mode !== 'split' || previewRef.current === null) return;
                                    const source = event.currentTarget;
                                    const ratio = source.scrollTop / Math.max(1, source.scrollHeight - source.clientHeight);
                                    const target = previewRef.current;
                                    target.scrollTop = ratio * Math.max(0, target.scrollHeight - target.clientHeight);
                                  },
                                }),
                              ),
                          mode === 'edit'
                            ? null
                            : h(
                                'div',
                                { className: 'bs-pane' },
                                h('div', {
                                  ref: previewRef,
                                  className: 'bs-preview',
                                  dangerouslySetInnerHTML: { __html: '<div class="bs-md">' + previewHtml + '</div>' },
                                  onClick: (event) => {
                                    const target = event.target;
                                    if (target === null || typeof target.closest !== 'function') return;
                                    const link = target.closest('[data-wikilink]');
                                    if (link === null) return;
                                    event.preventDefault();
                                    setQuery(link.getAttribute('data-wikilink') || '');
                                  },
                                }),
                              ),
                        ),
                        h(
                          'div',
                          { className: 'bs-foot', key: 'foot' },
                          h(
                            'span',
                            { className: 'bs-foot-info', title: t('wordCountTip') },
                            t('words', { n: countWords(active.body) }),
                            ' · ',
                            active.remotePath === ''
                              ? t('notPublishedYet')
                              : h(
                                  'a',
                                  { href: repoUrl, target: '_blank', rel: 'noreferrer' },
                                  active.remotePath,
                                ),
                          ),
                          active.remotePath === ''
                            ? null
                            : activeDirty
                              ? h('span', { className: 'bs-inline-state bs-inline-state-warn' }, t('dirty'))
                              : active.publishedFingerprint !== ''
                                ? h('span', { className: 'bs-inline-state bs-inline-state-ok' }, t('clean'))
                                : null,
                          status.mode === 'local'
                            ? h(
                                'button',
                                {
                                  type: 'button',
                                  className:
                                    'bs-sync' +
                                    (status.sync !== null && status.sync.ok === false ? ' bs-sync-bad' : '') +
                                    (status.sync !== null && status.sync.running ? ' bs-sync-running' : ''),
                                  title: status.sync !== null && status.sync.message !== '' ? status.sync.message : t('syncNow'),
                                  onClick: () => void syncNow(),
                                },
                                status.sync !== null && status.sync.running
                                  ? t('syncPending')
                                  : status.sync !== null && status.sync.at > 0
                                    ? status.sync.ok
                                      ? t('syncOk')
                                      : t('syncFailed')
                                    : t('syncIdle'),
                              )
                            : null,
                          status.mode === 'local' && active.remotePath !== ''
                            ? h(
                                'button',
                                { type: 'button', className: 'bs-btn bs-btn-quiet', onClick: () => void openInObsidian(active.remotePath) },
                                t('openInObsidian'),
                              )
                            : null,
                          postUrl === ''
                            ? null
                            : h(
                                'button',
                                { type: 'button', className: 'bs-btn bs-btn-quiet', onClick: () => window.open(postUrl, '_blank', 'noopener') },
                                t('openSite'),
                                glyphExternal(),
                              ),
                          confirmDelete
                            ? h(
                                'span',
                                { style: { display: 'inline-flex', alignItems: 'center', gap: '6px' } },
                                h(
                                  'button',
                                  {
                                    type: 'button',
                                    className: 'bs-btn bs-btn-danger',
                                    disabled: busy === 'delete',
                                    onClick: () => {
                                      if (active.remotePath === '') {
                                        removeDraft(active.id);
                                        setConfirmDelete(false);
                                      } else {
                                        void deleteRemote();
                                      }
                                    },
                                  },
                                  active.remotePath === '' ? t('confirmDiscard') : t('confirmDelete'),
                                ),
                                h('button', { type: 'button', className: 'bs-btn', onClick: () => setConfirmDelete(false) }, t('cancel')),
                              )
                            : h(
                                'button',
                                {
                                  type: 'button',
                                  className: 'bs-btn bs-btn-quiet',
                                  title: active.remotePath === '' ? t('discardTitle') : t('deleteTitle'),
                                  onClick: () => setConfirmDelete(true),
                                },
                                glyphTrash(),
                                active.remotePath === '' ? t('discard') : t('delete'),
                              ),
                          h('span', { className: 'bs-inline-state' }, busy === 'read' ? '…' : ''),
                        ),
                      ],
                ),
              );

        return h(
          'div',
          { className: 'bs-page', style: { position: 'relative' } },
          h('style', { dangerouslySetInnerHTML: { __html: PAGE_CSS } }),
          h(
            'header',
            { className: 'bs-top' },
            view === 'settings'
              ? h(
                  'button',
                  { type: 'button', className: 'bs-ico', title: t('back'), 'aria-label': t('back'), onClick: () => setView('write') },
                  glyphBack(),
                )
              : h('span', { className: 'bs-brand-mark' }, glyphPen()),
            h('span', { className: 'bs-brand' }, h('h1', { className: 'bs-title' }, view === 'settings' ? t('settingsTitle') : t('title'))),
            h(
              'span',
              { className: 'bs-chip', title: chipText },
              h('span', { className: 'bs-chip-dot' + statusDot }),
              h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis' } }, chipText),
            ),
            h('span', { className: 'bs-spacer' }),
            view === 'settings'
              ? null
              : [
                  h(
                    'button',
                    { type: 'button', className: 'bs-btn', key: 'new', onClick: newPost },
                    glyphPlus(),
                    t('newPost'),
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'bs-ico',
                      key: 'refresh',
                      title: t('refresh'),
                      'aria-label': t('refresh'),
                      disabled: posts.phase === 'loading',
                      onClick: () => void loadPosts(),
                    },
                    glyphRefresh(),
                  ),
                  h(
                    'button',
                    { type: 'button', className: 'bs-ico', key: 'settings', title: t('settings'), 'aria-label': t('settings'), onClick: () => setView('settings') },
                    glyphGear(),
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'bs-btn',
                      key: 'publishAll',
                      disabled: pendingDrafts.length === 0 || busy === 'publishAll' || busy === 'publish',
                      title: t('publishAllHint'),
                      onClick: () => void publishAll(),
                    },
                    busy === 'publishAll' ? t('publishing') : t('publishAll', { n: pendingDrafts.length }),
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'bs-btn bs-btn-primary',
                      key: 'publish',
                      disabled: active === null || busy === 'publish' || busy === 'publishAll',
                      onClick: () => void publish(),
                    },
                    glyphCloud(),
                    busy === 'publish' ? t('publishing') : t('publishThis'),
                  ),
                ],
          ),
          bodyView,
          h(Notice, { notice, onDismiss: () => setNotice(null), t }),
        );
      };
    }
    //#endregion

    //#region registration
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh: DICT_ZH, en: DICT_EN }), 'brain: dictionaries');
      const t = ctx.locale.bind(NS);
      const Page = makePage(t);
      const GuardedPage = function BrainGuardedPage() {
        return h(PageBoundary, { t }, h(Page));
      };

      ctx.effect(() => {
        const disposers = [
          ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID, locale: NS }, GuardedPage)),
          ctx.slots.inject('sidebar.panellist', () =>
            ctx.slots.register(
              {
                name: 'sidebar.panellist',
                id: PANEL_ID,
                order: 31,
                label: () => t('title'),
                locale: NS,
              },
              SidebarGlyph,
            ),
          ),
        ];
        return () => {
          for (const dispose of disposers) {
            if (typeof dispose === 'function') dispose();
          }
        };
      }, 'brain: panel');
    }

    return { name: '@local/brain', inject: ['slots', 'locale'], apply };
  },
});
