// تدفقات المستخدم الأساسية على محاكاة iPhone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { launch, openApp, go, sheet, createCycle } from './helpers.mjs';

const money = (s) => Number(String(s).replace(/[^\d.-]/g, ''));

test('دورة كاملة: إنشاء، حصص، إدخال شهر، دفعة، أرصدة، إقفال الشهر، تعديل وإلغاء', async () => {
  const t = await launch();
  const { page } = t;
  page.on('dialog', (d) => d.accept());
  try {
    await openApp(page, t.url);
    const id = await createCycle(page);
    assert.ok(id);
    // إدخال شهر نوفمبر: 600 طبق × 110 + 10 دبل × 130، علف 4 طن × 15000، أجرة 9000
    await go(page, `#/poultry/cycle/${id}`);
    await page.getByRole('button', { name: 'إدخال شهر' }).click();
    const b = sheet(page);
    await b.getByLabel('الشهر', { exact: true }).selectOption('2025-11');
    const sales = b.locator('.lines').nth(0);
    await sales.locator('.line').first().locator('input').nth(0).fill('600');
    await sales.locator('.line').first().locator('input').nth(1).fill('110');
    await b.getByRole('button', { name: '+ سطر بيع' }).click();
    await page.getByRole('option', { name: 'بيض دبل' }).click();
    await sales.locator('.line').nth(1).locator('input').nth(0).fill('10');
    await sales.locator('.line').nth(1).locator('input').nth(1).fill('130');
    const exps = b.locator('.lines').nth(1);
    await exps.locator('.line').first().locator('input').nth(0).fill('4');
    await exps.locator('.line').first().locator('input').nth(1).fill('15000');
    await b.getByRole('button', { name: '+ سطر مصروف' }).click();
    await page.getByRole('option', { name: /أجرة العمال/ }).click();
    await exps.locator('.line').nth(1).locator('input').nth(2).fill('9000');
    assert.match(await b.locator('.line-summary').last().innerText(), /67,300.*69,000/);
    await b.getByRole('button', { name: 'حفظ كل الأسطر' }).click();
    await page.waitForFunction(() => !document.querySelector('.sheet'));
    // دفعة مني للمدير 100000 ودفعة الشريك التابع لي 30000
    await page.getByRole('button', { name: 'دفعة' }).first().click();
    await sheet(page).getByLabel('المبلغ').fill('100000');
    await sheet(page).getByRole('button', { name: 'حفظ' }).click();
    await page.waitForFunction(() => !document.querySelector('.sheet'));
    await page.getByRole('button', { name: 'دفعة' }).first().click();
    await sheet(page).getByRole('tab', { name: 'تابع دفع لرأسه' }).click();
    await sheet(page).getByLabel('المبلغ').fill('30000');
    await sheet(page).getByRole('button', { name: 'حفظ' }).click();
    await page.waitForFunction(() => !document.querySelector('.sheet'));
    // الشهر: صافي -1700؛ ناحيتي = 100000 + نصف (-1700) = 99150
    await go(page, `#/poultry/cycle/${id}/month/2025-11`);
    assert.match(await page.locator('.stat').nth(2).innerText(), /-1,700/);
    await go(page, `#/poultry/cycle/${id}/partners`);
    const text = await page.locator('#screen').innerText();
    assert.match(text, /99,150/);
    // التابع: دفع 30000 + نصيبه (-1700/6 = -283.33) = 29716.67
    assert.match(text, /29,716.67/);
    // إقفال الشهر ثم محاولة الإضافة عليه
    await go(page, `#/poultry/cycle/${id}/month/2025-11`);
    await page.getByRole('button', { name: 'إقفال الشهر (تم التحاسب)' }).click();
    await page.locator('.dialog').getByRole('button', { name: 'إقفال' }).click();
    await page.waitForSelector('.banner.info');
    assert.match(await page.locator('#screen').innerText(), /مقفول/);
    // فتح الشهر بسبب، ثم تعديل سطر الأجرة إلى 9500
    await page.getByRole('button', { name: 'فتح للتعديل' }).click();
    await page.locator('.dialog input').fill('تصحيح الأجرة');
    await page.locator('.dialog').getByRole('button', { name: 'فتح', exact: true }).click();
    await page.getByRole('button', { name: /أجرة العمال/ }).click();
    await page.getByRole('button', { name: 'تعديل' }).click();
    await sheet(page).getByLabel('المبلغ').fill('9500');
    await sheet(page).getByRole('button', { name: 'حفظ' }).click();
    await page.locator('.dialog').getByRole('button', { name: 'حفظ التعديل' }).click();
    await page.waitForFunction(() => !document.querySelector('.sheet'));
    await go(page, `#/poultry/cycle/${id}/month/2025-11`);
    assert.match(await page.locator('.stat').nth(2).innerText(), /-2,200/);
    // إلغاء قيد الدبل
    await page.getByRole('button', { name: /بيض دبل/ }).click();
    await page.getByRole('button', { name: 'إلغاء القيد' }).click();
    await page.locator('.dialog input').fill('خطأ إدخال');
    await page.locator('.dialog').getByRole('button', { name: 'إلغاء القيد' }).click();
    await page.waitForSelector('.banner.bad');
    await go(page, `#/poultry/cycle/${id}/month/2025-11`);
    assert.match(await page.locator('.stat').nth(2).innerText(), /-3,500/);
    // المؤشرات والشاشات الأخرى تُفتح بلا أخطاء
    for (const tab of ['summary', 'months', 'entries', 'kpis', 'setup']) {
      await go(page, `#/poultry/cycle/${id}/${tab}`);
      assert.equal(await page.locator('.banner.bad').count(), 0, tab);
    }
    // التصفية: تسجيلها يجعل الأرصدة صفراً
    await go(page, `#/poultry/cycle/${id}/settle`);
    assert.match(await page.locator('#screen').innerText(), /يدفع/);
    await page.getByRole('button', { name: 'تسجيل التصفية كدفعات' }).click();
    await page.locator('.dialog').getByRole('button', { name: 'تسجيل' }).click();
    await page.waitForSelector('text=كل الحسابات مسوّاة');
    await go(page, '#/finance');
    assert.match(await page.locator('#screen').innerText(), /لا توجد أرصدة|وضعي المالي/);
    await go(page, '#/');
    assert.match(await page.locator('#screen').innerText(), /دورة-اختبار/);
    assert.deepEqual(t.errors, []);
  } finally {
    await t.close();
  }
});

