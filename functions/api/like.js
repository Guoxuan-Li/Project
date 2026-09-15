const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers });

export async function onRequestPost(context) {
  let body;
  try { body = await context.request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }
  const id = Number(body.id);
  if (!Number.isInteger(id) || id < 1 || typeof body.liked !== "boolean") return json({ error: "Invalid like." }, 400);
  const db = context.env.BLOG_DB || context.env.blog_message;
  try {
    await db.prepare(body.liked
      ? "UPDATE comments SET likes = likes + 1 WHERE id = ? AND status = 'approved'"
      : "UPDATE comments SET likes = MAX(0, likes - 1) WHERE id = ? AND status = 'approved'").bind(id).run();
    const row = await db.prepare("SELECT likes FROM comments WHERE id = ?").bind(id).first();
    return json({ liked: body.liked, likes: Number(row?.likes) || 0 });
  } catch (error) { console.error(error); return json({ error: "Like failed." }, 500); }
}
