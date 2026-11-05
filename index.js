/**
 * Host half of Second Brain.
 *
 * Local-first by design: the vault is a folder on disk (`~/brain` by default),
 * and Obsidian watches that same folder. The plugin and the agent write plain
 * `.md` files there, so a capture is visible in Obsidian immediately and works
 * offline. Git is the sync layer, not the write path: after a change the host
 * commits and pushes in the background, and only a machine without the local
 * clone falls back to the GitHub Contents API.
 *
 * Three things never reach the page: the access token (credentials record
 * `brain`), the git plumbing, and the agent tools (`brain_save`,
 * `brain_search`).
 */
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const API = 'https://api.github.com';
const ROUTE = '/brain/api';
const TOKEN_KEY = 'brain';

const DEFAULTS = Object.freeze({
  owner: 'supeBam',
  repo: 'brain',
  branch: 'main',
  inbox: 'inbox',
  siteUrl: '',
  vaultPath: '~/brain',
});

const NOTE_TYPES = ['thought', 'clip', 'quote', 'task'];
const SYNC_DEBOUNCE_MS = 3000;

class GhError extends Error {
  constructor(status, message, hint) {
    super(message);
    this.status = status;
    this.hint = hint;
  }
}

function normalizeConfig(raw) {
  const base = { ...DEFAULTS };
  if (raw !== null && typeof raw === 'object' && Array.isArray(raw) === false) {
    for (const key of Object.keys(DEFAULTS)) {
      if (typeof raw[key] === 'string') base[key] = raw[key].trim();
    }
  }
  if (base.owner === '') base.owner = DEFAULTS.owner;
  if (base.repo === '') base.repo = DEFAULTS.repo;
  if (base.branch === '') base.branch = DEFAULTS.branch;
  if (base.inbox === '') base.inbox = DEFAULTS.inbox;
  if (base.vaultPath === '') base.vaultPath = DEFAULTS.vaultPath;
  return base;
}

function expandHome(value) {
  const text = String(value || '').trim();
  if (text === '') return '';
  if (text === '~') return os.homedir();
  if (text.startsWith('~/')) return path.join(os.homedir(), text.slice(2));
  return path.resolve(text);
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req, limit = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function cleanCoordinate(value, label) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text === '') throw new Error(`缺少${label}`);
  if (/[\n\r]/.test(text)) throw new Error(`${label}不合法`);
  return text;
}

function cleanPath(value) {
  const text = cleanCoordinate(value, '文件路径')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
  if (text.split('/').includes('..')) throw new Error('文件路径不合法');
  return text;
}

function cleanDir(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  const trimmed = text.replace(/^\/+/, '').replace(/\/+$/, '');
  if (trimmed.split('/').includes('..')) throw new Error('目录不合法');
  return trimmed;
}

