// حسابات دورة الدواجن: الحصص على مستويين، الضيف، رأس المال، التسوية الشهرية، الأرصدة، الإقفال.
import test from 'node:test';
import assert from 'node:assert/strict';
import { demoBook, opts, exp, eggs, pay } from './helpers.mjs';
import { computeCycle, periodStats, personStatement, monthKpis } from '../../app/src/core/modules/poultry/calc.js';
import { buildState } from '../../app/src/core/engine.js';

function scenario() {
  const b = demoBook();
  // تربية مشتركة: الضيف له نصف الطيور، ثم 4500 من 9500، ثم أخذ طيوره
  b.addEntry({ kind: 'poultry.guest', cycleId: 'c1', date: '2025-05-05', personId: 'gst', guestBirds: 5000, totalBirds: 10000 }, opts);
  b.addEntry({ kind: 'poultry.guest', cycleId: 'c1', date: '2025-07-01', personId: 'gst', guestBirds: 4500, totalBirds: 9500 }, opts);
  b.addEntry({ kind: 'poultry.guest', cycleId: 'c1', date: '2025-08-01', personId: 'gst', guestBirds: 0, totalBirds: 9500 }, opts);
  b.addEntries([
    exp('c1', '2025-05-10', '2025-05', 'feed', 100000, { qty: 4000, price: 25000 }),
    exp('c1', '2025-07-10', '2025-07', 'labor', 9500),
    exp('c1', '2025-08-10', '2025-08', 'power', 1000),
    exp('c1', '2025-10-05', '2025-10', 'feed', 30000),
    exp('c1', '2025-11-27', '2025-12', 'feed', 20000), // شراء آخر نوفمبر يُحسب على ديسمبر
    eggs('c1', '2025-11-03', '2025-11', 500, 100),
    eggs('c1', '2025-12-05', '2025-11', 10, 100, 'double'), // بيع في ديسمبر يُحسب على نوفمبر
    pay('c1', '2025-05-06', 'me', 'cycle', 60000),
    pay('c1', '2025-05-07', 'sub', 'me', 20000),
    pay('c1', '2025-08-02', 'gst', 'cycle', 54500),
    pay('c1', '2025-12-10', 'cycle', 'me', 10000),
  ], opts);
  return b;
}

test('الضيف يتحمّل نسبته من المصروف حتى يأخذ طيوره، ورصيده صفر بعد دفع نصيبه', () => {
  const d = computeCycle(scenario().state, 'c1', '2025-12-20');
  const g = d.people.get('gst');
  assert.equal(g.guestCost, 50000 + 4500);
  assert.equal(g.sideBalance, 0);
  assert.equal(d.totals.capExpenses, 50000 + 5000 + 1000);
});

test('رأس المال قبل شهر التسوية والتسوية الشهرية بعده، بشهر الحساب لا بتاريخ الحركة', () => {
  const d = computeCycle(scenario().state, 'c1', '2025-12-20');
  const m = Object.fromEntries(d.months.map((r) => [r.month, r]));
  assert.equal(m['2025-05'].pre, true);
  assert.equal(m['2025-10'].pre, false);
  assert.equal(m['2025-10'].opNet, -30000);
  assert.equal(m['2025-11'].opRevenue, 51000);
  assert.equal(m['2025-11'].opNet, 51000);
  assert.equal(m['2025-12'].opExpenses, 20000);
  assert.equal(d.totals.capNet, -56000);
  assert.equal(d.totals.net, -56000 - 30000 + 51000 - 20000);
  assert.equal(m['2025-11'].eggs.byGrade.double.qty, 10000);
});

test('توزيع النتائج على الحصص بكسور دقيقة (1/3، 1/6، 1/2) والمجموع محفوظ', () => {
  const d = computeCycle(scenario().state, 'c1', '2025-12-20');
  for (const r of d.months) {
    const sumOp = r.alloc.reduce((s, a) => s + a.op, 0);
    const sumCap = r.alloc.reduce((s, a) => s + a.cap, 0);
    assert.equal(sumOp, r.opNet);
    assert.equal(sumCap, r.capNet);
  }
  const nov = d.months.find((r) => r.month === '2025-11');
  const by = Object.fromEntries(nov.alloc.map((a) => [a.personId, a.op]));
  assert.deepEqual(by, { me: 17000, sub: 8500, mgr: 25500 });
});

