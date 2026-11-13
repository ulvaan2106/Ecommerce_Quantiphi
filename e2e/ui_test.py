"""
End-to-end check of every VIBZO control in a real browser.
Run: python3 e2e/ui_test.py   (starts the server itself on port 3100)
"""
import json, subprocess, sys, time, urllib.request
from playwright.sync_api import sync_playwright, expect

PORT = 3100
BASE = f"http://localhost:{PORT}"
results = []

def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(("PASS" if ok else "FAIL"), "-", name, ("| " + detail) if detail else "")

def api(path):
    with urllib.request.urlopen(BASE + path) as r:
        return json.loads(r.read())

def wait_count(page, expected, timeout=3000):
    """Poll until the grid shows `expected` products (filters are applied via async fetch)."""
    try:
        page.wait_for_function(
            "(n) => { const t = document.getElementById('resultCount').textContent; return +t.split(' ')[1] === n; }",
            arg=expected, timeout=timeout)
        return True
    except Exception:
        return False

def shown_count(page):
    text = page.locator("#resultCount").inner_text()
    return int(text.split()[1])  # "Showing N of T products"

server = subprocess.Popen(["node", "server.js"], env={"PORT": str(PORT), "PATH": "/usr/bin:/bin"},
                          stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
time.sleep(1)
try:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        js_errors = []
        page.on("pageerror", lambda e: js_errors.append(str(e)))
        page.goto(BASE + "/")
        expect(page.locator(".card").first).to_be_visible()

        total = api("/api/meta")["total"]
        check("Store name is VIBZO", page.locator("h1").inner_text() == "VIBZO" and "VIBZO" in page.title())
        check("Initial grid shows full inventory", shown_count(page) == total, f"{shown_count(page)}/{total}")
        check("Sticky sidebar", page.eval_on_selector(".sidebar", "e => getComputedStyle(e).position") == "sticky")

        # Category checkboxes
        cats = page.locator("#categoryList input")
        check("4 category checkboxes", cats.count() == 4)
        cats.nth(0).check()
        cats.nth(2).check()
        expected = api("/api/products?categories=Electronics,Footwear")["count"]
        wait_count(page, expected)
        check("Category checkboxes filter grid instantly", shown_count(page) == expected, f"{shown_count(page)} vs {expected}")
        cats.nth(0).uncheck(); cats.nth(2).uncheck()
        wait_count(page, total)
        check("Unchecking all categories restores full inventory", shown_count(page) == total)

        # Star rating radios
        radios = page.locator("#ratingList input")
        check("6 rating radios (Any + 1..5)", radios.count() == 6)
        radios.nth(4).check()  # 4 stars & up
        expected = api("/api/products?minRating=4")["count"]
        wait_count(page, expected)
        check("4-star radio filters grid", shown_count(page) == expected, f"{shown_count(page)} vs {expected}")
        cards_ok = page.evaluate("""() => [...document.querySelectorAll('.card-price')].length""")
        check("Cards render with price", cards_ok == expected)
        radios.nth(0).check()
        wait_count(page, total)
        check("'Any rating' radio restores full inventory", shown_count(page) == total)

        # Price sliders
        lo, hi = page.locator("#priceMin"), page.locator("#priceMax")
        lo.evaluate("e => { e.value = 5000; e.dispatchEvent(new Event('input')) }")
        expected = api("/api/products?minPrice=5000")["count"]
        wait_count(page, expected)
        check("Min price slider filters grid", shown_count(page) == expected, f"{shown_count(page)} vs {expected}")
        hi.evaluate("e => { e.value = 20000; e.dispatchEvent(new Event('input')) }")
        expected = api("/api/products?minPrice=5000&maxPrice=20000")["count"]
        wait_count(page, expected)
        check("Both price handles combine", shown_count(page) == expected, f"{shown_count(page)} vs {expected}")
        # Cross the handles: min pushed above max must clamp
        lo.evaluate("e => { e.value = 60000; e.dispatchEvent(new Event('input')) }")
        page.wait_for_timeout(400)
        check("Min handle cannot cross max", page.evaluate("() => +document.getElementById('priceMin').value <= +document.getElementById('priceMax').value"))
        check("Price labels show ₹", "₹" in page.locator("#priceMinLabel").inner_text())

        # Zero-match screen + reset button
        page.evaluate("""() => { const a=document.getElementById('priceMin'); const b=document.getElementById('priceMax');
            a.value=1000; a.dispatchEvent(new Event('input')); b.value=1000; b.dispatchEvent(new Event('input')); }""")
        page.locator("#ratingList input").nth(5).check()  # 5 stars
        page.wait_for_timeout(500)
        empty_visible = page.locator("#emptyState").is_visible()
        grid_hidden = not page.locator("#grid").is_visible()
        check("Zero matches: empty screen shown", empty_visible)
        check("Zero matches: grid hidden", grid_hidden)
        check("Empty message text", "No items match your criteria." in page.locator("#emptyState").inner_text())
        page.locator("#emptyResetBtn").click()
        page.wait_for_timeout(500)
        check("Empty-state 'Reset filters' button restores grid", shown_count(page) == total and page.locator("#grid").is_visible())
        check("Reset clears price handles", page.locator("#priceMin").input_value() == str(api("/api/meta")["priceBounds"]["min"]))
        check("Reset clears rating back to Any", page.locator("#ratingList input").nth(0).is_checked())

        # Clear all link
        cats.nth(1).check(); radios.nth(2).check()
        page.locator("#resetBtn").click()
        page.wait_for_timeout(400)
        check("'Clear all' link resets filters", shown_count(page) == total and not cats.nth(1).is_checked())

        # Sort dropdown
        sort = page.locator("#sortSelect")
        check("Sort dropdown has 3 options", sort.locator("option").count() == 3)
        sort.select_option("price-asc")
        page.wait_for_timeout(400)
        prices = page.evaluate("() => [...document.querySelectorAll('.card-price')].map(e => parseInt(e.textContent.replace(/[^0-9]/g,'')))")
        check("Price: Low to High orders cards ascending", prices == sorted(prices) and len(prices) > 0)
        sort.select_option("rating-desc")
        page.wait_for_timeout(400)
        ratings = page.evaluate("() => [...document.querySelectorAll('.rating-num')].map(e => parseFloat(e.textContent))")
        check("Top Rated First orders cards descending", ratings == sorted(ratings, reverse=True) and len(ratings) > 0)
        cats.nth(3).check()
        page.wait_for_timeout(400)
        ratings2 = page.evaluate("() => [...document.querySelectorAll('.rating-num')].map(e => parseFloat(e.textContent))")
        check("Sort persists when filters change", ratings2 == sorted(ratings2, reverse=True))

        # Thumbnails load
        broken = page.evaluate("() => [...document.images].filter(i => !i.complete || i.naturalWidth === 0).length")
        check("All product thumbnails load", broken == 0, f"broken={broken}")

        # Mobile layout
        page.set_viewport_size({"width": 400, "height": 800})
        page.wait_for_timeout(200)
        check("Responsive: sidebar not sticky on mobile", page.eval_on_selector(".sidebar", "e => getComputedStyle(e).position") == "static")

        check("No JavaScript errors in console", not js_errors, "; ".join(js_errors))
        browser.close()
finally:
    server.terminate()

failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed else 0)
