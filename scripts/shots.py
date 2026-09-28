#!/usr/bin/env python3
"""Mobile screenshots (390x844 @2x) of the Mini App grid and a detail view."""
import sys
from playwright.sync_api import sync_playwright

base = sys.argv[1] if len(sys.argv) > 1 else "https://paulos99.github.io/eslavia-app/"
out = sys.argv[2] if len(sys.argv) > 2 else "/workspace/eslavia-app-shots"
prefix = sys.argv[3] if len(sys.argv) > 3 else ""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True,
                        has_touch=True, locale="ru-RU",
                        user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148")
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: m.type == "error" and errs.append(m.text))
    pg.goto(base, wait_until="networkidle", timeout=45000)
    pg.wait_for_selector(".card img", timeout=20000)
    pg.evaluate("document.fonts.ready")
    pg.wait_for_timeout(1200)
    n = pg.locator(".card").count()
    pg.screenshot(path=f"{out}/{prefix}grid.png")
    pg.click("#cats [data-cat='Пижамы']")
    pg.click("#sizes [data-size='60']")
    pg.wait_for_timeout(800)
    nf = pg.locator(".card").count()
    cnt = pg.inner_text("#count")
    pg.screenshot(path=f"{out}/{prefix}grid-filter.png")
    pg.click("#reset")
    pg.fill("#q", "м-102")
    pg.wait_for_timeout(500)
    nq = pg.locator(".card").count()
    pg.fill("#q", "")
    pg.wait_for_timeout(400)
    pg.click(".card[data-id='m-102']")
    pg.wait_for_selector("#detail-view:not([hidden])")
    pg.wait_for_timeout(1500)
    order = pg.get_attribute("#d-order", "href")
    post = pg.get_attribute("#d-post", "href")
    pg.screenshot(path=f"{out}/{prefix}detail.png")
    pg.go_back()
    pg.wait_for_timeout(500)
    closed = pg.is_hidden("#detail-view")
    print(f"cards={n} filter(Пижамы,60)={nf} '{cnt}' search(м-102)={nq} detail_post={post} back_closes={closed}")
    print("order_href=", order)
    print("errors=", errs)
    b.close()