test('الأرصدة: ناحيتي عند المدير، ما أدين به لشريكي التابع، وصافي رصيدي', () => {
  const d = computeCycle(scenario().state, 'c1', '2025-12-20');
  const me = d.people.get('me');
  const sub = d.people.get('sub');
  // نتائج التابع: رأس مال -9333 ثم أكتوبر -5000 ثم نوفمبر +8500 ثم ديسمبر -3333
  const subResults = sub.withHeads[0].results;
  assert.equal(sub.withHeads[0].paid, 20000);
  assert.equal(sub.withHeads[0].balance, 20000 + subResults);
  assert.equal(me.sideBalance, 60000 - 10000 + me.topResults + subResults);
  assert.equal(me.ownBalance, me.sideBalance - sub.withHeads[0].balance);
  assert.equal(sub.ownBalance, sub.withHeads[0].balance);
});

test('ثابت: نقدية المدير المحسوبة = مجموع أرصدة كل النواحي والضيوف', () => {
  const d = computeCycle(scenario().state, 'c1', '2025-12-20');
  const sides = [...d.people.values()].filter((p) => p.isTop || p.isGuest || p.personId === 'mgr').reduce((s, p) => s + p.sideBalance, 0);
  assert.equal(d.cash.pool, sides);
  assert.equal(d.cash.pool, 60000 + 54500 - 10000 + 51000 - (100000 + 9500 + 1000 + 30000 + 20000));
});

test('كشف حساب الناحية ينتهي بنفس الرصيد', () => {
  const d = computeCycle(scenario().state, 'c1', '2025-12-20');
  const lines = personStatement(d, 'me');
  assert.equal(lines[lines.length - 1].balance, d.people.get('me').sideBalance);
  const subLines = personStatement(d, 'sub', { head: 'me' });
  assert.equal(subLines[subLines.length - 1].balance, d.people.get('sub').withHeads[0].balance);
  const g = personStatement(d, 'gst');
  assert.equal(g[g.length - 1].balance, 0);
});

test('مؤشرات الشهر والفترة: متوسط السعر، تكلفة الطبق، العلف', () => {
  const d = computeCycle(scenario().state, 'c1', '2025-12-20');
  const nov = d.months.find((r) => r.month === '2025-11');
  const k = monthKpis(nov);
  assert.equal(k.trays, 510000);
  assert.equal(k.eggAvg, 100);
  const p = periodStats(d, '2025-05', '2025-12');
  assert.equal(p.trays, 510000);
  assert.equal(p.feedQty, 4000);
  assert.equal(p.feedAvg, 25000);
  assert.equal(d.kpis.breakEven, '2025-11');
});

test('الحصص يجب أن تساوي 100% بالضبط، والتابع لرأس مباشر فقط', () => {
  const b = demoBook();
  assert.throws(() => b.addEntry({ kind: 'poultry.shares', cycleId: 'c1', date: '2025-06-01', from: '2025-06', stakes: [{ personId: 'me', num: 3333, den: 10000 }, { personId: 'mgr', num: 6666, den: 10000 }] }, opts), /100%/);
  assert.throws(() => b.addEntry({ kind: 'poultry.shares', cycleId: 'c1', date: '2025-06-01', from: '2025-06', stakes: [{ personId: 'me', num: 1, den: 2 }, { personId: 'sub', num: 1, den: 2, via: 'gst' }] }, opts), /تابع/);
});

test('الشريك التابع لا يدفع للدورة مباشرة؛ يدفع لرأسه', () => {
  const b = demoBook();
  assert.throws(() => b.addEntry(pay('c1', '2025-06-01', 'sub', 'cycle', 1000), opts), /رأسه/);
  assert.doesNotThrow(() => b.addEntry(pay('c1', '2025-06-01', 'sub', 'me', 1000), opts));
  assert.doesNotThrow(() => b.addEntry(pay('c1', '2025-06-02', 'me', 'sub', 500), opts));
});

