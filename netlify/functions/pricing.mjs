// Live pricing proxy for The Ironing Man API.
//
// WHY THIS EXISTS
// The Lovely Laundry price list used to be hand-maintained HTML, so it drifted
// out of date whenever the group's live prices changed. This function fetches
// the current prices from The Ironing Man pricing API and hands them to the
// pricing page, so the site always shows live figures.
//
// SECURITY
// The API key lives ONLY in the LL_API_PRICING_KEY environment variable (set in
// Netlify → Site settings → Environment variables). It is read server-side here
// and is never sent to the browser. Do not move the key into client-side code
// or commit it to the repo.
//
// CONFIGURATION (set in Netlify env vars)
//   LL_API_PRICING_KEY   (required)  the secret API key — already added by the owner
//   LL_API_PRICING_URL   (required)  the upstream pricing endpoint URL
//   LL_API_PRICING_AUTH  (optional)  how to send the key: "bearer" (default),
//                                    "header", or "query"
//   LL_API_PRICING_HEADER(optional)  header name when AUTH = "header" (default "x-api-key")
//   LL_API_PRICING_QUERY (optional)  query param name when AUTH = "query" (default "key")

const UPSTREAM_URL = process.env.LL_API_PRICING_URL || '';
const AUTH_STYLE = (process.env.LL_API_PRICING_AUTH || 'bearer').toLowerCase();
const AUTH_HEADER = process.env.LL_API_PRICING_HEADER || 'x-api-key';
const AUTH_QUERY = process.env.LL_API_PRICING_QUERY || 'key';

export default async () => {
  const key = process.env.LL_API_PRICING_KEY;
  if (!key) return json({ error: 'not_configured', detail: 'LL_API_PRICING_KEY is not set' }, 503);
  if (!UPSTREAM_URL) return json({ error: 'not_configured', detail: 'LL_API_PRICING_URL is not set' }, 503);

  let upstream;
  try {
    const url = new URL(UPSTREAM_URL);
    const headers = { Accept: 'application/json' };
    if (AUTH_STYLE === 'bearer') headers.Authorization = `Bearer ${key}`;
    else if (AUTH_STYLE === 'header') headers[AUTH_HEADER] = key;
    else if (AUTH_STYLE === 'query') url.searchParams.set(AUTH_QUERY, key);

    upstream = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
  } catch {
    return json({ error: 'upstream_unreachable' }, 502);
  }

  if (!upstream.ok) return json({ error: 'upstream_error', status: upstream.status }, 502);

  let data;
  try {
    data = await upstream.json();
  } catch {
    return json({ error: 'bad_upstream_payload' }, 502);
  }

  const categories = normalise(data);
  if (!categories.length) return json({ error: 'empty_pricing' }, 502);

  return json(
    { categories, updatedAt: new Date().toISOString() },
    200,
    {
      // Cache at Netlify's edge for 10 minutes and serve stale-while-revalidate,
      // so prices stay fresh without hammering the upstream API and a brief
      // outage never breaks the page.
      'Cache-Control': 'public, max-age=0, s-maxage=600, stale-while-revalidate=86400',
    }
  );
};

// --- Map the upstream response to the shape the pricing page renders --------
//
// Normalised output:
//   [ { name: "Dry Cleaning",
//       groups: [ { name: "Dress"|null, items: [ { name, price } ] } ] } ]
//
// This mapper is deliberately tolerant of a few common field names so it keeps
// working if the upstream tweaks its JSON. Once the real response is confirmed,
// this is the single place to adjust.
function normalise(data) {
  const rawCategories = data?.categories ?? data?.data ?? data ?? [];
  if (!Array.isArray(rawCategories)) return [];

  return rawCategories
    .map((cat) => {
      const name = str(cat?.name ?? cat?.category ?? cat?.title);
      const rawItems = cat?.items ?? cat?.products ?? cat?.prices ?? [];
      if (!Array.isArray(rawItems)) return null;

      // Group items by their optional sub-group label, preserving first-seen order.
      const groupOrder = [];
      const groups = new Map();
      for (const it of rawItems) {
        const itemName = str(it?.name ?? it?.item ?? it?.title ?? it?.description);
        const price = num(it?.price ?? it?.amount ?? it?.cost ?? it?.value);
        if (!itemName || price === null) continue;
        const groupName = str(it?.group ?? it?.subgroup ?? it?.sub ?? it?.section) || '';
        if (!groups.has(groupName)) {
          groups.set(groupName, []);
          groupOrder.push(groupName);
        }
        groups.get(groupName).push({ name: itemName, price });
      }

      const groupList = groupOrder
        .map((g) => ({ name: g || null, items: groups.get(g) }))
        .filter((g) => g.items.length);
      if (!name || !groupList.length) return null;
      return { name, groups: groupList };
    })
    .filter(Boolean);
}

function str(v) {
  return typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
}

function num(v) {
  if (typeof v === 'number' && isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[^0-9.]/g, ''));
    return isFinite(n) ? n : null;
  }
  return null;
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}
