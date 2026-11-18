// التطبيق كتطبيق مثبَّت: يعمل أوفلاين، التحديث لا يمس البيانات، القفل، واسترجاع المرآة.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch, openApp, go, swReady, APP_DIR, sheet } from './helpers.mjs';
import { writeSwAssets } from '../../tools/gen-sw-assets.mjs';

test('يعمل بدون إنترنت بعد أول فتح، والبيانات باقية', async () => {
  const t = await launch();
  const { page, context } = t;
  try {
    await openApp(page, t.url);
    await swReady(page);
    await page.evaluate(() => window.__pa.store.run((b) => b.upsert('person', { id: 'off', name: 'شخص أوفلاين' })));
    await context.setOffline(true);
    await page.reload();
    await page.waitForSelector('.tabbar');
    await go(page, '#/people');
    assert.match(await page.locator('#screen').innerText(), /شخص أوفلاين/);
  } finally {
    await t.close();
  }
});

test('تحديث الكود يعرض «تحديث الآن» ولا يمس البيانات', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pa-app-'));
  cpSync(APP_DIR, dir, { recursive: true });
  const t = await launch({ root: dir });
  const { page } = t;
  try {
    await openApp(page, t.url);
    await swReady(page);
    await page.evaluate(() => window.__pa.store.run((b) => b.upsert('person', { id: 'keep', name: 'باقٍ بعد التحديث' })));
    const before = await page.evaluate(() => window.__pa.store.events.length);
    const p = join(dir, 'src/config/version.js');
    writeFileSync(p, readFileSync(p, 'utf8').replace(/APP_VERSION = '[^']+'/, "APP_VERSION = '9.9.9'"));
    writeSwAssets(dir);
    await page.reload();
    await page.waitForSelector('.banner.info', { timeout: 15000 });
    await page.getByRole('button', { name: 'تحديث الآن' }).click();
    await page.waitForFunction(() => window.__pa && window.__pa.version === '9.9.9', null, { timeout: 15000 });
    assert.equal(await page.evaluate(() => window.__pa.store.events.length), before);
  } finally {
    await t.close();
  }
});

test('قفل الرقم السري: يطلب الرقم ويرفض الخطأ', async () => {
  const t = await launch();
  const { page } = t;
  try {
    await openApp(page, t.url);
    await go(page, '#/settings');
    await page.getByRole('button', { name: 'تفعيل القفل' }).click();
    await sheet(page).getByLabel('الرقم الجديد').fill('2468');
    await sheet(page).getByLabel('تأكيد الرقم').fill('2468');
    await sheet(page).getByRole('button', { name: 'حفظ' }).click();
    await page.reload();
    await page.waitForSelector('.lock');
    for (const d of '1111') await page.getByRole('button', { name: d, exact: true }).click();
    await page.waitForSelector('text=رقم غير صحيح');
    for (const d of '2468') await page.getByRole('button', { name: d, exact: true }).click();
    await page.waitForSelector('.tabbar');
  } finally {
    await t.close();
  }
});

test('اختفاء قاعدة البيانات وحدها: يعرض الاسترجاع من النسخة المرآة', async () => {
  const t = await launch();
  const { page } = t;
  page.on('dialog', (d) => d.accept());
  try {
    await openApp(page, t.url);
    await page.evaluate(() => window.__pa.store.run((b) => b.upsert('person', { id: 'mir', name: 'محفوظ في المرآة' })));
    await page.evaluate(() => window.__pa.mirror.flush());
    await page.evaluate(() => new Promise((r) => { window.__pa.store.close(); const q = indexedDB.deleteDatabase('personal-assistant'); q.onsuccess = q.onerror = q.onblocked = () => r(); }));
    await page.reload();
    await page.waitForSelector('.dialog');
    await page.locator('.dialog').getByRole('button', { name: 'استرجاع' }).click();
    await page.waitForSelector('.tabbar');
    await go(page, '#/people');
    assert.match(await page.locator('#screen').innerText(), /محفوظ في المرآة/);
  } finally {
    await t.close();
  }
});
