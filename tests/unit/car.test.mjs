// وحدة العربية: الجدول حسب مواصفات العربية، آخر مرة والموعد الجاي (كيلو أو وقت أيهما أقرب)، العداد ومتوسط المشي،
// التحقق (العداد لا يرجع، الإجمالي = القطع + المصنعية)، الأعطال والتعديلات المشتقة، التذكيرات، التكاليف، الوضع المالي.
// بيانات وهمية فقط.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Book } from '../../app/src/core/book.js';
import { buildState, describeEntry } from '../../app/src/core/engine.js';
import { carCosts, carData, carTasks, addMonthsDate, needsAction, overrideId } from '../../app/src/core/modules/car/calc.js';
import { allReminders, financeOverview } from '../../app/src/core/overview.js';

const o = { now: '2026-11-18T10:00:00.000Z' };
const TODAY = '2026-11-18';

function carBook(spec = {}, { km = 394000, date = '2026-11-01' } = {}) {
  const b = Book.seeded();
  b.dispatchAll(
    [
      ['entity.upsert', { kind: 'car.vehicle', item: { id: 'car1', name: 'عربية تجريبية', model: 'دايو لانوس', year: 2002, engine: '1.5-8v', gearbox: 'manual', fuel: 'petrol', ...spec } }],
      ['entry.add', { entry: { id: 'od0', kind: 'car.odometer', carId: 'car1', date, km } }],
    ],
    o,
  );
  return b;
}
const work = (extra) => ({ kind: 'car.work', carId: 'car1', type: 'service', amount: 0, ...extra });
const task = (b, id, today = TODAY) => carData(b.state, 'car1', today).tasks.find((t) => t.id === id);
const ids = (b) => carTasks(b.state, 'car1').map((t) => t.id);

test('الجدول حسب مواصفات العربية: الفتيس والوقود والتكييف والدركسيون', () => {
  const manual = ids(carBook());
  for (const k of ['oil', 'timing-belt', 'plugs', 'gear-oil', 'clutch', 'brake-fluid', 'suspension', 'ac', 'ps-fluid']) assert.ok(manual.includes(k), k);
  for (const k of ['atf', 'cng-service', 'cng-cylinder', 'plugs-cng']) assert.ok(!manual.includes(k), k);
  const auto = ids(carBook({ gearbox: 'auto', fuel: 'petrol-cng', ac: false, powerSteering: false }));
  for (const k of ['atf', 'cng-service', 'cng-cylinder', 'plugs-cng']) assert.ok(auto.includes(k), k);
  for (const k of ['gear-oil', 'clutch', 'plugs', 'ac', 'ps-fluid']) assert.ok(!auto.includes(k), k);
});

test('البداية: كل البنود «مش معروف»، والمهمة منها مطلوبة الآن، والتذكيرات مجمّعة', () => {
  const b = carBook();
  const d = carData(b.state, 'car1', TODAY);
  assert.ok(d.tasks.every((t) => t.status === 'unknown'));
  const now = d.tasks.filter(needsAction).map((t) => t.id);
  for (const k of ['oil', 'timing-belt', 'coolant', 'brakes', 'brake-fluid', 'suspension']) assert.ok(now.includes(k), k);
  assert.ok(!now.includes('air-filter'));
  const rem = allReminders(b.state, TODAY).filter((r) => r.module === 'car');
  const due = rem.find((r) => r.id === 'car-due-car1');
  assert.equal(due.level, 'overdue');
  assert.match(due.title, /صيانة مطلوبة \(6\)/);
  assert.ok(rem.some((r) => r.id === 'car-unknown-car1' && r.level === 'upcoming'));
});

