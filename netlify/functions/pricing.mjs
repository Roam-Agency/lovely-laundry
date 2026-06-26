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

export default async (request) => {
  const key = process.env.LL_API_PRICING_KEY;
  if (!key) return json({ error: 'not_configured', detail: 'LL_API_PRICING_KEY is not set' }, 503);

  const debug = new URL(request.url).searchParams.get('debug') === '1';

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

  // Temporary diagnostics: /api/pricing?debug=1 reports the upstream structure
  // (field names + the distinct values of likely category fields) so the
  // category mapping can be confirmed against the real data. No prices rendered.
  if (debug) {
    const list = firstArray(data?.Products, data?.products, Array.isArray(data) ? data : null, data?.data) || [];
    const sample = list[0] || null;
    const categoryFieldValues = {};
    for (const k of ['category', 'categoryName', 'categoryID', 'categoryId', 'productCategory', 'type', 'categoryTitle']) {
      const vals = [...new Set(list.map((p) => p?.[k]).filter((v) => v !== undefined && v !== null))];
      if (vals.length) categoryFieldValues[k] = vals.slice(0, 50);
    }
    return json({
      debug: true,
      topLevelKeys: data && typeof data === 'object' ? Object.keys(data) : typeof data,
      productCount: list.length,
      productKeys: sample ? Object.keys(sample) : [],
      sampleProduct: sample,
      categoryFieldValues,
    });
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
// CleanCloud returns a flat product list (typically under "Products"), where
// each product carries its own category. We group products by category. The
// field-name lookups are deliberately tolerant so a minor API change won't break
// rendering. This is the single place to adjust once the real response is seen.
function normalise(data) {
  const flat = firstArray(data?.Products, data?.products, Array.isArray(data) ? data : null, data?.data);
  if (flat) return groupFlat(flat);

  // Fallback: a pre-grouped { categories: [ { name, items } ] } shape.
  const nested = data?.categories;
  if (Array.isArray(nested)) return groupNested(nested);

  return [];
}

function groupFlat(products) {
  const order = [];
  const byCat = new Map();
  for (const p of products) {
    const name = str(p?.name ?? p?.productName ?? p?.item ?? p?.title);
    const price = num(p?.price ?? p?.cost ?? p?.amount ?? p?.value);
    if (!name || price === null) continue;
    const cat = str(p?.category ?? p?.categoryName ?? p?.productCategory ?? p?.type) || 'Other';
    if (!byCat.has(cat)) {
      byCat.set(cat, []);
      order.push(cat);
    }
    byCat.get(cat).push({ name, price });
  }
  return order.map((c) => ({ name: c, groups: [{ name: null, items: byCat.get(c) }] }));
}

function groupNested(categories) {
  return categories
    .map((cat) => {
      const name = str(cat?.name ?? cat?.category ?? cat?.title);
      const items = (cat?.items ?? cat?.products ?? [])
        .map((it) => ({
          name: str(it?.name ?? it?.item ?? it?.title),
          price: num(it?.price ?? it?.amount ?? it?.cost),
        }))
        .filter((it) => it.name && it.price !== null);
      if (!name || !items.length) return null;
      return { name, groups: [{ name: null, items }] };
    })
    .filter(Boolean);
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
