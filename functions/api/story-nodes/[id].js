import { allowAction, clean, dbFor, json, readStory } from "../../_lib/stories.js";

export async function onRequestPatch(context) {
  let body;
  try { body = await context.request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }
  const id = Number(context.params.id);
  const title = clean(body.title, 80), author = clean(body.author, 40), content = clean(body.content, 3000);
  if (!Number.isInteger(id) || !title || !author || !content) return json({ error: "Invalid passage." }, 400);
  const db = dbFor(context);
  try {
    if (!(await allowAction(db, context, "edit", 12))) return json({ error: "Please wait before editing again." }, 429);
    const node = await db.prepare("SELECT story_slug FROM story_nodes WHERE id = ?").bind(id).first();
    if (!node) return json({ error: "Passage not found." }, 404);
    await db.prepare("UPDATE story_nodes SET title = ?, author = ?, content = ? WHERE id = ?").bind(title, author, content, id).run();
    return json({ story: await readStory(db, node.story_slug) });
  } catch (error) { console.error(error); return json({ error: "Passage could not be edited." }, 500); }
}