test('الموعد الجاي = آخر مرة + المدة، بالكيلو أو بالوقت أيهما أقرب', () => {
  const b = carBook({}, { date: '2026-11-01' });
  b.addEntry(work({ date: '2026-11-01', km: 394000, tasks: ['oil', 'air-filter'] }), o);
  let oil = task(b, 'oil');
  assert.equal(oil.dueKm, 399000);
  assert.equal(oil.dueDate, '2027-05-01');
  assert.equal(oil.status, 'ok');
  // مشي 4,600 كم ← باقي 400 (أقل من 500) = قريب
  b.addEntry({ kind: 'car.odometer', carId: 'car1', date: '2026-11-15', km: 398600 }, o);
  oil = task(b, 'oil', '2026-11-15');
  assert.equal(oil.remainingKm, 400);
  assert.equal(oil.status, 'soon');
  // عدّى 5,000 كم = مطلوب
  b.addEntry({ kind: 'car.odometer', carId: 'car1', date: '2026-11-17', km: 399100 }, o);
  assert.equal(task(b, 'oil', '2026-11-17').status, 'due');
  // بالوقت: قراءة قليلة لكن عدّى 6 شهور
  const b2 = carBook({}, { date: '2026-01-01', km: 300000 });
  b2.addEntry(work({ date: '2026-01-02', km: 300010, tasks: ['oil'] }), o);
  b2.addEntry({ kind: 'car.odometer', carId: 'car1', date: '2026-07-01', km: 300500 }, o);
  const t = task(b2, 'oil', '2026-07-02');
  assert.equal(t.dueDate, '2026-07-02');
  assert.equal(t.status, 'due');
  assert.equal(addMonthsDate('2026-08-31', 6), '2027-02-28');
});

test('متوسط المشي من القراءات، والعداد الحالي تقديري، وتاريخ متوقع للموعد بالكيلو', () => {
  const b = carBook({ kmPerMonth: 1500 }, { date: '2026-10-01', km: 394000 });
  let d = carData(b.state, 'car1', '2026-10-11');
  assert.equal(d.rate.source, 'estimate');
  assert.equal(d.kmNow, 394000 + Math.round((1500 / 30.44) * 10));
  b.addEntry({ kind: 'car.odometer', carId: 'car1', date: '2026-10-31', km: 395500 }, o);
  b.addEntry(work({ date: '2026-10-31', km: 395500, tasks: ['oil'] }), o);
  d = carData(b.state, 'car1', '2026-11-10');
  assert.equal(d.rate.source, 'readings');
  assert.equal(d.rate.perDay, 50);
  assert.equal(d.kmNow, 396000);
  assert.ok(d.estimated);
  const oil = d.tasks.find((t) => t.id === 'oil');
  assert.equal(oil.remainingKm, 4500);
  assert.equal(oil.kmDate, '2027-02-08'); // 4500 ÷ 50 = 90 يوم
  assert.equal(oil.dueAt, '2027-02-08'); // قبل موعد الوقت (2027-04-30)
});

test('العداد لا يرجع للخلف، والتعديل بإلغاء القديم يسمح بالتصحيح', () => {
  const b = carBook({}, { date: '2026-11-01', km: 394000 });
  assert.throws(() => b.addEntry({ kind: 'car.odometer', carId: 'car1', date: '2026-11-10', km: 393000 }, o), /أقل من قراءة سابقة/);
  assert.throws(() => b.addEntry({ kind: 'car.odometer', carId: 'car1', date: '2026-10-01', km: 395000 }, o), /أكبر من قراءة بعده/);
  b.replaceEntry('od0', { kind: 'car.odometer', carId: 'car1', date: '2026-11-01', km: 390000 }, 'خطأ كتابة', TODAY, o);
  b.addEntry({ kind: 'car.odometer', carId: 'car1', date: '2026-11-10', km: 393000 }, o);
  assert.equal(carData(b.state, 'car1', '2026-11-10').last.km, 393000);
});

