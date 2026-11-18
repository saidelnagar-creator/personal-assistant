// التخزين في IndexedDB (fake-indexeddb): الزرع، الحفظ وإعادة الفتح، الاستيراد مع نسخة تلقائية، الدمج.
import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { Store } from '../../app/src/storage/store.js';
import { seedEvents } from '../../app/src/core/book.js';
import { parseBackup } from '../../app/src/core/backup.js';

let n = 0;
const fresh = () => Store.open({ dbName: `t-${++n}` });

test('أول فتح يزرع القوائم ويعلّم القاعدة جديدة', async () => {
  const s = await fresh();
  assert.equal(s.isFresh, true);
  assert.equal(s.events.length, seedEvents().length);
  assert.ok(s.state.entities.get('person').get('me'));
  assert.ok(s.state.entities.get('poultry.category').get('feed'));
});

test('الحفظ يبقى بعد إعادة الفتح، والحالة تُعاد بناؤها من السجل', async () => {
  const name = `t-${++n}`;
  const s = await Store.open({ dbName: name });
  await s.run((b) => b.upsert('person', { id: 'x', name: 'شخص' }));
  await s.run((b) => b.upsert('poultry.cycle', { id: 'c', name: 'د', startDate: '2025-01-01', birds: 10, status: 'active' }));
  await s.run((b) => b.addEntry({ kind: 'poultry.expense', cycleId: 'c', date: '2025-01-02', month: '2025-01', category: 'feed', amount: 500 }));
  s.close();
  const s2 = await Store.open({ dbName: name });
  assert.equal(s2.isFresh, false);
  assert.equal(s2.events.length, s.events.length);
  assert.equal(s2.state.entries.length, 1);
});

test('حدث مرفوض لا يُكتب ولا يغيّر الحالة', async () => {
  const s = await fresh();
  const before = s.events.length;
  await assert.rejects(() => s.run((b) => b.addEntry({ kind: 'poultry.expense', cycleId: 'missing', date: '2025-01-02', month: '2025-01', category: 'feed', amount: 1 })), /الدورة غير موجودة/);
  assert.equal(s.events.length, before);
});

test('الاستيراد (استبدال/دمج) يأخذ نسخة تلقائية أولاً، والتصدير يعود كما هو', async () => {
  const a = await fresh();
  await a.run((b) => b.upsert('person', { id: 'p1', name: 'أ' }));
  const doc = a.exportDoc('t');
  const b = await fresh();
  await b.run((bk) => bk.upsert('person', { id: 'p2', name: 'ب' }));
  await b.importBackup(parseBackup(JSON.stringify(doc)), 'merge');
  assert.ok(b.state.entities.get('person').get('p1') && b.state.entities.get('person').get('p2'));
  const snaps = await b.listSnapshots();
  assert.ok(snaps.some((x) => x.reason.includes('دمج')));
  await b.importBackup(parseBackup(JSON.stringify(doc)), 'replace');
  assert.ok(!b.state.entities.get('person').get('p2'));
  await b.restoreSnapshot(snaps[0].id);
  assert.ok(b.state.entities.get('person').get('p2'));
});

test('ملف معدَّل يُرفض (checksum)', async () => {
  const a = await fresh();
  const doc = a.exportDoc();
  doc.events[0].data.item.name = 'تلاعب';
  assert.throws(() => parseBackup(JSON.stringify(doc)), /checksum/);
});
