// السلف والجمعيات والأمانات والأسعار: الباقي وجدول السداد، القيمة وقت السلف ودلوقتي، التحويل لنوع تاني،
// الجمعية (عضو بأكتر من سهم وسهم لحد تاني، ومدير)، الأمانات والترجيع الجزئي، التذكيرات، الوضع المالي.
// بيانات وهمية فقط.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Book } from '../../app/src/core/book.js';
import { buildState, describeEntry } from '../../app/src/core/engine.js';
import { allReminders, financeOverview } from '../../app/src/core/overview.js';
import { deriveGold, qtyText, valueOf } from '../../app/src/core/modules/money/units.js';
import { priceAt } from '../../app/src/core/modules/money/prices.js';
import { loanData } from '../../app/src/core/modules/loans/calc.js';
import { assocData } from '../../app/src/core/modules/assoc/calc.js';
import { trustData } from '../../app/src/core/modules/trusts/calc.js';

const o = { now: '2026-11-18T10:00:00.000Z' };
const TODAY = '2026-11-18';
const J = (n) => n * 100; // جنيه ← قرش
const G = (n) => Math.round(n * 1000); // جرام ← ×1000

function book() {
  const b = Book.seeded();
  for (const [id, name] of [
    ['p1', 'شخص أول'],
    ['p2', 'شخص تاني'],
    ['p3', 'شخص تالت'],
    ['org', 'مدير جمعية'],
  ])
    b.upsert('person', { id, name }, o);
  return b;
}

function newLoan(b, item, draw) {
  b.dispatchAll(
    [
      ['entity.upsert', { kind: 'loan', item: { plan: { type: 'open' }, ...item } }],
      ['entry.add', { entry: { id: `d-${item.id}`, kind: 'loan.draw', loanId: item.id, ...draw } }],
    ],
    o,
  );
}

const finItem = (b, pred) => financeOverview(b.state, TODAY).items.find(pred);

// ---------- الوحدات والأسعار ----------
test('الأسعار: عيار 24 و18 والجنيه الذهب من عيار 21، والسعر في تاريخ = آخر سعر قبله', () => {
  const d = deriveGold(J(4200));
  assert.equal(d.g24, J(4800));
  assert.equal(d.g18, J(3600));
  assert.equal(d.gpound, J(33600));
  const b = book();
  b.addEntry({ kind: 'money.price', date: '2026-10-01', prices: { g21: J(4000), USD: 4850 } }, o);
  b.addEntry({ kind: 'money.price', date: '2026-11-10', prices: { g21: J(4200) } }, o);
  assert.equal(priceAt(b.state, 'g21', '2026-10-20').price, J(4000));
  assert.equal(priceAt(b.state, 'g21', TODAY).price, J(4200));
  assert.equal(priceAt(b.state, 'USD', TODAY).price, 4850, 'العملة من آخر قيد فيه سعرها');
  assert.equal(priceAt(b.state, 'g21', '2026-09-01'), null);
  assert.equal(valueOf(G(10.5), 'g21', J(4200)), J(44100));
  assert.equal(valueOf(J(100), 'USD', 4850), J(4850));
  assert.equal(qtyText(G(10.5), 'g21'), '10.5 جم عيار 21');
  assert.throws(() => b.addEntry({ kind: 'money.price', date: TODAY, prices: { g22: 100 } }, o), /سعر غير معروف/);
  assert.throws(() => b.addEntry({ kind: 'money.price', date: TODAY, prices: {} }, o), /سعر واحد/);
});

