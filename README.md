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

## Brand

- Magenta `#9c1d8f`, plum `#4a0f4d`, lime accent `#b5d40e`
- Display: Fredoka · Body: Inter
