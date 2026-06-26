// Live pricing proxy for the CleanCloud API (The Ironing Man's POS platform).
//
// WHY THIS EXISTS
// The Lovely Laundry price list used to be hand-maintained HTML, so it drifted
// out of date whenever the group's live prices changed. This function fetches
// the current products from CleanCloud (cleancloudapp.com) and hands them to the
// pricing page, so the site always shows live figures.
//
// SECURITY
// The API key lives ONLY in the LL_API_PRICING_KEY environment variable (set in
// Netlify → Site settings → Environment variables). It is read server-side here
// and is never sent to the browser. Do not move the key into client-side code
// or commit it to the repo.
//
// CleanCloud API: POST https://cleancloudapp.com/api/getProducts
//   body: { "api_token": "<key>", "priceListID": <optional> }
//   docs: https://cleancloudapp.com/api
//
// CONFIGURATION (set in Netlify env vars)
//   LL_API_PRICING_KEY    (required)  the CleanCloud API token — already added by the owner
//   LL_API_PRICING_URL    (optional)  override the endpoint (default getProducts)
//   LL_API_PRICELIST_ID   (optional)  CleanCloud price list ID, if not the default list

const UPSTREAM_URL = process.env.LL_API_PRICING_URL || 'https://cleancloudapp.com/api/getProducts';
const PRICE_LIST_ID = process.env.LL_API_PRICELIST_ID || '';

export default async () => {
  const key = process.env.LL_API_PRICING_KEY;
  if (!key) return json({ error: 'not_configured', detail: 'LL_API_PRICING_KEY is not set' }, 503);

  const payload = { api_token: key };
  if (PRICE_LIST_ID) payload.priceListID = PRICE_LIST_ID;

  let upstream;
  try {
    upstream = await fetch(UPSTREAM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return json({ error: 'upstream_unreachable' }, 502);
  }

  const raw = await upstream.text();

  if (!upstream.ok) {
    // Short, non-sensitive excerpt to make misconfiguration easy to diagnose by
    // visiting /api/pricing directly.
    return json({ error: 'upstream_error', status: upstream.status, detail: raw.slice(0, 200) }, 502);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return json({ error: 'bad_upstream_payload', hint: raw.slice(0, 120) }, 502);
  }

  // CleanCloud signals failures (e.g. a bad token) with success:"0" and an error.
  if (data && (data.success === '0' || data.success === 0 || data.success === false)) {
    return json({ error: 'cleancloud_error', detail: str(data.error) || 'request rejected' }, 502);
  }

  const categories = normalise(data);
  if (!categories.length) return json({ error: 'empty_pricing' }, 502);

  return json(
    { categories, updatedAt: new Date().toISOString() },
    200,
    {
      // Cache at Netlify's edge for 10 minutes and serve stale-while-revalidate,
      // so prices stay fresh without hammering the API and a brief outage never
      // breaks the page.
      'Cache-Control': 'public, max-age=0, s-maxage=600, stale-while-revalidate=86400',
    }
  );
};

// --- Map the CleanCloud response to the shape the pricing page renders ------
//
// Normalised output:
//   [ { name: "Dry Cleaning",
//       groups: [ { name: null, items: [ { name, price } ] } ] } ]
//
// CleanCloud returns a flat product list under "Products". Each product has a
// numeric `section` id; the human category name + display order come from the
// top-level `SectionsMap` (an array of { id, name, order }). Products are ordered
// within a section by `sortOrder`. Price 0 / blank means "price on application"
// and is passed through as null so the page can show "POA".
function normalise(data) {
  const products = firstArray(data?.Products, data?.products, data?.data);
  if (!products) return [];

  // section id -> { name, order }
  const sections = new Map();
  if (Array.isArray(data?.SectionsMap)) {
    for (const s of data.SectionsMap) {
      const id = str(s?.id);
      if (id) sections.set(id, { name: str(s?.name) || `Section ${id}`, order: num(s?.order) ?? 999 });
    }
  }

  const bySection = new Map();
  for (const p of products) {
    const name = str(p?.name);
    if (!name) continue;
    const sectionId = str(p?.section);
    const sec = sections.get(sectionId) || { name: 'Other', order: 998 };
    if (!bySection.has(sectionId)) {
      bySection.set(sectionId, { name: sec.name, order: sec.order, items: [] });
    }
    const priceNum = num(p?.price);
    bySection.get(sectionId).items.push({
      name,
      price: priceNum && priceNum > 0 ? priceNum : null, // null -> POA
      sortOrder: num(p?.sortOrder) ?? 0,
    });
  }

  return [...bySection.values()]
    .filter((c) => c.items.length)
    .sort((a, b) => a.order - b.order)
    .map((c) => {
      c.items.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
      return { name: c.name, groups: [{ name: null, items: c.items.map(({ name, price }) => ({ name, price })) }] };
    });
}

function firstArray(...candidates) {
  for (const c of candidates) if (Array.isArray(c) && c.length) return c;
  return null;
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