// ---------- السلف ----------
test('سلفة جنيه بأقساط: المسدد يغطي الأقدم أولاً، المتأخر والقادم، والتذكير والوضع المالي', () => {
  const b = book();
  newLoan(
    b,
    { id: 'L1', dir: 'out', personId: 'p1', unit: 'EGP', plan: { type: 'schedule', items: [{ due: '2026-09-01', qty: J(3000) }, { due: '2026-10-01', qty: J(3000) }, { due: '2026-11-20', qty: J(4000) }] } },
    { date: '2026-08-01', qty: J(10000) },
  );
  b.addEntry({ kind: 'loan.pay', loanId: 'L1', date: '2026-09-02', qty: J(4000) }, o);
  const d = loanData(b.state, 'L1', TODAY);
  assert.equal(d.balance, J(6000));
  assert.deepEqual(
    d.schedule.map((s) => [s.state, s.remaining]),
    [
      ['paid', 0],
      ['overdue', J(2000)],
      ['upcoming', J(4000)],
    ],
  );
  assert.equal(d.overdueQty, J(2000));
  assert.equal(d.valueNow, J(6000));
  const r = allReminders(b.state, TODAY).find((x) => x.module === 'loans');
  assert.equal(r.level, 'overdue');
  assert.match(r.title, /شخص أول عليه قسط 2,000 ج/);
  assert.equal(finItem(b, (x) => x.href === '#/loan/L1').kind, 'receivable');
  assert.equal(finItem(b, (x) => x.href === '#/loan/L1').amount, J(6000));
  // السداد كله ← خلصت ومفيش تذكير
  b.addEntry({ kind: 'loan.pay', loanId: 'L1', date: TODAY, qty: J(6000) }, o);
  const d2 = loanData(b.state, 'L1', TODAY);
  assert.equal(d2.status, 'settled');
  assert.ok(d2.schedule.every((s) => s.state === 'paid'));
  assert.ok(!allReminders(b.state, TODAY).some((x) => x.module === 'loans'));
  assert.ok(!finItem(b, (x) => x.href === '#/loan/L1'));
});

test('السداد أكبر من الباقي مرفوض — حتى بتاريخ قديم قبل زيادة السلفة', () => {
  const b = book();
  newLoan(b, { id: 'L1', dir: 'in', personId: 'p2', unit: 'EGP' }, { date: '2026-01-10', qty: J(5000) });
  b.addEntry({ kind: 'loan.draw', loanId: 'L1', date: '2026-03-01', qty: J(5000) }, o);
  assert.throws(() => b.addEntry({ kind: 'loan.pay', loanId: 'L1', date: '2026-02-01', qty: J(6000) }, o), /أكبر من الباقي وقتها \(5,000 ج يوم 01\/02\/2026\)/);
  b.addEntry({ kind: 'loan.pay', loanId: 'L1', date: '2026-04-01', qty: J(6000) }, o);
  // إلغاء الزيادة يخلي السداد أكبر من السلفة ← مرفوض
  const draw2 = b.state.entries.find((e) => e.kind === 'loan.draw' && e.date === '2026-03-01');
  assert.throws(() => b.voidEntry(draw2.id, 'غلط', TODAY, o), /أكبر من الباقي/);
  const d = loanData(b.state, 'L1', TODAY);
  assert.equal(d.balance, J(4000));
  assert.equal(d.drawn, J(10000));
  const it = finItem(b, (x) => x.href === '#/loan/L1');
  assert.equal(it.kind, 'payable');
  assert.equal(it.amount, J(4000));
  assert.match(describeEntry(b.state, draw2).title, /زيادة سلفة من شخص تاني/);
});

