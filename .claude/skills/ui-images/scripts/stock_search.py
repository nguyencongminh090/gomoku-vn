#!/usr/bin/env python3
"""Search and download free stock photos from Pexels and Pixabay.

Standard library only (Python 3.9+). API keys come from the environment:
  PEXELS_API_KEY   free key: https://www.pexels.com/api/
  PIXABAY_API_KEY  free key: https://pixabay.com/api/docs/

Commands:
  search    print candidate photos as JSON (one normalised list for both providers)
  download  download one photo, record it in <out-dir>/stock-credits.json, print an <img> snippet

Exit codes: 0 ok, 2 bad arguments, 3 no usable API key, 4 provider error (auth, rate limit,
network, not found), 5 download rejected (not an image, too large, host not allowed).

Terms this script follows (see fe-stock-images): API responses are cached for 24 hours
(Pixabay requires it); images are downloaded, never hotlinked (Pixabay forbids permanent
hotlinking and its webformatURL expires); keys never reach output or files.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

PEXELS_BASE = os.environ.get("STOCK_PEXELS_API_BASE", "https://api.pexels.com/v1")  # override for tests only
PIXABAY_BASE = os.environ.get("STOCK_PIXABAY_API_BASE", "https://pixabay.com/api")  # override for tests only
DEFAULT_HOSTS = {"images.pexels.com", "pixabay.com", "cdn.pixabay.com"}
EXTRA_HOSTS = {h for h in os.environ.get("STOCK_ALLOW_HOSTS", "").split(",") if h}  # tests only
CACHE_TTL_S = 24 * 3600            # Pixabay API terms: cache requests for 24 hours
MAX_BYTES = 25 * 1024 * 1024       # refuse downloads above 25 MB; a web image should be far smaller
TIMEOUT_S = 30
USER_AGENT = "ui-images-skill/1.0"
LICENSES = {
    "pexels": "https://www.pexels.com/license/",
    "pixabay": "https://pixabay.com/service/license-summary/",
}
EXT_BY_TYPE = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif", "image/gif": "gif"}


class ProviderError(Exception):
    pass


class NoKey(Exception):
    pass


def key_for(provider: str) -> str:
    name = "PEXELS_API_KEY" if provider == "pexels" else "PIXABAY_API_KEY"
    value = os.environ.get(name, "").strip()
    if not value:
        url = "https://www.pexels.com/api/" if provider == "pexels" else "https://pixabay.com/api/docs/"
        raise NoKey(f"{name} is not set. Get a free key at {url} and export it, e.g. export {name}=...")
    return value


def redact(text: str) -> str:
    """Remove API keys from any text that may be printed."""
    for name in ("PEXELS_API_KEY", "PIXABAY_API_KEY"):
        secret = os.environ.get(name, "").strip()
        if secret:
            text = text.replace(secret, "***")
    return re.sub(r"([?&]key=)[^&\s]+", r"\1***", text)


def cache_dir() -> Path:
    base = os.environ.get("XDG_CACHE_HOME") or str(Path.home() / ".cache")
    return Path(base) / "ui-images"


def http_get_json(provider: str, url: str, headers: dict, cache_key: str, use_cache: bool = True):
    path = cache_dir() / (hashlib.sha256(cache_key.encode()).hexdigest() + ".json")
    if use_cache and path.exists() and time.time() - path.stat().st_mtime < CACHE_TTL_S:
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            pass  # unreadable cache entry: fetch again
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, **headers})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            raise ProviderError(f"{provider}: key rejected (HTTP {e.code}); check the API key") from None
        if e.code == 429:
            reset = e.headers.get("X-Ratelimit-Reset") or e.headers.get("X-RateLimit-Reset") or "unknown"
            raise ProviderError(f"{provider}: rate limit reached (HTTP 429), reset: {reset}; wait or use the other provider") from None
        if e.code == 400 and provider == "pixabay":
            raise ProviderError("pixabay: request rejected (HTTP 400); usually an invalid key or parameter") from None
        if e.code == 404:
            raise ProviderError(f"{provider}: not found (HTTP 404)") from None
        raise ProviderError(redact(f"{provider}: HTTP {e.code} {e.reason}")) from None
    except (urllib.error.URLError, TimeoutError, ValueError) as e:
        raise ProviderError(redact(f"{provider}: request failed: {e}")) from None
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data), encoding="utf-8")
    except OSError:
        pass  # caching is best effort
    return data


# ---------- normalisation ----------

def norm_pexels(p: dict) -> dict:
    src = p.get("src") or {}
    return {
        "provider": "pexels", "id": str(p.get("id")),
        "width": p.get("width"), "height": p.get("height"),
        "page_url": p.get("url"), "photographer": p.get("photographer"),
        "photographer_url": p.get("photographer_url"),
        "alt_draft": p.get("alt") or "", "avg_color": p.get("avg_color"),
        "preview_url": src.get("medium") or src.get("tiny"),
        "sizes": {"large": src.get("large2x") or src.get("large"), "medium": src.get("large"),
                  "original": src.get("original")},
        "license_url": LICENSES["pexels"],
    }


def norm_pixabay(h: dict) -> dict:
    return {
        "provider": "pixabay", "id": str(h.get("id")),
        "width": h.get("imageWidth"), "height": h.get("imageHeight"),
        "page_url": h.get("pageURL"), "photographer": h.get("user"),
        "photographer_url": f"https://pixabay.com/users/{h.get('user')}-{h.get('user_id')}/" if h.get("user") else None,
        "alt_draft": h.get("tags") or "", "avg_color": None,
        "preview_url": h.get("previewURL"),
        # webformatURL expires after 24 h: fine for previewing, download it, never hotlink it
        "sizes": {"large": h.get("largeImageURL"), "medium": h.get("webformatURL"), "original": h.get("largeImageURL")},
        "license_url": LICENSES["pixabay"],
    }


# ---------- providers ----------

PEXELS_ORIENT = {"landscape": "landscape", "portrait": "portrait", "square": "square"}
PIXABAY_ORIENT = {"landscape": "horizontal", "portrait": "vertical"}


def search_pexels(a) -> list:
    params = {"query": a.query, "per_page": min(a.per_page, 80), "page": a.page}
    if a.orientation:
        params["orientation"] = PEXELS_ORIENT[a.orientation]
    if a.color:
        params["color"] = a.color
    if a.locale:
        params["locale"] = a.locale
    url = f"{PEXELS_BASE}/search?{urllib.parse.urlencode(params)}"
    data = http_get_json("pexels", url, {"Authorization": key_for("pexels")}, "pexels:" + url, not a.no_cache)
    items = [norm_pexels(p) for p in data.get("photos", [])]
    return [i for i in items if not a.min_width or (i["width"] or 0) >= a.min_width]


def search_pixabay(a) -> list:
    params = {"q": a.query[:100], "image_type": "photo", "per_page": max(3, min(a.per_page, 200)),
              "page": a.page, "safesearch": "true"}
    if a.orientation in PIXABAY_ORIENT:
        params["orientation"] = PIXABAY_ORIENT[a.orientation]
    if a.color:
        params["colors"] = a.color
    if a.min_width:
        params["min_width"] = a.min_width
    if a.locale:
        params["lang"] = a.locale.split("-")[0]
    query = urllib.parse.urlencode(params)
    url = f"{PIXABAY_BASE}/?key={urllib.parse.quote(key_for('pixabay'))}&{query}"
    data = http_get_json("pixabay", url, {}, "pixabay:" + query, not a.no_cache)
    items = [norm_pixabay(h) for h in data.get("hits", [])]
    if a.orientation == "square":
        items = [i for i in items if i["width"] and i["height"] and 0.9 <= i["width"] / i["height"] <= 1.1]
    return items


def lookup(provider: str, photo_id: str) -> dict:
    if not photo_id.isdigit():
        raise ProviderError("id must be numeric")
    if provider == "pexels":
        url = f"{PEXELS_BASE}/photos/{photo_id}"
        return norm_pexels(http_get_json("pexels", url, {"Authorization": key_for("pexels")}, "pexels:" + url))
    url = f"{PIXABAY_BASE}/?key={urllib.parse.quote(key_for('pixabay'))}&id={photo_id}"
    hits = http_get_json("pixabay", url, {}, f"pixabay:id={photo_id}").get("hits", [])
    if not hits:
        raise ProviderError(f"pixabay: photo {photo_id} not found")
    return norm_pixabay(hits[0])


# ---------- commands ----------

def cmd_search(a) -> int:
    providers = ["pexels", "pixabay"] if a.provider == "all" else [a.provider]
    results, notes = [], []
    for p in providers:
        try:
            results += search_pexels(a) if p == "pexels" else search_pixabay(a)
        except NoKey as e:
            if a.provider != "all":
                raise
            notes.append(f"skipped {p}: {e}")
        except ProviderError as e:
            if a.provider != "all":
                raise
            notes.append(str(e))
    if not results and len(notes) == len(providers) and all(n.startswith("skipped") for n in notes):
        raise NoKey(" | ".join(notes))
    out = {"query": a.query, "count": len(results),
           "attribution": "Results from Pexels (https://www.pexels.com) and Pixabay (https://pixabay.com); "
                          "show the source next to any results you display.",
           "notes": notes, "results": results}
    print(json.dumps(out, indent=2, ensure_ascii=False))
    return 0


def slugify(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s[:50] or "photo"


def fetch_image(url: str) -> tuple[bytes, str]:
    host = urllib.parse.urlparse(url).hostname or ""
    if host not in DEFAULT_HOSTS | EXTRA_HOSTS:
        raise ValueError(f"host not allowed: {host}")
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
        ctype = (resp.headers.get("Content-Type") or "").split(";")[0].strip().lower()
        if ctype not in EXT_BY_TYPE:
            raise ValueError(f"not an image (Content-Type {ctype or 'missing'})")
        body = resp.read(MAX_BYTES + 1)
    if len(body) > MAX_BYTES:
        raise ValueError(f"larger than {MAX_BYTES // (1024 * 1024)} MB")
    return body, EXT_BY_TYPE[ctype]


def pexels_width_url(original: str, width: int) -> str:
    # Pexels serves resized copies through query params on images.pexels.com (as in its own src URLs).
    base = original.split("?")[0]
    return f"{base}?auto=compress&cs=tinysrgb&w={width}"


def cmd_download(a) -> int:
    item = lookup(a.provider, a.id)
    out_dir = Path(a.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    stem = f"{slugify(a.name or item['alt_draft'] or 'photo')}-{item['provider']}-{item['id']}"
    files = []
    widths = sorted({w for w in (a.widths or []) if w > 0})
    if widths and item["provider"] == "pexels" and item["sizes"].get("original"):
        jobs = [(pexels_width_url(item["sizes"]["original"], w), w) for w in widths]
    else:
        if widths:
            print("note: --widths is supported for Pexels only; downloading one size", file=sys.stderr)
        url = item["sizes"].get(a.size) or item["sizes"].get("large")
        jobs = [(url, None)]
    for url, w in jobs:
        if not url:
            raise ProviderError("no download URL in the API response")
        try:
            body, ext = fetch_image(url)
        except (urllib.error.URLError, TimeoutError) as e:
            raise ProviderError(redact(f"download failed: {e}")) from None
        name = f"{stem}-{w}w.{ext}" if w else f"{stem}.{ext}"
        (out_dir / name).write_bytes(body)
        files.append({"file": name, "width": w, "bytes": len(body)})

    manifest = out_dir / "stock-credits.json"
    try:
        entries = json.loads(manifest.read_text(encoding="utf-8")) if manifest.exists() else []
    except ValueError:
        entries = []
    entries = [e for e in entries if not (e.get("provider") == item["provider"] and e.get("id") == item["id"])]
    entries.append({
        "provider": item["provider"], "id": item["id"], "files": [f["file"] for f in files],
        "photographer": item["photographer"], "photographer_url": item["photographer_url"],
        "page_url": item["page_url"], "license_url": item["license_url"],
        "alt_draft": item["alt_draft"], "original_width": item["width"], "original_height": item["height"],
        "downloaded": date.today().isoformat(),
    })
    manifest.write_text(json.dumps(entries, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    w0, h0 = item["width"] or 0, item["height"] or 0
    largest = files[-1]
    if largest["width"] and w0:
        disp_w, disp_h = largest["width"], round(h0 * largest["width"] / w0)
    else:
        disp_w, disp_h = w0, h0
    rel = a.url_prefix.rstrip("/")
    srcset = ", ".join(f"{rel}/{f['file']} {f['width']}w" for f in files if f["width"])
    snippet = f'<img src="{rel}/{largest["file"]}"'
    if srcset:
        snippet += f' srcset="{srcset}" sizes="100vw"'
    snippet += f' width="{disp_w}" height="{disp_h}" alt="TODO: describe the image" decoding="async">'
    credit = f'Photo by {item["photographer"]} on {"Pexels" if item["provider"] == "pexels" else "Pixabay"} ({item["page_url"]})'
    print(json.dumps({"files": files, "manifest": str(manifest), "img": snippet, "credit": credit,
                      "alt_draft": item["alt_draft"],
                      "note": "width/height are from the source aspect ratio; adjust sizes to the layout slot"},
                     indent=2, ensure_ascii=False))
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("search", help="search photos")
    s.add_argument("query")
    s.add_argument("--provider", choices=["pexels", "pixabay", "all"], default="all")
    s.add_argument("--orientation", choices=["landscape", "portrait", "square"])
    s.add_argument("--color", help="pexels: name or hex; pixabay: comma list of its color names")
    s.add_argument("--min-width", type=int, default=0)
    s.add_argument("--locale", help="e.g. en-US, vi-VN")
    s.add_argument("--per-page", type=int, default=15)
    s.add_argument("--page", type=int, default=1)
    s.add_argument("--no-cache", action="store_true", help="skip the 24 h response cache")
    d = sub.add_parser("download", help="download one photo and record its credit")
    d.add_argument("provider", choices=["pexels", "pixabay"])
    d.add_argument("id")
    d.add_argument("--out-dir", default="public/images/stock")
    d.add_argument("--url-prefix", default="/images/stock", help="public URL of --out-dir for the snippet")
    d.add_argument("--name", help="file name stem; default from the alt text or tags")
    d.add_argument("--size", choices=["large", "medium", "original"], default="large")
    d.add_argument("--widths", type=lambda v: [int(x) for x in v.split(",") if x.strip()],
                   help="pexels only: comma list of widths for srcset, e.g. 640,1280,1920")
    a = ap.parse_args(argv)
    if a.cmd == "search" and not a.query.strip():
        ap.error("query must not be empty")
    try:
        return cmd_search(a) if a.cmd == "search" else cmd_download(a)
    except NoKey as e:
        print(f"error: {e}", file=sys.stderr)
        return 3
    except ProviderError as e:
        print(f"error: {redact(str(e))}", file=sys.stderr)
        return 4
    except ValueError as e:
        print(f"error: download rejected: {redact(str(e))}", file=sys.stderr)
        return 5


if __name__ == "__main__":
    sys.exit(main())
