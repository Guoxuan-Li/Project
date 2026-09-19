const KINDS = new Set(['travels', 'food', 'animals', 'crafts']);
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']);
const MAX_BYTES = 8 * 1024 * 1024;

function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });
}

async function equal(a, b) {
  if (!a || !b) return false;
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b))
  ]);
  const x = new Uint8Array(left);
  const y = new Uint8Array(right);
  let difference = 0;
  for (let i = 0; i < x.length; i++) difference |= x[i] ^ y[i];
  return difference === 0;
}

async function hash(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('origin');
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean);
    const cors = origin && allowed.includes(origin) ? {
      'access-control-allow-origin': origin,
      'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
      'access-control-allow-headers': 'authorization, content-type',
      'vary': 'Origin'
    } : {};
    if (request.method === 'OPTIONS') return new Response(null, { status: origin && !allowed.includes(origin) ? 403 : 204, headers: cors });
    if (origin && !allowed.includes(origin)) return json({ error: 'Origin not allowed' }, 403);
    if (!env.GALLERY_DB || !env.GALLERY_IMAGES) return json({ error: 'Storage is not configured' }, 503, cors);
    const path = url.pathname.replace(/\/$/, '');

    try {
      if (path === '/comments' && request.method === 'GET') {
        const result = await env.GALLERY_DB.prepare("SELECT id, name, content, created_at FROM guestbook_comments WHERE status = 'approved' ORDER BY created_at DESC LIMIT 100").all();
        return json({ comments: result.results }, 200, { ...cors, 'cache-control': 'no-store' });
      }

      if (path === '/comments' && request.method === 'POST') {
        if (Number(request.headers.get('content-length')) > 5000) return json({ error: '留言内容太长' }, 413, cors);
        const data = await request.json().catch(() => null);
        const name = String(data?.name || '').trim();
        const content = String(data?.content || '').trim();
        if (data?.website) return json({ ok: true }, 201, cors);
        if (!name || !content || name.length > 30 || content.length > 500) return json({ error: '昵称需要 1–30 字，留言需要 1–500 字' }, 400, cors);
        const ip = request.headers.get('cf-connecting-ip') || 'unknown';
        const ipHash = await hash(`${env.UPLOAD_KEY || 'guestbook'}:${ip}`);
        const latest = await env.GALLERY_DB.prepare('SELECT created_at FROM guestbook_comments WHERE ip_hash = ? ORDER BY created_at DESC LIMIT 1').bind(ipHash).first();
        if (latest?.created_at) {
          const lastPost = Date.parse(String(latest.created_at).replace(' ', 'T') + 'Z');
          if (Date.now() - lastPost < 60000) return json({ error: '请稍等一分钟再留言' }, 429, cors);
        }
        const result = await env.GALLERY_DB.prepare('INSERT INTO guestbook_comments (name, content, ip_hash) VALUES (?, ?, ?) RETURNING id, name, content, created_at').bind(name, content, ipHash).first();
        return json(result, 201, cors);
      }

      const commentMatch = /^\/comments\/(\d+)$/.exec(path);
      if (commentMatch && request.method === 'DELETE') {
        if (!env.UPLOAD_KEY || !await equal(request.headers.get('authorization') || '', `Bearer ${env.UPLOAD_KEY}`)) return json({ error: '站主密钥不正确' }, 401, cors);
        await env.GALLERY_DB.prepare('DELETE FROM guestbook_comments WHERE id = ?').bind(Number(commentMatch[1])).run();
        return json({ ok: true }, 200, cors);
      }

      if (path === '/items' && request.method === 'GET') {
        const kind = url.searchParams.get('kind');
        if (!KINDS.has(kind)) return json({ error: 'Invalid section' }, 400, cors);
        const result = await env.GALLERY_DB.prepare('SELECT id, kind, title, location, caption, story, created_at FROM gallery_items WHERE kind = ? ORDER BY created_at DESC LIMIT 200').bind(kind).all();
        return json({ items: result.results.map(item => ({ ...item, image: `${url.origin}/images/${item.id}` })) }, 200, { ...cors, 'cache-control': 'no-store' });
      }

      const imageMatch = /^\/images\/([a-f0-9-]{36})$/.exec(path);
      if (imageMatch && request.method === 'GET') {
        const object = await env.GALLERY_IMAGES.getWithMetadata(imageMatch[1], 'arrayBuffer');
        if (!object.value) return json({ error: 'Image not found' }, 404, cors);
        return new Response(object.value, { headers: { ...cors, 'content-type': object.metadata?.contentType || 'application/octet-stream', 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' } });
      }

      if (path === '/items' && request.method === 'POST') {
        if (!env.UPLOAD_KEY || !await equal(request.headers.get('authorization') || '', `Bearer ${env.UPLOAD_KEY}`)) return json({ error: '上传密钥不正确' }, 401, cors);
        if (Number(request.headers.get('content-length')) > MAX_BYTES + 30000) return json({ error: '图片不能超过 8 MB' }, 413, cors);
        const data = await request.formData();
        const image = data.get('image');
        const kind = String(data.get('kind') || '');
        const title = String(data.get('title') || '').trim();
        const location = String(data.get('location') || '').trim();
        const caption = String(data.get('caption') || '').trim();
        const story = String(data.get('story') || '').trim();
        if (!KINDS.has(kind) || !title || !caption || title.length > 60 || location.length > 50 || caption.length > 180 || story.length > 600) return json({ error: '请检查标题、地点和配字' }, 400, cors);
        if (!(image instanceof File) || !TYPES.has(image.type) || image.size === 0 || image.size > MAX_BYTES) return json({ error: '请选择 8 MB 以内的 JPG、PNG、WebP、AVIF 或 GIF 图片' }, 400, cors);
        const id = crypto.randomUUID();
        await env.GALLERY_IMAGES.put(id, image.stream(), { metadata: { contentType: image.type } });
        try {
          await env.GALLERY_DB.prepare('INSERT INTO gallery_items (id, kind, title, location, caption, story) VALUES (?, ?, ?, ?, ?, ?)').bind(id, kind, title, location, caption, story).run();
        } catch (error) {
          await env.GALLERY_IMAGES.delete(id);
          throw error;
        }
        return json({ id, kind, title, location, caption, story, image: `${url.origin}/images/${id}` }, 201, cors);
      }

      const itemMatch = /^\/items\/([a-f0-9-]{36})$/.exec(path);
      if (itemMatch && request.method === 'DELETE') {
        if (!env.UPLOAD_KEY || !await equal(request.headers.get('authorization') || '', `Bearer ${env.UPLOAD_KEY}`)) return json({ error: '上传密钥不正确' }, 401, cors);
        await env.GALLERY_DB.prepare('DELETE FROM gallery_items WHERE id = ?').bind(itemMatch[1]).run();
        await env.GALLERY_IMAGES.delete(itemMatch[1]);
        return json({ ok: true }, 200, cors);
      }
      return json({ error: 'Not found' }, 404, cors);
    } catch (error) {
      console.error(error);
      return json({ error: '云端暂时无法处理请求，请稍后重试' }, 500, cors);
    }
  }
};
