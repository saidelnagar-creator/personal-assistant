// العربية على محاكاة iPhone: إضافة عربية، العداد، صيانة بقطع غيار، عطل ← تصليح، تعديل مخطط ← اتعمل،
// سجل سابق، تعديل مدة بند، التكاليف، العداد لا يرجع، وإخفاء الأرصدة. بيانات وهمية فقط.
import test from 'node:test';
import assert from 'node:assert/strict';
import { launch, openApp, go, sheet } from './helpers.mjs';

const closed = (page) => page.waitForFunction(() => !document.querySelector('.sheet'));
const text = (page) => page.locator('#screen').innerText();

test('العربية: الجدول والعداد والصيانة والأعطال والتعديلات والتكاليف', async () => {
  const t = await launch();
  const { page } = t;
  try {
    await openApp(page, t.url);
    await go(page, '#/sectors');
    await page.getByRole('button', { name: /العربية/ }).click();
    await page.getByRole('button', { name: 'عربية جديدة' }).click();
    let s = sheet(page);
    await s.getByLabel('الاسم', { exact: true }).fill('عربية الاختبار');
    await s.getByLabel('العداد الآن (كم)').fill('394000');
    await s.getByLabel('القيمة التقديرية لو اتباعت (اختياري)').fill('150000');
    await s.getByRole('button', { name: 'حفظ', exact: true }).click();
    await closed(page);
    const id = await page.evaluate(() => location.hash.split('/')[2]);
    assert.match(await text(page), /394,000 كم/);
    assert.match(await text(page), /6 بند صيانة مطلوب الآن/);

    // العداد
    await page.getByRole('button', { name: 'سجّل العداد' }).click();
    s = sheet(page);
    await s.getByLabel('قراءة العداد (كم)').fill('394200');
    await s.getByRole('button', { name: 'حفظ', exact: true }).click();
    await closed(page);
    assert.match(await text(page), /394,200 كم/);

    // العداد لا يرجع للخلف
    await page.getByRole('button', { name: 'سجّل العداد' }).click();
    s = sheet(page);
    await s.getByLabel('قراءة العداد (كم)').fill('390000');
    await s.getByRole('button', { name: 'حفظ', exact: true }).click();
    await page.waitForSelector('.sheet .form-error:not([style*="none"])');
    assert.match(await s.locator('.form-error').innerText(), /نفس اليوم/);
    await s.getByRole('button', { name: 'إغلاق' }).click();

    // صيانة: زيت + فلتر بقطع غيار ومصنعية
    await page.getByRole('button', { name: 'صيانة / تصليح' }).first().click();
    s = sheet(page);
    await s.getByRole('checkbox', { name: 'زيت الموتور + فلتر الزيت' }).check();
    await s.getByLabel('العداد وقت الشغل (كم)').fill('394200');
    await s.getByRole('button', { name: '+ قطعة' }).click();
    await s.getByLabel('اسم القطعة').fill('زيت 20W-50');
    await s.getByLabel('الكمية').fill('4');
    await s.getByLabel('سعر الوحدة').fill('300');
    await s.getByLabel('المصنعية').fill('100');
    assert.match(await s.locator('.line-summary').innerText(), /1,300/);
    await s.getByRole('button', { name: 'حفظ', exact: true }).click();
    await closed(page);

    await go(page, `#/car/${id}/schedule`);
    const oil = page.getByRole('button', { name: /زيت الموتور \+ فلتر الزيت/ });
    assert.match(await oil.innerText(), /باقي 5,000 كم/);
    assert.match(await oil.innerText(), /تمام/);

    // سجل سابق لسير الكاتينة: بالعداد بدون تاريخ
    await go(page, `#/car/${id}/task/timing-belt`);
    await page.getByRole('button', { name: 'آخر مرة (قديم)' }).click();
    s = sheet(page);
    await s.getByLabel('مش فاكر التاريخ').check();
    await s.getByLabel('العداد وقتها (كم)').fill('370000');
    await s.getByRole('button', { name: 'حفظ', exact: true }).click();
    await closed(page);
    assert.match(await text(page), /باقي 15,800 كم/);

    // تعديل مدة الزيت إلى 7,500
    await go(page, `#/car/${id}/task/oil`);
    await page.getByRole('button', { name: 'تعديل المدة' }).click();
    s = sheet(page);
    await s.getByLabel('كل كام كيلو').fill('7500');
    await s.getByRole('button', { name: 'حفظ', exact: true }).click();
    await closed(page);
    assert.match(await text(page), /باقي 7,500 كم/);

    // عطل ← اتصلح
    await go(page, `#/car/${id}/faults`);
    await page.getByRole('button', { name: 'عطل' }).click();
    s = sheet(page);
    await s.getByLabel('العطل').fill('طقطقة في المطبات');
    await s.getByLabel('الخطورة').selectOption('urgent');
    await s.getByLabel('الجزء').selectOption('suspension');
    await s.getByRole('button', { name: 'حفظ', exact: true }).click();
    await closed(page);
    await go(page, '#/');
    assert.match(await text(page), /عطل خطر في عربية الاختبار: طقطقة في المطبات/);
    await go(page, `#/car/${id}/faults`);
    await page.getByRole('button', { name: /طقطقة في المطبات/ }).click();
    await sheet(page).getByRole('button', { name: /اتصلح ← سجّل التصليح/ }).click();
    s = sheet(page);
    assert.ok(await s.getByRole('checkbox', { name: 'طقطقة في المطبات' }).isChecked());
    await s.getByLabel('وصف الشغل').fill('تغيير جلب المقصات');
    await s.getByLabel('المصنعية').fill('200');
    await s.getByRole('button', { name: 'حفظ', exact: true }).click();
    await closed(page);
    assert.match(await page.getByRole('button', { name: /طقطقة في المطبات/ }).innerText(), /اتصلح/);

    // تعديل مخطط ← اتعمل
    await go(page, `#/car/${id}/plans`);
    await page.getByRole('button', { name: 'تعديل', exact: true }).click();
    s = sheet(page);
    await s.getByLabel('التعديل').fill('حساسات ركن');
    await s.getByLabel('التكلفة التقديرية (اختياري)').fill('1500');
    await s.getByRole('button', { name: 'حفظ', exact: true }).click();
    await closed(page);
    await page.getByRole('button', { name: /حساسات ركن/ }).click();
    await sheet(page).getByRole('button', { name: /اتعمل ← سجّل الشغل/ }).click();
    s = sheet(page);
    await s.getByLabel('مصاريف تانية (ونش، نقل…)').fill('1400');
    await s.getByRole('button', { name: 'حفظ', exact: true }).click();
    await closed(page);
    assert.match(await page.getByRole('button', { name: /حساسات ركن/ }).innerText(), /اتعمل/);

    // التكاليف: 1,300 + 200 + 1,400
    await go(page, `#/car/${id}/costs`);
    assert.match(await page.locator('.stat').nth(2).innerText(), /2,900/);
    await page.getByLabel('بحث في القطع').fill('زيت');
    assert.match(await text(page), /زيت 20W-50/);
    assert.match(await text(page), /4 × 300/);

    // تفاصيل الشغل في شاشة القيد
    await page.getByRole('button', { name: /زيت 20W-50/ }).click();
    await page.waitForFunction(() => location.hash.startsWith('#/entry/') && document.querySelector('.topbar h1')?.textContent.includes('صيانة'));
    const detail = await text(page);
    assert.match(detail, /زيت الموتور \+ فلتر الزيت/);
    assert.match(detail, /قطع الغيار/);

    // إخفاء الأرصدة: المبالغ تختفي والعداد يفضل ظاهر
    await go(page, `#/car/${id}/costs`);
    await page.locator('#privacy-toggle').click();
    await page.waitForFunction(() => document.querySelectorAll('.stat')[2]?.textContent.includes('•••••'));
    assert.match(await page.locator('.stat').nth(2).innerText(), /•••••/);
    assert.match(await page.locator('.stat').first().innerText(), /394,200/);
    await page.locator('#privacy-toggle').click();
    await page.waitForFunction(() => !document.querySelectorAll('.stat')[2]?.textContent.includes('•••••'));

    // القيمة في وضعي المالي، والعربية في الرئيسية
    await go(page, '#/finance');
    assert.match(await text(page), /عربية الاختبار \(قيمة تقديرية\)/);
    await go(page, '#/');
    assert.match(await text(page), /🚗 عربية الاختبار/);

    assert.deepEqual(t.errors, []);
  } finally {
    await t.close();
  }
});
