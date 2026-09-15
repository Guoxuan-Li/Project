import { allowAction, clean, dbFor, json, readStory } from "../../../_lib/stories.js";

export async function onRequestPost(context) {
  let body;
  try { body = await context.request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }
  const title = clean(body.title, 80), author = clean(body.author, 40), content = clean(body.content, 3000);
  const parentId = Number(body.parent_id);
  if (!title || !author || !content || !Number.isInteger(parentId)) return json({ error: "Invalid passage." }, 400);
  const db = dbFor(context), slug = context.params.slug;
  try {
    if (!(await allowAction(db, context, "continue", 12))) return json({ error: "Please wait before writing again." }, 429);
    const parent = await db.prepare("SELECT id FROM story_nodes WHERE id = ? AND story_slug = ?").bind(parentId, slug).first();
    if (!parent) return json({ error: "Parent passage not found." }, 404);
    await db.prepare("INSERT INTO story_nodes (story_slug, parent_id, title, author, content) VALUES (?, ?, ?, ?, ?)").bind(slug, parentId, title, author, content).run();
    return json({ story: await readStory(db, slug) }, 201);
  } catch (error) { console.error(error); return json({ error: "Passage could not be saved." }, 500); }
}
