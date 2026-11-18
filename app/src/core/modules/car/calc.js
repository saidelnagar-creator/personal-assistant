// حسابات العربية (دوال خالصة): الجدول الفعلي لكل عربية، قراءات العداد ومتوسط المشي، آخر مرة اتعمل كل بند
// والموعد الجاي بالكيلو أو بالوقت (أيهما أقرب)، حالة الأعطال والتعديلات، والتكاليف.
import { activeEntries, entity, listEntities } from '../../engine.js';
import { addDays, addMonths, cmp, daysBetween } from '../../util.js';
import { CAR_RULES, WORK_TYPES } from './config.js';
import { SCHEDULE, scheduleByKey } from './schedule.js';

// معرّف كيان «تعديل بند من القالب» لعربية: ثابت حتى يتراكم التعديل على نفس الكيان.
export const overrideId = (carId, key) => `${carId}:${key}`;

// تاريخ + عدد شهور (آخر يوم في الشهر لو اليوم غير موجود).
export function addMonthsDate(date, n) {
  const ym = addMonths(date.slice(0, 7), n);
  const last = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate();
  return `${ym}-${String(Math.min(Number(date.slice(8, 10)), last)).padStart(2, '0')}`;
}

const memo = new WeakMap();
function cached(state, key, today, fn) {
  let m = memo.get(state);
  if (!m || m.version !== state.version || m.today !== today) memo.set(state, (m = { version: state.version, today, map: new Map() }));
  if (!m.map.has(key)) m.map.set(key, fn());
  return m.map.get(key);
}

const pos = (x) => (Number.isSafeInteger(x) && x > 0 ? x : 0);

// الجدول الفعلي للعربية: بنود القالب المنطبقة عليها (بتعديلات المستخدم) + البنود الخاصة.
// km/months = 0 معناها «البُعد ده مش مستخدم» (بالوقت فقط أو بالكيلو فقط).
export function carTasks(state, carId) {
  const car = entity(state, 'car.vehicle', carId);
  if (!car) return [];
  const mine = listEntities(state, 'car.task', { archived: true }).filter((t) => t.carId === carId);
  const over = new Map(mine.filter((t) => t.key).map((t) => [t.key, t]));
  const out = [];
  for (const t of SCHEDULE) {
    if (t.when && !t.when(car)) continue;
    const o = over.get(t.key);
    const pick = (k) => (o && o[k] !== undefined && o[k] !== null ? o[k] : t[k] || 0);
    out.push({
      id: t.key,
      key: t.key,
      name: t.name,
      group: t.group,
      kind: t.kind,
      km: pick('km'),
      months: pick('months'),
      note: t.note,
      userNote: o?.note || '',
      critical: !!t.critical,
      off: !!o?.off,
      defaults: { km: t.km || 0, months: t.months || 0 },
      changed: !!o && ((o.km ?? null) !== null || (o.months ?? null) !== null),
      custom: false,
    });
  }
  for (const t of mine) {
    if (t.key || t.archived) continue;
    out.push({ id: t.id, key: null, name: t.name, group: t.group || 'other', kind: t.kind || 'check', km: pos(t.km), months: pos(t.months), note: '', userNote: t.note || '', critical: !!t.critical, off: !!t.off, defaults: null, changed: false, custom: true });
  }
  return out;
}

// اسم أي بند (حتى لو لم يعد منطبقاً أو اتلغى) — للسجل القديم.
export const taskName = (state, id) => scheduleByKey.get(id)?.name || entity(state, 'car.task', id)?.name || id;

// قراءات العداد: من «تسجيل العداد» ومن أي شغل مكتوب عداده (عدا السجل السابق مجهول التاريخ).
export function readings(state, carId) {
  const out = [];
  for (const e of state.entries) {
    if (e.voided || e.carId !== carId || (e.kind !== 'car.odometer' && e.kind !== 'car.work')) continue;
    if (Number.isSafeInteger(e.km) && !e.dateUnknown) out.push({ date: e.date, km: e.km, entryId: e.id, kind: e.kind });
  }
  return out.sort((a, b) => cmp(a.date, b.date) || a.km - b.km);
}

// متوسط المشي في اليوم: من قراءات آخر 6 شهور (أو كل القراءات)، وإلا من تقدير المستخدم الشهري.
export function rateOf(rs, car) {
  if (rs.length >= 2) {
    const last = rs[rs.length - 1];
    const from = addDays(last.date, -CAR_RULES.rateWindowDays);
    let first = rs.find((r) => r.date >= from);
    if (daysBetween(first.date, last.date) < CAR_RULES.minRateSpanDays) first = rs[0];
    const span = daysBetween(first.date, last.date);
    if (span >= CAR_RULES.minRateSpanDays && last.km >= first.km) return { perDay: (last.km - first.km) / span, source: 'readings', from: first.date, to: last.date };
  }
  if (pos(car?.kmPerMonth)) return { perDay: car.kmPerMonth / 30.44, source: 'estimate' };
  return null;
}

