import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './src/index.js';

function environment() {
  const rows = [];
  const images = new Map();
  return {
    ALLOWED_ORIGINS: 'https://guoxuan-li.github.io',
    UPLOAD_KEY: 'a-long-private-test-key',
    GALLERY_IMAGES: {
      put: async (key, body, options) => images.set(key, { body: new Blob([await new Response(body).arrayBuffer()]), httpMetadata: options.httpMetadata }),
      get: async key => images.get(key) || null,
      delete: async key => images.delete(key)
    },
    GALLERY_DB: {
      prepare(sql) {
        return {
          bind(...values) {
            return {
              all: async () => ({ results: rows.filter(row => row.kind === values[0]) }),
              run: async () => {
                if (sql.startsWith('INSERT')) rows.push({ id: values[0], kind: values[1], title: values[2], location: values[3], caption: values[4], story: values[5], created_at: '2026-09-18 12:00:00' });
                if (sql.startsWith('DELETE')) rows.splice(rows.findIndex(row => row.id === values[0]), 1);
              }
            };
          }
        };
      }
    }
  };
}

test('only owner can upload, and public visitors see the same image and caption', async () => {
  const env = environment();
  const data = new FormData();
  for (const [key, value] of Object.entries({ kind: 'food', title: '晚餐', location: '伦敦', caption: '虾与晚霞', story: '一次旅行' })) data.set(key, value);
  data.set('image', new File(['fake image'], 'photo.jpg', { type: 'image/jpeg' }));
  const request = key => new Request('https://x-gx-h-gallery-api.example.workers.dev/items', { method: 'POST', headers: { origin: 'https://guoxuan-li.github.io', authorization: `Bearer ${key}` }, body: data });
  assert.equal((await worker.fetch(request('wrong'), env)).status, 401);
  assert.equal((await worker.fetch(request(env.UPLOAD_KEY), env)).status, 201);
  const list = await worker.fetch(new Request('https://x-gx-h-gallery-api.example.workers.dev/items?kind=food', { headers: { origin: 'https://guoxuan-li.github.io' } }), env);
  const { items } = await list.json();
  assert.equal(items.length, 1);
  assert.equal(items[0].caption, '虾与晚霞');
  const photo = await worker.fetch(new Request(items[0].image), env);
  assert.equal(photo.status, 200);
  assert.equal(photo.headers.get('content-type'), 'image/jpeg');
  assert.equal(await photo.text(), 'fake image');
});
