const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "public, max-age=60, s-maxage=60",
};

export async function onRequest(context) {
  const cf = context.request.cf || {};
  return new Response(JSON.stringify({
    country: cf.country || null,
    city: cf.city || null,
    latitude: cf.latitude != null ? Number(cf.latitude) : null,
    longitude: cf.longitude != null ? Number(cf.longitude) : null,
    timezone: cf.timezone || null,
  }), { headers: JSON_HEADERS });
}
