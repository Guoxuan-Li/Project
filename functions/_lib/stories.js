export const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
export const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers });
export const dbFor = (context) => context.env.BLOG_DB || context.env.blog_message;
export const clean = (value, max) => typeof value === "string" ? value.trim().slice(0, max) : "";
export const slugify = (value) => clean(value, 80).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `story-${Date.now()}`;

export async function readStory(db, slug) {
  const story = await db.prepare("SELECT slug, title, description, likes, created_at FROM stories WHERE slug = ?").bind(slug).first();
  if (!story) return null;
  const nodes = await db.prepare("SELECT id, parent_id, title, author, content, created_at FROM story_nodes WHERE story_slug = ? ORDER BY created_at, id").bind(slug).all();
  story.nodes = nodes.results || [];
  return story;
}

export async function allowAction(db, context, action, limit = 12) {
  const ip = context.request.headers.get("CF-Connecting-IP") || "unknown";
  const key = `${action}:${ip}:${new Date().toISOString().slice(0, 13)}`;
  await db.prepare("INSERT INTO story_action_limits (action_key, count) VALUES (?, 1) ON CONFLICT(action_key) DO UPDATE SET count = count + 1").bind(key).run();
  const row = await db.prepare("SELECT count FROM story_action_limits WHERE action_key = ?").bind(key).first();
  return Number(row?.count) <= limit;
}
