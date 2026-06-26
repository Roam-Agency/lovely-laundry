# Lovely Laundry — website

Marketing site for Lovely Laundry (Stockton-on-Tees), rebuilt as a static
HTML/CSS/JS site for deployment on Netlify. Now part of the same group as
**The Ironing Man** — the primary call to action throughout the site is to
book a doorstep pickup at https://ironing-man.co.uk/book.

## Structure

```
index.html        Home
pricing.html      Full price list (with live filter)
commercial.html   Commercial laundry + enquiry form
contact.html      Contact details, form, map
visit.html        Location, hours, directions
assets/
  styles.css      Design system + components
  main.js         Mobile nav + scroll reveal
  img/            Optimised WebP photos, logo, app-store badges
  icons/          Service category SVGs
netlify.toml      Build/redirect/header config
_redirects        Legacy /visit-store -> /visit.html redirect
robots.txt, sitemap.xml
Images/           Original source images (not served)
```

## Local preview

No build step. Serve the folder:

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

## Deploy (Netlify)

- Connect this repo in Netlify.
- Build command: *(none)*
- Publish directory: `.` (repo root)

Contact forms use Netlify Forms (`data-netlify="true"`); submissions appear
in the Netlify dashboard once deployed.

## Live pricing

The price list on `pricing.html` is fed from The Ironing Man pricing API so it
stays in sync with live prices instead of being hand-maintained.

- `netlify/functions/pricing.mjs` proxies the API **server-side** and is exposed
  at `/api/pricing`. The API key never reaches the browser.
- `assets/pricing.js` fetches `/api/pricing` on load and renders the list. If the
  request fails, the static prices in `pricing.html` are shown as a fallback, so
  the page is never broken.

### Required Netlify environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `LL_API_PRICING_KEY` | yes | Secret API key (already set in Netlify). Never commit this. |
| `LL_API_PRICING_URL` | yes | Upstream pricing endpoint URL. |
| `LL_API_PRICING_AUTH` | no | How the key is sent: `bearer` (default), `header`, or `query`. |
| `LL_API_PRICING_HEADER` | no | Header name when `AUTH=header` (default `x-api-key`). |
| `LL_API_PRICING_QUERY` | no | Query param name when `AUTH=query` (default `key`). |

The static fallback prices in `pricing.html` should be refreshed occasionally so
they remain a sensible backup.

## Brand

- Magenta `#9c1d8f`, plum `#4a0f4d`, lime accent `#b5d40e`
- Display: Fredoka · Body: Inter