test('سلفة ذهب: القيمة وقتها ودلوقتي بالأسعار، وبدون سعر تتحسب بقيمتها وقت السلف', () => {
  const b = book();
  newLoan(b, { id: 'G1', dir: 'in', personId: 'p1', unit: 'g21', plan: { type: 'once', due: '2027-06-01' } }, { date: '2026-05-01', qty: G(20), value: J(70000), desc: 'سبيكة' });
  let d = loanData(b.state, 'G1', TODAY);
  assert.equal(d.valueThen, J(70000));
  assert.equal(d.valueBasis, 'then');
  assert.equal(d.valueNow, J(70000));
  b.addEntry({ kind: 'money.price', date: '2026-11-15', prices: { g21: J(4200) } }, o);
  b.addEntry({ kind: 'loan.pay', loanId: 'G1', date: '2026-11-16', qty: G(5) }, o);
  d = loanData(b.state, 'G1', TODAY);
  assert.equal(d.balance, G(15));
  assert.equal(d.valueNow, J(63000));
  assert.equal(d.valueBasis, 'price');
  assert.equal(d.next.due, '2027-06-01');
  assert.equal(d.next.remaining, G(15));
  assert.match(finItem(b, (x) => x.href === '#/loan/G1').label, /15 جم عيار 21/);
  // نوع السلفة مايتغيرش بعد التسجيل
  assert.throws(() => b.upsert('loan', { id: 'G1', unit: 'EGP' }, o), /استخدم «تحويل لنوع تاني»/);
});

test('اللي اتسلم ذهب والدين بالجنيه (اتحول وقتها)، والسلفة بحاجة تانية', () => {
  const b = book();
  newLoan(b, { id: 'L1', dir: 'in', personId: 'p1', unit: 'EGP' }, { date: '2026-06-01', qty: J(84000), given: { unit: 'g21', qty: G(20), desc: 'غويشتين' } });
  const e = b.state.entries.find((x) => x.kind === 'loan.draw');
  assert.match(describeEntry(b.state, e).title, /استلفت من شخص أول: 84,000 ج \(اتسلم 20 جم عيار 21\)/);
  assert.throws(() => b.addEntry({ kind: 'loan.draw', loanId: 'L1', date: TODAY, qty: 1, given: { unit: 'EGP', qty: 1 } }, o), /اللي اتسلم فعلاً غير صالح/);
  assert.throws(() => b.upsert('loan', { dir: 'out', personId: 'p1', unit: 'item', plan: { type: 'open' } }, o), /الحاجة اللي اتسلفت إيه/);
  newLoan(b, { id: 'I1', dir: 'out', personId: 'p2', unit: 'item', itemName: 'كرسي' }, { date: '2026-06-01', qty: G(4), value: J(2000) });
  b.addEntry({ kind: 'loan.pay', loanId: 'I1', date: '2026-07-01', qty: G(1) }, o);
  const d = loanData(b.state, 'I1', TODAY);
  assert.equal(d.valueNow, J(1500), 'الحاجة بقيمتها وقت السلف بالتناسب');
  assert.equal(qtyText(d.balance, 'item', 'كرسي'), '3 كرسي');
});

test('جدول جديد للباقي في نص السلفة: المسدد قبله مايتحسبش على أقساطه', () => {
  const b = book();
  newLoan(b, { id: 'L1', dir: 'out', personId: 'p1', unit: 'EGP', plan: { type: 'open' } }, { date: '2026-01-01', qty: J(10000) });
  b.addEntry({ kind: 'loan.pay', loanId: 'L1', date: '2026-05-01', qty: J(4000) }, o);
  b.upsert('loan', { id: 'L1', plan: { type: 'schedule', base: J(4000), items: [{ due: '2026-12-01', qty: J(3000) }, { due: '2027-01-01', qty: J(3000) }] } }, o);
  let d = loanData(b.state, 'L1', TODAY);
  assert.deepEqual(d.schedule.map((s) => [s.paid, s.remaining]), [[0, J(3000)], [0, J(3000)]]);
  b.addEntry({ kind: 'loan.pay', loanId: 'L1', date: TODAY, qty: J(1000) }, o);
  d = loanData(b.state, 'L1', TODAY);
  assert.equal(d.schedule[0].remaining, J(2000));
  assert.equal(d.unscheduled, 0);
});

