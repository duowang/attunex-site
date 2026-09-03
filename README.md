# Attunex site

Public marketing, support, and privacy site for [Attunex](https://apps.apple.com/us/app/attunex-podcast-player/id6786431074),
an iOS app for following people across podcasts. Hosted on **Cloudflare Workers
static assets** at [attunex.app](https://attunex.app/) (`wrangler.jsonc`, `assets.directory: "."`).

## Pages (hand-authored)
- `index.html` — landing page (Open Graph, `MobileApplication`/`WebSite` JSON-LD).
- `about.html` — who builds Attunex (`/about`; E-E-A-T / trust signal).
- `support.html` — contact + FAQ (`/support`; `FAQPage` JSON-LD).
- `privacy.html` — privacy policy (`/privacy`). Referenced from App Store Connect.
- `robots.txt` — allows crawling; points to both sitemaps.
- `sitemap.xml` — core pages.

These URLs are referenced from App Store Connect (Support URL, Marketing URL, Privacy Policy URL).

## Generated person pages (SEO — "every podcast episode featuring X")
- `p/<slug>.html` — one page per swept person (`/p/<slug>`).
- `people/index.html` — browse hub (`/people`).
- `sitemap-people.xml` — sitemap for the above.

These are **generated** from the people graph and should be regenerated before
deploy (the generator lives in the pipeline repo, which holds `people.db`):
```
cd ~/code/attunex/graph-pipeline
python3 generate_person_pages.py        # writes into ~/attunex-site: p/, people/index.html, sitemap-people.xml
```
Quality gates: swept people only (`pulled_at`), featured appearances on non-AI
shows only, >=2 appearances to publish. Coverage is stated "as of <date>" per page.

`people/curated-people.v1.json` is an existing app data asset — leave it in place.

## Deploy
Push to `main` — Cloudflare Workers Builds deploys automatically using `wrangler.jsonc`.
Manual fallback: `npx wrangler deploy`.

## After deploy
Add the domain in Google Search Console and submit `sitemap.xml` + `sitemap-people.xml`.
