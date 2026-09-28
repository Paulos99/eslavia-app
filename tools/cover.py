from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    pg = b.new_page(viewport={"width": 640, "height": 360}, device_scale_factor=1)
    pg.goto("http://127.0.0.1:8765/tools/cover.html", wait_until="networkidle")
    pg.evaluate("document.fonts.ready"); pg.wait_for_timeout(800)
    pg.screenshot(path="/workspace/eslavia-app/brand/cover-640x360.png")
    b.close()
