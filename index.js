/**
 * Host half of Second Brain.
 *
 * The writing page is browser state, but a second brain needs three things the
 * page cannot own:
 *
 *   - the GitHub token, kept in a credentials record (key `brain`) and never
 *     handed to the page;
 *   - the repository coordinates, kept in this row's plugin config so the
 *     agent-facing tools and the page read the same source of truth;
 *   - two tools (`brain_save`, `brain_search`) so the assistant can file what is
 *     worth keeping during a conversation instead of letting it evaporate.
 *
 * One exact route, POST /brain/api, carries small JSON commands; every GitHub
 * call resolves the token per request, so a rotated token reaches the next call
 * without a restart.
 */
import { execFile } from 'node:child_process';

const API = 'https://api.github.com';
const ROUTE = '/brain/api';
const TOKEN_KEY = 'brain';

const DEFAULTS = Object.freeze({
  owner: 'supeBam',
  repo: 'brain',
  branch: 'main',
  inbox: 'inbox',
  siteUrl: '',
});

const NOTE_TYPES = ['thought', 'clip', 'quote', 'task'];

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
  return base;
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

/** Relative path inside the repository, normalised for the Contents API. */
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

function encodeRepoPath(path) {
  return path
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
  const hours = pad(Math.floor(Math.abs(offset) / 60));
  const minutes = pad(Math.abs(offset) % 60);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${hours}:${minutes}`;
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
    const path = [process.env.PATH || '', '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin']
      .filter((part) => part !== '')
      .join(':');
    execFile(
      'gh',
      ['auth', 'token'],
      { timeout: 6000, windowsHide: true, env: { ...process.env, PATH: path } },
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

export const name = 'brain';
export const inject = ['webServer', 'credentials'];

export function apply(ctx, rawConfig) {
  const webServer = ctx.webServer;
  const credentials = ctx.credentials;
  const settings = normalizeConfig(rawConfig);

  async function resolveToken() {
    const record = await credentials.readRecord(TOKEN_KEY).catch(() => undefined);
    if (record !== undefined && record !== null) {
      if (record.kind === 'api-key' && typeof record.key === 'string' && record.key !== '') {
        return { token: record.key, source: 'record' };
      }
      if (record.kind === 'grant' && record.payload !== undefined && record.payload !== null) {
        const payload = record.payload;
        const value = typeof payload === 'string' ? payload : payload.token;
        if (typeof value === 'string' && value !== '') return { token: value, source: 'record' };
      }
    }
    const env = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    if (typeof env === 'string' && env.trim() !== '') return { token: env.trim(), source: 'env' };
    return { token: '', source: 'none' };
  }

  async function requireToken() {
    const resolved = await resolveToken();
    if (resolved.token === '') throw new GhError(401, '尚未配置 GitHub 访问令牌', 'token-missing');
    return resolved.token;
  }

  async function gh(token, path, init = {}) {
    const method = init.method || 'GET';
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
      response = await fetch(`${API}${path}`, { method, headers, body });
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

  async function readNote(token, path, ref) {
    const query = typeof ref === 'string' && ref !== '' ? `?ref=${encodeURIComponent(ref)}` : '';
    const data = await gh(token, `/repos/${encodeURIComponent(settings.owner)}/${encodeURIComponent(settings.repo)}/contents/${encodeRepoPath(path)}${query}`);
    if (data === null || typeof data !== 'object' || typeof data.content !== 'string') {
      throw new GhError(422, '该文件没有可读取的文本内容');
    }
    return { path: data.path, sha: data.sha, text: b64decode(data.content) };
  }

  async function listNotes(token, dir) {
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
      .filter((item) => item.type === 'file' && /\.(md|markdown|mdx)$/i.test(item.name))
      .map((item) => ({ name: item.name, path: item.path, sha: item.sha, size: item.size }))
      .sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
  }

  async function writeNote(token, path, content, message, sha) {
    const body = { message, content: b64encode(content), branch: settings.branch };
    if (typeof sha === 'string' && sha !== '') body.sha = sha;
    try {
      return await gh(
        token,
        `/repos/${encodeURIComponent(settings.owner)}/${encodeURIComponent(settings.repo)}/contents/${encodeRepoPath(path)}`,
        { method: 'PUT', body },
      );
    } catch (error) {
      if (error instanceof GhError && error.status === 422 && body.sha === undefined) {
        throw new GhError(409, `仓库里已经有同名文件：${path}`, 'file-exists');
      }
      throw error;
    }
  }

  /** Pick the first free `date-slug(-n).md` name; the date prefix keeps names unique. */
  async function uniquePath(token, title) {
    const base = `${today()}-${slugify(title)}`;
    const dir = settings.inbox === '' ? '' : `${settings.inbox}/`;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const name = attempt === 0 ? `${base}.md` : `${base}-${attempt + 1}.md`;
      const path = dir + name;
      try {
        await gh(
          token,
          `/repos/${encodeURIComponent(settings.owner)}/${encodeURIComponent(settings.repo)}/contents/${encodeRepoPath(path)}?ref=${encodeURIComponent(settings.branch)}`,
        );
      } catch (error) {
        if (error instanceof GhError && error.status === 404) return path;
        throw error;
      }
    }
    throw new GhError(409, '同名文件过多，请换一个标题');
  }

  async function saveNote(input) {
    const token = await requireToken();
    const title = typeof input?.title === 'string' && input.title.trim() !== '' ? input.title.trim() : '未命名';
    const rawBody = typeof input?.body === 'string' ? input.body : '';
    const type = NOTE_TYPES.includes(input?.type) ? input.type : 'thought';
    const tags = Array.isArray(input?.tags)
      ? input.tags.map((tag) => String(tag).trim()).filter((tag) => tag !== '').slice(0, 12)
      : [];
    const source = typeof input?.source === 'string' ? input.source.trim() : '';
    const path = await uniquePath(token, title);
    const content = buildNote({ title, type, created: isoTimestamp(), tags, source }, rawBody);
    const data = await writeNote(token, path, content, `brain: add ${title}`);
    return {
      path: data?.content?.path ?? path,
      sha: data?.content?.sha ?? '',
      url: siteUrlOf(path),
      commit: data?.commit?.html_url ?? '',
    };
  }

  function siteUrlOf(path) {
    const base = settings.siteUrl.trim();
    if (base === '') return '';
    const stem = path.replace(/\.(md|markdown|mdx)$/i, '');
    return base.replace(/\/+$/, '') + '/' + stem.split('/').map(encodeURIComponent).join('/');
  }

  async function searchNotes(query, limit) {
    const token = await requireToken();
    const text = String(query || '').trim();
    if (text === '') return [];
    const max = Math.max(1, Math.min(Number(limit) || 8, 20));
    try {
      const data = await gh(
        token,
        `/search/code?q=${encodeURIComponent(`${text} repo:${settings.owner}/${settings.repo}`)}&per_page=${max}`,
        { accept: 'application/vnd.github.text-match+json' },
      );
      const items = Array.isArray(data?.items) ? data.items : [];
      return items.slice(0, max).map((item) => ({
        path: item.path,
        fragments: Array.isArray(item.text_matches)
          ? item.text_matches.map((match) => String(match.fragment || '').slice(0, 240)).filter((part) => part !== '')
          : [],
      }));
    } catch (error) {
      /* Code search needs extra scopes and is rate-limited; fall back to the inbox. */
      const files = await listNotes(token, settings.inbox);
      const needle = text.toLowerCase();
      const hits = [];
      for (const file of files.slice(0, 40)) {
        if (hits.length >= max) break;
        const data = await readNote(token, file.path, settings.branch).catch(() => null);
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
      };
      await editor.edit(entry, (current) => ({ ...current, ...next }));
      Object.assign(settings, next);
      return { ...settings };
    },

    async 'token.set'(input) {
      const token = cleanCoordinate(input.token, '访问令牌');
      const login = await checkUser(token);
      await credentials.modifyRecord(TOKEN_KEY, async () => ({ kind: 'api-key', key: token }));
      return { login };
    },

    async 'token.clear'() {
      await credentials.deleteRecord(TOKEN_KEY);
      return { cleared: true };
    },

    async 'token.importGh'() {
      const token = await execGhToken();
      const login = await checkUser(token);
      await credentials.modifyRecord(TOKEN_KEY, async () => ({ kind: 'api-key', key: token }));
      return { login };
    },

    async 'note.list'(input) {
      const token = await requireToken();
      const dir = typeof input?.dir === 'string' && input.dir !== '' ? cleanDir(input.dir) : settings.inbox;
      return { dir, notes: await listNotes(token, dir) };
    },

    async 'note.read'(input) {
      const token = await requireToken();
      const path = cleanPath(input.path);
      return readNote(token, path, settings.branch);
    },

    async 'note.write'(input) {
      const token = await requireToken();
      const path = cleanPath(input.path);
      const content = typeof input.content === 'string' ? input.content : '';
      const message = typeof input.message === 'string' && input.message.trim() !== '' ? input.message.trim() : `brain: update ${path}`;
      const data = await writeNote(token, path, content, message, input.sha);
      return {
        path: data?.content?.path ?? path,
        sha: data?.content?.sha ?? '',
        commit: data?.commit?.html_url ?? '',
        url: siteUrlOf(path),
      };
    },

    async 'note.delete'(input) {
      const token = await requireToken();
      const path = cleanPath(input.path);
      const sha = cleanCoordinate(input.sha, '文件版本');
      await gh(
        token,
        `/repos/${encodeURIComponent(settings.owner)}/${encodeURIComponent(settings.repo)}/contents/${encodeRepoPath(path)}`,
        { method: 'DELETE', body: { message: `brain: remove ${path}`, sha, branch: settings.branch } },
      );
      return { removed: true };
    },

    async 'note.save'(input) {
      const note = await saveNote(input);
      return note;
    },

    async 'note.search'(input) {
      return { items: await searchNotes(input.query, input.limit) };
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
        'Save one note into the user\'s second-brain GitHub repository (Markdown vault). Use it when the conversation produces something worth keeping long-term: a user idea, a decision with its reason, a conclusion backed by a source, a link to read later, or a task. Do not save small talk, secrets/tokens, or content the user asked not to record. The note appears in the sidebar inbox immediately after the commit.',
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
        render: (_args, value) => text(`Saved ${value.path}${value.commit ? ` (${value.commit})` : ''}`),
      },
      async execute(args) {
        const note = await saveNote(args);
        return note;
      },
    };

    const searchTool = {
      name: 'brain_search',
      description:
        'Search the second-brain repository for earlier notes: the user\'s own ideas, saved clips, quotes and tasks. Use it when the user refers to something from before ("上次那个结论", "我之前记过") or before saving a note that may already exist.',
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
