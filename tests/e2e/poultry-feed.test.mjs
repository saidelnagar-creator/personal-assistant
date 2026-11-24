// إدخال الشهر بعد إصلاح iPhone: اختيار البند بالأزرار، السطر الفاضي يُستخدم بدل سطر جديد، الكمية + الإجمالي ⇒ سعر الطن
// ومراجعته مع المتوسط، جرد العلف، وتقارير العلف والإنتاج والمقارنة وكل بند شهراً بشهر.
import test from 'node:test';
import assert from 'node:assert/strict';
import { launch, openApp, go, sheet, createCycle } from './helpers.mjs';

const state = (page) => page.evaluate(() => window.__pa.store.state.entries.filter((e) => !e.voided && e.kind === 'poultry.expense').map(({ category, month, qty, price, amount }) => ({ category, month, qty, price, amount })));

test('إدخال الشهر: البند بالأزرار، الكمية والإجمالي ⇒ سعر الطن ومقارنته، والتقارير', async () => {
  const t = await launch();
  const { page } = t;
  try {
    await openApp(page, t.url);
    const id = await createCycle(page);
    await go(page, `#/poultry/cycle/${id}`);

    // أكتوبر: علف 5 طن × 14,000 (الكمية والسعر)
    await page.getByRole('button', { name: 'إدخال شهر' }).click();
    let b = sheet(page);
    assert.equal(await page.evaluate(() => document.body.classList.contains('sheet-open')), true);
    await b.getByLabel('الشهر', { exact: true }).selectOption('2025-10');
    let exps = b.locator('.lines').nth(1);
    await exps.locator('.line').first().locator('input.q').fill('5');
    await exps.locator('.line').first().locator('input.p').fill('14000');
    assert.equal(await exps.locator('.line').first().locator('input.a').inputValue(), '70000');
    await b.getByRole('button', { name: 'حفظ كل الأسطر' }).click();
    await page.waitForFunction(() => !document.querySelector('.sheet'));
    assert.equal(await page.evaluate(() => document.body.classList.contains('sheet-open')), false);

    // نوفمبر: علف 4 طن بإجمالي 68,000 ⇒ 17,000/طن (+21% عن المتوسط) — تنبيه
    await page.getByRole('button', { name: 'إدخال شهر' }).click();
    b = sheet(page);
    await b.getByLabel('الشهر', { exact: true }).selectOption('2025-11');
    exps = b.locator('.lines').nth(1);
    const feed = exps.locator('.line').first();
    await feed.locator('input.q').fill('4');
    await feed.locator('input.a').fill('68000');
    assert.equal(await feed.locator('input.p').inputValue(), '17000');
    const review = feed.locator('.price-review');
    assert.match(await review.innerText(), /سعر الطن: 17,000[\s\S]*متوسط آخر 3 شهور: 14,000[\s\S]*\+21.4%[\s\S]*⚠️/);
    assert.match(await review.getAttribute('class'), /warn/);

    // «+ سطر مصروف» يفتح قائمة البنود؛ الإغلاق بلا اختيار لا يضيف سطراً
    await b.getByRole('button', { name: '+ سطر مصروف' }).click();
    await sheet(page).getByRole('button', { name: 'إغلاق' }).click();
    assert.equal(await exps.locator('.line').count(), 1);
    await b.getByRole('button', { name: '+ سطر مصروف' }).click();
    await page.getByRole('option', { name: /أجرة العمال/ }).click();
    assert.equal(await exps.locator('.line').count(), 2);
    // بند بلا وحدة: الإجمالي بس، والتركيز عليه مباشرة
    assert.equal(await page.evaluate(() => document.activeElement.classList.contains('a')), true);
    assert.equal(await exps.locator('.line').nth(1).locator('input.q').isVisible(), false);
    await exps.locator('.line').nth(1).locator('input.a').fill('9000');
    // سطر فاضي موجود يُستخدم بدل سطر جديد
    await b.getByRole('button', { name: '+ سطر مصروف' }).click();
    await page.getByRole('option', { name: /نشارة/ }).click();
    assert.equal(await exps.locator('.line').count(), 3);
    await b.getByRole('button', { name: '+ سطر مصروف' }).click();
    await page.getByRole('option', { name: /كهرباء/ }).click();
    assert.equal(await exps.locator('.line').count(), 3);
    assert.match(await exps.locator('.line').nth(2).locator('.pick-btn').innerText(), /كهرباء/);
    // البيع: بيض دبل بالعدد والإجمالي ⇒ السعر محسوب ومخزَّن
    const sales = b.locator('.lines').nth(0);
    await sales.locator('.line').first().locator('input.q').fill('600');
    await sales.locator('.line').first().locator('input.p').fill('110');
    await b.getByRole('button', { name: '+ سطر بيع' }).click();
    await page.getByRole('option', { name: 'بيض دبل' }).click();
    assert.equal(await page.evaluate(() => document.activeElement.classList.contains('q')), true);
    await sales.locator('.line').nth(1).locator('input.q').fill('10');
    await sales.locator('.line').nth(1).locator('input.a').fill('1300');
    await b.getByRole('button', { name: 'حفظ كل الأسطر' }).click();
    await page.waitForFunction(() => !document.querySelector('.sheet') || document.querySelector('.form-error')?.textContent, null, { timeout: 5000 }).catch(() => {});
    assert.equal(await page.locator('.sheet .form-error').filter({ hasText: /./ }).count(), 0, await page.locator('.sheet .form-error').innerText().catch(() => ''));
    const saved = await state(page);
    assert.deepEqual(saved.find((e) => e.month === '2025-11' && e.category === 'feed'), { category: 'feed', month: '2025-11', qty: 4000, price: undefined, amount: 6800000 });
    assert.ok(saved.some((e) => e.category === 'labor' && e.amount === 900000 && e.qty === undefined));
    assert.equal(saved.length, 3); // سطر الكهرباء الفاضي لا يُحفظ

    // شراء منفرد: البند بزر (بلا select)، والبند بلا وحدة = المبلغ بس
    await page.getByRole('button', { name: 'شراء/مصروف' }).click();
    let s = sheet(page);
    assert.equal(await s.locator('select').filter({ hasText: 'علف' }).count(), 0);
    await s.getByRole('button', { name: /البند/ }).click();
    await page.getByRole('option', { name: /بيطري/ }).click();
    assert.equal(await s.getByLabel('الكمية').count(), 0);
    await s.getByRole('button', { name: /البند/ }).click();
    await page.getByRole('option', { name: /^علف/ }).click();
    await s.getByLabel('التاريخ الفعلي').fill('2025-11-15'); // المقارنة بمتوسط آخر 3 شهور قبل تاريخ الشراء (أكتوبر 14,000)
    await s.getByLabel('الكمية (طن)').fill('2');
    await s.getByLabel('الإجمالي').fill('29000');
    assert.equal(await s.getByLabel('سعر الطن').inputValue(), '14500');
    assert.match(await s.locator('.price-review').innerText(), /متوسط آخر 3 شهور: 14,000 ج \(\+3.6%\)/);
    assert.doesNotMatch(await s.locator('.price-review').innerText(), /⚠️/);
    await s.getByRole('button', { name: 'إغلاق' }).click();

    // جرد العلف مرتين ⇒ استهلاك مقيس
    for (const [date, qty] of [['2025-11-01', '2'], ['2025-11-30', '1.5']]) {
      await page.getByRole('button', { name: 'جرد' }).click();
      s = sheet(page);
      await s.getByRole('tab', { name: 'العلف في المخزن' }).click();
      await s.getByLabel(/العلف الموجود في المخزن/).fill(qty);
      await s.getByLabel('التاريخ').fill(date);
      await s.getByRole('button', { name: 'حفظ' }).click();
      await page.waitForFunction(() => !document.querySelector('.sheet'));
    }

    // تقرير الشهر: الكمية وسعر الوحدة، العلف (من الجرد)، الإنتاج، والمقارنة بأكتوبر
    await go(page, `#/poultry/cycle/${id}/month/2025-11`);
    const month = await page.locator('#screen').innerText();
    assert.match(month, /علف \(طن\)\s+4\s+17,000\s+68,000/);
    assert.match(month, /الاستهلاك اليومي \(من الجرد، 29 يوم من 30\)\s+155 كجم في اليوم/); // (2 + 4 − 1.5) طن ÷ 29 يوم
    assert.match(month, /نسبة الإنتاج/);
    assert.match(month, /مقارنة بشهر أكتوبر 2025[\s\S]*سعر الطن\s+17,000\s+14,000\s+▲ 3,000 \(21%\)/);

    // المؤشرات: مخزن العلف، وكل بند شهراً بشهر بمجموع الكميات
    await go(page, `#/poultry/cycle/${id}/kpis`); // الفترة الافتراضية: أكتوبر (أول شهر منتظم) – نوفمبر
    const kpis = await page.locator('#screen').innerText();
    assert.match(kpis, /مخزن العلف[\s\S]*آخر جرد \(30\/11\/2025\)/);
    assert.match(kpis, /كل بند شهر بشهر[\s\S]*المجموع\s+9\s+15,333\s+138,000/);
    assert.match(kpis, /العلف والإنتاج شهر بشهر/);
    assert.deepEqual(t.errors, []);
  } finally {
    await t.close();
  }
});

test('حقلان أرقام يتركّز عليهما في نفس اللحظة: التركيز يستقر ولا يتبادلانه بلا نهاية (كانت الشاشة تعلق)', async () => {
  const t = await launch();
  const { page } = t;
  try {
    await openApp(page, t.url);
    const id = await createCycle(page, { name: 'دورة-تركيز' });
    await go(page, `#/poultry/cycle/${id}`);
    await page.getByRole('button', { name: 'إدخال شهر' }).click();
    const focuses = await page.evaluate(async () => {
      const [a, b] = document.querySelectorAll('.sheet .lines input.q');
      let n = 0;
      document.addEventListener('focusin', () => n++, true);
      a.focus();
      b.focus();
      await new Promise((r) => setTimeout(r, 300));
      return { n, active: document.activeElement === b };
    });
    assert.ok(focuses.n <= 2, `تبادل التركيز ${focuses.n} مرة`);
    assert.equal(focuses.active, true);
    await page.keyboard.type('7');
    assert.equal(await page.locator('.sheet .lines').nth(1).locator('input.q').first().inputValue(), '7');
    assert.deepEqual(t.errors, []);
  } finally {
    await t.close();
  }
});