test('إقفال الشهر يمنع الإضافة والتعديل فيه، وتغيير الحصص بأثر رجعي، وإعادة الفتح ترفع المنع', () => {
  const b = scenario();
  b.dispatch('month.close', { scope: 'poultry:c1', month: '2025-11', totals: {} }, opts);
  assert.throws(() => b.addEntry(eggs('c1', '2025-12-01', '2025-11', 1, 100), opts), /مقفول/);
  const nov = b.state.entries.find((e) => e.kind === 'poultry.sale' && e.month === '2025-11');
  assert.throws(() => b.voidEntry(nov.id, 'خطأ', '2025-12-20', opts), /مقفول/);
  assert.throws(() => b.addEntry({ kind: 'poultry.shares', cycleId: 'c1', date: '2025-10-01', from: '2025-10', stakes: [{ personId: 'me', num: 1, den: 2 }, { personId: 'mgr', num: 1, den: 2 }] }, opts), /مقفول/);
  assert.doesNotThrow(() => b.addEntry(eggs('c1', '2025-12-01', '2025-12', 1, 100), opts)); // شهر آخر مفتوح
  b.dispatch('month.reopen', { scope: 'poultry:c1', month: '2025-11', reason: 'تصحيح' }, opts);
  assert.doesNotThrow(() => b.voidEntry(nov.id, 'خطأ', '2025-12-20', opts));
});

test('التعديل = إلغاء + قيد جديد، والسجل يعيد بناء نفس الحالة', () => {
  const b = scenario();
  const e = b.state.entries.find((x) => x.kind === 'poultry.expense' && x.category === 'power');
  const n = b.replaceEntry(e.id, { ...e, id: undefined, ts: undefined, voided: undefined, amount: 2000 }, 'تصحيح المبلغ', '2025-12-20', opts);
  assert.equal(b.state.entryById.get(e.id).voided.replacedBy, n.id);
  const d1 = computeCycle(b.state, 'c1', '2025-12-20');
  const d2 = computeCycle(buildState(b.events), 'c1', '2025-12-20');
  assert.equal(d1.totals.capExpenses, 50000 + 5000 + 2000);
  assert.deepEqual(d2.totals, d1.totals);
});

test('تغيير الحصص من شهر لاحق لا يمس الشهور السابقة', () => {
  const b = scenario();
  b.addEntry({ kind: 'poultry.shares', cycleId: 'c1', date: '2025-12-01', from: '2025-12', stakes: [{ personId: 'me', num: 2, den: 5 }, { personId: 'mgr', num: 3, den: 5 }] }, opts);
  const d = computeCycle(b.state, 'c1', '2025-12-20');
  const nov = d.months.find((r) => r.month === '2025-11');
  const dec = d.months.find((r) => r.month === '2025-12');
  assert.equal(nov.alloc.find((a) => a.personId === 'me').op, 17000);
  assert.equal(dec.alloc.find((a) => a.personId === 'me').op, -8000);
  assert.equal(dec.alloc.length, 2);
});

test('فترة البشاير: من شهر البشاير حتى أول شهر منتظم، صافيها يُضاف للتأسيس ولا تدخل متوسط الشهور المنتظمة', async () => {
  const { aggregateMonths } = await import('../../app/src/core/modules/poultry/calc.js');
  const b = demoBook({ settleFrom: '2025-11' });
  b.upsert('poultry.cycle', { id: 'c1', layStart: '2025-09-10' }, opts);
  b.addEntries([
    exp('c1', '2025-07-10', '2025-07', 'feed', 60000),
    exp('c1', '2025-09-15', '2025-09', 'feed', 30000),
    eggs('c1', '2025-10-20', '2025-10', 100, 100),
    exp('c1', '2025-10-20', '2025-10', 'vet', 6000),
    eggs('c1', '2025-11-20', '2025-11', 500, 100),
    exp('c1', '2025-11-20', '2025-11', 'feed', 20000),
  ], opts);
  const d = computeCycle(b.state, 'c1', '2025-11-30');
  const m = Object.fromEntries(d.months.map((r) => [r.month, r]));
  assert.equal(m['2025-07'].phase, 'rearing');
  assert.equal(m['2025-09'].phase, 'lay');
  assert.equal(m['2025-10'].phase, 'lay');
  assert.equal(m['2025-11'].phase, 'regular');
  assert.equal(d.totals.capExpenses, 60000 + 36000);
  assert.deepEqual([d.totals.lay.from, d.totals.lay.to, d.totals.lay.net], ['2025-09', '2025-10', 10000 - 36000]);
  assert.equal(d.totals.establishment, 60000 + 26000);
  assert.equal(d.totals.regular.net, 30000);
  assert.equal(d.kpis.avgMonthlyNet, 30000);
  assert.equal(d.totals.net, -60000 - 26000 + 30000);
  const agg = aggregateMonths([m['2025-09'], m['2025-10']]);
  assert.equal(agg.capNet, -26000);
  assert.equal(agg.alloc.reduce((s, a) => s + a.cap, 0), -26000);
  const me = personStatement(d, 'me');
  assert.ok(me.some((l) => l.kind === 'lay'));
  // تغيير شهر البشاير ممنوع بعد إقفال شهر يتأثر به
  b.dispatch('month.close', { scope: 'poultry:c1', month: '2025-10', totals: {} }, opts);
  assert.throws(() => b.upsert('poultry.cycle', { id: 'c1', layStart: '2025-10-01' }, opts), /البشاير/);
});

