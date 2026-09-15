import { dbFor, json, readStory } from "../../_lib/stories.js";

export async function onRequestGet(context) {
  try {
    const story = await readStory(dbFor(context), context.params.slug);
    return story ? json({ story }) : json({ error: "Story not found." }, 404);
  } catch (error) { console.error(error); return json({ error: "Story unavailable." }, 500); }
}

export async function onRequestPatch(context) {
  let body;
  try { body = await context.request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }
  if (body.action !== "like") return json({ error: "Invalid action." }, 400);
  const db = dbFor(context);
  try {
    await db.prepare("UPDATE stories SET likes = likes + 1 WHERE slug = ?").bind(context.params.slug).run();
    return json({ story: await readStory(db, context.params.slug) });
  } catch (error) { console.error(error); return json({ error: "Like failed." }, 500); }
}
