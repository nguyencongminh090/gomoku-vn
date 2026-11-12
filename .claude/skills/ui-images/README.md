# ui-images

Authored in this tree on 2026-11-12 (not copied from another project). Redirect only the notes root: note paths use `${SKILLS_TREE:-/run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE}`, so set `SKILLS_TREE` when the tree lives elsewhere.

Searches Pexels and Pixabay through their APIs, downloads the chosen photos into the target project and records credits in `<out-dir>/stock-credits.json`. Reads, in place: `fe-stock-images` and `fe-media-assets` (`knowledge/web-development/items/`).

Needs in the target project or shell:
- `python3` 3.9+ (standard library only).
- `PEXELS_API_KEY` and/or `PIXABAY_API_KEY` in the environment (free keys). Without keys the skill stops and asks the user to browse the sites; it never scrapes them.
- Network access to api.pexels.com, images.pexels.com, pixabay.com and cdn.pixabay.com.

Script behavior: 24-hour response cache in `${XDG_CACHE_HOME:-~/.cache}/ui-images/` (keys are not stored), downloads only from Pexels or Pixabay hosts, image content types only, 25 MB cap. The `STOCK_*_API_BASE` and `STOCK_ALLOW_HOSTS` variables exist for the offline test (`kit/web-visual/tests/test_stock_search.py`) only.

Naming: the kit uses `ui-*` noun names (ui-brief, ui-audit, ui-fix, ui-motion, ui-images) rather than Anthropic's suggested gerund form; the guidance allows noun phrases when one pattern is kept across a collection.

Related community skills: not searched for stock image APIs (the search on 2026-11-12 covered motion and 3D skills only).
