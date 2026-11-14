"""End-to-end smoke test using Playwright + the installed Chrome.
Usage:  python3 tools/e2e-smoke.py [base_url] [screenshot_dir]
Start the server first (npm start).  It checks behaviour that the static
checks cannot: focus management, live regions, dynamic fields, sorting,
filtering, delete + undo, reflow at 320px and visible focus.
"""
import sys, re, os
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:3000"
SHOTS = sys.argv[2] if len(sys.argv) > 2 else None
results, console_problems = [], []


def check(name, ok, detail=""):
    results.append((ok, name, detail))
    print(("PASS  " if ok else "FAIL  ") + name + (("  -> " + str(detail)) if detail and not ok else ""))


def shot(page, name):
    if SHOTS:
        os.makedirs(SHOTS, exist_ok=True)
        page.screenshot(path=os.path.join(SHOTS, name + ".png"), full_page=True)


def login(page, user, pw):
    page.goto(BASE + "/")
    page.fill("#username", user)
    page.fill("#password", pw)
    page.click("#login-btn")
    page.wait_for_url("**/dashboard.html", timeout=5000)


with sync_playwright() as p:
    # Works on macOS, Linux and Windows: uses your installed Google Chrome if present,
    # otherwise Playwright's own Chromium (install it with: python3 -m playwright install chromium).
    # Set CHROME_PATH to use a specific browser binary.
    try:
        if os.environ.get("CHROME_PATH"):
            browser = p.chromium.launch(executable_path=os.environ["CHROME_PATH"])
        else:
            browser = p.chromium.launch(channel="chrome")
    except Exception:
        browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1280, "height": 900})
    page = ctx.new_page()
    page.on("console", lambda m: console_problems.append(m.text) if m.type in ("error", "warning") else None)
    page.on("pageerror", lambda e: console_problems.append(str(e)))

    # ---------- Task 1: sign-in ----------
    page.goto(BASE + "/")
    page.click("#login-btn")
    page.wait_for_selector("#error-summary:not([hidden])")
    check("sign-in: empty submit shows error summary", page.is_visible("#error-summary"))
    check("sign-in: error summary receives focus", page.evaluate("document.activeElement.id") == "error-summary")
    check("sign-in: fields marked aria-invalid", page.get_attribute("#username", "aria-invalid") == "true")
    page.fill("#username", "agent"); page.fill("#password", "wrong")
    page.click("#login-btn")
    page.wait_for_selector("#error-summary-list li:has-text('not correct')", timeout=4000)
    check("sign-in: wrong password gives specific message", "not correct" in page.inner_text("#error-summary"))
    page.fill("#password", "agent123")
    page.click("#login-btn")
    page.wait_for_timeout(150)
    check("sign-in: busy state shows 'Signing in…'", "Signing in" in page.inner_text("#login-btn-text"))
    check("sign-in: button uses aria-disabled (keeps focus)", page.get_attribute("#login-btn", "aria-disabled") == "true")
    page.wait_for_url("**/dashboard.html", timeout=5000)

    # ---------- Task 2: dashboard ----------
    page.wait_for_selector("#dash-content:not([hidden])")
    check("dashboard: one h1", page.locator("h1").count() == 1)
    check("dashboard: stats loaded from server", int(page.inner_text("#s-total")) >= 40)
    check("dashboard: upcoming departures listed", page.locator("#upcoming li").count() > 0)
    check("dashboard: nav marks current page", page.get_attribute("nav a[aria-current=page]", "href") == "dashboard.html")
    shot(page, "dashboard-desktop")

    # ---------- Task 4: table ----------
    page.click("nav >> text=Bookings")
    page.wait_for_selector("#table-wrap:not([hidden])")
    check("table: 10 rows per page by default", page.locator("#tbody tr").count() == 10)
    check("table: result count announced in live region", "Showing 1 to 10 of" in page.inner_text("#result-count"))
    page.click("button[data-sort=customerName]")
    check("table: aria-sort ascending after click", page.get_attribute("th:has(button[data-sort=customerName])", "aria-sort") == "ascending")
    names = page.locator("#tbody tr td[data-label=Customer]").all_inner_texts()
    check("table: customer column actually sorted", names == sorted(names, key=str.lower), names)
    page.click("button[data-sort=customerName]")
    check("table: second click sorts descending", page.get_attribute("th:has(button[data-sort=customerName])", "aria-sort") == "descending")
    page.fill("#q", "kyoto")
    page.wait_for_timeout(500)
    dests = set(page.locator("#tbody tr td[data-label=Destination]").all_inner_texts())
    check("table: search filters rows", dests <= {"Kyoto, Japan"} and len(dests) == 1, dests)
    check("table: result count mentions filtering", "filtered from" in page.inner_text("#result-count"))
    page.fill("#q", "zzzznothing")
    page.wait_for_timeout(500)
    check("table: empty state shown for no matches", page.is_visible("#empty") and "No bookings match" in page.inner_text("#empty-title"))
    page.click("#empty-clear")
    check("table: clear filters restores rows and focuses search", page.locator("#tbody tr").count() == 10 and page.evaluate("document.activeElement.id") == "q")
    page.click("#next")
    check("table: next page works", "Page 2 of" in page.inner_text("#page-info"))
    check("table: Next keeps keyboard focus", page.evaluate("document.activeElement.id") == "next")
    page.select_option("#f-status", "pending")
    check("table: status filter works", all("Pending" in t for t in page.locator("#tbody tr td[data-label=Status]").all_inner_texts()))
    check("table: status uses text not colour only", "Pending" in page.locator("#tbody tr td[data-label=Status]").first.inner_text())
    check("table: agents do not see Delete", page.locator("#tbody button:has-text('Delete')").count() == 0)
    shot(page, "bookings-desktop")

    # ---------- Task 3: form ----------
    page.goto(BASE + "/booking-form.html")
    page.click("#save-btn")
    page.wait_for_selector("#error-summary:not([hidden])")
    check("form: empty submit lists errors in summary", page.locator("#error-summary-list li").count() >= 4)
    check("form: summary focused", page.evaluate("document.activeElement.id") == "error-summary")
    page.click("#error-summary-list a >> nth=0")
    check("form: summary link moves focus to the field", page.evaluate("document.activeElement.id") == "customerName")
    check("form: inline error linked via aria-describedby", "customerName-error" in page.get_attribute("#customerName", "aria-describedby"))
    check("form: return date visible by default", page.is_visible("#returnDate"))
    page.check("#trip-oneway")
    check("form: one-way hides return date", not page.is_visible("#returnDate"))
    page.wait_for_timeout(150)
    check("form: dynamic change announced", "Return date field removed" in page.inner_text("#live-polite"))
    page.check("#trip-return")
    check("form: assistance textarea hidden until ticked", not page.is_visible("#assistanceDetails"))
    page.check("#addon-assistance")
    check("form: assistance textarea appears", page.is_visible("#assistanceDetails"))
    page.fill("#adults", "5"); page.fill("#children", "2")
    check("form: total travellers updates", "7 travellers" in page.inner_text("#total-travellers"))
    page.fill("#children", "6"); page.press("#children", "Tab")
    check("form: >9 travellers rejected with specific message", "at most 9" in page.inner_text("#children-error"))
    page.fill("#children", "0")
    page.fill("#customerName", "Browser Test"); page.fill("#email", "bt@example.com")
    page.select_option("#destination", "Rome, Italy")
    page.fill("#departureDate", "2020-01-01"); page.focus("#phone")
    check("form: past departure date rejected", "cannot be in the past" in page.inner_text("#departureDate-error"))
    import datetime
    d1 = (datetime.date.today() + datetime.timedelta(days=30)).isoformat()
    d2 = (datetime.date.today() + datetime.timedelta(days=37)).isoformat()
    page.fill("#departureDate", d1); page.fill("#returnDate", d1); page.focus("#phone")
    check("form: return not after departure rejected", "after the departure" in page.inner_text("#returnDate-error"))
    page.fill("#returnDate", d2)
    page.click("#save-btn")
    page.wait_for_selector("#error-summary:not([hidden])")
    check("form: missing assistance details caught", "assistanceDetails" in page.inner_html("#error-summary-list"))
    page.fill("#assistanceDetails", "Wheelchair to the gate")
    page.click("#another-btn")
    page.wait_for_selector("#notice .notice-success", timeout=4000)
    check("form: 'save and add another' confirms and resets", "ready for the next booking" in page.inner_text("#notice") and page.input_value("#customerName") == "")
    check("form: focus returns to first field for fast entry", page.evaluate("document.activeElement.id") == "customerName")
    page.fill("#customerName", "Browser Test Two"); page.fill("#email", "bt2@example.com")
    page.select_option("#destination", "Bali, Indonesia"); page.fill("#departureDate", d1); page.fill("#returnDate", d2)
    page.click("#save-btn")
    page.wait_for_url("**/bookings.html*", timeout=5000)
    page.wait_for_selector("#notice .notice-success")
    check("form: save redirects with success notice", "saved" in page.inner_text("#notice"))
    page.fill("#q", "Browser Test Two"); page.wait_for_timeout(500)
    check("persistence: new record is in the table after reload", page.locator("#tbody tr").count() == 1)
    page.reload(); page.wait_for_selector("#table-wrap:not([hidden])")
    check("persistence: view (search) remembered, data survives refresh", page.locator("#tbody tr").count() == 1)
    page.click("#tbody a:has-text('Edit')")
    page.wait_for_selector("#booking-form:not([hidden])")
    check("edit: form pre-filled", page.input_value("#customerName") == "Browser Test Two")
    shot(page, "form-desktop")

    # ---------- manager: delete with confirmation + undo ----------
    page.click("#signout")
    page.wait_for_url("**/index.html*")
    check("sign-out: confirmation message shown", "signed out" in page.inner_text("#notice"))
    login(page, "manager", "manager123")
    page.goto(BASE + "/bookings.html"); page.wait_for_selector("#table-wrap:not([hidden])")
    page.fill("#q", "Browser Test Two"); page.wait_for_timeout(500)
    page.click("#tbody button:has-text('Delete')")
    check("delete: confirmation dialog opens", page.is_visible("#confirm-dialog"))
    check("delete: focus starts on the safe 'Keep' button", page.evaluate("document.activeElement.id") == "dlg-keep")
    page.keyboard.press("Escape")
    check("delete: Escape closes dialog, row kept", not page.is_visible("#confirm-dialog") and page.locator("#tbody tr").count() == 1)
    page.click("#tbody button:has-text('Delete')"); page.click("#dlg-delete")
    page.wait_for_selector("#notice .notice-success")
    check("delete: record removed with Undo offered", page.locator("#tbody tr").count() == 0 and page.is_visible("text=Undo delete"))
    check("delete: focus moved to results heading", page.evaluate("document.activeElement.id") == "results-heading")
    page.click("text=Undo delete")
    page.wait_for_selector("text=was restored")
    check("undo: record restored", page.locator("#tbody tr").count() == 1)
    page.click("#clear")
    shot(page, "bookings-manager")

    # ---------- keyboard / focus visibility ----------
    page.goto(BASE + "/booking-form.html"); page.wait_for_selector("#booking-form:not([hidden])")
    seen, bad = [], []
    for _ in range(40):
        page.keyboard.press("Tab")
        info = page.evaluate("""() => { const e = document.activeElement; const s = getComputedStyle(e);
            return {tag: e.tagName, id: e.id, outline: s.outlineStyle, w: parseFloat(s.outlineWidth), focused: e.matches(':focus')}; }""")
        seen.append(info["id"] or info["tag"])
        # Chrome's date input moves focus to an internal picker button (drawn by the browser);
        # in that moment the host element no longer matches :focus, so skip it.
        if info["tag"] != "BODY" and info["focused"] and (info["outline"] == "none" or info["w"] < 2):
            bad.append(info)
    check("keyboard: 40 Tab presses reach many controls, no trap", len(set(seen)) > 20, len(set(seen)))
    check("keyboard: every focused control has a visible outline", not bad, bad[:3])
    page.keyboard.press("Home")
    page.goto(BASE + "/dashboard.html"); page.wait_for_selector("#dash-content:not([hidden])")
    page.keyboard.press("Tab")
    check("keyboard: skip link is first tab stop and becomes visible",
          page.evaluate("document.activeElement.className") == "skip-link" and page.evaluate("document.activeElement.getBoundingClientRect().top") >= 0)

    # ---------- reflow / zoom / responsive ----------
    for name, w in [("320 (phone / 400% zoom)", 320), ("640 (200% zoom of 1280)", 640), ("768 (tablet)", 768)]:
        ctx2 = browser.new_context(viewport={"width": w, "height": 800})
        pg = ctx2.new_page()
        login(pg, "manager", "manager123")
        for path, ready in [("/dashboard.html", "#dash-content:not([hidden])"), ("/bookings.html", "#table-wrap:not([hidden])"),
                            ("/booking-form.html", "#booking-form"), ("/index.html?x=1", "#login-form")]:
            if path.startswith("/index"):
                pg.evaluate("sessionStorage.clear()")
            pg.goto(BASE + path); pg.wait_for_selector(ready)
            sw = pg.evaluate("document.documentElement.scrollWidth")
            check("reflow @" + name + ": no horizontal scroll on " + path.split('?')[0], sw <= w, sw)
            if w == 320 and SHOTS:
                shot(pg, "mobile-" + path.strip("/").split(".")[0].split("?")[0])
        ctx2.close()

    # text spacing (WCAG 1.4.12) - inject the required overrides and ensure nothing overflows
    ctx3 = browser.new_context(viewport={"width": 1280, "height": 900}, bypass_csp=True)  # bypass only to inject the test stylesheet
    pg = ctx3.new_page(); login(pg, "agent", "agent123")
    pg.goto(BASE + "/bookings.html"); pg.wait_for_selector("#table-wrap:not([hidden])")
    pg.add_style_tag(content="*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important} p{margin-bottom:2em!important}")
    pg.set_viewport_size({"width": 640, "height": 900})
    check("text spacing (1.4.12) @200%: no horizontal scroll", pg.evaluate("document.documentElement.scrollWidth") <= 640)
    ctx3.close()

    # ---------- roles: server refuses delete for agents ----------
    ctx5 = browser.new_context(viewport={"width": 1280, "height": 900})
    pg = ctx5.new_page(); login(pg, "agent", "agent123")
    st = pg.evaluate("""async () => { const r = await fetch('/api/bookings/WD-0001', {method:'DELETE', headers:{'X-WD-Role':'agent'}}); return r.status; }""")
    check("roles: server refuses DELETE from an agent (403)", st == 403, st)

    # ---------- editing keeps the original 'booked by' ----------
    ref = pg.evaluate("""async () => { const d = await (await fetch('/api/bookings')).json();
        return d.bookings.find(b => b.bookedBy === 'Morgan Blake').reference; }""")
    pg.goto(BASE + "/booking-form.html?id=" + ref); pg.wait_for_selector("#booking-form:not([hidden])")
    check("edit: shows the original agent in 'Booked by'", pg.inner_text("#booked-by") == "Morgan Blake")
    pg.fill("#notes", "edited in test"); pg.click("#save-btn")
    pg.wait_for_url("**/bookings.html*", timeout=5000)
    who = pg.evaluate("async (r) => (await (await fetch('/api/bookings/' + r)).json()).bookedBy", ref)
    check("edit: saving by a different agent keeps the original 'booked by'", who == "Morgan Blake", who)

    # ---------- unsaved-changes warning ----------
    dialogs = []
    pg.on("dialog", lambda d: (dialogs.append(d.type), d.accept()))
    pg.goto(BASE + "/booking-form.html"); pg.wait_for_selector("#booking-form")
    pg.fill("#customerName", "Half typed")
    pg.click("nav >> text=Dashboard")
    pg.wait_for_url("**/dashboard.html", timeout=5000)
    check("form: leaving with typed data triggers the browser's unsaved-changes prompt", "beforeunload" in dialogs, dialogs)
    dialogs.clear()
    pg.goto(BASE + "/booking-form.html"); pg.wait_for_selector("#booking-form")
    pg.click("nav >> text=Dashboard"); pg.wait_for_url("**/dashboard.html", timeout=5000)
    check("form: no prompt when nothing was typed", not dialogs, dialogs)
    ctx5.close()

    # ---------- accessible names in Chrome's accessibility tree (axe-style check) ----------
    NAMED = ("button", "link", "textbox", "combobox", "checkbox", "radio", "spinbutton", "searchbox")
    for who, user, pw, pages in [
        ("signed out", None, None, ["/index.html"]),
        ("manager", "manager", "manager123", ["/dashboard.html", "/bookings.html", "/booking-form.html"]),
    ]:
        c = browser.new_context(viewport={"width": 1280, "height": 900}); pg = c.new_page()
        if user: login(pg, user, pw)
        for path in pages:
            pg.goto(BASE + path); pg.wait_for_timeout(700)
            cdp = c.new_cdp_session(pg)
            nodes = cdp.send("Accessibility.getFullAXTree")["nodes"]
            unnamed = [n["role"]["value"] for n in nodes if not n.get("ignored")
                       and n.get("role", {}).get("value") in NAMED
                       and not str(n.get("name", {}).get("value", "")).strip()]
            check("a11y tree: every control on " + path + " has an accessible name", not unnamed, unnamed)
        c.close()

    browser.close()

real_console = [c for c in console_problems if "favicon" not in c.lower()]
check("no console errors or CSP violations during the run", not real_console, real_console[:3])
failed = [r for r in results if not r[0]]
print("\n%d checks, %d passed, %d failed" % (len(results), len(results) - len(failed), len(failed)))
sys.exit(1 if failed else 0)
