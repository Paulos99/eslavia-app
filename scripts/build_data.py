#!/usr/bin/env python3
"""Build data/catalog.json + light WebP images for the Eslavia Mini App.

Sources (read-only):
  /workspace/eslavia-site/data/products.json, categories.json   product data
  /workspace/eslavia-site/public/images/{products,thumbs}/       photos
  /workspace/eslavia-tg/state.json                               channel album message ids
  /workspace/eslavia-tg/post_catalog.py                          ordering + naming rules

For each product: post URL = https://t.me/<channel>/<first message id of album>,
order URL = https://t.me/baristCoachN?text=<urlencoded lines>, byte-identical to the
"Заказать" link in the channel caption (cross-checked against state.json captions).

Images: img/<id>/01-480.webp (grid), 01-720/02-720/03-720.webp (gallery = the same
3 photos as the channel album). Existing site thumbnails are copied; missing sizes are
generated the same way as the site (Lanczos downscale, WebP q82, method 6).
"""
from __future__ import annotations

import html
import json
import re
import shutil
import sys
import urllib.parse
from pathlib import Path

from PIL import Image

APP = Path(__file__).resolve().parents[1]
TG = Path("/workspace/eslavia-tg")
SITE = Path("/workspace/eslavia-site")
PUBLIC = SITE / "public"
sys.path.insert(0, str(TG))
import post_catalog as pc  # noqa: E402  (no Telegram calls on import)

CHANNEL = "eslavia_opt"
CHAT_KEY = "-1004469691410"
ORDER_USER = pc.ORDER_TG_USERNAME  # baristCoachN
PHOTOS = 3
EXPECTED = 98
QUALITY = 82
CAT_LABEL = {"Пижамы для дома": "Пижамы"}
SIZE_MIN, SIZE_MAX = 42, 72


def display_name(p: dict) -> str:
    """Exactly the name used in the channel caption / order text (post_catalog.build_caption)."""
    raw = p.get("name") or p.get("article") or p["id"]
    raw = re.sub(r"\s*больш(ие|их)\s+размер(ы|ов)\s*", " ", raw, flags=re.I)
    return pc.cap_first(re.sub(r"\s{2,}", " ", raw).strip())


def order_url(name: str, post_url: str) -> str:
    msg = f"Здравствуйте!\nИнтересует модель: {name}.\n{post_url}\nПодскажите, пожалуйста, условия заказа."
    return f"https://t.me/{ORDER_USER}?text=" + urllib.parse.quote(msg)


def size_nums(sizes: list[str]) -> list[int]:
    out: set[int] = set()
    for s in sizes:
        nums = [int(n) for n in re.findall(r"\d+", str(s))]
        if not nums:
            continue
        lo, hi = min(nums), max(nums)
        out.update(n for n in range(lo, hi + 1) if n % 2 == 0)
    return sorted(out)


def thumb_src(rel: str, width: int) -> Path:
    stem = rel[len("/images/products/"):].rsplit(".", 1)[0]
    return PUBLIC / "images" / "thumbs" / f"{stem}-{width}.webp"


def put_image(rel: str, width: int, dst: Path) -> str:
    """Copy the site thumbnail if present, else generate it from the original."""
    dst.parent.mkdir(parents=True, exist_ok=True)
    src_thumb = thumb_src(rel, width)
    orig = PUBLIC / rel.lstrip("/")
    if not orig.is_file():
        raise FileNotFoundError(rel)
    if dst.is_file() and dst.stat().st_mtime >= orig.stat().st_mtime:
        return "kept"
    if src_thumb.is_file():
        shutil.copy2(src_thumb, dst)
        return "copied"
    with Image.open(orig) as raw:
        im = raw.convert("RGB")
    w, h = im.size
    if w > width:
        im = im.resize((width, round(h * width / w)), Image.Resampling.LANCZOS)
    im.save(dst, "WEBP", quality=QUALITY, method=6)
    return "generated"


def caption_order_href(caption: str) -> str | None:
    m = re.search(r'<a href="([^"]+)">Заказать</a>', caption or "")
    return html.unescape(m.group(1)) if m else None


def main() -> int:
    products = pc.load_products()  # same order as the channel
    state = pc.load_state()
    cats_order = pc.category_order()
    items, errors, stats = [], [], {"copied": 0, "generated": 0, "kept": 0}
    caption_match = 0
    for p in products:
        rec = state["posts"].get(p["id"], {}).get(CHAT_KEY)
        if not rec:
            errors.append(f"{p['id']}: not in state.json")
            continue
        mid = rec["message_ids"][0]
        post = f"https://t.me/{rec['chat'].lstrip('@')}/{mid}"
        if not post.startswith(f"https://t.me/{CHANNEL}/"):
            errors.append(f"{p['id']}: unexpected chat {rec['chat']}")
        name = display_name(p)
        order = order_url(name, post)
        cap_href = caption_order_href(rec.get("caption", ""))
        if cap_href == order:
            caption_match += 1
        else:
            errors.append(f"{p['id']}: order URL differs from channel caption")
        imgs = (p.get("images") or [])[:PHOTOS]
        if len(imgs) < PHOTOS:
            errors.append(f"{p['id']}: only {len(imgs)} images")
            continue
        base = APP / "img" / p["id"]
        stats[put_image(imgs[0], 480, base / "01-480.webp")] += 1
        gallery = []
        for i, rel in enumerate(imgs, 1):
            stats[put_image(rel, 720, base / f"{i:02d}-720.webp")] += 1
            gallery.append(f"img/{p['id']}/{i:02d}-720.webp")
        article = p.get("article") or ""
        title = pc.cap_first(re.sub(r"\s{2,}", " ", name.replace(article, "")).strip()) if article else name
        cat = p.get("category") or ""
        nums = size_nums(p.get("sizes") or [])
        items.append({
            "id": p["id"],
            "article": article,
            "name": name,
            "title": title,
            "category": CAT_LABEL.get(cat, cat),
            "sizes": [str(s).strip() for s in p.get("sizes") or []],
            "sizeNums": nums,
            "big": max(nums or [0]) >= pc.BIG_SIZE_MIN,
            "price": int(round(float(p["priceWholesale"]))),
            "material": p.get("material") or None,
            "thumb": f"img/{p['id']}/01-480.webp",
            "thumb2x": gallery[0],
            "images": gallery,
            "post": post,
            "order": order,
        })
    categories = []
    for c in cats_order + sorted({CAT_LABEL.get(p.get('category'), p.get('category')) for p in products} - set(cats_order)):
        label = CAT_LABEL.get(c, c)
        n = sum(1 for it in items if it["category"] == label)
        if n and label not in [x["name"] for x in categories]:
            categories.append({"name": label, "count": n})
    all_sizes = sorted({n for it in items for n in it["sizeNums"] if SIZE_MIN <= n <= SIZE_MAX})
    catalog = {
        "brand": "ЭСЛАВИЯ",
        "channel": f"https://t.me/{CHANNEL}",
        "minOrder": "от 5 000 ₽",
        "count": len(items),
        "categories": categories,
        "sizes": all_sizes,
        "items": items,
    }
    out = APP / "data" / "catalog.json"
    out.write_text(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    posts = [it["post"] for it in items]
    print(f"items={len(items)} (expected {EXPECTED}) unique_posts={len(set(posts))} "
          f"caption_order_match={caption_match}/{len(items)} images={stats} "
          f"categories={[(c['name'], c['count']) for c in categories]} sizes={all_sizes}")
    if len(items) != EXPECTED or len(set(posts)) != EXPECTED:
        errors.append("count mismatch")
    for e in errors:
        print("ERROR", e)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
