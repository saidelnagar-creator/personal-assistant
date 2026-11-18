// خواص عشوائية: لأي سلسلة قيود صالحة تبقى الثوابت المحاسبية صحيحة.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Book } from '../../app/src/core/book.js';
import { buildState } from '../../app/src/core/engine.js';
import { computeCycle } from '../../app/src/core/modules/poultry/calc.js';
import { addMonths } from '../../app/src/core/util.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

const SHARESETS = [
  [['me', 1, 3, null], ['sub', 1, 6, 'me'], ['mgr', 1, 2, null]],
  [['me', 2, 5, null], ['mgr', 3, 5, null]],
  [['me', 1, 4, null], ['sub', 1, 4, 'me'], ['sub2', 1, 8, 'mgr'], ['mgr', 3, 8, null]],
];

function randomBook(seed) {
  const r = rng(seed);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const b = Book.seeded();
  const o = { now: '2026-01-01T00:00:00.000Z' };
  for (const id of ['mgr', 'sub', 'sub2', 'gst']) b.upsert('person', { id, name: id }, o);
  const start = '2025-01';
  const settleFrom = addMonths(start, 1 + Math.floor(r() * 4));
  b.upsert('poultry.cycle', { id: 'c', name: 'c', startDate: `${start}-05`, birds: 1000, settleFrom, managerId: 'mgr', status: 'active' }, o);
  const set1 = pick(SHARESETS);
  b.addEntry({ kind: 'poultry.shares', cycleId: 'c', date: `${start}-05`, from: start, stakes: set1.map(([personId, num, den, via]) => ({ personId, num, den, via })) }, o);
  if (r() < 0.5) {
    const set2 = pick(SHARESETS);
    b.addEntry({ kind: 'poultry.shares', cycleId: 'c', date: '2025-06-01', from: '2025-06', stakes: set2.map(([personId, num, den, via]) => ({ personId, num, den, via })) }, o);
  }
  if (r() < 0.6) {
    b.addEntry({ kind: 'poultry.guest', cycleId: 'c', date: `${start}-05`, personId: 'gst', guestBirds: 300 + Math.floor(r() * 700), totalBirds: 2000 }, o);
    b.addEntry({ kind: 'poultry.guest', cycleId: 'c', date: '2025-03-01', personId: 'gst', guestBirds: 0, totalBirds: 1000 }, o);
  }
  const relations = new Set();
  for (const e of b.state.entries) if (e.kind === 'poultry.shares') for (const s of e.stakes) relations.add(s.via ? `${s.personId}>${s.via}` : `top:${s.personId}`);
  for (let i = 0; i < 80; i++) {
    const month = addMonths(start, Math.floor(r() * 10));
    const date = `${month}-${String(1 + Math.floor(r() * 27)).padStart(2, '0')}`;
    const k = r();
    if (k < 0.4) b.addEntry({ kind: 'poultry.expense', cycleId: 'c', date, month, category: pick(['feed', 'labor', 'vet', 'power']), amount: 1 + Math.floor(r() * 5_000_000), capital: r() < 0.1 || undefined, noGuest: r() < 0.1 || undefined }, o);
    else if (k < 0.75) {
      const qty = (1 + Math.floor(r() * 900)) * 1000;
      const price = 8000 + Math.floor(r() * 9000);
      b.addEntry({ kind: 'poultry.sale', cycleId: 'c', date, month, product: 'eggs', grade: pick(['normal', 'double']), qty, price, amount: Math.round((qty * price) / 1000) }, o);
    } else {
      const rel = pick([...relations]);
      const amount = 1 + Math.floor(r() * 2_000_000);
      if (rel.startsWith('top:')) {
        const p = rel.slice(4);
        const pays = r() < 0.6;
        b.addEntry({ kind: 'poultry.payment', cycleId: 'c', date, from: pays ? p : 'cycle', to: pays ? 'cycle' : p, amount }, o);
      } else {
        const [q, h] = rel.split('>');
        b.addEntry({ kind: 'poultry.payment', cycleId: 'c', date, ...(r() < 0.5 ? { from: q, to: h } : { from: h, to: q }), amount }, o);
      }
    }
  }
  return b;
}

