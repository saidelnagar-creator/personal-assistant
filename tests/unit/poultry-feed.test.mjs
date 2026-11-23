// العلف: سعر الوحدة المشتق ومراجعته، الكميات بلا سعر، الجرد والاستهلاك اليومي، الطيور والإنتاج والنافق، كل بند شهراً بشهر.
import test from 'node:test';
import assert from 'node:assert/strict';
import { demoBook, opts, exp, eggs } from './helpers.mjs';
import { computeCycle, periodStats, monthKpis, unitPriceStats, priceCheck, categoryMonths, feedUsage } from '../../app/src/core/modules/poultry/calc.js';
import { describeEntry } from '../../app/src/core/engine.js';

const count = (cycleId, date, item, qty) => ({ kind: 'poultry.count', cycleId, date, item, qty });
const log = (cycleId, date, month, extra) => ({ kind: 'poultry.log', cycleId, date, month, ...extra });

test('شراء بالكمية والإجمالي فقط (بلا سعر): الكمية تدخل المجموع، وسعر الوحدة يُشتق في الوصف والمتوسط', () => {
  const b = demoBook();
  b.addEntries([
    exp('c1', '2025-10-05', '2025-10', 'feed', 6800000, { qty: 4000 }), // 4 طن بإجمالي 68,000 ⇒ 17,000/طن
    exp('c1', '2025-10-20', '2025-10', 'feed', 3000000, { qty: 2000, price: 1500000 }),
    exp('c1', '2025-10-25', '2025-10', 'feed', 500000), // بلا كمية
  ], opts);
  const d = computeCycle(b.state, 'c1', '2025-12-20');
  const oct = d.months.find((r) => r.month === '2025-10');
  assert.equal(oct.byCategory.feed.qty, 6000);
  assert.equal(oct.byCategory.feed.noQty, 1);
  assert.equal(oct.byCategory.feed.noQtyAmount, 500000);
  assert.equal(monthKpis(oct).feedAvg, Math.round((9800000 * 1000) / 6000)); // المتوسط المرجّح من القيود ذات الكمية
  const e = d.entries.find((x) => x.kind === 'poultry.expense' && !x.price && x.qty);
  assert.match(describeEntry(b.state, e).title, /4 طن × 17,000/);
});

test('مراجعة سعر الطن: متوسط آخر 3 شهور مرجّح بالكمية، وآخر سعر، واستثناء القيد المعدَّل، والتنبيه فوق 10%', () => {
  const b = demoBook();
  b.addEntries([
    exp('c1', '2025-06-01', '2025-06', 'feed', 1000000, { qty: 1000 }), // قديم (خارج النافذة): 10,000/طن
    exp('c1', '2025-09-10', '2025-09', 'feed', 4200000, { qty: 3000 }), // 14,000
    exp('c1', '2025-10-10', '2025-10', 'feed', 1500000, { qty: 1000 }), // 15,000
    exp('c1', '2025-10-12', '2025-10', 'feed', 900000), // بلا كمية: لا يدخل
    exp('c1', '2025-10-15', '2025-10', 'labor', 900000),
  ], opts);
  const st = unitPriceStats(b.state, 'feed', '2025-12-01');
  assert.equal(st.from, '2025-09-01');
  assert.equal(st.count, 2);
  assert.equal(st.avg, Math.round((5700000 * 1000) / 4000)); // 14,250
  assert.deepEqual(st.last, { date: '2025-10-10', price: 1500000, cycleId: 'c1' });
  const last = b.state.entries.find((x) => x.date === '2025-10-10');
  assert.equal(unitPriceStats(b.state, 'feed', '2025-12-01', { excludeId: last.id }).avg, 1400000);
  assert.equal(unitPriceStats(b.state, 'feed', '2025-09-05').avg, null); // لا مشتريات في النافذة (من 05/06)
  assert.equal(unitPriceStats(b.state, 'feed', '2025-09-05').last.price, 1000000);
  assert.equal(priceCheck(1700000, 1425000).warn, true);
  assert.equal(priceCheck(1500000, 1425000).warn, false);
  assert.equal(priceCheck(1500000, null), null);
});