function encodeRepoPath(value) {
  return value
    .split('/')
    .filter((part) => part !== '')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function b64encode(text) {
  return Buffer.from(text, 'utf8').toString('base64');
}

function b64decode(text) {
  return Buffer.from(String(text || '').replace(/\s+/g, ''), 'base64').toString('utf8');
}

function yamlScalar(value) {
  const text = String(value == null ? '' : value);
  if (text === '') return '""';
  if (/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?)?$/.test(text)) return text;
  if (/^[A-Za-z0-9\u4e00-\u9fff][^#:]*$/.test(text) && !/^\s|\s$/.test(text)) return text;
  return JSON.stringify(text);
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function isoTimestamp() {
  const date = new Date();
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
}

function slugify(text) {
  const slug = String(text || '')
    .trim()
    .replace(/[\\/:*?"<>|#%{}$!'`^&+=@~,;\[\]()]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return slug === '' ? 'note' : slug;
}

function buildNote(meta, body) {
  const lines = ['---'];
  lines.push(`title: ${yamlScalar(meta.title)}`);
  lines.push(`type: ${meta.type}`);
  lines.push(`created: ${yamlScalar(meta.created)}`);
  if (Array.isArray(meta.tags) && meta.tags.length > 0) lines.push(`tags: [${meta.tags.map(yamlScalar).join(', ')}]`);
  if (typeof meta.source === 'string' && meta.source !== '') lines.push(`source: ${yamlScalar(meta.source)}`);
  lines.push('---', '');
  return lines.join('\n') + String(body || '').replace(/^\n+/, '');
}

function execGhToken() {
  return new Promise((resolve, reject) => {
    execFile(
      'gh',
      ['auth', 'token'],
      { timeout: 6000, windowsHide: true, env: { ...process.env, PATH: shellPath() } },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error((stderr || error.message || '').trim() || '无法读取 gh 登录状态'));
          return;
        }
        const token = String(stdout || '').trim();
        if (token === '') reject(new Error('gh 没有返回令牌，请先执行 gh auth login'));
        else resolve(token);
      },
    );
  });
}

function shellPath() {
  return [process.env.PATH || '', '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin']
    .filter((part) => part !== '')
    .join(':');
}

export const name = 'brain';
export const inject = ['webServer', 'credentials'];

export function apply(ctx, rawConfig) {
  const webServer = ctx.webServer;
  const credentials = ctx.credentials;
  const settings = normalizeConfig(rawConfig);
  const vault = expandHome(settings.vaultPath);

  let syncTimer = null;
  let syncState = { at: 0, ok: true, message: '', pending: false, running: false };

  /**
   * The credentials store may scope a record under `<scope>/<key>` (we have
   * observed `brain/github` for a key written as `brain`), and the scope can
   * differ across restarts. Rather than guess the format, enumerate records and
   * accept every address that belongs to this plugin.
   */
  async function tokenKeys() {
    const keys = [TOKEN_KEY, `${TOKEN_KEY}/github`];
    try {
      const records = await credentials.listRecords();
      for (const entry of records) {
        const key = String(entry?.key ?? '');
        if (key === TOKEN_KEY || key.startsWith(`${TOKEN_KEY}/`)) {
          if (keys.includes(key) === false) keys.push(key);
        }
      }
    } catch {
      /* enumeration is optional */
    }
    return keys;
  }

  async function resolveToken() {
    for (const key of await tokenKeys()) {
      const record = await credentials.readRecord(key).catch(() => undefined);
      if (record === undefined || record === null) continue;
      if (record.kind === 'api-key' && typeof record.key === 'string' && record.key !== '') {
        return { token: record.key, source: 'record', key };
      }
      if (record.kind === 'grant' && record.payload !== undefined && record.payload !== null) {
        const payload = record.payload;
        const value = typeof payload === 'string' ? payload : payload.token;
        if (typeof value === 'string' && value !== '') return { token: value, source: 'record', key };
      }
    }
    const env = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    if (typeof env === 'string' && env.trim() !== '') return { token: env.trim(), source: 'env', key: '' };
    return { token: '', source: 'none', key: '' };
  }

  /** Write the token to whichever address this plugin already owns. */
  async function storeToken(token) {
    const resolved = await resolveToken();
    const key = resolved.key !== '' ? resolved.key : TOKEN_KEY;
    await credentials.modifyRecord(key, async () => ({ kind: 'api-key', key: token }));
    return key;
  }

  async function requireToken() {
    const resolved = await resolveToken();
    if (resolved.token === '') throw new GhError(401, '尚未配置 GitHub 访问令牌', 'token-missing');
    return resolved.token;
  }

  //#region local vault
  function resolveInside(relative) {
    const clean = String(relative || '').replace(/^\/+/, '');
    const absolute = path.resolve(vault, clean);
    const root = path.resolve(vault);
    if (absolute !== root && absolute.startsWith(root + path.sep) === false) throw new Error('文件路径越界');
    return absolute;
  }

  async function vaultReady() {
    if (vault === '') return false;
    try {
      const stat = await fs.stat(vault);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  async function hasGit() {
    try {
      await fs.stat(path.join(vault, '.git'));
      return true;
    } catch {
      return false;
    }
  }

  function relativeOf(absolute) {
    return path.relative(vault, absolute).split(path.sep).join('/');
  }

  async function listLocal(dir) {
    const root = dir === '' ? vault : resolveInside(dir);
    const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
    const notes = [];
    for (const entry of entries) {
      if (entry.isFile() === false) continue;
      if (/\.(md|markdown)$/i.test(entry.name) === false) continue;
      const absolute = path.join(root, entry.name);
      const stat = await fs.stat(absolute).catch(() => null);
      notes.push({
        name: entry.name,
        path: relativeOf(absolute),
        sha: '',
        size: stat === null ? 0 : stat.size,
        mtime: stat === null ? 0 : stat.mtimeMs,
      });
    }
    notes.sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
    return notes;
  }

  async function readLocal(relative) {
    const absolute = resolveInside(relative);
    const text = await fs.readFile(absolute, 'utf8');
    return { path: relative, sha: '', text };
  }

  async function writeLocal(relative, content) {
    const absolute = resolveInside(relative);
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, content, 'utf8');
    scheduleSync();
    return { path: relative, sha: '', url: siteUrlOf(relative), commit: '' };
  }

  async function deleteLocal(relative) {
    const absolute = resolveInside(relative);
    await fs.unlink(absolute);
    scheduleSync();
    return { removed: true };
  }

  async function walkMarkdown(root, depth = 0, out = []) {
    if (depth > 3 || out.length > 400) return out;
    const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === '.git') continue;
      const absolute = path.join(root, entry.name);
      if (entry.isDirectory()) {
        await walkMarkdown(absolute, depth + 1, out);
      } else if (/\.(md|markdown)$/i.test(entry.name) && out.length < 400) {
        out.push(absolute);
      }
    }
    return out;
  }

  async function searchLocal(query, limit) {
    const needle = String(query || '').trim().toLowerCase();
    if (needle === '') return [];
    const max = Math.max(1, Math.min(Number(limit) || 8, 20));
    const files = await walkMarkdown(vault);
    const hits = [];
    for (const absolute of files) {
      if (hits.length >= max) break;
      const text = await fs.readFile(absolute, 'utf8').catch(() => null);
      if (text === null) continue;
      const index = text.toLowerCase().indexOf(needle);
      if (index === -1) continue;
      hits.push({
        path: relativeOf(absolute),
        fragments: [text.slice(Math.max(0, index - 60), index + 180).replace(/\s+/g, ' ')],
      });
    }
    return hits;
  }

  async function uniqueLocalPath(title) {
    const base = `${today()}-${slugify(title)}`;
    const dir = settings.inbox === '' ? '' : `${settings.inbox}/`;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const name = attempt === 0 ? `${base}.md` : `${base}-${attempt + 1}.md`;
      const absolute = resolveInside(dir + name);
      const exists = await fs.stat(absolute).then(() => true).catch(() => false);
      if (!exists) return dir + name;
    }
    throw new Error('同名文件过多，请换一个标题');
  }
  //#endregion

  //#region git sync
  function git(args, timeout = 25000) {
    return new Promise((resolve, reject) => {
      execFile(
        'git',
        ['-C', vault, ...args],
        { timeout, windowsHide: true, env: { ...process.env, PATH: shellPath(), GIT_TERMINAL_PROMPT: '0' } },
        (error, stdout, stderr) => {
          if (error) {
            const message = (String(stderr || '').trim() || error.message || 'git 执行失败').split('\n').slice(0, 4).join(' ');
            reject(new Error(message));
            return;
          }
          resolve(String(stdout || ''));
        },
      );
    });
  }

  function scheduleSync() {
    if (syncTimer !== null) clearTimeout(syncTimer);
    syncState = { ...syncState, pending: true };
    syncTimer = setTimeout(() => {
      syncTimer = null;
      void runSync();
    }, SYNC_DEBOUNCE_MS);
  }

  async function runSync() {
    if (syncState.running) return syncState;
    if ((await vaultReady()) === false || (await hasGit()) === false) {
      syncState = { ...syncState, pending: false, ok: true, message: '本地目录不是 git 仓库，跳过同步', at: Date.now() };
      return syncState;
    }
    syncState = { ...syncState, running: true, pending: false };
    let message = '';
    let ok = true;
    try {
      await git(['add', '-A']);
      const porcelain = await git(['status', '--porcelain']);
      if (porcelain.trim() !== '') {
        await git(['commit', '-m', `brain: sync ${new Date().toISOString().replace('T', ' ').slice(0, 19)}`]);
      }
      try {
        await git(['pull', '--rebase', '--autostash'], 30000);
      } catch (error) {
        await git(['rebase', '--abort']).catch(() => {});
        throw new Error(`拉取失败：${error instanceof Error ? error.message : String(error)}`);
      }
      try {
        await git(['push'], 30000);
      } catch (error) {
        const resolved = await resolveToken();
        if (resolved.token === '') throw error;
        const auth = 'Basic ' + Buffer.from(`x-access-token:${resolved.token}`).toString('base64');
        await git(
          [
            '-c',
            `http.https://github.com/.extraheader=Authorization: ${auth}`,
            'push',
            `https://github.com/${settings.owner}/${settings.repo}.git`,
            `HEAD:${settings.branch}`,
          ],
          35000,
        );
      }
      message = '已同步';
    } catch (error) {
      ok = false;
      message = error instanceof Error ? error.message : String(error);
    }
    syncState = { at: Date.now(), ok, message, pending: false, running: false };
    return syncState;
  }
  //#endregion

  //#region remote (GitHub Contents API)
  async function gh(token, apiPath, init = {}) {
    const headers = {
      accept: init.accept || 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'dsh-brain',
      authorization: `Bearer ${token}`,
    };
    let body;
    if (init.body !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(init.body);
    }
    let response;
    try {
      response = await fetch(`${API}${apiPath}`, { method: init.method || 'GET', headers, body });
    } catch (error) {
      throw new GhError(0, `无法连接 GitHub：${error instanceof Error ? error.message : String(error)}`, 'network');
    }
    const text = await response.text();
    let data = null;
    if (text !== '') {
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
    }
    if (!response.ok) {
      const message =
        data !== null && typeof data.message === 'string' && data.message !== ''
          ? data.message
          : `GitHub 返回 HTTP ${response.status}`;
      throw new GhError(response.status, message);
    }
    return data;
  }

  async function checkUser(token) {
    const data = await gh(token, '/user');
    return typeof data?.login === 'string' ? data.login : '';
  }

  async function readRemote(token, relative, ref) {
    const query = typeof ref === 'string' && ref !== '' ? `?ref=${encodeURIComponent(ref)}` : '';
    const data = await gh(token, `/repos/${encodeURIComponent(settings.owner)}/${encodeURIComponent(settings.repo)}/contents/${encodeRepoPath(relative)}${query}`);
    if (data === null || typeof data !== 'object' || typeof data.content !== 'string') {
      throw new GhError(422, '该文件没有可读取的文本内容');
    }
    return { path: data.path, sha: data.sha, text: b64decode(data.content) };
  }

  async function listRemote(token, dir) {
    const suffix = dir === '' ? '' : `/${encodeRepoPath(dir)}`;
    let list;
    try {
      list = await gh(token, `/repos/${encodeURIComponent(settings.owner)}/${encodeURIComponent(settings.repo)}/contents${suffix}?ref=${encodeURIComponent(settings.branch)}`);
    } catch (error) {
      if (error instanceof GhError && error.status === 404) return [];
      throw error;
    }
    if (!Array.isArray(list)) throw new GhError(422, '该目录不是普通目录');
    return list
      .filter((item) => item.type === 'file' && /\.(md|markdown)$/i.test(item.name))
      .map((item) => ({ name: item.name, path: item.path, sha: item.sha, size: item.size, mtime: 0 }))
      .sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
  }

  async function writeRemote(token, relative, content, message, sha) {
    const body = { message, content: b64encode(content), branch: settings.branch };
    if (typeof sha === 'string' && sha !== '') body.sha = sha;
    try {
      return await gh(
        token,
        `/repos/${encodeURIComponent(settings.owner)}/${encodeURIComponent(settings.repo)}/contents/${encodeRepoPath(relative)}`,
        { method: 'PUT', body },
      );
    } catch (error) {
      if (error instanceof GhError && error.status === 422 && body.sha === undefined) {
        throw new GhError(409, `仓库里已经有同名文件：${relative}`, 'file-exists');
      }
      throw error;
    }
  }

  async function uniqueRemotePath(token, title) {
    const base = `${today()}-${slugify(title)}`;
    const dir = settings.inbox === '' ? '' : `${settings.inbox}/`;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const name = attempt === 0 ? `${base}.md` : `${base}-${attempt + 1}.md`;
      const relative = dir + name;
      try {
        await gh(token, `/repos/${encodeURIComponent(settings.owner)}/${encodeURIComponent(settings.repo)}/contents/${encodeRepoPath(relative)}?ref=${encodeURIComponent(settings.branch)}`);
      } catch (error) {
        if (error instanceof GhError && error.status === 404) return relative;
        throw error;
      }
    }
    throw new GhError(409, '同名文件过多，请换一个标题');
  }

  async function searchRemote(query, limit) {
    const token = await requireToken();
    const text = String(query || '').trim();
    if (text === '') return [];
    const max = Math.max(1, Math.min(Number(limit) || 8, 20));
    let hits = [];
    try {
      const data = await gh(
        token,
        `/search/code?q=${encodeURIComponent(`${text} repo:${settings.owner}/${settings.repo}`)}&per_page=${max}`,
        { accept: 'application/vnd.github.text-match+json' },
      );
      const items = Array.isArray(data?.items) ? data.items : [];
      hits = items.slice(0, max).map((item) => ({
        path: item.path,
        fragments: Array.isArray(item.text_matches)
          ? item.text_matches.map((match) => String(match.fragment || '').slice(0, 240)).filter((part) => part !== '')
          : [],
      }));
    } catch (error) {
      hits = [];
    }
    if (hits.length > 0) return hits;
    const files = await listRemote(token, settings.inbox);
    const needle = text.toLowerCase();
    for (const file of files.slice(0, 40)) {
      if (hits.length >= max) break;
      const data = await readRemote(token, file.path, settings.branch).catch(() => null);
      if (data === null) continue;
      const index = data.text.toLowerCase().indexOf(needle);
      if (index === -1) continue;
      hits.push({
        path: file.path,
        fragments: [data.text.slice(Math.max(0, index - 60), index + 180).replace(/\s+/g, ' ')],
      });
    }
    return hits;
  }
  //#endregion

  function siteUrlOf(relative) {
    const base = settings.siteUrl.trim();
    if (base === '') return '';
    const stem = relative.replace(/\.(md|markdown)$/i, '');
    return base.replace(/\/+$/, '') + '/' + stem.split('/').map(encodeURIComponent).join('/');
  }

  async function mode() {
    return (await vaultReady()) ? 'local' : 'remote';
  }

  async function saveNote(input) {
    const title = typeof input?.title === 'string' && input.title.trim() !== '' ? input.title.trim() : '未命名';
    const body = typeof input?.body === 'string' ? input.body : '';
    const type = NOTE_TYPES.includes(input?.type) ? input.type : 'thought';
    const tags = Array.isArray(input?.tags)
      ? input.tags.map((tag) => String(tag).trim()).filter((tag) => tag !== '').slice(0, 12)
      : [];
    const source = typeof input?.source === 'string' ? input.source.trim() : '';
    const content = buildNote({ title, type, created: isoTimestamp(), tags, source }, body);

    if ((await vaultReady()) === true) {
      const relative = await uniqueLocalPath(title);
      return writeLocal(relative, content);
    }
    const token = await requireToken();
    const relative = await uniqueRemotePath(token, title);
    const data = await writeRemote(token, relative, content, `brain: add ${title}`);
    return {
      path: data?.content?.path ?? relative,
      sha: data?.content?.sha ?? '',
      url: siteUrlOf(relative),
      commit: data?.commit?.html_url ?? '',
    };
  }

  async function searchNotes(query, limit) {
    if ((await vaultReady()) === true) return searchLocal(query, limit);
    return searchRemote(query, limit);
  }

  function obsidianUrl(relative) {
    const name = path.basename(vault);
    const file = relative.replace(/\.(md|markdown)$/i, '');
    return `obsidian://open?vault=${encodeURIComponent(name)}&file=${encodeURIComponent(file)}`;
  }

  //#region client actions
  const actions = {
    async status() {
      const resolved = await resolveToken();
      let login = '';
      let valid = false;
      if (resolved.token !== '') {
        try {
          login = await checkUser(resolved.token);
          valid = login !== '';
        } catch {
          valid = false;
        }
      }
      return {
        configured: resolved.token !== '',
        source: resolved.source,
        valid,
        login,
        mode: await mode(),
        vaultPath: vault,
        sync: { ...syncState },
        config: { ...settings },
      };
    },

    async 'config.set'(input) {
      const editor = ctx.get('configEditor');
      const entry = ctx.fiber?.entry;
      if (editor === undefined || entry === undefined) throw new Error('当前 profile 不支持保存配置');
      const next = {
        owner: cleanCoordinate(input.owner, '仓库所有者'),
        repo: cleanCoordinate(input.repo, '仓库名'),
        branch: cleanCoordinate(input.branch, '分支'),
        inbox: cleanDir(typeof input.inbox === 'string' ? input.inbox : settings.inbox),
        siteUrl: typeof input.siteUrl === 'string' ? input.siteUrl.trim() : settings.siteUrl,
        vaultPath: typeof input.vaultPath === 'string' ? input.vaultPath.trim() : settings.vaultPath,
      };
      await editor.edit(entry, (current) => ({ ...current, ...next }));
      Object.assign(settings, next);
      return { ...settings };
    },

    async 'token.set'(input) {
      const token = cleanCoordinate(input.token, '访问令牌');
      const login = await checkUser(token);
      await storeToken(token);
      return { login };
    },

    async 'token.clear'() {
      await credentials.deleteRecord(TOKEN_KEY);
      return { cleared: true };
    },

    async 'token.importGh'() {
      const token = await execGhToken();
      const login = await checkUser(token);
      await storeToken(token);
      return { login };
    },

    async 'note.list'(input) {
      const dir = typeof input?.dir === 'string' && input.dir !== '' ? cleanDir(input.dir) : settings.inbox;
      if ((await vaultReady()) === true) return { dir, notes: await listLocal(dir) };
      const token = await requireToken();
      return { dir, notes: await listRemote(token, dir) };
    },

    async 'note.read'(input) {
      const relative = cleanPath(input.path);
      if ((await vaultReady()) === true) return readLocal(relative);
      const token = await requireToken();
      return readRemote(token, relative, settings.branch);
    },

    async 'note.write'(input) {
      const relative = cleanPath(input.path);
      const content = typeof input.content === 'string' ? input.content : '';
      if ((await vaultReady()) === true) return writeLocal(relative, content);
      const token = await requireToken();
      const message = typeof input.message === 'string' && input.message.trim() !== '' ? input.message.trim() : `brain: update ${relative}`;
      const data = await writeRemote(token, relative, content, message, input.sha);
      return {
        path: data?.content?.path ?? relative,
        sha: data?.content?.sha ?? '',
        commit: data?.commit?.html_url ?? '',
        url: siteUrlOf(relative),
      };
    },

    async 'note.delete'(input) {
      const relative = cleanPath(input.path);
      if ((await vaultReady()) === true) return deleteLocal(relative);
      const token = await requireToken();
      await gh(
        token,
        `/repos/${encodeURIComponent(settings.owner)}/${encodeURIComponent(settings.repo)}/contents/${encodeRepoPath(relative)}`,
        { method: 'DELETE', body: { message: `brain: remove ${relative}`, sha: input.sha, branch: settings.branch } },
      );
      return { removed: true };
    },

    async 'note.save'(input) {
      return saveNote(input);
    },

    async 'note.search'(input) {
      return { items: await searchNotes(input.query, input.limit) };
    },

    async 'sync.now'() {
      if (syncTimer !== null) {
        clearTimeout(syncTimer);
        syncTimer = null;
      }
      return runSync();
    },

    async 'sync.status'() {
      return { ...syncState };
    },

    async 'obsidian.url'(input) {
      return { url: obsidianUrl(cleanPath(input.path)) };
    },
  };
  //#endregion

  const disposeRoute = webServer.register({
    kind: 'exact',
    path: ROUTE,
    async handler(req, res) {
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, error: { code: 'method', message: '只接受 POST' } });
        return;
      }
      let request;
      try {
        request = JSON.parse(await readBody(req));
      } catch (error) {
        sendJson(res, 400, {
          ok: false,
          error: { code: 'bad-json', message: error instanceof Error ? error.message : '请求体不是 JSON' },
        });
        return;
      }
      const action = typeof request?.action === 'string' ? request.action : '';
      const run = actions[action];
      if (typeof run !== 'function') {
        sendJson(res, 404, { ok: false, error: { code: 'unknown-action', message: `未知操作：${action}` } });
        return;
      }
      try {
        const data = await run(request);
        sendJson(res, 200, { ok: true, data });
      } catch (error) {
        const status = error instanceof GhError && Number.isFinite(error.status) && error.status > 0 ? error.status : 500;
        sendJson(res, 200, {
          ok: false,
          error: {
            code: error instanceof GhError ? error.hint || 'github' : 'internal',
            status,
            message: error instanceof Error ? error.message : String(error),
          },
        });
      }
    },
  });
  ctx.effect(() => disposeRoute, 'brain: api route');

  //#region tools
  const tools = ctx.get('tools');
  if (tools !== undefined) {
    const text = (value) => [{ type: 'text', text: value }];
    const saveTool = {
      name: 'brain_save',
      description:
        'Save one note into the user\'s second-brain vault (a local Markdown folder synced to a private GitHub repository). Use it when the conversation produces something worth keeping long-term: a user idea, a decision with its reason, a conclusion backed by a source, a link to read later, or a task. Do not save small talk, secrets/tokens, or content the user asked not to record. The note appears in the sidebar and in Obsidian immediately.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string', description: 'Short unique note title; also used for the file name' },
          body: { type: 'string', description: 'Markdown body. [[wikilinks]] and #tags are allowed' },
          type: { type: 'string', enum: NOTE_TYPES, description: 'thought = own idea/reflection; clip = saved external material; quote = a passage worth keeping; task = something to do' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags, at most 12' },
          source: { type: 'string', description: 'Source URL for clips and quotes' },
        },
        required: ['title', 'body'],
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            path: { type: 'string' },
            sha: { type: 'string' },
            url: { type: 'string' },
            commit: { type: 'string' },
          },
          required: ['path'],
        },
        render: (_args, value) => text(`Saved ${value.path}`),
      },
      async execute(args) {
        return saveNote(args);
      },
    };

    const searchTool = {
      name: 'brain_search',
      description:
        'Search the second-brain vault for earlier notes: the user\'s own ideas, saved clips, quotes and tasks. Use it when the user refers to something from before ("上次那个结论", "我之前记过") or before saving a note that may already exist.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          query: { type: 'string', description: 'Search text; matched against note titles, bodies and tags' },
          limit: { type: 'integer', description: 'Max results, 1-20 (default 8)' },
        },
        required: ['query'],
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  path: { type: 'string' },
                  fragments: { type: 'array', items: { type: 'string' } },
                },
                required: ['path'],
              },
            },
          },
          required: ['items'],
        },
        render: (_args, value) => {
          if (value.items.length === 0) return text('No matching notes.');
          return text(
            value.items
              .map((item) => `- ${item.path}${item.fragments.length > 0 ? `\n  ${item.fragments[0]}` : ''}`)
              .join('\n'),
          );
        },
      },
      async execute(args) {
        return { items: await searchNotes(args?.query, args?.limit) };
      },
    };

    ctx.effect(() => {
      const disposers = [tools.register(saveTool), tools.register(searchTool)];
      return () => {
        for (const dispose of disposers) {
          if (typeof dispose === 'function') dispose();
        }
      };
    }, 'brain: tools');
  }
  //#endregion
}