test('ثوابت: مجموع التوزيع = صافي كل شهر، والنقدية = مجموع أرصدة النواحي، وإعادة البناء متطابقة', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const b = randomBook(seed);
    const d = computeCycle(b.state, 'c', '2026-01-01');
    for (const m of d.months) {
      if (m.unallocated) continue;
      assert.equal(m.alloc.reduce((s, a) => s + a.op, 0), m.opNet, `seed ${seed} ${m.month}`);
      assert.equal(m.alloc.reduce((s, a) => s + a.cap, 0), m.capNet, `seed ${seed} ${m.month}`);
    }
    assert.equal(d.totals.net, d.totals.sales - (d.totals.grossExpenses - d.totals.guestCost), `seed ${seed}`);
    const sides = [...d.people.values()].filter((p) => p.isTop || p.isGuest || p.personId === 'mgr').reduce((s, p) => s + p.sideBalance, 0);
    assert.equal(d.cash.pool, sides, `seed ${seed}: النقدية ≠ مجموع النواحي`);
    const own = [...d.people.values()].reduce((s, p) => s + p.ownBalance, 0);
    assert.equal(own, sides, `seed ${seed}: الأرصدة الشخصية ≠ مجموع النواحي`);
    const d2 = computeCycle(buildState(b.events), 'c', '2026-01-01');
    assert.deepEqual(d2.totals, d.totals);
  }
});

// العربية: لأي سلسلة قراءات وشغل وإلغاءات صالحة — إجمالي كل شغل = بنوده، والتكاليف = مجموع الشغل الساري،
// والعداد لا يرجع للخلف، والموعد الجاي = آخر مرة + المدة، وإعادة البناء متطابقة.
import { carCosts, carData } from '../../app/src/core/modules/car/calc.js';
import { SCHEDULE } from '../../app/src/core/modules/car/schedule.js';
import { addDays } from '../../app/src/core/util.js';

function randomCarBook(seed) {
  const r = rng(seed);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const o = { now: '2026-11-18T00:00:00.000Z' };
  const b = Book.seeded();
  b.upsert('person', { id: 'm1', name: 'm1' }, o);
  b.dispatchAll(
    [
      ['entity.upsert', { kind: 'car.vehicle', item: { id: 'car', name: 'car', gearbox: pick(['manual', 'auto']), fuel: pick(['petrol', 'petrol-cng']) } }],
      ['entry.add', { entry: { id: 'od0', kind: 'car.odometer', carId: 'car', date: '2025-01-01', km: 300000 } }],
    ],
    o,
  );
  const keys = SCHEDULE.map((t) => t.key);
  let date = '2025-01-01';
  let km = 300000;
  const works = [];
  for (let i = 0; i < 40; i++) {
    date = addDays(date, 1 + Math.floor(r() * 20));
    km += Math.floor(r() * 1500);
    const k = r();
    if (k < 0.4) b.addEntry({ kind: 'car.odometer', carId: 'car', date, km }, o);
    else if (k < 0.9) {
      const parts = Array.from({ length: Math.floor(r() * 4) }, (_, j) => {
        const qty = (1 + Math.floor(r() * 4)) * 500;
        const price = Math.floor(r() * 100000);
        return { name: `p${j}`, qty, price, amount: Math.round((qty * price) / 1000) };
      });
      const labor = r() < 0.6 ? Math.floor(r() * 50000) : 0;
      const other = r() < 0.2 ? Math.floor(r() * 20000) : 0;
      const tasks = [...new Set(Array.from({ length: 1 + Math.floor(r() * 3) }, () => pick(keys)))];
      const e = b.addEntry({ kind: 'car.work', carId: 'car', type: pick(['service', 'repair', 'upgrade']), date, km, tasks, parts: parts.length ? parts : undefined, labor: labor || undefined, other: other || undefined, mechanicId: r() < 0.5 ? 'm1' : undefined, amount: parts.reduce((s, p) => s + p.amount, 0) + labor + other }, o);
      works.push(e.id);
    } else if (works.length) {
      const id = works.splice(Math.floor(r() * works.length), 1)[0];
      b.voidEntry(id, 'random', date, o);
    }
  }
  return { b, today: addDays(date, Math.floor(r() * 200)) };
}

