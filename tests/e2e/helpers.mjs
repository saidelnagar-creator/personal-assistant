// أدوات اختبارات المتصفح: خادم ثابت على مسار فرعي (مثل GitHub Pages) + Chromium بمحاكاة iPhone.
// WebKit غير مثبت في بيئة التطوير؛ نحاكي iPhone (المقاس، اللمس، user-agent) على Chromium.
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../../tools/serve.mjs';

const require = createRequire(import.meta.url);
export const { chromium, devices } = require('playwright');
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const APP_DIR = resolve(ROOT, 'app');
const iPhone = devices['iPhone 14'];
export const IPHONE = { viewport: iPhone.viewport, userAgent: iPhone.userAgent, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'ar-EG', timezoneId: 'Africa/Cairo' };

export async function launch({ root = APP_DIR, base = '/personal-assistant/' } = {}) {
  let current = root;
  const srv = await startServer({ getRoot: () => current, base });
  const browser = await chromium.launch();
  const context = await browser.newContext({ ...IPHONE, serviceWorkers: 'allow', acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return {
    browser,
    context,
    page,
    errors,
    url: srv.url,
    setRoot: (r) => (current = r),
    stopServer: () => srv.close(),
    async close() {
      await browser.close();
      await srv.close().catch(() => {});
    },
  };
}

export async function openApp(page, url) {
  await page.goto(url);
  await page.waitForSelector('.tabbar', { timeout: 15000 });
}

export const go = (page, hash) => page.evaluate((h) => (location.hash = h), hash).then(() => page.waitForTimeout(120));
export const sheet = (page) => page.locator('.sheet').last();

export async function swReady(page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
  });
}

// إضافة شخص من زر «+ جديد» داخل حقل.
export async function newPerson(page, scope, name) {
  await scope.getByRole('button', { name: '+ جديد' }).click();
  await page.locator('.dialog input').fill(name);
  await page.locator('.dialog').getByRole('button', { name: 'إضافة' }).click();
}

// دورة بشركاء: أنا 1/3، شريك تابع 1/6، المدير 1/2.
export async function createCycle(page, { name = 'دورة-اختبار', start = '2025-05-05', settle = '2025-10' } = {}) {
  await go(page, '#/poultry');
  await page.getByRole('button', { name: 'دورة جديدة' }).click();
  const s = sheet(page);
  await s.getByLabel('اسم مميز للدورة').fill(name);
  await s.getByLabel('تاريخ البداية').fill(start);
  await s.getByLabel('عدد الطيور عند الشراء').fill('5000');
  if (settle) await s.getByLabel('أول شهر في التسوية الشهرية').selectOption(settle);
  await newPerson(page, s.locator('.field', { hasText: 'المدير' }), 'مدير الاختبار');
  await s.getByRole('button', { name: 'حفظ' }).click();
  await page.waitForSelector('.sheet .lines');
  const lines = page.locator('.sheet .line');
  await lines.nth(0).locator('input').first().fill('1/3');
  await lines.nth(1).locator('input').first().fill('1/2');
  await page.locator('.sheet').getByRole('button', { name: '+ شريك' }).click();
  await newPerson(page, lines.nth(2), 'شريك تابع');
  await lines.nth(2).locator('input').first().fill('1/6');
  await lines.nth(2).locator('select').last().selectOption({ label: 'تابع لـ أنا' });
  await page.locator('.sheet').getByRole('button', { name: 'حفظ الحصص' }).click();
  await page.waitForFunction(() => !document.querySelector('.sheet'));
  return page.evaluate(() => location.hash.split('/')[3]);
}
