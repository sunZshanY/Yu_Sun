"""Browser regression checks. Run: python -m unittest discover -s tests -v"""
import functools
import json
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
import unittest

from playwright.sync_api import expect, sync_playwright


ROOT = Path(__file__).resolve().parents[1]
POST = {"id": 1, "title": "Fresh article", "date": "2026-09-24",
        "content": "Updated article body.", "tags": ["test"]}


class StaticHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


class FrontendTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(
            ("127.0.0.1", 0), functools.partial(StaticHandler, directory=str(ROOT)))
        cls.server_thread = Thread(target=cls.server.serve_forever, daemon=True)
        cls.server_thread.start()
        cls.origin = "http://127.0.0.1:" + str(cls.server.server_port)
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch()

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()
        cls.server.shutdown()
        cls.server.server_close()
        cls.server_thread.join()

    def setUp(self):
        self.context = self.browser.new_context(viewport={"width": 1440, "height": 900})
        # Keep regression runs local: do not contact analytics or third-party widgets.
        self.context.route("**/*", lambda route: route.continue_()
                           if route.request.url.startswith(self.origin + "/") else route.abort())
        self.context.route("**/api/bg?*", lambda route: route.abort())
        self.context.route("**/api/visitors/heartbeat", lambda route: route.fulfill(status=204))
        self.context.route("**/api/posts-data", lambda route: route.fulfill(status=503))
        self.errors = []
        self.context.on("page", lambda page: page.on("pageerror", lambda error: self.errors.append(str(error))))
        self.page = self.context.new_page()

    def tearDown(self):
        self.context.unroute_all(behavior="wait")
        self.context.close()
        self.assertEqual(self.errors, [], "Unexpected browser JavaScript errors")

    def goto(self, path="home.html"):
        self.page.goto(self.origin + "/" + path, wait_until="domcontentloaded")

    def theme(self, page, mode):
        expect(page.locator("html")).to_have_attribute("data-theme", mode)
        expect(page.locator('[data-theme-value="' + mode + '"]')).to_have_attribute("aria-pressed", "true")
        self.assertEqual(page.locator('[data-theme-value][aria-pressed="true"]').count(), 1)

    def api(self, payload):
        self.context.route("**/api/posts-data", lambda route: route.fulfill(json=payload))

    def giscus_stub(self):
        # Exercise the embed boundary locally; never post comments to GitHub in tests.
        self.context.route("https://giscus.app/client.js", lambda route: route.fulfill(
            content_type="application/javascript", headers={"Access-Control-Allow-Origin": "*"}, body="""
            const frame = document.createElement('iframe');
            frame.className = 'giscus-frame';
            frame.src = 'https://giscus.app/widget?theme=' + document.currentScript.dataset.theme;
            document.querySelector('.giscus').appendChild(frame);
            """))
        self.context.route("https://giscus.app/widget?*", lambda route: route.fulfill(
            content_type="text/html", body="""<!doctype html><html><body>
            <textarea aria-label="Comment draft"></textarea>
            <script>
            document.documentElement.dataset.theme = new URL(location.href).searchParams.get('theme');
            window.addEventListener('message', event => {
                if (event.source === parent && event.data?.giscus?.setConfig?.theme) {
                    document.documentElement.dataset.theme = event.data.giscus.setConfig.theme;
                }
            });
            parent.postMessage({giscus: {discussion: {number: 5}}}, '*');
            </script></body></html>"""))

    def test_discussion_loads_on_demand_and_preserves_draft_when_switching_theme(self):
        self.giscus_stub()
        self.page.emulate_media(reduced_motion="reduce")
        self.goto()
        client = self.page.locator('script[src="https://giscus.app/client.js"]')
        expect(client).to_have_count(0)
        self.page.get_by_role("button", name="深色主题", exact=True).click()
        self.page.locator('[data-panel="discussion"]').click()
        expect(client).to_have_count(1)
        expect(client).to_have_attribute("data-repo", "sunZshanY/personal_website")
        expect(client).to_have_attribute("data-mapping", "number")
        expect(client).to_have_attribute("data-term", "5")
        frame = self.page.frame_locator('.giscus-frame')
        expect(frame.locator('html')).to_have_attribute('data-theme', 'dark')
        expect(self.page.locator('#discussionStatus')).to_be_hidden()
        draft = frame.get_by_role('textbox', name='Comment draft')
        draft.fill('Keep my draft')
        self.page.get_by_role("button", name="浅色主题", exact=True).click()
        expect(frame.locator('html')).to_have_attribute('data-theme', 'light')
        self.page.locator('[data-panel="friends-link"]').click()
        self.page.locator('[data-panel="discussion"]').click()
        expect(client).to_have_count(1)
        expect(draft).to_have_value('Keep my draft')
        for width in [320, 768, 1440]:
            self.page.set_viewport_size({"width": width, "height": 850})
            bounds = self.page.locator('.giscus-frame').bounding_box()
            self.assertGreaterEqual(bounds['x'], 0)
            self.assertLessEqual(bounds['x'] + bounds['width'], width)
            expect(self.page.locator('.rinui-topbar')).to_be_in_viewport()
            expect(self.page.locator('.rinui-statusbar')).to_be_in_viewport()

    def test_discussion_links_and_sign_in_return_open_panel(self):
        self.giscus_stub()
        for path in ['home.html#discussion', 'home.html#discussionComments',
                     'home.html#comments', 'home.html?giscus=test-session']:
            with self.subTest(path=path):
                self.goto(path)
                expect(self.page.locator('#discussion')).to_be_visible()
                expect(self.page.locator('[data-panel="discussion"]')).to_have_attribute('aria-current', 'page')
                expect(self.page.locator('.giscus-frame')).to_have_count(1)

    def test_discussion_network_failure_keeps_github_link_available(self):
        self.goto()
        self.page.locator('[data-panel="discussion"]').click()
        expect(self.page.locator('#discussionStatus')).to_contain_text('讨论暂时无法加载')
        link = self.page.get_by_role('link', name='在 GitHub 中参与')
        expect(link).to_be_visible()
        expect(link).to_have_attribute('href', 'https://github.com/sunZshanY/personal_website/discussions/5')
        expect(self.page.locator('#flm-comment-widget')).to_have_count(0)
        expect(self.page.locator('script[src*="fakeicp"]')).to_have_count(0)

    def test_sliding_thumb_and_keyboard_on_both_pages(self):
        for path in ["home.html", "read.html?post=1"]:
            with self.subTest(path=path):
                self.goto(path)
                self.theme(self.page, "light")
                self.assertIn(self.page.locator(".theme-switch").evaluate(
                    "el => getComputedStyle(el).display"), ["flex", "inline-flex"])
                motion = self.page.evaluate("""() => {
                    const control = document.querySelector('.theme-switch');
                    const style = () => getComputedStyle(control, '::before');
                    const x = () => new DOMMatrixReadOnly(style().transform).m41;
                    const start = x();
                    document.querySelector('[data-theme-value="dark"]').click();
                    style().transform;
                    const animation = control.getAnimations({subtree: true})
                        .find(item => item.transitionProperty === 'transform');
                    if (!animation) throw new Error('Missing sliding transition');
                    animation.pause();
                    animation.currentTime = animation.effect.getTiming().duration / 2;
                    const middle = x();
                    animation.finish();
                    return {start, middle, end: x(), width: parseFloat(style().width)};
                }""")
                self.assertEqual(motion["start"], 0)
                self.assertGreater(motion["middle"], 0)
                self.assertLess(motion["middle"], motion["end"])
                self.assertAlmostEqual(motion["end"], motion["width"], delta=1)
                self.theme(self.page, "dark")
                dark = self.page.get_by_role("button", name="深色主题", exact=True)
                dark.focus()
                dark.press("ArrowLeft")
                self.theme(self.page, "light")
                self.page.keyboard.press("ArrowRight")
                self.theme(self.page, "dark")
                light = self.page.get_by_role("button", name="浅色主题", exact=True)
                light.focus()
                light.press("Space")
                self.theme(self.page, "light")

    def test_restore_before_body_and_sync_across_tabs(self):
        self.context.add_init_script("""try { localStorage.setItem('omiblog_theme', 'dark'); } catch (error) {}
            new MutationObserver(records => {
                if (!window.themeBoot && records.some(record => record.attributeName === 'data-theme')) {
                    window.themeBoot = {theme: document.documentElement.dataset.theme, bodyExists: !!document.body};
                }
            }).observe(document, {subtree: true, attributes: true});""")
        self.goto()
        self.theme(self.page, "dark")
        self.assertEqual(self.page.evaluate("window.themeBoot"), {"theme": "dark", "bodyExists": False})
        reader = self.context.new_page()
        reader.goto(self.origin + "/read.html?post=1")
        self.theme(reader, "dark")
        reader.get_by_role("button", name="浅色主题", exact=True).click()
        self.theme(self.page, "light")
        reader.get_by_role("button", name="深色主题", exact=True).click()
        self.theme(self.page, "dark")
        reader.evaluate("localStorage.clear()")
        self.theme(self.page, "light")

    def test_saved_choice_survives_navigation_reload_and_invalid_value(self):
        self.goto()
        self.page.get_by_role("button", name="深色主题", exact=True).click()
        self.page.reload()
        self.theme(self.page, "dark")
        self.goto("read.html?post=1")
        self.theme(self.page, "dark")
        self.page.evaluate("localStorage.setItem('omiblog_theme', 'invalid')")
        self.page.reload()
        self.theme(self.page, "light")

    def test_mobile_layout_and_reduced_motion(self):
        self.page.emulate_media(reduced_motion="reduce")
        for width in [320, 375, 480, 768, 1440]:
            self.page.set_viewport_size({"width": width, "height": 850})
        for path in ["home.html", "read.html?post=1"]:
                with self.subTest(width=width, path=path):
                    self.goto(path)
                    self.page.get_by_role("button", name="深色主题", exact=True).click()
                    self.theme(self.page, "dark")
                    layout = self.page.locator(".theme-switch").evaluate("""el => {
                        const box = el.getBoundingClientRect();
                        const topbar = el.closest('header').getBoundingClientRect();
                        return {left: box.left, right: box.right, top: box.top, bottom: box.bottom,
                            barBottom: topbar.bottom, viewport: innerWidth,
                            duration: getComputedStyle(el, '::before').transitionDuration,
                            overflow: document.documentElement.scrollWidth > innerWidth};
                    }""")
                    self.assertGreaterEqual(layout["left"], 0)
                    self.assertLessEqual(layout["right"], layout["viewport"])
                    self.assertGreaterEqual(layout["top"], 0)
                    self.assertLessEqual(layout["bottom"], layout["barBottom"])
                    self.assertFalse(layout["overflow"])
                    self.assertTrue(all(float(value.strip().removesuffix("s")) == 0
                                        for value in layout["duration"].split(",")))

    def test_blocked_storage_does_not_break_theme_or_content(self):
        self.context.add_init_script("""for (const key of ['localStorage', 'sessionStorage']) {
            Object.defineProperty(window, key, {get() { throw new DOMException('Blocked', 'SecurityError'); }});
        }""")
        for path, selector in [("home.html", ".blog-card"), ("read.html?post=1", ".article-title")]:
            self.goto(path)
            expect(self.page.locator(selector).first).to_be_visible()
            self.page.get_by_role("button", name="深色主题", exact=True).click()
            self.theme(self.page, "dark")

    def test_live_posts_replace_stale_cache_and_preserve_home_interactions(self):
        self.api({"posts": [POST]})
        stale = dict(POST, title="Stale article")
        self.context.add_init_script("localStorage.setItem('omiblog_z', " + json.dumps(json.dumps([stale])) + ");")
        self.goto("read.html?post=1")
        expect(self.page.locator(".article-title")).to_have_text("Fresh article")
        self.goto()
        expect(self.page.locator(".blog-card-title")).to_have_text("Fresh article")
        self.page.locator("#blogSearch").fill("missing")
        expect(self.page.locator("#blogEmpty")).to_be_visible()
        self.page.locator("#blogSearch").fill("Fresh")
        expect(self.page.locator(".blog-card")).to_be_visible()
        self.page.locator(".read-more").click()
        expect(self.page.locator(".blog-card")).to_have_class("blog-card expanded")
        self.page.locator(".blog-card-title").click()
        expect(self.page.locator(".article-title")).to_have_text("Fresh article")

    def test_invalid_api_uses_static_data_and_offline_uses_cache(self):
        self.api({"unexpected": []})
        self.goto("read.html?post=1")
        expect(self.page.locator(".article-title")).to_have_text("Hello World")
        self.page.evaluate("post => localStorage.setItem('omiblog_z', JSON.stringify([post]))", POST)
        self.context.route("**/data/posts.json", lambda route: route.fulfill(status=503))
        self.page.reload()
        expect(self.page.locator(".article-title")).to_have_text("Fresh article")
        self.page.evaluate("localStorage.setItem('omiblog_z', '{broken')")
        self.page.reload()
        expect(self.page.locator(".read-404 h2")).to_contain_text("文章未找到")

    def test_hanging_api_times_out_to_static_data(self):
        pending_routes = []
        self.context.route("**/api/posts-data", lambda route: pending_routes.append(route))
        self.page.clock.install()
        self.goto("read.html?post=1")
        try:
            expect(self.page.locator(".read-404 h2")).to_contain_text("加载中")
            self.page.clock.fast_forward(8100)
            expect(self.page.locator(".article-title")).to_have_text("Hello World")
        finally:
            for route in pending_routes:
                route.abort()


    def test_splash_screen_shows_greeting_and_enters_home(self):
        self.goto("index.html")
        expect(self.page.locator(".title")).to_have_text("Hello My name is Yu Sun")
        expect(self.page.locator(".welcome")).to_have_text("欢迎来到我的网页")
        self.page.mouse.click(5, 5)
        expect(self.page.locator(".rinui-topbar")).to_be_visible()
        expect(self.page.locator(".hero-title")).to_have_text("私のウェブページへようこそ")
        expect(self.page.locator(".hero-subtitle")).to_have_text("欢迎来到我的网页")


if __name__ == "__main__":
    unittest.main(verbosity=2)
