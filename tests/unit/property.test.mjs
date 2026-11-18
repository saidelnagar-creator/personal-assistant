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