test('مسامحة في جزء: تقفل السلفة بدون فلوس، وتتحسب في جدول السداد', () => {
  const b = book();
  newLoan(b, { id: 'L1', dir: 'out', personId: 'p1', unit: 'EGP', plan: { type: 'once', due: '2026-10-01' } }, { date: '2026-01-01', qty: J(1000) });
  b.addEntry({ kind: 'loan.pay', loanId: 'L1', date: '2026-10-01', qty: J(800) }, o);
  const f = b.addEntry({ kind: 'loan.pay', loanId: 'L1', date: '2026-10-02', qty: J(200), forgive: true }, o);
  const d = loanData(b.state, 'L1', TODAY);
  assert.equal(d.status, 'settled');
  assert.equal(d.forgiven, J(200));
  const desc = describeEntry(b.state, b.state.entryById.get(f.id));
  assert.equal(desc.sign, 0);
  assert.match(desc.title, /مسامحة شخص أول: 200 ج/);
});

test('تحويل الباقي كله لنوع تاني: السلفة القديمة تتقفل والجديدة تبدأ بالكمية المتفق عليها', () => {
  const b = book();
  newLoan(b, { id: 'G1', dir: 'out', personId: 'p1', unit: 'g21' }, { date: '2026-01-01', qty: G(10), value: J(30000) });
  b.addEntry({ kind: 'loan.pay', loanId: 'G1', date: '2026-03-01', qty: G(4) }, o);
  assert.throws(
    () =>
      b.dispatchAll(
        [
          ['entity.upsert', { kind: 'loan', item: { id: 'E1', dir: 'out', personId: 'p1', unit: 'EGP', plan: { type: 'open' }, fromLoanId: 'G1' } }],
          ['entry.add', { entry: { id: 'c1', kind: 'loan.convert', loanId: 'G1', toLoanId: 'E1', date: '2026-11-01', fromQty: G(5), toQty: J(21000) } }],
        ],
        o,
      ),
    /لكل الباقي \(6 جم عيار 21\)/,
  );
  assert.ok(!b.state.entities.get('loan').has('E1'), 'الكتلة كلها اتلغت');
  b.dispatchAll(
    [
      ['entity.upsert', { kind: 'loan', item: { id: 'E1', dir: 'out', personId: 'p1', unit: 'EGP', plan: { type: 'open' }, fromLoanId: 'G1' } }],
      ['entry.add', { entry: { id: 'c1', kind: 'loan.convert', loanId: 'G1', toLoanId: 'E1', date: '2026-11-01', fromQty: G(6), toQty: J(25200), value: J(25200) } }],
    ],
    o,
  );
  const g = loanData(b.state, 'G1', TODAY);
  const e = loanData(b.state, 'E1', TODAY);
  assert.equal(g.status, 'converted');
  assert.equal(g.balance, 0);
  assert.equal(e.balance, J(25200));
  assert.equal(e.valueThen, J(25200));
  assert.throws(() => b.addEntry({ kind: 'loan.pay', loanId: 'G1', date: TODAY, qty: G(1) }, o), /اتحولت لنوع تاني/);
  const pay = b.addEntry({ kind: 'loan.pay', loanId: 'E1', date: TODAY, qty: J(5000) }, o);
  assert.throws(() => b.voidEntry('c1', 'غلط', TODAY, o), /السلفة الجديدة عليها حركات/);
  b.voidEntry(pay.id, 'غلط', TODAY, o);
  b.voidEntry('c1', 'غلط', TODAY, o);
  assert.equal(loanData(b.state, 'G1', TODAY).balance, G(6));
  assert.equal(loanData(b.state, 'G1', TODAY).status, 'active');
  const fin = financeOverview(b.state, TODAY).items.filter((x) => x.personId === 'p1');
  assert.equal(fin.length, 1, 'السلفة الجديدة الفاضية مش ظاهرة');
});