test('تحقق الشغل: الإجمالي، الكمية × السعر، العداد مطلوب للبنود بالكيلو، السجل السابق', () => {
  const b = carBook();
  const parts = [{ name: 'فلتر زيت', qty: 1000, price: 15000, amount: 15000 }];
  assert.throws(() => b.addEntry(work({ date: TODAY, km: 394500, tasks: ['oil'], parts, labor: 5000, amount: 15000 }), o), /الإجمالي/);
  assert.throws(() => b.addEntry(work({ date: TODAY, km: 394500, tasks: ['oil'], parts: [{ ...parts[0], amount: 14000 }], amount: 14000 }), o), /الكمية × السعر/);
  assert.throws(() => b.addEntry(work({ date: TODAY, tasks: ['oil'] }), o), /اكتب قراءة العداد/);
  assert.throws(() => b.addEntry(work({ date: TODAY, km: 394500, tasks: ['nope'] }), o), /غير موجود/);
  assert.throws(() => b.addEntry(work({ date: TODAY, km: 394500 }), o), /اختر البنود/);
  assert.throws(() => b.addEntry(work({ date: TODAY, dateUnknown: true, km: 380000, tasks: ['oil'] }), o), /سجل سابق/);
  assert.throws(() => b.addEntry(work({ type: 'history', date: TODAY, dateUnknown: true, tasks: ['timing-belt'] }), o), /لازم تكتب العداد/);
  // بند بالوقت فقط لا يحتاج عداد
  b.addEntry(work({ date: TODAY, tasks: ['battery'], title: 'فحص البطارية' }), o);
  const e = b.addEntry(work({ date: TODAY, km: 394500, tasks: ['oil'], parts, labor: 5000, other: 1000, amount: 21000 }), o);
  assert.match(describeEntry(b.state, e).title, /صيانة دورية: زيت الموتور/);
});

test('سجل سابق: بالعداد بدون تاريخ، والأحدث يغلب', () => {
  const b = carBook();
  b.addEntry(work({ type: 'history', date: TODAY, dateUnknown: true, km: 380000, tasks: ['timing-belt'] }), o);
  let t = task(b, 'timing-belt');
  assert.equal(t.dueKm, 420000);
  assert.equal(t.dueDate, null);
  assert.equal(t.status, 'ok');
  // السجل مجهول التاريخ لا يدخل القراءات ولا يعطل ترتيب العداد
  assert.equal(carData(b.state, 'car1', TODAY).readings.length, 1);
  b.addEntry(work({ date: '2026-11-17', km: 394500, tasks: ['timing-belt'] }), o);
  t = task(b, 'timing-belt');
  assert.equal(t.last.km, 394500);
  assert.equal(t.history.length, 2);
  // بالتاريخ فقط: البنود بالكيلو والوقت تُحسب بالوقت
  const b2 = carBook();
  b2.addEntry(work({ type: 'history', date: '2025-01-15', tasks: ['coolant'] }), o);
  t = task(b2, 'coolant');
  assert.equal(t.dueKm, null);
  assert.equal(t.dueDate, '2027-01-15');
  assert.equal(t.status, 'ok');
});

test('الأعطال: مفتوح ← اتصلح بشغل يذكره، وإلغاء الشغل يرجّعه مفتوح، والقفل اليدوي', () => {
  const b = carBook();
  b.upsert('car.fault', { id: 'f1', carId: 'car1', title: 'طقطقة في المطبات', date: '2026-11-05', system: 'suspension', severity: 'urgent' }, o);
  b.upsert('car.fault', { id: 'f2', carId: 'car1', title: 'لمبة الزيت بتنور', date: '2026-11-06', system: 'engine', severity: 'watch' }, o);
  let d = carData(b.state, 'car1', TODAY);
  assert.deepEqual(d.faults.map((f) => [f.id, f.state]), [['f1', 'open'], ['f2', 'open']]);
  assert.ok(allReminders(b.state, TODAY).some((r) => r.id === 'car-fault-f1' && r.level === 'overdue'));
  assert.ok(!allReminders(b.state, TODAY).some((r) => r.id === 'car-fault-f2'));
  b.upsert('person', { id: 'mech', name: 'ميكانيكي تجريبي' }, o);
  const w = b.addEntry(work({ type: 'repair', date: '2026-11-10', km: 394300, faultIds: ['f1'], title: 'تغيير جلب مقصات', mechanicId: 'mech', parts: [{ name: 'جلبة مقص', qty: 2000, price: 25000, amount: 50000 }], labor: 20000, amount: 70000 }), o);
  d = carData(b.state, 'car1', TODAY);
  assert.equal(d.faults.find((f) => f.id === 'f1').state, 'fixed');
  assert.equal(d.faults.find((f) => f.id === 'f1').fixedBy.id, w.id);
  b.voidEntry(w.id, 'خطأ', TODAY, o);
  assert.equal(carData(b.state, 'car1', TODAY).faults.find((f) => f.id === 'f1').state, 'open');
  b.upsert('car.fault', { id: 'f2', status: 'closed', closeNote: 'اختفى' }, o);
  assert.equal(carData(b.state, 'car1', TODAY).faults.find((f) => f.id === 'f2').state, 'closed');
  assert.throws(() => b.addEntry(work({ type: 'repair', date: TODAY, faultIds: ['nope'], title: 'x' }), o), /عطل غير موجود/);
});