test('النسخ الاحتياطي: تصدير ثم استيراد على جهاز جديد يعيد كل شيء', async () => {
  const t = await launch();
  const { page } = t;
  try {
    await openApp(page, t.url);
    const id = await createCycle(page, { name: 'دورة-نسخ' });
    await go(page, '#/backup');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'تصدير نسخة احتياطية' }).click()]);
    const path = await dl.path();
    const doc = JSON.parse(readFileSync(path, 'utf8'));
    assert.equal(doc.app, 'personal-assistant');
    // جهاز جديد: سياق جديد بلا بيانات
    const ctx2 = await t.browser.newContext({ serviceWorkers: 'block' });
    const p2 = await ctx2.newPage();
    await openApp(p2, t.url);
    await go(p2, '#/backup');
    await p2.locator('#import-file').setInputFiles(path);
    await p2.locator('.sheet').getByRole('button', { name: /استيراد|دمج/ }).first().click();
    await p2.waitForFunction(() => !document.querySelector('.sheet'));
    await go(p2, `#/poultry/cycle/${id}/partners`);
    assert.match(await p2.locator('#screen').innerText(), /شريك تابع/);
    await ctx2.close();
  } finally {
    await t.close();
  }
});

test('إخفاء الأرصدة بضغطة وإظهارها', async () => {
  const t = await launch();
  const { page } = t;
  try {
    await openApp(page, t.url);
    await page.locator('#privacy-toggle').click();
    await page.waitForFunction(() => document.querySelector('.stat .value').textContent.includes('•'));
    await page.locator('#privacy-toggle').click();
    await page.waitForFunction(() => !document.querySelector('.stat .value').textContent.includes('•'));
    assert.match(await page.locator('.stat .value').first().innerText(), /\d/);
  } finally {
    await t.close();
  }
});

test('إضافة بيع أو شراء على فترة التأسيس أو البشاير أو شهر محدد، مع فتح الفترة المقفولة', async () => {
  const t = await launch();
  const { page } = t;
  try {
    await openApp(page, t.url);
    const id = await createCycle(page, { name: 'دورة-فترات', settle: '2025-11' });
    await page.evaluate((cid) => window.__pa.store.run((b) => b.upsert('poultry.cycle', { id: cid, layStart: '2025-10-01' })), id);
    await go(page, `#/poultry/cycle/${id}`);
    // شراء على فترة التأسيس (شهر أغسطس)
    await page.getByRole('button', { name: 'شراء/مصروف' }).click();
    let s = sheet(page);
    await s.getByRole('tab', { name: 'التأسيس' }).click();
    await s.getByLabel('الشهر', { exact: true }).selectOption('2025-08');
    await s.getByLabel('الإجمالي').fill('6000');
    await s.getByRole('button', { name: 'حفظ' }).click();
    await page.waitForFunction(() => !document.querySelector('.sheet'));
    // بيع على فترة البشاير
    await page.getByRole('button', { name: 'بيع' }).first().click();
    s = sheet(page);
    await s.getByRole('tab', { name: 'البشاير' }).click();
    await s.getByLabel('عدد الأطباق').fill('10');
    await s.getByLabel('سعر الطبق').fill('100');
    await s.getByRole('button', { name: 'حفظ' }).click();
    await page.waitForFunction(() => !document.querySelector('.sheet'));
    const d = await page.evaluate((cid) => {
      const st = window.__pa.store.state;
      return st.entries.filter((e) => e.cycleId === cid && (e.kind === 'poultry.expense' || e.kind === 'poultry.sale')).map((e) => [e.kind, e.month]);
    }, id);
    assert.deepEqual(d.sort(), [['poultry.expense', '2025-08'], ['poultry.sale', '2025-10']]);
    await go(page, `#/poultry/cycle/${id}/summary`);
    assert.match(await page.locator('#screen').innerText(), /إجمالي التأسيس[\s\S]*5,000/); // 6000 تربية − 1000 بشاير
    // إقفال فترة البشاير ثم الإضافة عليها بعد فتحها من النموذج
    await go(page, `#/poultry/cycle/${id}/period/2025-10/2025-10`);
    await page.getByRole('button', { name: /إقفال/ }).click();
    await page.locator('.dialog').getByRole('button', { name: 'إقفال' }).click();
    await go(page, `#/poultry/cycle/${id}`);
    await page.getByRole('button', { name: 'شراء/مصروف' }).click();
    s = sheet(page);
    await s.getByRole('tab', { name: 'البشاير' }).click();
    await s.locator('.closed-note').waitFor();
    await s.getByRole('button', { name: 'فتح للإضافة' }).click();
    await page.locator('.dialog').getByRole('button', { name: 'فتح' }).click();
    await s.getByLabel('الإجمالي').fill('500');
    await s.getByRole('button', { name: 'حفظ' }).click();
    await page.waitForFunction(() => !document.querySelector('.sheet'));
    assert.deepEqual(t.errors, []);
  } finally {
    await t.close();
  }
});
