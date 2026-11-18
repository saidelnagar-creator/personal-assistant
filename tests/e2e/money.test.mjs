// السلف والجمعيات والأمانات والأسعار على محاكاة iPhone: سلفة جنيه بأقساط وسدادها، سلفة ذهب وقيمتها قبل وبعد السعر
// وتحويلها لجنيه، جمعية (عضو بسهمين وقبض على مرتين وسهم لحد تاني) وجمعية أنا مديرها، أمانة ذهب وورق وترجيع جزء،
// الوضع المالي وإخفاء الأرصدة. بيانات وهمية فقط.
import test from 'node:test';
import assert from 'node:assert/strict';
import { launch, openApp, go, sheet, newPerson } from './helpers.mjs';

const closed = (page) => page.waitForFunction(() => !document.querySelector('.sheet'));
// علامات عزل الاتجاه (حول الأرقام والوحدات) لا تظهر للمستخدم؛ نشيلها قبل مقارنة النصوص.
const plain = (s) => s.replace(/[\u2066-\u2069]/g, '');
const text = async (page) => plain(await page.locator('#screen').innerText());
const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const monthsAgo = (n) => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - n);
  return ym(d);
};

test('السلف والأسعار والجمعيات والأمانات', async () => {
  const t = await launch();
  const { page } = t;
  try {
    await openApp(page, t.url);

    // ---------- سلفة جنيه بأقساط ----------
    await go(page, '#/sectors');
    await page.getByRole('button', { name: /السلف/ }).click();
    await page.getByRole('button', { name: 'سلفة', exact: true }).click();
    let s = sheet(page);
    await newPerson(page, s.locator('.field', { hasText: 'الشخص' }), 'شخص الاختبار');
    await s.getByLabel('الكمية / المبلغ').fill('9000');
    await s.getByRole('tab', { name: 'أقساط بجدول' }).click();
    assert.match(plain(await s.locator('.line-summary').innerText()), /مجموع الأقساط 9,000 ج من 9,000 ج/);
    await s.getByRole('button', { name: 'حفظ', exact: true }).click();
    await closed(page);
    assert.match(await text(page), /الباقي[\s\S]*9,000 ج/);
    assert.match(await text(page), /القسط 3/);
    await page.getByRole('button', { name: 'رجعلي جزء' }).click();
    s = sheet(page);
    assert.equal(await s.getByLabel(/الكمية \/ المبلغ/).inputValue(), '3000');
    await s.getByRole('button', { name: 'حفظ', exact: true }).click();
    await closed(page);
    assert.match(await text(page), /6,000 ج/);
    assert.match(await text(page), /شخص الاختبار سدد: 3,000 ج/);

    // ---------- سلفة ذهب (عليّ) بدون سعر ثم بسعر، ثم تحويل لجنيه ----------
    await go(page, '#/loans/in');
    await page.getByRole('button', { name: 'سلفة', exact: true }).click();
    s = sheet(page);
    await newPerson(page, s.locator('.field', { hasText: 'الشخص' }), 'صاحب الذهب');
    await s.getByLabel('النوع').selectOption('g21');
    await s.getByLabel('الكمية / المبلغ').fill('10');
    assert.match(plain(await s.locator('.field', { hasText: 'قيمتها وقتها بالجنيه' }).innerText()), /مفيش سعر مكتوب/);
    await s.getByLabel('قيمتها وقتها بالجنيه').fill('35000');
    await s.getByRole('tab', { name: 'من غير ميعاد' }).click();
    await s.getByRole('button', { name: 'حفظ', exact: true }).click();
    await closed(page);
    const goldUrl = await page.evaluate(() => location.hash);
    let body = await text(page);
    assert.match(body, /10 جم عيار 21/);
    assert.match(body, /قيمته وقت السلف[\s\S]*35,000 ج/);
    assert.match(body, /بقيمته وقت السلف \(مفيش سعر\)/);

    await go(page, '#/prices');
    await page.getByRole('button', { name: 'أسعار النهارده' }).click();
    s = sheet(page);
    await s.getByLabel('جرام عيار 21').fill('4200');
    assert.equal(await s.getByLabel('جرام عيار 24').inputValue(), '4800');
    assert.equal(await s.getByLabel('الجنيه الذهب').inputValue(), '33600');
    await s.getByLabel('دولار').fill('48.5');
    await s.getByRole('button', { name: 'حفظ', exact: true }).click();
    await closed(page);
    assert.match(await text(page), /جرام عيار 21[\s\S]*4,200 ج/);

    await go(page, goldUrl);
    assert.match(await text(page), /قيمته دلوقتي[\s\S]*42,000 ج/);
    await page.getByRole('button', { name: 'تحويل لنوع تاني' }).click();
    s = sheet(page);
    assert.equal(await s.getByLabel('يبقى عليه / عليّ').inputValue(), '42000');
    await s.getByLabel('يبقى عليه / عليّ').fill('41000');
    await s.getByRole('button', { name: 'تحويل', exact: true }).click();
    await page.locator('.dialog').getByRole('button', { name: 'تحويل' }).click();
    await closed(page);
    body = await text(page);
    assert.match(body, /محوّلة من سلفة 10 جم عيار 21/);
    assert.match(body, /الباقي[\s\S]*41,000 ج/);
    await go(page, goldUrl);
    assert.match(await text(page), /اتحولت يوم/);
    assert.equal(await page.getByRole('button', { name: 'رجعلي جزء' }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'سددت جزء' }).count(), 0);

    // ---------- جمعية: عضو بسهم كامل (قبض 40+60) ونص سهم لحد تاني ----------
    const start = monthsAgo(2);
    await go(page, '#/assoc');
    await page.getByRole('button', { name: 'جمعية', exact: true }).click();
    s = sheet(page);
    await s.getByLabel('اسم الجمعية').fill('الشغل');
    await newPerson(page, s.locator('.field', { hasText: 'مين بيلمّها' }), 'مدير الجمعية');
    await s.getByLabel('قسط السهم في الشهر').fill('10000');
    await s.getByLabel('عدد الشهور').fill('10');
    await s.getByLabel('أول شهر').selectOption(start);
    await s.getByLabel('ترتيب القبض').first().fill('4');
    let line = s.locator('.line').first();
    assert.match(plain(await line.innerText()), /القبض 100,000 ج/);
    await line.getByLabel('مبلغ القبض').fill('40000');
    await line.getByRole('button', { name: '+ ميعاد قبض' }).click();
    await line.getByLabel('شهر القبض').nth(1).selectOption({ index: 6 });
    assert.equal(await line.getByLabel('مبلغ القبض').nth(1).inputValue(), '60000');
    assert.doesNotMatch(await line.innerText(), /لازم يساوي/);
    await s.getByRole('button', { name: '+ سهم' }).click();
    line = s.locator('.line').nth(1);
    await newPerson(page, line, 'أخ الاختبار');
    await line.getByLabel('حجم السهم').selectOption('1/2');
    await line.getByLabel('ترتيب القبض').fill('10');
    assert.match(plain(await line.innerText()), /القبض 50,000 ج/);
    await s.getByRole('button', { name: 'حفظ', exact: true }).click();
    await closed(page);
    body = await text(page);
    assert.match(await page.locator('.topbar').innerText(), /جمعية الشغل[\s\S]*الشهر 3 من 10/);
    assert.match(body, /قسطي في الشهر[\s\S]*15,000 ج/);
    assert.match(body, /أنا — /);
    await page.getByRole('button', { name: 'دفعت القسط' }).first().click();
    s = sheet(page);
    await s.getByRole('button', { name: 'حفظ', exact: true }).click();
    await closed(page);
    assert.match(await text(page), /دفعت[\s\S]*15,000 ج/);
    await page.getByRole('button', { name: /دفعلي \/ سلّمته/ }).click();
    await sheet(page).getByRole('button', { name: 'أخ الاختبار دفعلي' }).click();
    s = sheet(page);
    await s.getByLabel('المبلغ').fill('5000');
    await s.getByRole('button', { name: 'حفظ', exact: true }).click();
    await closed(page);
    assert.match(await text(page), /سهم أخ الاختبار\nدفعلي 5,000 ج · دفعت لسهمه 5,000 ج[\s\S]*متسوي/);
    await go(page, `${await page.evaluate(() => location.hash)}/months`);
    assert.equal(await page.locator('.month.paid').count(), 1);
    assert.equal(await page.locator('.month.due').count(), 2, 'الشهر التاني والتالت فاتوا');

    // ---------- جمعية أنا مديرها ----------
    await go(page, '#/assoc');
    await page.getByRole('button', { name: 'جمعية', exact: true }).click();
    s = sheet(page);
    await s.getByLabel('اسم الجمعية').fill('جمعية العيلة');
    await s.getByLabel('مين بيلمّها (المدير)').selectOption({ label: 'أنا' });
    await s.getByLabel('قسط السهم في الشهر').fill('1000');
    await s.getByLabel('عدد الشهور').fill('2');
    await s.getByLabel('أول شهر').selectOption(monthsAgo(0));
    await s.getByLabel('ترتيب القبض').first().fill('2');
    await s.getByRole('button', { name: '+ سهم' }).click();
    line = s.locator('.line').nth(1);
    await newPerson(page, line, 'عضو الاختبار');
    await line.getByLabel('ترتيب القبض').fill('1');
    await s.getByRole('button', { name: 'حفظ', exact: true }).click();
    await closed(page);
    assert.match(await page.locator('.topbar').innerText(), /أنا المدير/);
    await page.getByRole('button', { name: 'تحصيل أقساط' }).click();
    await sheet(page).getByRole('button', { name: 'حفظ', exact: true }).click();
    await closed(page);
    assert.match(await text(page), /الفلوس معايا للجمعية[\s\S]*2,000 ج/);
    await page.getByRole('button', { name: 'سلّمت القبض' }).click();
    s = sheet(page);
    assert.equal(await s.getByLabel('المبلغ').inputValue(), '2000');
    await s.getByRole('button', { name: 'حفظ', exact: true }).click();
    await closed(page);
    assert.match(await text(page), /الفلوس معايا للجمعية[\s\S]*0 ج/);

    // ---------- أمانة: ذهب بالوزن + ورق، وترجيع جزء ----------
    await go(page, '#/trusts');
    await page.getByRole('button', { name: 'أمانة', exact: true }).click();
    s = sheet(page);
    await newPerson(page, s.locator('.field', { hasText: 'صاحب الأمانة' }), 'صاحبة الأمانة');
    line = s.locator('.line').first();
    await line.getByLabel('الحاجة').fill('غويشة');
    await line.getByLabel('الوزن بالجرام').fill('30');
    await line.getByLabel('العدد').first().fill('2');
    await s.getByRole('button', { name: '+ حاجة' }).click();
    line = s.locator('.line').nth(1);
    await line.getByLabel('النوع').selectOption('doc');
    await line.getByLabel('الحاجة').fill('قايمة منقولات');
    await s.getByRole('button', { name: 'حفظ', exact: true }).click();
    await closed(page);
    body = await text(page);
    assert.match(body, /قيمتها دلوقتي[\s\S]*126,000 ج/);
    assert.match(body, /2 غويشة عيار 21 \(30 جم\)/);
    await page.getByRole('button', { name: 'رجّعت' }).click();
    s = sheet(page);
    await s.getByRole('checkbox', { name: 'قايمة منقولات' }).uncheck();
    await s.getByLabel(/الراجع من 2 غويشة/).fill('1');
    await s.getByRole('button', { name: 'حفظ', exact: true }).click();
    await closed(page);
    body = await text(page);
    assert.match(body, /رجع 1 · باقي 1/);
    assert.match(body, /قيمتها دلوقتي[\s\S]*63,000 ج/);

    // ---------- الوضع المالي والإخفاء ----------
    await go(page, '#/finance');
    body = await text(page);
    assert.match(body, /أمانات عندي لغيري \(خارج الحساب\) — 63,000/);
    assert.match(body, /سلفة شخص الاختبار \(6,000 ج\)/);
    assert.match(body, /سلفة من صاحب الذهب \(41,000 ج\)/);
    await go(page, '#/loans');
    await page.locator('#privacy-toggle').click();
    await page.waitForFunction(() => document.querySelector('.stat .value').textContent.includes('•'));
    assert.doesNotMatch(await page.locator('#screen').innerText(), /6,000|41,000/);
    await page.locator('#privacy-toggle').click();
    await page.waitForFunction(() => !document.querySelector('.stat .value').textContent.includes('•'));

    // الرئيسية والقطاعات
    await go(page, '#/');
    body = await text(page);
    assert.match(body, /🤝 السلف/);
    assert.match(body, /🔐 الأمانات/);
    assert.deepEqual(t.errors, []);
  } finally {
    await t.close();
  }
});