test('التعديلات المخططة: تذكير قبل الموعد، وتتقفل بشغل «تعديل»', () => {
  const b = carBook();
  b.upsert('car.plan', { id: 'p1', carId: 'car1', title: 'حساسات ركن', priority: 'high', targetDate: '2026-12-01', estimate: 150000 }, o);
  b.upsert('car.plan', { id: 'p2', carId: 'car1', title: 'فرش كراسي', targetDate: '2027-06-01' }, o);
  const rem = allReminders(b.state, TODAY);
  assert.ok(rem.some((r) => r.id === 'car-plan-p1' && r.level === 'upcoming'));
  assert.ok(!rem.some((r) => r.id === 'car-plan-p2'));
  b.addEntry(work({ type: 'upgrade', date: TODAY, planIds: ['p1'], other: 140000, amount: 140000 }), o);
  const d = carData(b.state, 'car1', TODAY);
  assert.equal(d.plans.find((p) => p.id === 'p1').state, 'done');
  assert.equal(d.plans[0].id, 'p2');
});

test('تعديل مدة بند، الرجوع للافتراضي، الإيقاف، وبند خاص', () => {
  const b = carBook();
  b.addEntry(work({ date: TODAY, km: 394000, tasks: ['oil'] }), o);
  b.upsert('car.task', { id: overrideId('car1', 'oil'), carId: 'car1', key: 'oil', km: 7500 }, o);
  assert.equal(task(b, 'oil').dueKm, 401500);
  assert.equal(task(b, 'oil').months, 6);
  b.upsert('car.task', { id: overrideId('car1', 'oil'), carId: 'car1', key: 'oil', km: null }, o);
  assert.equal(task(b, 'oil').dueKm, 399000);
  assert.throws(() => b.upsert('car.task', { id: overrideId('car1', 'battery'), carId: 'car1', key: 'battery', months: 0 }, o), /حدد كل كام/);
  b.upsert('car.task', { id: overrideId('car1', 'timing-belt'), carId: 'car1', key: 'timing-belt', off: true }, o);
  assert.equal(task(b, 'timing-belt').status, 'off');
  assert.ok(!allReminders(b.state, TODAY).find((r) => r.id === 'car-due-car1').title.includes('سير الكاتينة'));
  assert.throws(() => b.upsert('car.task', { id: 'x1', carId: 'car1', key: 'oil', km: 1 }, o), /معرّف/);
  const c = b.upsert('car.task', { carId: 'car1', name: 'تشحيم الكوالين', group: 'body', kind: 'clean', months: 12 }, o);
  b.addEntry(work({ date: '2026-01-10', tasks: [c.id] }), o);
  const t = task(b, c.id);
  assert.equal(t.custom, true);
  assert.equal(t.dueDate, '2027-01-10');
  assert.equal(t.status, 'ok');
});

test('تذكير العداد كل أسبوع، والرخصة قبل انتهائها بشهر', () => {
  const b = carBook({ licenseExpiry: '2026-12-10' }, { date: '2026-11-11' });
  let rem = allReminders(b.state, TODAY);
  assert.ok(rem.some((r) => r.id === 'car-read-car1-2026-11-18' && r.level === 'today'));
  assert.ok(rem.some((r) => r.id === 'car-license-car1-2026-12-10' && r.level === 'upcoming'));
  b.addEntry({ kind: 'car.odometer', carId: 'car1', date: TODAY, km: 394400 }, o);
  rem = allReminders(b.state, TODAY);
  assert.ok(!rem.some((r) => r.id.startsWith('car-read-')));
  assert.equal(allReminders(b.state, '2026-12-11').find((r) => r.id.startsWith('car-license-')).level, 'overdue');
  b.upsert('car.vehicle', { id: 'car1', status: 'sold' }, o);
  assert.ok(!allReminders(b.state, TODAY).some((r) => r.module === 'car'));
});