test('ثوابت العربية: الإجمالي = البنود، التكاليف = مجموع الشغل، العداد لا يرجع، وإعادة البناء متطابقة', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const { b, today } = randomCarBook(seed);
    const d = carData(b.state, 'car', today);
    const c = carCosts(b.state, 'car', today);
    let total = 0;
    for (const w of d.works) {
      assert.equal(w.amount, (w.parts || []).reduce((s, p) => s + p.amount, 0) + (w.labor || 0) + (w.other || 0), `seed ${seed}`);
      total += w.amount;
    }
    assert.equal(c.totals.total, total, `seed ${seed}`);
    assert.equal(c.byYear.reduce((s, [, y]) => s + y.total, 0), total, `seed ${seed}`);
    assert.equal(c.split.parts + c.split.labor + c.split.other, total, `seed ${seed}`);
    for (let i = 1; i < d.readings.length; i++) assert.ok(d.readings[i].km >= d.readings[i - 1].km, `seed ${seed}: العداد رجع`);
    for (const t of d.tasks) if (t.last && t.km > 0 && t.status !== 'off') assert.equal(t.dueKm, t.last.km + t.km, `seed ${seed} ${t.id}`);
    const s2 = buildState(b.events);
    assert.deepEqual(JSON.parse(JSON.stringify(carData(s2, 'car', today).tasks)), JSON.parse(JSON.stringify(d.tasks)), `seed ${seed}`);
    assert.deepEqual(carCosts(s2, 'car', today).totals, c.totals, `seed ${seed}`);
  }
});

// السلف: لأي سلسلة أخذ/سداد/مسامحة/إلغاء صالحة — الباقي = المأخوذ − المسدد، لا يصبح سالباً في أي يوم،
// المسدد على الجدول = min(المسدد، الجدول)، وإعادة البناء متطابقة. الجمعيات: مجموع أرصدة الأسهم = الفلوس مع المدير.
import { loanData, loanMoves } from '../../app/src/core/modules/loans/calc.js';
import { assocData } from '../../app/src/core/modules/assoc/calc.js';

test('ثوابت السلف: الباقي = المأخوذ − المسدد، لا سالب في أي يوم، والجدول متسق', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const r = rng(seed * 7);
    const o = { now: '2026-11-18T00:00:00.000Z' };
    const b = Book.seeded();
    b.upsert('person', { id: 'p', name: 'p' }, o);
    const items = Array.from({ length: 1 + Math.floor(r() * 5) }, (_, i) => ({ due: addDays('2026-01-01', 30 * (i + 1)), qty: 1 + Math.floor(r() * 100000) }));
    b.dispatchAll(
      [
        ['entity.upsert', { kind: 'loan', item: { id: 'L', dir: r() < 0.5 ? 'out' : 'in', personId: 'p', unit: 'EGP', plan: r() < 0.5 ? { type: 'schedule', items } : { type: 'once', due: '2026-06-01' } } }],
        ['entry.add', { entry: { id: 'd0', kind: 'loan.draw', loanId: 'L', date: '2026-01-01', qty: 1 + Math.floor(r() * 200000) } }],
      ],
      o,
    );
    const ids = [];
    let accepted = 0;
    for (let i = 0; i < 40; i++) {
      const date = addDays('2026-01-01', Math.floor(r() * 300));
      const k = r();
      try {
        if (k < 0.25) ids.push(b.addEntry({ kind: 'loan.draw', loanId: 'L', date, qty: 1 + Math.floor(r() * 50000) }, o).id);
        else if (k < 0.85) ids.push(b.addEntry({ kind: 'loan.pay', loanId: 'L', date, qty: 1 + Math.floor(r() * 60000), forgive: r() < 0.1 || undefined }, o).id);
        else if (ids.length) b.voidEntry(ids.splice(Math.floor(r() * ids.length), 1)[0], 'x', date, o);
        accepted++;
      } catch (e) {
        assert.equal(e.name, 'ValidationError', `seed ${seed}: ${e.message}`);
      }
    }
    assert.ok(accepted > 5, `seed ${seed}`);
    const d = loanData(b.state, 'L', '2026-11-18');
    assert.equal(d.balance, d.drawn - d.paid - d.forgiven, `seed ${seed}`);
    let bal = 0;
    for (const m of loanMoves(b.state, 'L')) {
      bal += m.delta;
      assert.ok(bal >= 0, `seed ${seed}: الباقي بالسالب`);
    }
    const sched = d.schedule.reduce((a, s) => a + s.qty, 0);
    if (d.status === 'active') assert.equal(d.schedule.reduce((a, s) => a + s.paid, 0), Math.min(d.paid + d.forgiven, sched), `seed ${seed}`);
    assert.ok(sched <= d.drawn, `seed ${seed}: الجدول أكبر من السلفة`);
    const d2 = loanData(buildState(b.events), 'L', '2026-11-18');
    assert.deepEqual(JSON.parse(JSON.stringify(d2.schedule)), JSON.parse(JSON.stringify(d.schedule)), `seed ${seed}`);
  }
});