// أي سجل «اتعمل» أحدث؟ بالعداد لو معروف في الاتنين، وإلا بالتاريخ، والمعروف تاريخه أحدث من المجهول.
function compareDone(a, b) {
  if (a.km !== null && b.km !== null && a.km !== b.km) return a.km - b.km;
  if (a.date && b.date && a.date !== b.date) return cmp(a.date, b.date);
  if (a.date && !b.date) return 1;
  if (!a.date && b.date) return -1;
  return 0;
}

export function taskStatus(task, last, kmNow, rate, today) {
  if (task.off) return { status: 'off' };
  if (!last) return { status: 'unknown' };
  const dueKm = task.km > 0 && last.km !== null ? last.km + task.km : null;
  const dueDate = task.months > 0 && last.date ? addMonthsDate(last.date, task.months) : null;
  if (dueKm === null && dueDate === null) return { status: 'unknown', partial: true };
  const remainingKm = dueKm !== null && kmNow !== null ? dueKm - kmNow : null;
  const remainingDays = dueDate ? daysBetween(today, dueDate) : null;
  let kmDate = null;
  if (remainingKm !== null) kmDate = remainingKm <= 0 ? today : rate?.perDay > 0 ? addDays(today, Math.ceil(remainingKm / rate.perDay)) : null;
  const dueAt = [dueDate, kmDate].filter(Boolean).sort()[0] || null;
  const soonKm = Math.max(CAR_RULES.soonKmMin, Math.round(task.km * CAR_RULES.soonKmRatio));
  let status = 'ok';
  if ((remainingKm !== null && remainingKm <= 0) || (remainingDays !== null && remainingDays <= 0)) status = 'due';
  else if ((remainingKm !== null && remainingKm <= soonKm) || (remainingDays !== null && remainingDays <= CAR_RULES.soonDays)) status = 'soon';
  const usedKm = dueKm !== null && kmNow !== null ? (kmNow - last.km) / task.km : 0;
  const usedTime = dueDate ? daysBetween(last.date, today) / Math.max(1, daysBetween(last.date, dueDate)) : 0;
  return { status, dueKm, dueDate, remainingKm, remainingDays, kmDate, dueAt, progress: Math.max(0, usedKm, usedTime) };
}

export const STATUS_RANK = { due: 0, soon: 1, unknown: 2, ok: 3, off: 4 };
// بند يحتاج تصرف الآن: مستحق، أو مهم ومش معروف آخر مرة.
export const needsAction = (t) => t.status === 'due' || (t.status === 'unknown' && t.critical);

export function carData(state, carId, today) {
  return cached(state, `car:${carId}`, today, () => computeCar(state, carId, today));
}

export function computeCar(state, carId, today) {
  const car = entity(state, 'car.vehicle', carId);
  if (!car) return null;
  const rs = readings(state, carId);
  const last = rs.length ? rs[rs.length - 1] : null;
  const rate = rateOf(rs, car);
  const since = last ? Math.max(0, daysBetween(last.date, today)) : 0;
  const kmNow = last ? last.km + (rate ? Math.round(rate.perDay * since) : 0) : null;
  const works = activeEntries(state, (e) => e.kind === 'car.work' && e.carId === carId).sort((a, b) => cmp(b.date, a.date) || (b.km ?? 0) - (a.km ?? 0));

  // سجل كل بند: كل مرة اتعمل فيها (الأحدث أولاً).
  const done = new Map();
  for (const w of works)
    for (const id of w.tasks || []) {
      if (!done.has(id)) done.set(id, []);
      done.get(id).push({ date: w.dateUnknown ? null : w.date, km: Number.isSafeInteger(w.km) ? w.km : null, entryId: w.id, type: w.type });
    }
  const tasks = carTasks(state, carId).map((t) => {
    const hist = (done.get(t.id) || []).slice();
    let lastDone = null;
    for (const r of hist) if (!lastDone || compareDone(r, lastDone) > 0) lastDone = r;
    hist.sort((a, b) => -compareDone(a, b));
    return { ...t, last: lastDone, history: hist, ...taskStatus(t, lastDone, kmNow, rate, today) };
  });
  tasks.sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || (b.critical ? 1 : 0) - (a.critical ? 1 : 0) || cmp(a.dueAt || '9999', b.dueAt || '9999') || (a.remainingKm ?? 1e9) - (b.remainingKm ?? 1e9));

  // الأعطال: «اتصلح» لو أي شغل ساري بيذكره، وإلا «اتقفل» لو المستخدم قفله، وإلا مفتوح.
  const fixedBy = new Map();
  const doneBy = new Map();
  for (const w of [...works].reverse()) {
    for (const f of w.faultIds || []) fixedBy.set(f, w);
    for (const p of w.planIds || []) doneBy.set(p, w);
  }
  const SEV = { urgent: 0, soon: 1, watch: 2 };
  const faults = listEntities(state, 'car.fault')
    .filter((f) => f.carId === carId)
    .map((f) => ({ ...f, state: fixedBy.has(f.id) ? 'fixed' : f.status === 'closed' ? 'closed' : 'open', fixedBy: fixedBy.get(f.id) || null }))
    .sort((a, b) => (a.state === 'open' ? 0 : 1) - (b.state === 'open' ? 0 : 1) || (a.state === 'open' ? SEV[a.severity] - SEV[b.severity] : 0) || cmp(b.date, a.date));
  const PR = { high: 0, normal: 1, low: 2 };
  const plans = listEntities(state, 'car.plan')
    .filter((p) => p.carId === carId)
    .map((p) => ({ ...p, state: doneBy.has(p.id) ? 'done' : p.status === 'cancelled' ? 'cancelled' : 'planned', doneBy: doneBy.get(p.id) || null }))
    .sort((a, b) => ['planned', 'done', 'cancelled'].indexOf(a.state) - ['planned', 'done', 'cancelled'].indexOf(b.state) || PR[a.priority || 'normal'] - PR[b.priority || 'normal'] || cmp(a.targetDate || '9999', b.targetDate || '9999'));

  const lastOdometer = [...rs].reverse().find((r) => r.kind === 'car.odometer') || null;
  return { car, readings: rs, last, lastOdometer, rate, kmNow, estimated: !!(last && rate && since > 0), since, works, tasks, faults, plans };
}

