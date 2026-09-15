const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { ...JSON_HEADERS, ...(init.headers || {}) },
  });
}

function cleanText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

async function hashIp(ip, salt = "") {
  if (!ip) return null;
  const bytes = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function onRequestGet(context) {
  try {
    const db = context.env.BLOG_DB || context.env.blog_message;
    const result = await db
      .prepare(`
        SELECT
          id,
          name,
          content,
          parent_id,
          likes,
          CASE WHEN public_contact = TRUE THEN contact ELSE NULL END AS contact,
          created_at
        FROM comments
        WHERE status = 'approved'
        ORDER BY created_at DESC, id DESC
      `)
      .all();

    return json({ comments: result.results || [] });
  } catch (error) {
    console.error("Failed to read comments", error);
    return json({ error: "Messages could not be loaded. Please try again later." }, { status: 500 });
  }
}

export async function onRequestPost(context) {
  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid request format." }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ error: "Malformed request body." }, { status: 400 });
  }

  // Honeypot field: real visitors never fill it in.
  if (body.company) return json({ error: "Unable to submit message." }, { status: 400 });

  const name = cleanText(body.name, 40);
  const content = cleanText(body.content, 1000);
  const contact = cleanText(body.contact, 120) || null;
  const publicContact = Boolean(contact) && body.public_contact === true;
  const parentId = Number.isInteger(body.parent_id) && body.parent_id > 0
    ? body.parent_id
    : null;

  if (!name || !content) {
    return json({ error: "Please provide your name and a message." }, { status: 400 });
  }
  const ip = context.request.headers.get("CF-Connecting-IP") || "";
  const ipHash = await hashIp(ip, context.env.IP_HASH_SALT || "");
  const country = cleanText(context.request.cf?.country, 8) || null;
  const city = cleanText(context.request.cf?.city, 100) || null;

  try {
    const db = context.env.BLOG_DB || context.env.blog_message;
    if (parentId !== null) {
      const parent = await db
        .prepare("SELECT id FROM comments WHERE id = ? AND status = 'approved' AND parent_id IS NULL")
        .bind(parentId)
        .first();

      if (!parent) {
        return json({ error: "The message you are replying to no longer exists." }, { status: 400 });
      }
    }

    const result = await db
      .prepare(`
        INSERT INTO comments (
          name, content, contact, public_contact, ip_hash, country, city, parent_id, status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'approved')
        RETURNING id, name, content, parent_id, created_at
      `)
      .bind(name, content, contact, publicContact ? 1 : 0, ipHash, country, city, parentId)
      .first();

    return json({ comment: result }, { status: 201 });
  } catch (error) {
    console.error("Failed to create comment", error);
    return json({ error: "Your message could not be saved. Please try again later." }, { status: 500 });
  }
}