// ---------- الجمعيات ----------
// 10 شهور × 10,000 من يوليو 2026: سهمي كامل يقبض 40,000 في الشهر الرابع (أكتوبر) و60,000 في يناير؛
// ونص سهم لشخص تاني بيدفعلي، يقبض 50,000 في أبريل.
function memberAssoc() {
  const b = book();
  b.upsert(
    'assoc',
    {
      id: 'A1',
      name: 'جمعية الشغل',
      organizerId: 'org',
      monthly: J(10000),
      months: 10,
      start: '2026-07',
      payDay: 5,
      shares: [
        { id: 's1', ownerId: 'me', size: { num: 1, den: 1 }, turn: 4, payouts: [{ month: '2026-10', amount: J(40000) }, { month: '2027-01', amount: J(60000) }] },
        { id: 's2', ownerId: 'p2', size: { num: 1, den: 2 }, turn: 10, payouts: [{ month: '2027-04', amount: J(50000) }] },
      ],
    },
    o,
  );
  return b;
}
const apay = (shareId, month, amount, date = `${month}-05`) => ({ kind: 'assoc.pay', assocId: 'A1', shareId, month, amount, date });

test('جمعية (عضو): مجموع القبض لازم = إجمالي الأقساط، والأشهر والقبض والرصيد مع صاحب السهم', () => {
  const b = memberAssoc();
  assert.throws(() => b.upsert('assoc', { id: 'A1', shares: [{ id: 's1', ownerId: 'me', size: { num: 1, den: 1 }, payouts: [{ month: '2026-10', amount: J(40000) }] }] }, o), /مجموع قبض أنا \(40,000 ج\) لازم يساوي إجمالي أقساطه \(100,000 ج\)/);
  assert.throws(() => b.upsert('assoc', { id: 'A1', shares: [{ id: 's1', ownerId: 'me', size: { num: 1, den: 1 }, payouts: [{ month: '2027-05', amount: J(100000) }] }] }, o), /من شهور الجمعية/);
  for (const m of ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11']) b.addEntry(apay('s1', m, J(10000)), o);
  for (const m of ['2026-07', '2026-08', '2026-09']) b.addEntry(apay('s2', m, J(5000)), o);
  b.addEntry({ kind: 'assoc.transfer', assocId: 'A1', shareId: 's2', dir: 'in', amount: J(10000), date: '2026-07-01' }, o);
  b.addEntry({ kind: 'assoc.payout', assocId: 'A1', shareId: 's1', month: '2026-10', amount: J(40000), date: '2026-10-05' }, o);
  const d = assocData(b.state, 'A1', TODAY);
  const [mine, other] = d.shares;
  assert.equal(mine.installment, J(10000));
  assert.equal(other.installment, J(5000));
  assert.equal(other.total, J(50000));
  assert.equal(mine.position, J(10000), 'دفعت 50 وقبضت 40');
  assert.equal(d.myPosition, J(10000));
  assert.equal(other.ownerBalance, J(-5000), 'دفعتله 15 من عندي ودفعلي 10');
  assert.equal(other.late, J(10000), 'سهمه متأخر أكتوبر ونوفمبر');
  assert.equal(other.ownerLate, J(15000));
  assert.deepEqual(
    mine.payouts.map((p) => [p.month, p.state]),
    [
      ['2026-10', 'received'],
      ['2027-01', 'later'],
    ],
  );
  assert.equal(d.monthIndex, 5);
  assert.deepEqual(d.grid.slice(2, 6).map((g) => g.state), ['paid', 'partial', 'partial', 'upcoming']);
  // الوضع المالي: ليّ في الجمعية 10، وشخص تاني عليه 5
  const items = financeOverview(b.state, TODAY).items.filter((x) => x.module === 'assoc');
  assert.deepEqual(
    items.map((x) => [x.kind, x.amount]),
    [
      ['receivable', J(10000)],
      ['receivable', J(5000)],
    ],
  );
  assert.equal(items[1].personId, 'p2');
  // التذكير: قسط شهر 4 لسهمه متأخر + هو متأخر عليّ
  const rem = allReminders(b.state, TODAY).filter((x) => x.module === 'assoc');
  assert.ok(rem.some((r) => r.level === 'overdue' && /قسط جمعية الشغل \(شهر 4\): 10,000 ج/.test(r.title)), JSON.stringify(rem));
  assert.ok(rem.some((r) => /شخص تاني متأخر 15,000 ج/.test(r.title)));
  // الأقساط مايتعدوش الإجمالي
  for (const m of ['2026-12', '2027-01', '2027-02', '2027-03', '2027-04']) b.addEntry(apay('s1', m, J(10000)), o);
  assert.throws(() => b.addEntry(apay('s1', '2027-04', J(1)), o), /أكبر من إجمالي السهم \(100,000 ج\)/);
  // قبض سهمه وسلّمته
  b.addEntry({ kind: 'assoc.payout', assocId: 'A1', shareId: 's2', month: '2027-04', amount: J(50000), date: '2027-04-05' }, o);
  const d2 = assocData(b.state, 'A1', '2027-04-06');
  assert.equal(d2.shares[1].ownerBalance, J(45000));
  assert.ok(allReminders(b.state, '2027-04-06').some((r) => /سلّم شخص تاني فلوس قبض جمعية الشغل: 45,000 ج/.test(r.title)));
  // سهم عليه حركات مايتشالش
  assert.throws(() => b.upsert('assoc', { id: 'A1', shares: [d.assoc.shares[0]] }, o), /سهم شخص تاني عليه حركات/);
});

test('جمعية (مدير): التحصيل من الأعضاء، تسليم القبض، والفلوس اللي معايا واللي دفعتها من جيبي', () => {
  const b = book();
  b.upsert(
    'assoc',
    {
      id: 'A2',
      name: 'جمعية العيلة',
      organizerId: 'me',
      monthly: J(1000),
      months: 3,
      start: '2026-09',
      payDay: 1,
      shares: [
        { id: 'm1', ownerId: 'p1', size: { num: 1, den: 1 }, turn: 1, payouts: [{ month: '2026-09', amount: J(3000) }] },
        { id: 'm2', ownerId: 'me', size: { num: 1, den: 1 }, turn: 2, payouts: [{ month: '2026-10', amount: J(3000) }] },
        { id: 'm3', ownerId: 'p3', size: { num: 1, den: 1 }, turn: 3, payouts: [{ month: '2026-11', amount: J(3000) }] },
      ],
    },
    o,
  );
  const pay = (shareId, month, date) => b.addEntry({ kind: 'assoc.pay', assocId: 'A2', shareId, month, amount: J(1000), date }, o);
  pay('m1', '2026-09', '2026-09-01');
  pay('m2', '2026-09', '2026-09-01');
  // الشخص التالت ما دفعش وسلّمت الأول القبض كامل من جيبي
  b.addEntry({ kind: 'assoc.payout', assocId: 'A2', shareId: 'm1', month: '2026-09', amount: J(3000), date: '2026-09-02' }, o);
  let d = assocData(b.state, 'A2', '2026-09-10');
  assert.equal(d.organizer, true);
  assert.equal(d.pot, J(-1000));
  assert.deepEqual(
    financeOverview(b.state, '2026-09-10')
      .items.filter((x) => x.module === 'assoc')
      .map((x) => [x.kind, x.amount]),
    [
      ['receivable', J(1000)],
      ['receivable', J(1000)],
    ],
    'قسطي + اللي دفعته من جيبي',
  );
  const rem = allReminders(b.state, '2026-09-10').filter((x) => x.module === 'assoc');
  assert.ok(rem.some((r) => /حصّل أقساط جمعية العيلة: 1 سهم لسه \(شخص تالت\)/.test(r.title)), JSON.stringify(rem));
  pay('m3', '2026-09', '2026-09-12');
  for (const s of ['m1', 'm2', 'm3']) pay(s, '2026-10', '2026-10-01');
  b.addEntry({ kind: 'assoc.payout', assocId: 'A2', shareId: 'm2', month: '2026-10', amount: J(3000), date: '2026-10-02' }, o);
  d = assocData(b.state, 'A2', '2026-10-10');
  assert.equal(d.pot, 0);
  assert.equal(d.myPosition, J(-1000), 'قبضت قبل ما أكمّل: عليّ قسط');
  assert.equal(d.shares[0].position, J(-1000), 'الأول عليه قسط نوفمبر');
  assert.match(describeEntry(b.state, d.entries.find((e) => e.kind === 'assoc.payout' && e.shareId === 'm1')).title, /سلّمت شخص أول قبض جمعية العيلة/);
  assert.throws(() => b.addEntry({ kind: 'assoc.transfer', assocId: 'A2', shareId: 'm1', dir: 'in', amount: 100, date: TODAY }, o), /جمعية أنا مش مديرها/);
  assert.throws(() => b.upsert('assoc', { id: 'A2', organizerId: 'org' }, o), /إنك المدير/);
});

// ---------- الأمانات ----------
function trustBook() {
  const b = book();
  b.upsert(
    'trust',
    {
      id: 'T1',
      dir: 'held',
      personId: 'p1',
      date: '2026-03-01',
      place: 'الدولاب',
      dueDate: '2026-11-20',
      items: [
        { id: 'i1', type: 'gold', name: 'غويشة', karat: 21, weight: G(30), count: 2 },
        { id: 'i2', type: 'gold', name: 'جنيه ذهب', count: 3 },
        { id: 'i3', type: 'gold', name: 'سبيكة', karat: 24, weight: G(10) },
        { id: 'i4', type: 'doc', name: 'قايمة منقولات', desc: 'أصل' },
        { id: 'i5', type: 'gold', name: 'خاتم', desc: 'بفص' },
      ],
    },
    o,
  );
  b.upsert('trust', { id: 'T2', dir: 'placed', personId: 'p2', date: '2026-05-01', items: [{ id: 'u1', type: 'money', unit: 'USD', amount: J(1000) }] }, o);
  return b;
}

test('أمانة ذهب بالوزن والعيار والعدد وورق: القيمة الحالية والترجيع الجزئي', () => {
  const b = trustBook();
  let d = trustData(b.state, 'T1', TODAY);
  assert.equal(d.valueNow, 0);
  assert.equal(d.unvalued, 4, 'الذهب من غير سعر');
  b.addEntry({ kind: 'money.price', date: '2026-11-15', prices: { g21: J(4200), g24: J(4800), gpound: J(33600), USD: 4850 } }, o);
  d = trustData(b.state, 'T1', TODAY);
  assert.equal(d.valueNow, J(30 * 4200 + 3 * 33600 + 10 * 4800));
  assert.equal(d.unvalued, 1, 'الخاتم بوصف بس');
  assert.deepEqual(d.goldByKarat, { 21: G(30), 24: G(10) });
  // رجّع غويشة واحدة وجنيهين
  b.addEntry({ kind: 'trust.return', trustId: 'T1', date: TODAY, items: [{ itemId: 'i1', count: 1 }, { itemId: 'i2', count: 2 }] }, o);
  d = trustData(b.state, 'T1', TODAY);
  assert.equal(d.status, 'partial');
  const g = d.items.find((x) => x.id === 'i1');
  assert.equal(g.remainingCount, 1);
  assert.equal(g.remainingWeight, G(15));
  assert.equal(d.valueNow, J(15 * 4200 + 33600 + 10 * 4800));
  assert.throws(() => b.addEntry({ kind: 'trust.return', trustId: 'T1', date: TODAY, items: [{ itemId: 'i1', count: 2 }] }, o), /أكبر من الباقي/);
  assert.throws(() => b.upsert('trust', { id: 'T1', items: d.trust.items.filter((x) => x.id !== 'i2') }, o), /رجع منها جزء/);
  assert.throws(() => b.upsert('trust', { dir: 'held', personId: 'p1', date: TODAY, items: [{ id: 'x', type: 'gold' }] }, o), /اكتب القطعة/);
  // الوضع المالي: أمانة عندي خارج الحساب، وأمانتي (دولار) ليّ عند الغير
  const fin = financeOverview(b.state, TODAY);
  const held = fin.items.find((x) => x.href === '#/trust/T1');
  assert.equal(held.kind, 'held');
  assert.equal(fin.totals.receivable, J(48500));
  assert.equal(fin.net, J(48500), 'الأمانة اللي عندي مش داخلة في الصافي');
  // التذكير بميعاد الرجوع
  const rem = allReminders(b.state, TODAY).find((r) => r.module === 'trusts');
  assert.equal(rem.level, 'upcoming');
  assert.match(rem.title, /ميعاد ترجيع أمانة شخص أول/);
  // ترجيع الباقي كله ← رجعت
  b.addEntry({ kind: 'trust.return', trustId: 'T1', date: TODAY, items: [{ itemId: 'i1', count: 1 }, { itemId: 'i2', count: 1 }, { itemId: 'i3', count: 1 }, { itemId: 'i4', count: 1 }, { itemId: 'i5', count: 1 }] }, o);
  assert.equal(trustData(b.state, 'T1', TODAY).status, 'returned');
  assert.ok(!allReminders(b.state, TODAY).some((r) => r.module === 'trusts'));
  // فلوس: ترجيع جزء من المبلغ
  b.addEntry({ kind: 'trust.return', trustId: 'T2', date: TODAY, items: [{ itemId: 'u1', amount: J(400) }] }, o);
  assert.equal(trustData(b.state, 'T2', TODAY).valueNow, J(600 * 48.5));
});

test('تنبيه «حدّث الأسعار» لما سعر ذهب أو عملة مستخدمة قديم أو مش موجود', () => {
  const b = trustBook();
  let r = allReminders(b.state, TODAY).find((x) => x.id.startsWith('prices-'));
  assert.ok(r);
  assert.match(r.title, /مفيش سعر مكتوب/);
  b.addEntry({ kind: 'money.price', date: '2026-11-01', prices: { g21: J(4200), g24: J(4800), gpound: J(33600), USD: 4850 } }, o);
  r = allReminders(b.state, TODAY).find((x) => x.id.startsWith('prices-'));
  assert.match(r.title, /آخر سعر من 17 يوم/);
  b.addEntry({ kind: 'money.price', date: TODAY, prices: { g21: J(4250), g24: J(4850), gpound: J(34000), USD: 4860 } }, o);
  assert.ok(!allReminders(b.state, TODAY).some((x) => x.id.startsWith('prices-')));
});

test('التذكير قبل الميعاد بالمدة المختارة من الإعدادات (الافتراضي أسبوع)', () => {
  const b = book();
  newLoan(b, { id: 'L1', dir: 'in', personId: 'p1', unit: 'EGP', plan: { type: 'once', due: '2026-11-28' } }, { date: '2026-10-01', qty: J(500) });
  assert.ok(!allReminders(b.state, TODAY).some((x) => x.module === 'loans'), '10 أيام: لسه');
  b.dispatch('settings.set', { key: 'money.remindDays', value: 14 }, o);
  const r = allReminders(b.state, TODAY).find((x) => x.module === 'loans');
  assert.equal(r.level, 'upcoming');
  assert.match(r.title, /عليّ سداد لـشخص أول: 500 ج/);
});

test('إعادة بناء الحالة من السجل تعطي نفس الأرقام', () => {
  const b = memberAssoc();
  b.addEntry(apay('s1', '2026-07', J(10000)), o);
  newLoan(b, { id: 'L1', dir: 'out', personId: 'p1', unit: 'USD' }, { date: '2026-01-01', qty: J(300), value: J(14550) });
  const s2 = buildState(b.events);
  assert.deepEqual(JSON.parse(JSON.stringify(financeOverview(s2, TODAY))), JSON.parse(JSON.stringify(financeOverview(b.state, TODAY))));
  assert.deepEqual(JSON.parse(JSON.stringify(allReminders(s2, TODAY))), JSON.parse(JSON.stringify(allReminders(b.state, TODAY))));
});
