---
name: ui-images
description: "Finds, picks and downloads free stock photos from Pexels and Pixabay that fit a web design, records credits and license links, and writes responsive img markup. Use for 'find images', 'stock photos', 'hero image', 'background photo', 'Pexels', 'Pixabay', 'need pictures for the site', 'ui images'."
---

# UI Images

Fill a web UI with free stock photos that match `DESIGN.md`, within the license and API terms. The script `scripts/stock_search.py` (in this skill folder, `${CLAUDE_SKILL_DIR}` in Claude Code) does the API calls, the 24-hour cache, downloads and the credits file; run it, do not reimplement it.

Notes are read in place, never copied, under `${SKILLS_TREE:-/run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE}/knowledge/web-development/items/`:
- `fe-stock-images.md` - what the licenses allow, API rules (attribution, hotlinking, caching), picking images that fit
- `fe-media-assets.md` - formats, `srcset`, dimensions, lazy loading and the LCP image

## Steps

Copy this checklist into your reply and tick it off:

```
- [ ] 1 Brief: slots and imagery direction
- [ ] 2 Keys checked
- [ ] 3 Searched, shortlist shown with sources
- [ ] 4 User picked
- [ ] 5 Downloaded, credits recorded
- [ ] 6 Markup with dimensions, srcset, alt
- [ ] 7 License risks checked
```

1. **Brief.** List the image slots (hero, section backgrounds, cards, team placeholder) with layout size and aspect ratio. Read `DESIGN.md`: brand words and `Style:`, the `- Imagery:` line under `## Tokens` (subject, mood, people or not, color treatment) and `## Forbidden`. No `DESIGN.md`: ask for brand words and mood in one message, or suggest `ui-brief`. For each slot write a search query of concrete subject plus mood words (for example `team meeting bright office` rather than `business`), plus orientation and color.
2. **Keys.** The script reads `PEXELS_API_KEY` and `PIXABAY_API_KEY` from the environment. Exit code 3 means none is set: tell the user to create free keys at https://www.pexels.com/api/ and https://pixabay.com/api/docs/ and export them (one provider is enough). Never ask the user to paste a key into chat or a file in the repository, and never put a key in client-side code. Without keys, do not fetch or scrape the sites (both Terms ban robots). Offer the manual path instead: give the user the search queries from step 1; they browse pexels.com or pixabay.com, download the chosen files into the `--out-dir` folder and send each photo page URL and photographer name. Add an entry per file to `<out-dir>/stock-credits.json` by hand with the script's fields (`provider`, `id`, `files`, `photographer`, `photographer_url`, `page_url`, `license_url`, `alt_draft`, `original_width`, `original_height`, `downloaded`), read the pixel size from the file, then continue at step 6.
3. **Search** per slot:

   ```bash
   python3 "${CLAUDE_SKILL_DIR}/scripts/stock_search.py" search "mountain lake dawn" --orientation landscape --min-width 1920 --per-page 10
   ```

   Options: `--provider pexels|pixabay|all` (default all), `--color`, `--locale vi-VN`, `--page`, `--no-cache`. Output is JSON with `results` (provider, id, size, `page_url`, photographer, `alt_draft`, `avg_color`, `preview_url`). Exit 4 is a provider error (bad key, rate limit, network): read the message, switch provider or wait. Responses are cached for 24 hours as Pixabay requires; do not pass `--no-cache` in loops.
4. **Shortlist.** Drop results that miss the slot (too small for the layout width at 2x, wrong ratio, visible logos or brands, text in the image, faces where `## Forbidden` or the context rules them out). Show 3-5 per slot as a table: preview link, provider, photographer, size, why it fits. Name the source in the table (`Pexels`, `Pixabay`), as both APIs require wherever results are shown. The user picks; with a browser or image tool you may view previews first, otherwise say you judged from metadata.
5. **Download** each pick into the project's static folder:

   ```bash
   python3 "${CLAUDE_SKILL_DIR}/scripts/stock_search.py" download pexels 2014422 --widths 640,1280,1920 --out-dir public/images/stock --url-prefix /images/stock --name hero-lake
   python3 "${CLAUDE_SKILL_DIR}/scripts/stock_search.py" download pixabay 736885 --out-dir public/images/stock --url-prefix /images/stock --name about-forest
   ```

   Pick `--out-dir` and `--url-prefix` from the framework (`public/` for Vite and Next.js, `static/` for SvelteKit and Hugo, `src/assets/` when the bundler should process images). The script refuses non-image responses, files over 25 MB and hosts other than Pexels and Pixabay (exit 5). It appends to `<out-dir>/stock-credits.json` (photographer, page URL, license URL, date) and prints an `<img>` snippet and a credit line. Never hotlink: Pixabay forbids it and its preview URLs expire.
6. **Markup.** Use the snippet and adapt it with `fe-media-assets` "Images": keep `width` and `height`; set `sizes` to the real slot width; the hero or LCP image gets `fetchpriority="high"` and no `loading="lazy"`, images below the fold get `loading="lazy"`. Pixabay gives one size (1280 px); add a framework image component or a build step if more widths are needed. Write real `alt` text from what the image shows in context; `alt_draft` (Pexels alt or Pixabay tags) is only a starting point; decorative backgrounds get `alt=""` or CSS. Text over a photo needs a scrim or overlay and a contrast check on the actual image (`vbase-color`).
7. **License check** before handing over, per `fe-stock-images` "What the licenses allow": no implied endorsement by recognisable people or brands, no logo or trademark use, no resale of unaltered copies. Add a visible credit line (footer or about page) such as "Photos from Pexels and Pixabay" with links; it is optional under the licenses but good practice. Report the files, `stock-credits.json` and any risk you flagged.

## Not in scope

- Choosing the visual style or writing `DESIGN.md`: `ui-brief`. Animating images: `ui-motion`.
- AI-generated images, illustrations and icons.
- Video: both APIs have video endpoints (see `fe-stock-images`), not covered by the script; download manually and follow the same credit and markup rules.

## gomoku-vn overrides

Project rules in `CLAUDE.md` win. Save images under `client/` (not `public/`), never hotlink, and after any `client/` edit run `node scripts/cache-bust.js --write`. Avatars/images must display the same on every page (`.claude/rules/consistency.md`). Needs `PEXELS_API_KEY`/`PIXABAY_API_KEY`; only run when the user asks for photos.
