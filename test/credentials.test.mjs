import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';
import { apply } from '../index.js';

test('saving a token in a fresh store writes a scoped credential', async (t) => {
  const records = new Map();
  let handler;
  t.mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    text: async () => '{"login":"test-user"}',
  }));
  apply({
    webServer: {
      register(route) {
        handler = route.handler;
        return () => {};
      },
    },
    credentials: {
      async listRecords() {
        return [...records.keys()].map((key) => ({ key }));
      },
      async readRecord(key) {
        return records.get(key);
      },
      async modifyRecord(key, update) {
        records.set(key, await update(records.get(key)));
      },
      async deleteRecord(key) {
        records.delete(key);
      },
    },
    effect() {},
    get() { return undefined; },
  }, {});

  async function request(action, fields = {}) {
    const req = Readable.from([Buffer.from(JSON.stringify({ action, ...fields }))]);
    req.method = 'POST';
    let reply;
    await handler(req, { writeHead() {}, end(body) { reply = JSON.parse(body); } });
    assert.equal(reply.ok, true);
    return reply.data;
  }

  await request('token.set', { token: 'test-only' });
  assert.deepEqual([...records.keys()], ['brain/github']);
  assert.equal((await request('status')).source, 'record');
  await request('token.clear');
  assert.equal(records.size, 0);
});