// التكاليف: كل الشغل الساري بمبالغه، بالسنة والنوع، والقطع، والميكانيكية، وتكلفة الكيلو.
export function carCosts(state, carId, today) {
  return cached(state, `car-costs:${carId}`, today, () => {
    const d = carData(state, carId, today);
    if (!d) return null;
    const types = Object.keys(WORK_TYPES);
    const blank = () => ({ ...Object.fromEntries(types.map((t) => [t, 0])), total: 0 });
    const byYear = new Map();
    const totals = blank();
    const split = { parts: 0, labor: 0, other: 0 };
    const mechanics = new Map();
    const parts = [];
    const yearAgo = addDays(today, -365);
    let last12 = 0;
    let thisYear = 0;
    for (const w of d.works) {
      const amount = w.amount || 0;
      const y = w.dateUnknown ? 'غير معروف' : w.date.slice(0, 4);
      if (!byYear.has(y)) byYear.set(y, blank());
      byYear.get(y)[w.type] += amount;
      byYear.get(y).total += amount;
      totals[w.type] += amount;
      totals.total += amount;
      if (!w.dateUnknown && w.date > yearAgo && w.date <= today) last12 += amount;
      if (!w.dateUnknown && w.date.slice(0, 4) === today.slice(0, 4)) thisYear += amount;
      for (const p of w.parts || []) {
        split.parts += p.amount || 0;
        parts.push({ ...p, date: w.date, dateUnknown: !!w.dateUnknown, km: w.km ?? null, entryId: w.id, mechanicId: w.mechanicId || null, place: w.place || '' });
      }
      split.labor += w.labor || 0;
      split.other += w.other || 0;
      if (w.mechanicId) {
        const m = mechanics.get(w.mechanicId) || { personId: w.mechanicId, count: 0, total: 0, last: null };
        m.count++;
        m.total += amount;
        if (!w.dateUnknown && (!m.last || w.date > m.last)) m.last = w.date;
        mechanics.set(w.mechanicId, m);
      }
    }
    // تكلفة كل 1000 كم: مصروف الشغل المسجّل من أول قراءة لآخر قراءة ÷ المسافة.
    let per1000 = null;
    const rs = d.readings;
    if (rs.length >= 2) {
      const a = rs[0];
      const b = rs[rs.length - 1];
      const dist = b.km - a.km;
      if (dist >= 1000) {
        const spent = d.works.filter((w) => !w.dateUnknown && w.type !== 'history' && w.date >= a.date && w.date <= b.date).reduce((s, w) => s + (w.amount || 0), 0);
        per1000 = { amount: Math.round((spent * 1000) / dist), dist, from: a.date, to: b.date };
      }
    }
    return { totals, byYear: [...byYear.entries()].sort((x, y) => cmp(y[0], x[0])), split, mechanics: [...mechanics.values()].sort((a, b) => b.total - a.total), parts, last12, thisYear, per1000 };
  });
}

// كل الشغل اللي عمله شخص (ميكانيكي) في كل العربيات.
export function mechanicWorks(state, personId) {
  return activeEntries(state, (e) => e.kind === 'car.work' && e.mechanicId === personId).sort((a, b) => cmp(b.date, a.date));
}
