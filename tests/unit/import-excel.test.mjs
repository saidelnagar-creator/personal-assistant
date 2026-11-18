// مستورد الإكسيل على شيت تركيبي: البنية، تصحيح السنوات، الضيف، التصنيف، والمطابقة.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildImport, reconcile, classifySale } from '../../tools/import-excel.mjs';
import { makeFarmSheet } from '../fixtures/make-farm-sheet.mjs';
import { computeCycle } from '../../app/src/core/modules/poultry/calc.js';
import { parseBackup, exportDoc } from '../../app/src/core/backup.js';

test('المستورد يقرأ البنية ويصحح سنة الشهر ويستنتج الضيف والحصص وفترة البشاير', () => {
  const { book, parsed, report, cycleId } = buildImport(makeFarmSheet(), { managerName: 'مدير وهمي', subPaid: 1250 });
  assert.deepEqual(parsed.blocks.map((b) => b.month), ['2025-05', '2025-06']);
  assert.ok(report.some((r) => r.includes('صُححت')));
  assert.deepEqual(parsed.ours, [0.5, 1]);
  const d = computeCycle(book.state, cycleId, '2025-07-01');
  assert.equal(d.people.get('p_guest').guestCost, 300000); // نصف 6000 بالقرش
  assert.equal(d.people.get('p_guest').sideBalance, 0); // افتراض أنه دفع نصيبه
  // رأس المال = دفعات التربية (نصيبنا 6000) − مصروفات فترة البشاير (1000)
  assert.equal(d.totals.capExpenses, 500000);
  assert.equal(d.cycle.layStart, '2025-05-01');
  assert.equal(d.cycle.settleFrom, '2025-06');
  assert.equal(d.totals.lay.months, 1);
  assert.equal(d.totals.lay.net, 2336000);
  // التابع دفع نصيبه من رأس المال بالضبط (1/4 × 5000)
  assert.equal(d.people.get('p_sub').withHeads[0].paid, 125000);
  // الشهور المستوردة مقفولة
  assert.ok(d.months.filter((r) => r.month <= '2025-06').every((r) => r.closed));
  const shares = d.currentShares.stakes.map((s) => [s.personId, s.num, s.den, s.via]);
  assert.deepEqual(shares, [['me', 1, 4, null], ['p_sub', 1, 4, 'me'], ['p_manager', 1, 2, null]]);
});

test('المطابقة مع أرقام الشيت ناجحة كلها', () => {
  const { checks } = reconcile(makeFarmSheet());
  for (const c of checks) assert.ok(c.ok, `${c.label}: ${c.app} ≠ ${c.excel}`);
});

test('تصنيف أسطر البيع: بيض عادي/دبل، سبلة، شكاير', () => {
  assert.deepEqual(classifySale({ count: 600, price: 110 }, [110, 112]), { product: 'eggs', grade: 'normal' });
  assert.deepEqual(classifySale({ count: 4, price: 130 }, [110, 112]), { product: 'eggs', grade: 'double' });
  assert.deepEqual(classifySale({ count: 1, price: 20000 }, []), { product: 'manure' });
  assert.deepEqual(classifySale({ count: 1, price: 1700 }, []), { product: 'bags' });
  assert.deepEqual(classifySale({ count: 560, price: 6 }, []), { product: 'bags', perUnit: true });
});

test('ناتج المستورد نسخة احتياطية صالحة يقرؤها التطبيق', () => {
  const { book } = buildImport(makeFarmSheet());
  const doc = exportDoc(book.events, { now: '2026-01-01T00:00:00.000Z' });
  const parsed = parseBackup(JSON.stringify(doc));
  assert.equal(parsed.doc.events.length, book.events.length);
});
