const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers });
const dbFor = (context) => context.env.BLOG_DB || context.env.blog_message;

async function read(db) {
  const result = await db.prepare("SELECT key, value FROM site_stats").all();
  const stats = { homepage_likes: 0, total_visits: 0 };
  (result.results || []).forEach((row) => { if (row.key in stats) stats[row.key] = Number(row.value) || 0; });
  return stats;
}

export async function onRequestGet(context) {
  try { return json(await read(dbFor(context))); }
  catch (error) { console.error(error); return json({ error: "Stats unavailable." }, 500); }
}

export async function onRequestPost(context) {
  let body;
  try { body = await context.request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }
  const db = dbFor(context);
  try {
    if (body.action === "visit") await db.prepare("UPDATE site_stats SET value = value + 1 WHERE key = 'total_visits'").run();
    else if (body.action === "like" && Number.isInteger(body.count) && body.count > 0 && body.count <= 100)
      await db.prepare("UPDATE site_stats SET value = value + ? WHERE key = 'homepage_likes'").bind(body.count).run();
    else return json({ error: "Invalid stats action." }, 400);
    return json(await read(db));
  } catch (error) { console.error(error); return json({ error: "Stats update failed." }, 500); }
}
