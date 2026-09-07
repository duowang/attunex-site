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
Run `npx wrangler deploy` from this repo (Cloudflare Workers static assets,
config in `wrangler.jsonc`, custom domains attunex.app + www.attunex.app).
NOTE: Cloudflare Workers Builds is NOT auto-deploying on push (verified
2026-09-03 — pushing to main did not update the live site after 10 min);
deploy manually with `wrangler deploy` until Builds is reconnected.

## After deploy
Add the domain in Google Search Console and submit `sitemap.xml` + `sitemap-people.xml`.

## Website search and handoff

The homepage loads `people/directory.v1.json`, generated alongside the person pages from the local graph. Names, bios, images, and counts are not maintained in website code. Search matches names and bio keywords, including accent-insensitive queries. The native form falls back to `/people?q=…`.

`site.css` carries the shared visual/accessibility rules. The homepage uses three static screenshots (no carousel or autoplay). QR handoffs are generated locally on request using vendored `qrcode-generator` 2.0.4 (`vendor/qrcode.js`, MIT license in its header), with no third-party QR service. Guest QR codes preserve the web page, not an app follow; the released app does not handle person links yet.

Pricing copy currently identifies the **1.5** free limit (three active people), checked against its release tag. Development builds have a five-person limit; update the FAQ in both `index.html` and `support.html` when that version is public. Keep the support FAQ JSON-LD synchronized.

## Web preview (`/demo`)

`demo/` is a small HTML/CSS/JS clone of the app's core flow (Listen feed, Search, person and podcast pages, follow with the free limit, Now Playing, the Read queue, Settings), embedded in the homepage hero as a phone frame and linkable on its own at `/demo/` (`/demo/?p=<slug>` opens a person). It runs on static JSON only:

- `demo/data/p/<slug>.json` (per person), `demo/data/s/<show-id>.json` (per show, shows with 8+ graph episodes), `demo/data/shows.json` (show index). The people index is `people/directory.v1.json`.
- Regenerate with the person pages: `python3 ~/code/attunex/graph-pipeline/generate_demo_data.py` (reads `people.db`, writes here). Same slugs and publish gate as `/p`.
- Follows, playback positions, and theme live in the visitor's `localStorage`; the free limit (5 active people) and the Pro copy mirror the app. Audio streams from the publishers' enclosure URLs. Transcripts and summaries are not generated on the web; the Read tab shows one real summary from the App Store screenshot plus the publisher's notes.

## Explore the podcast graph

`/explore` is a responsive, full-size graph experience. The homepage links to it and
embeds a compact, real-data path. Start with a person, select a podcast or neighbor,
listen to the supporting episodes, and recenter on another person. Solid lines
mean a shared show; dotted lines mean a shared episode (including compilations).
Follows use `attunex-explore-follows-v1` in localStorage, separate from the older
`/demo` preview and the iPhone app; there is no account synchronization.

Data comes from the same `db.connection_payloads` projection as the native app.
The site ships static public JSON, with no graph API credential and no requests
to production D1. It loads one neighborhood at a time and keeps a bounded cache.
Refresh from the local graph after pipeline updates:

```bash
cd ~/code/attunex
python3 graph-pipeline/generate_explore_data.py
```

This writes `explore/data/index.json` and `explore/data/p/<graph-id>.json`, including
empty neighborhoods so every linked person has a valid destination. Existing SEO
slugs are retained only when present in `people/directory.v1.json`. It does not
regenerate SEO or demo assets. Data updates require the usual manual site deploy.

Verify the graph evidence, geometry, and search helpers before deployment:

```bash
node --test tests/explore-model.test.mjs
node --check explore/explore.js
npx wrangler deploy --dry-run
```

Explore and `/demo` require full document navigation: each owns its scripts,
styles, and audio player. The shared `app.js` soft-navigation handler excludes
these routes (including history navigation). Keep homepage entry links marked
`target="_self"` so older cached copies of the shared script also leave them alone.
Regression check: `node --test tests/navigation.test.mjs`.
