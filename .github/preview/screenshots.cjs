// Takes preview screenshots of the running site (http://localhost:4100) for review. Used by preview.yml only.
const { chromium } = require('playwright');
const fs = require('node:fs');

const BASE = 'http://localhost:4100';
const OUT = process.argv[2] || 'preview';
const PUBLIC = [['home', '/'], ['rooms', '/rooms'], ['royal-suite', '/rooms/royal-suite'], ['dining', '/dining'], ['spa', '/spa'], ['weddings', '/weddings-events'], ['about', '/about'], ['book', '/book']];
const ADMIN = [['admin-dashboard', '/admin'], ['admin-bookings', '/admin/bookings'], ['admin-calendar', '/admin/calendar'], ['admin-rooms', '/admin/rooms'], ['admin-pages', '/admin/content/pages'], ['admin-theme', '/admin/content/theme'], ['admin-reports', '/admin/reports']];

async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => {});
  // Scroll through so in-view reveal animations and lazy images load, then return to the top.
  const h = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < h; y += 500) { await page.evaluate((v) => window.scrollTo(0, v), y); await page.waitForTimeout(120); }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2500);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  for (const [device, viewport] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: device === 'mobile' ? 2 : 1 });
    const page = await ctx.newPage();
    for (const [name, path] of PUBLIC) {
      try {
        await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
        await settle(page);
        await page.screenshot({ path: `${OUT}/${device}-${name}.png`, fullPage: false });
        if (device === 'desktop') await page.screenshot({ path: `${OUT}/${device}-${name}-full.png`, fullPage: true });
        console.log('ok', device, name);
      } catch (e) { console.log('FAIL', device, name, e.message); }
    }
    await ctx.close();
  }
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/admin', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#sl-email', { timeout: 20000 });
  await page.screenshot({ path: `${OUT}/admin-login.png` });
  await page.fill('#sl-email', 'admin@rambagh-concept.example');
  await page.fill('#sl-pw', 'Rambagh-Demo-2026');
  await page.click('button:has-text("Sign in")');
  await page.waitForSelector('#sl-email', { state: 'detached', timeout: 20000 }).catch(() => {});
  for (const [name, path] of ADMIN) {
    try {
      await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${OUT}/${name}.png` });
      console.log('ok', name);
    } catch (e) { console.log('FAIL', name, e.message); }
  }
  await browser.close();
})();