test('القيمة التقديرية في وضعي المالي (ممتلكات)، وتختفي لو اتباعت', () => {
  const b = carBook({ value: 15000000 });
  const fin = financeOverview(b.state);
  assert.equal(fin.totals.asset, 15000000);
  assert.ok(fin.items.some((it) => it.module === 'car' && it.kind === 'asset'));
  b.upsert('car.vehicle', { id: 'car1', status: 'sold' }, o);
  assert.equal(financeOverview(b.state).totals.asset, 0);
});

test('التكاليف: بالسنة والنوع، القطع والمصنعية، الميكانيكية، وتكلفة كل 1000 كم', () => {
  const b = carBook({}, { date: '2025-11-01', km: 380000 });
  b.upsert('person', { id: 'mech', name: 'ميكانيكي تجريبي' }, o);
  b.addEntry(work({ date: '2025-12-01', km: 381000, tasks: ['oil'], mechanicId: 'mech', parts: [{ name: 'زيت', qty: 4000, price: 30000, amount: 120000 }], labor: 10000, amount: 130000 }), o);
  b.addEntry(work({ type: 'repair', date: '2026-03-01', km: 385000, title: 'تغيير مساعدين', mechanicId: 'mech', parts: [{ name: 'مساعد أمامي', qty: 2000, price: 100000, amount: 200000, note: 'أصلي' }], labor: 40000, other: 10000, amount: 250000 }), o);
  b.addEntry(work({ type: 'history', date: TODAY, dateUnknown: true, km: 370000, tasks: ['timing-belt'], other: 50000, amount: 50000 }), o);
  b.addEntry({ kind: 'car.odometer', carId: 'car1', date: '2026-11-01', km: 390000 }, o);
  const c = carCosts(b.state, 'car1', TODAY);
  assert.equal(c.totals.total, 430000);
  assert.equal(c.totals.service, 130000);
  assert.equal(c.totals.repair, 250000);
  assert.equal(c.thisYear, 250000);
  assert.equal(c.last12, 380000);
  assert.deepEqual(c.split, { parts: 320000, labor: 50000, other: 60000 });
  assert.equal(c.byYear.reduce((s, [, r]) => s + r.total, 0), c.totals.total);
  assert.deepEqual(c.mechanics.map((m) => [m.personId, m.count, m.total, m.last]), [['mech', 2, 380000, '2026-03-01']]);
  assert.equal(c.parts.length, 2);
  assert.equal(c.per1000.dist, 10000);
  assert.equal(c.per1000.amount, 38000); // 380,000 قرش ÷ 10 = 38,000 قرش لكل 1000 كم
});

test('إعادة بناء الحالة من السجل تعطي نفس الجدول والتكاليف', () => {
  const b = carBook();
  b.addEntry(work({ date: '2026-11-10', km: 394300, tasks: ['oil', 'brakes'], parts: [{ name: 'تيل', amount: 50000 }], amount: 50000 }), o);
  b.upsert('car.fault', { id: 'f1', carId: 'car1', title: 'صفير', date: '2026-11-05', system: 'brakes', severity: 'soon' }, o);
  const s2 = buildState(b.events);
  assert.deepEqual(JSON.parse(JSON.stringify(carData(s2, 'car1', TODAY).tasks)), JSON.parse(JSON.stringify(carData(b.state, 'car1', TODAY).tasks)));
  assert.deepEqual(carCosts(s2, 'car1', TODAY).totals, carCosts(b.state, 'car1', TODAY).totals);
});

test('قراءتان في نفس اليوم لا يفرقان أكثر من 1500 كم (خطأ كتابة)', () => {
  const b = carBook({}, { date: TODAY, km: 394200 });
  assert.throws(() => b.addEntry({ kind: 'car.odometer', carId: 'car1', date: TODAY, km: 390000 }, o), /نفس اليوم/);
  b.addEntry(work({ date: TODAY, km: 394150, tasks: ['oil'] }), o); // الصيانة الصبح قبل المشوار: مسموح
  assert.equal(carData(b.state, 'car1', TODAY).last.km, 394200);
});