test('التصفية: تسجيل دفعات الخطة يجعل كل الأرصدة صفراً عدا المدير، والدفعات الحرة قبلها مسموحة', async () => {
  const { settlementPlan } = await import('../../app/src/core/modules/poultry/calc.js');
  const b = scenario();
  // استلمت من المدير أكثر من نصيبي وأعطيت التابع مبلغاً لا يناسب نسبته
  b.addEntries([pay('c1', '2025-12-15', 'cycle', 'me', 77777), pay('c1', '2025-12-16', 'me', 'sub', 33333)], opts);
  const plan = settlementPlan(computeCycle(b.state, 'c1', '2025-12-31'));
  assert.ok(plan.transfers.length >= 2);
  b.addEntries(plan.transfers.map((t) => pay('c1', '2025-12-31', t.from, t.to, t.amount)), opts);
  const d = computeCycle(b.state, 'c1', '2025-12-31');
  for (const p of d.people.values()) {
    if (p.personId !== 'mgr') assert.equal(p.sideBalance, 0, p.personId);
    for (const w of p.withHeads) assert.equal(w.balance, 0, `${p.personId}→${w.head}`);
  }
  assert.equal(d.cash.pool, d.people.get('mgr').sideBalance);
  assert.equal(settlementPlan(d).transfers.length, 0);
});

test('التأسيس = صافي التربية + صافي البشاير (مثال: 100 ثم بشاير صرف 40 ودخل 20 ⇒ 120)', () => {
  const b = demoBook({ settleFrom: '2025-11' });
  b.upsert('poultry.cycle', { id: 'c1', layStart: '2025-09-01' }, opts);
  b.addEntries([
    exp('c1', '2025-06-01', '2025-06', 'feed', 100000),
    exp('c1', '2025-09-10', '2025-09', 'feed', 25000),
    exp('c1', '2025-10-10', '2025-10', 'vet', 15000),
    eggs('c1', '2025-10-20', '2025-10', 200, 100),
    eggs('c1', '2025-11-20', '2025-11', 500, 100),
    exp('c1', '2025-11-20', '2025-11', 'feed', 20000),
  ], opts);
  const d = computeCycle(b.state, 'c1', '2025-11-30');
  assert.equal(d.totals.establishment, 120000);
  assert.equal(d.kpis.capital, 120000);
  assert.equal(d.totals.regular.net, 30000);
  assert.equal(d.totals.opNet, 30000);
  assert.equal(d.kpis.avgMonthlyNet, 30000);
});

test('قيد متأخر على حساب فترة التأسيس: يتحمّل الضيف نسبته حسب شهر الحساب لا تاريخ التسجيل', async () => {
  const { guestDate } = await import('../../app/src/core/modules/poultry/calc.js');
  assert.equal(guestDate({ date: '2026-11-18', month: '2025-06' }), '2025-06-30');
  assert.equal(guestDate({ date: '2025-09-27', month: '2025-10' }), '2025-10-01');
  assert.equal(guestDate({ date: '2025-10-05', month: '2025-10' }), '2025-10-05');
  const b = demoBook();
  b.addEntry({ kind: 'poultry.guest', cycleId: 'c1', date: '2025-05-05', personId: 'gst', guestBirds: 5000, totalBirds: 10000 }, opts);
  b.addEntry({ kind: 'poultry.guest', cycleId: 'c1', date: '2025-08-01', personId: 'gst', guestBirds: 0, totalBirds: 5000 }, opts);
  b.addEntry(exp('c1', '2025-12-20', '2025-06', 'vet', 8000), opts); // سُجّل في ديسمبر على حساب يونيو
  const d = computeCycle(b.state, 'c1', '2025-12-20');
  assert.equal(d.people.get('gst').guestCost, 4000);
  assert.equal(d.totals.capExpenses, 4000);
});