test('جرد العلف: المستهلك بين جردين = الأول + المشترى بينهم − الثاني، والموجود الآن تقديرياً', () => {
  const b = demoBook();
  b.addEntries([
    count('c1', '2025-11-01', 'feed', 2000),
    exp('c1', '2025-11-10', '2025-11', 'feed', 6000000, { qty: 4000 }),
    count('c1', '2025-11-21', 'feed', 1000), // المستهلك 2 + 4 − 1 = 5 طن في 20 يوم = 250 كجم/يوم
    exp('c1', '2025-11-25', '2025-11', 'feed', 3000000, { qty: 2000 }),
  ], opts);
  const d = computeCycle(b.state, 'c1', '2025-11-29');
  assert.equal(d.feed.intervals.length, 1);
  const iv = d.feed.intervals[0];
  assert.deepEqual([iv.days, iv.bought, iv.used, iv.perDay], [20, 4000, 5000, 250]);
  // الموجود الآن = 1 + 2 − 0.25 × 8 = 1 طن، ويكفي 4 أيام
  assert.equal(d.feed.stock.estimate, 1000);
  assert.equal(d.feed.stock.daysLeft, 4);
  // شهر نوفمبر: الاستهلاك المقيس يغطي 20 يوماً (2–21) بمعدل 250
  const nov = d.months.find((r) => r.month === '2025-11');
  assert.equal(nov.feedMeasuredDays, 20);
  const k = monthKpis(nov);
  assert.equal(k.feedMeasured, true);
  assert.equal(k.feedKgPerDay, 250);
  assert.equal(k.feedGramsPerBird, 50); // 250 كجم ÷ 5000 طائر
  assert.throws(() => b.addEntry({ kind: 'poultry.count', cycleId: 'c1', date: '2025-11-28', item: 'stock', qty: 1 }, opts), /الجرد/);
  assert.equal(feedUsage([], [], '2025-11-29').stock, null);
});

test('بلا جرد: الاستهلاك اليومي تقريبي = المشترى ÷ أيام الشهر، ولكل طائر بالجرام', () => {
  const b = demoBook();
  b.addEntries([exp('c1', '2025-11-03', '2025-11', 'feed', 9000000, { qty: 6000 }), eggs('c1', '2025-11-05', '2025-11', 3000, 10000)], opts);
  const d = computeCycle(b.state, 'c1', '2025-12-20');
  const k = monthKpis(d.months.find((r) => r.month === '2025-11'));
  assert.equal(k.feedMeasured, false);
  assert.equal(k.days, 30);
  assert.equal(k.feedKgPerDay, 200);
  assert.equal(k.feedGramsPerBird, 40);
  assert.equal(k.feedPerTray, 2); // 6000 كجم ÷ 3000 طبق
  assert.equal(k.layRate, (100 * 30) / 5000); // 100 طبق/يوم × 30 ÷ 5000 طائر
  // وحدة غير معروفة: المعدل بوحدة البند فقط
  assert.equal(monthKpis(d.months.find((r) => r.month === '2025-11'), { kg: null }).feedGramsPerBird, null);
});

test('عدد الطيور أول وآخر الشهر من الجرد والنافق والمباع، ونسبة النافق', () => {
  const b = demoBook();
  b.addEntries([
    log('c1', '2025-10-15', '2025-10', { deaths: 100 }),
    count('c1', '2025-11-01', 'birds', 4800000), // جرد: 4800
    log('c1', '2025-11-10', '2025-11', { deaths: 48, trays: 4000000 }),
    { kind: 'poultry.sale', cycleId: 'c1', date: '2025-11-20', month: '2025-11', product: 'birds', qty: 52000, amount: 100000 },
  ], opts);
  const d = computeCycle(b.state, 'c1', '2025-12-20');
  const oct = d.months.find((r) => r.month === '2025-10');
  const nov = d.months.find((r) => r.month === '2025-11');
  assert.deepEqual([oct.birdsStart, oct.birdsEnd], [5000, 4900]);
  assert.deepEqual([nov.birdsStart, nov.birdsEnd], [4900, 4700]); // الجرد 4800 يوم 1 − 48 نافق − 52 مباع
  const k = monthKpis(nov);
  assert.equal(k.mortality, 48 / 4900);
  assert.equal(k.producedFromLog, true);
  assert.equal(k.layRate, ((4000 / 30) * 30) / 4800);
  const p = periodStats(d, '2025-10', '2025-11');
  assert.equal(p.k.deaths, 148);
  assert.deepEqual([p.agg.birdsStart, p.agg.birdsEnd], [5000, 4700]);
});

test('كل بند شهراً بشهر: مجموع الكميات ومتوسط السعر المرجّح والقيود بلا كمية', () => {
  const b = demoBook();
  b.addEntries([
    exp('c1', '2025-10-05', '2025-10', 'feed', 4200000, { qty: 3000 }),
    exp('c1', '2025-11-05', '2025-11', 'feed', 3000000, { qty: 2000, price: 1500000 }),
    exp('c1', '2025-11-06', '2025-11', 'feed', 700000),
    exp('c1', '2025-12-06', '2025-12', 'labor', 700000),
  ], opts);
  const d = computeCycle(b.state, 'c1', '2025-12-20');
  const { rows, total } = categoryMonths(d, 'feed', '2025-10', '2025-12');
  assert.deepEqual(rows.map((r) => [r.month, r.qty, r.avg, r.gross, r.noQty]), [
    ['2025-10', 3000, 1400000, 4200000, 0],
    ['2025-11', 2000, 1500000, 3700000, 1],
  ]);
  assert.deepEqual([total.qty, total.avg, total.gross, total.noQty], [5000, 1440000, 7900000, 1]);
  assert.equal(periodStats(d, '2025-10', '2025-12').catDetail.feed.qty, 5000);
});