test('ثوابت الجمعيات: مجموع أرصدة الأسهم = الفلوس مع المدير، ولا سهم يتعدى إجماليه', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const r = rng(seed * 13);
    const o = { now: '2026-11-18T00:00:00.000Z' };
    const b = Book.seeded();
    for (const id of ['a', 'c', 'd']) b.upsert('person', { id, name: id }, o);
    const months = 3 + Math.floor(r() * 10);
    const organizer = r() < 0.5;
    const owners = ['me', 'a', 'c', 'd'];
    const sizes = [{ num: 1, den: 1 }, { num: 1, den: 2 }, { num: 1, den: 4 }];
    const monthly = 100 * (100 + Math.floor(r() * 1000));
    const start = '2026-01';
    const shares = Array.from({ length: 1 + Math.floor(r() * 4) }, (_, i) => {
      const size = sizes[Math.floor(r() * sizes.length)];
      const total = Math.round((monthly * size.num) / size.den) * months;
      const m1 = addMonths(start, Math.floor(r() * months));
      const split = r() < 0.4 ? Math.floor(total / 3) : 0;
      return { id: `s${i}`, ownerId: i === 0 ? 'me' : owners[Math.floor(r() * owners.length)], size, payouts: split ? [{ month: m1, amount: split }, { month: addMonths(start, months - 1), amount: total - split }] : [{ month: m1, amount: total }] };
    });
    b.upsert('assoc', { id: 'A', name: 'x', organizerId: organizer ? 'me' : 'a', monthly, months, start, payDay: 1 + Math.floor(r() * 28), shares }, o);
    for (let i = 0; i < 60; i++) {
      const sh = shares[Math.floor(r() * shares.length)];
      const month = addMonths(start, Math.floor(r() * months));
      const k = r();
      const amount = 1 + Math.floor(r() * monthly);
      try {
        if (k < 0.6) b.addEntry({ kind: 'assoc.pay', assocId: 'A', shareId: sh.id, month, amount, date: `${month}-02` }, o);
        else if (k < 0.85) b.addEntry({ kind: 'assoc.payout', assocId: 'A', shareId: sh.id, month, amount: amount * 3, date: `${month}-03` }, o);
        else b.addEntry({ kind: 'assoc.transfer', assocId: 'A', shareId: sh.id, dir: r() < 0.6 ? 'in' : 'out', amount, date: `${month}-01` }, o);
      } catch (e) {
        assert.equal(e.name, 'ValidationError', `seed ${seed}: ${e.message}`);
      }
    }
    const d = assocData(b.state, 'A', '2026-11-18');
    assert.equal(d.shares.reduce((a, s) => a + s.position, 0), d.pot, `seed ${seed}`);
    for (const s of d.shares) {
      assert.ok(s.paid <= s.total && s.received <= s.total, `seed ${seed}`);
      assert.equal(s.months.reduce((a, m) => a + m.paid, 0), s.paid, `seed ${seed}: الشهور ≠ المدفوع`);
      assert.equal(s.payouts.reduce((a, p) => a + p.received, 0), Math.min(s.received, s.payouts.reduce((a, p) => a + p.amount, 0)), `seed ${seed}`);
    }
    const d2 = assocData(buildState(b.events), 'A', '2026-11-18');
    assert.equal(d2.pot, d.pot);
    assert.equal(d2.myPosition, d.myPosition);
  }
});
