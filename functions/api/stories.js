import { allowAction, clean, dbFor, json, readStory, slugify } from "../_lib/stories.js";

export async function onRequestGet(context) {
  try {
    const result = await dbFor(context).prepare(`
      SELECT s.slug, s.title, s.description, s.likes, COUNT(n.id) AS node_count
      FROM stories s LEFT JOIN story_nodes n ON n.story_slug = s.slug
      GROUP BY s.slug ORDER BY s.created_at DESC`).all();
    return json({ stories: result.results || [] });
  } catch (error) { console.error(error); return json({ error: "Stories unavailable." }, 500); }
}

export async function onRequestPost(context) {
  let body;
  try { body = await context.request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }
  const title = clean(body.title, 80), author = clean(body.author, 40), content = clean(body.content, 3000);
  if (!title || !author || !content) return json({ error: "Title, author, and passage are required." }, 400);
  const db = dbFor(context);
  try {
    if (!(await allowAction(db, context, "create", 5))) return json({ error: "Please wait before creating another story." }, 429);
    let slug = slugify(title);
    const collision = await db.prepare("SELECT slug FROM stories WHERE slug = ?").bind(slug).first();
    if (collision) slug += `-${Date.now().toString(36)}`;
    await db.batch([
      db.prepare("INSERT INTO stories (slug, title, description) VALUES (?, ?, ?)").bind(slug, title, clean(body.description, 180) || "A collaborative story."),
      db.prepare("INSERT INTO story_nodes (story_slug, parent_id, title, author, content) VALUES (?, NULL, 'Opening', ?, ?)").bind(slug, author, content)
    ]);
    return json({ story: await readStory(db, slug) }, 201);
  } catch (error) { console.error(error); return json({ error: "Story could not be created." }, 500); }
}
