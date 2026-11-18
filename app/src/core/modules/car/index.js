// وحدة العربية: الصيانة الدورية بالكيلو وبالوقت، قراءات العداد، الأعطال، التصليحات وقطع الغيار والمبالغ،
// والتعديلات المخططة. الكيانات: العربية، تعديلات بنود الجدول والبنود الخاصة، الأعطال، التعديلات المخططة.
// القيود: قراءة عداد، وشغل (صيانة/تصليح/تعديل/سجل سابق) بقطعه ومصنعيته — وهو الذي يقفل البنود والأعطال والتعديلات.
import { entity, listEntities } from '../../engine.js';
import { lineAmount } from '../../money.js';
import { addDays, check, daysBetween, isDate, nonEmpty } from '../../util.js';
import { CAR_RULES, CAR_STATUS, ENGINES, FUELS, GEARBOXES, PRIORITY, SEVERITY, SYSTEMS, TASK_KINDS, WORK_TYPES } from './config.js';
import { scheduleByKey } from './schedule.js';
import { carData, carTasks, needsAction, readings, taskName } from './calc.js';

const posInt = (x) => Number.isSafeInteger(x) && x > 0;
const nonNegInt = (x) => Number.isSafeInteger(x) && x >= 0;
const optInt = (x, ok) => x === undefined || x === null || ok(x);
const isKm = (x) => nonNegInt(x) && x <= CAR_RULES.maxKm;
const kmText = (n) => n.toLocaleString('en-US');
const dmy = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const shortText = (s, max) => s === undefined || s === null || (typeof s === 'string' && s.length <= max);

function carOf(s, e) {
  const c = entity(s, 'car.vehicle', e.carId);
  check(c, 'العربية غير موجودة');
  return c;
}

// العداد لا يرجع للخلف: قراءة بتاريخ أقدم لا تزيد عن الجديدة، وقراءة بتاريخ أحدث لا تقل عنها.
function checkKmOrder(s, e) {
  if (!Number.isSafeInteger(e.km) || e.dateUnknown) return;
  for (const r of readings(s, e.carId)) {
    check(!(r.date < e.date && r.km > e.km), `العداد ${kmText(e.km)} أقل من قراءة سابقة (${kmText(r.km)} يوم ${dmy(r.date)}). راجع الرقم أو التاريخ.`);
    check(!(r.date > e.date && r.km < e.km), `العداد ${kmText(e.km)} أكبر من قراءة بعده (${kmText(r.km)} يوم ${dmy(r.date)}). راجع الرقم أو التاريخ.`);
    check(!(r.date === e.date && Math.abs(r.km - e.km) > CAR_RULES.sameDayKm), `العداد ${kmText(e.km)} بعيد جداً عن قراءة نفس اليوم (${kmText(r.km)}). راجع الرقم.`);
  }
}

const isTaskOf = (s, carId, id) => scheduleByKey.has(id) || (entity(s, 'car.task', id)?.carId === carId && !entity(s, 'car.task', id).key);

function validateParts(parts) {
  check(Array.isArray(parts) && parts.length <= 100, 'قطع الغيار غير صالحة');
  for (const p of parts) {
    check(p && nonEmpty(p.name) && p.name.trim().length <= 80, 'اكتب اسم كل قطعة');
    check(optInt(p.qty, posInt), `كمية «${p.name}» غير صالحة`);
    check(optInt(p.price, nonNegInt), `سعر «${p.name}» غير صالح`);
    check(nonNegInt(p.amount), `مبلغ «${p.name}» غير صالح`);
    if (p.qty && p.price !== undefined && p.price !== null) check(lineAmount(p.qty, p.price) === p.amount, `مبلغ «${p.name}» لا يساوي الكمية × السعر`);
    check(shortText(p.note, 120), 'ملاحظة القطعة طويلة');
  }
}

export const workTotal = (e) => (e.parts || []).reduce((a, p) => a + (p.amount || 0), 0) + (e.labor || 0) + (e.other || 0);

export default {
  id: 'car',
  name: 'العربية',
  entities: {
    'car.vehicle': {
      label: 'عربية',
      validate: (s, x) => {
        check(nonEmpty(x.name) && x.name.trim().length <= 80, 'اكتب اسم العربية (مثلاً: اللانوس)');
        check(shortText(x.model, 80), 'النوع طويل');
        check(optInt(x.year, (y) => Number.isSafeInteger(y) && y >= 1950 && y <= 2100), 'سنة الصنع غير صالحة');
        check(ENGINES[x.engine || '1.5-8v'], 'المحرك غير صالح');
        check(GEARBOXES[x.gearbox || 'manual'], 'الفتيس غير صالح');
        check(FUELS[x.fuel || 'petrol'], 'الوقود غير صالح');
        check(CAR_STATUS[x.status || 'active'], 'الحالة غير صالحة');
        check(shortText(x.plate, 30), 'رقم اللوحة طويل');
        check(!x.licenseExpiry || isDate(x.licenseExpiry), 'تاريخ انتهاء الرخصة غير صالح');
        check(optInt(x.value, nonNegInt), 'القيمة التقديرية غير صالحة');
        check(optInt(x.kmPerMonth, (n) => nonNegInt(n) && n <= 100000), 'متوسط المشي الشهري غير صالح');
        check(optInt(x.readEveryDays, (n) => Number.isSafeInteger(n) && n >= 1 && n <= 90), 'مدة تسجيل العداد من 1 إلى 90 يوم');
      },
    },
    // بند في جدول الصيانة: إما تعديل لبند من القالب (key) أو بند خاص بالمستخدم (بلا key).
    // km/months: null = الافتراضي، 0 = البُعد ده مش مستخدم.
    'car.task': {
      label: 'بند صيانة',
      validate: (s, x) => {
        check(entity(s, 'car.vehicle', x.carId), 'العربية غير موجودة');
        check(optInt(x.km, (n) => nonNegInt(n) && n <= 1000000), 'المسافة غير صالحة');
        check(optInt(x.months, (n) => nonNegInt(n) && n <= 240), 'المدة بالشهور غير صالحة');
        check(shortText(x.note, 500), 'الملاحظة طويلة');
        if (x.key) {
          const t = scheduleByKey.get(x.key);
          check(t, 'بند غير معروف في الجدول');
          check(x.id === `${x.carId}:${x.key}`, 'معرّف تعديل البند غير صالح');
          const km = x.km ?? t.km ?? 0;
          const months = x.months ?? t.months ?? 0;
          check(x.off || km > 0 || months > 0, 'حدد كل كام كيلو أو كل كام شهر (أو أوقف البند)');
        } else {
          check(nonEmpty(x.name) && x.name.trim().length <= 120, 'اكتب اسم البند');
          check(SYSTEMS[x.group || 'other'], 'الجزء غير صالح');
          check(TASK_KINDS[x.kind || 'check'], 'نوع البند غير صالح');
          check(x.off || x.archived || (x.km || 0) > 0 || (x.months || 0) > 0, 'حدد كل كام كيلو أو كل كام شهر');
        }
      },
    },
    'car.fault': {
      label: 'عطل',
      validate: (s, x) => {
        check(entity(s, 'car.vehicle', x.carId), 'العربية غير موجودة');
        check(nonEmpty(x.title) && x.title.trim().length <= 120, 'اكتب العطل باختصار (مثلاً: صوت طقطقة من العجلة اليمين)');
        check(isDate(x.date), 'تاريخ ظهور العطل غير صالح');
        check(optInt(x.km, isKm), 'العداد غير صالح');
        check(SYSTEMS[x.system || 'other'], 'الجزء غير صالح');
        check(SEVERITY[x.severity || 'soon'], 'درجة الخطورة غير صالحة');
        check(['open', 'closed'].includes(x.status || 'open'), 'حالة العطل غير صالحة');
        check(shortText(x.note, 500) && shortText(x.closeNote, 300), 'الوصف طويل جداً');
      },
    },
    'car.plan': {
      label: 'تعديل مخطط',
      validate: (s, x) => {
        check(entity(s, 'car.vehicle', x.carId), 'العربية غير موجودة');
        check(nonEmpty(x.title) && x.title.trim().length <= 120, 'اكتب التعديل اللي عاوز تعمله');
        check(PRIORITY[x.priority || 'normal'], 'الأولوية غير صالحة');
        check(SYSTEMS[x.system || 'other'], 'الجزء غير صالح');
        check(!x.targetDate || isDate(x.targetDate), 'الموعد المخطط غير صالح');
        check(optInt(x.targetKm, isKm), 'العداد المخطط غير صالح');
        check(optInt(x.estimate, nonNegInt), 'التكلفة التقديرية غير صالحة');
        check(['planned', 'cancelled'].includes(x.status || 'planned'), 'الحالة غير صالحة');
        check(shortText(x.note, 500), 'الوصف طويل جداً');
      },
    },
  },
  entries: {
    'car.odometer': {
      label: 'قراءة العداد',
      validate: (s, e) => {
        carOf(s, e);
        check(isKm(e.km), 'اكتب قراءة العداد بالكيلو (رقم صحيح)');
        checkKmOrder(s, e);
      },
      describe: (s, e) => ({ title: `العداد ${kmText(e.km)} كم`, amount: 0, sign: 0, tag: 'odometer' }),
    },
    // زيارة/شغل واحد: صيانة دورية أو تصليح عطل أو تعديل أو سجل سابق. المبلغ = القطع + المصنعية + مصاريف أخرى.
    'car.work': {
      label: 'صيانة / تصليح',
      validate: (s, e) => {
        carOf(s, e);
        check(WORK_TYPES[e.type], 'اختر نوع الشغل');
        check(optInt(e.km, isKm), 'قراءة العداد غير صالحة');
        if (e.dateUnknown) {
          check(e.type === 'history', 'التاريخ المجهول مسموح في «سجل سابق» فقط');
          check(Number.isSafeInteger(e.km), 'لو التاريخ مش معروف لازم تكتب العداد وقتها');
        }
        const tasks = e.tasks || [];
        check(Array.isArray(tasks) && new Set(tasks).size === tasks.length, 'بنود الجدول مكررة');
        for (const id of tasks) check(isTaskOf(s, e.carId, id), 'بند صيانة غير موجود في جدول العربية');
        for (const id of e.faultIds || []) check(entity(s, 'car.fault', id)?.carId === e.carId, 'عطل غير موجود');
        for (const id of e.planIds || []) check(entity(s, 'car.plan', id)?.carId === e.carId, 'تعديل غير موجود');
        if (e.type !== 'history' && !Number.isSafeInteger(e.km)) {
          const byKm = carTasks(s, e.carId).filter((t) => tasks.includes(t.id) && t.km > 0);
          check(!byKm.length, `اكتب قراءة العداد وقت الشغل — «${byKm[0]?.name}» موعده الجاي بالكيلو`);
        }
        validateParts(e.parts || []);
        check(optInt(e.labor, nonNegInt) && optInt(e.other, nonNegInt), 'المصنعية أو المصاريف غير صالحة');
        check(nonNegInt(e.amount) && e.amount === workTotal(e), 'الإجمالي لا يساوي القطع + المصنعية + المصاريف');
        check(shortText(e.title, 200) && shortText(e.place, 80), 'الوصف أو المكان طويل');
        check(!e.mechanicId || entity(s, 'person', e.mechanicId), 'اللي عمل الشغل غير موجود في الأشخاص');
        check(tasks.length || (e.faultIds || []).length || (e.planIds || []).length || nonEmpty(e.title) || (e.parts || []).length, 'اختر البنود اللي اتعملت أو اكتب وصف الشغل');
        checkKmOrder(s, e);
      },
      describe: (s, e) => {
        const what = nonEmpty(e.title)
          ? e.title.trim()
          : [...(e.tasks || []).map((id) => taskName(s, id)), ...(e.faultIds || []).map((id) => entity(s, 'car.fault', id)?.title || ''), ...(e.planIds || []).map((id) => entity(s, 'car.plan', id)?.title || ''), ...(e.parts || []).map((p) => p.name)].filter(Boolean);
        const text = Array.isArray(what) ? (what.length > 2 ? `${what.slice(0, 2).join('، ')} +${what.length - 2}` : what.join('، ')) : what;
        return { title: `${WORK_TYPES[e.type] || 'شغل'}: ${text}${Number.isSafeInteger(e.km) ? ` · ${kmText(e.km)} كم` : ''}`, amount: e.amount || 0, sign: e.amount ? -1 : 0, tag: 'car' };
      },
    },
  },

  // التذكيرات لكل عربية معايا: الصيانة المستحقة/القريبة/المجهولة، العداد، الرخصة، الأعطال، التعديلات المخططة.
  reminders(state, today) {
    const out = [];
    for (const car of listEntities(state, 'car.vehicle')) {
      if ((car.status || 'active') !== 'active') continue;
      const d = carData(state, car.id, today);
      const href = `#/car/${car.id}`;
      const names = (ts) => (ts.length > 3 ? `${ts.slice(0, 3).map((t) => t.name).join('، ')} و${ts.length - 3} غيرهم` : ts.map((t) => t.name).join('، '));
      const now = d.tasks.filter(needsAction);
      if (now.length) out.push({ id: `car-due-${car.id}`, due: now.map((t) => t.dueAt || today).sort()[0], title: `${car.name}: صيانة مطلوبة (${now.length}) — ${names(now)}`, level: 'overdue', href: `${href}/schedule` });
      const soon = d.tasks.filter((t) => t.status === 'soon');
      if (soon.length) {
        const due = soon.map((t) => t.dueAt || addDays(today, CAR_RULES.soonDays)).sort()[0];
        out.push({ id: `car-soon-${car.id}`, due, title: `${car.name}: صيانة قريبة (${soon.length}) — ${names(soon)}`, level: due <= today ? 'today' : 'upcoming', href: `${href}/schedule` });
      }
      const unknown = d.tasks.filter((t) => t.status === 'unknown' && !t.critical);
      if (unknown.length) out.push({ id: `car-unknown-${car.id}`, due: today, title: `${car.name}: ${unknown.length} بند مش معروف آخر مرة اتعمل — افحصها في أول زيارة أو سجّل آخر مرة`, level: 'upcoming', href: `${href}/schedule` });
      // العداد: كل كام يوم (الافتراضي أسبوع) من آخر قراءة.
      const every = car.readEveryDays || CAR_RULES.readEveryDays;
      const lastRead = d.last?.date || null;
      const readDue = lastRead ? addDays(lastRead, every) : today;
      if (readDue <= today) out.push({ id: `car-read-${car.id}-${readDue}`, due: readDue, title: `سجّل عداد ${car.name} + فحص سريع (الزيت، المياه، الكاوتش)`, level: readDue < today ? 'overdue' : 'today', href: `${href}?read=1` });
      if (car.licenseExpiry) {
        const left = daysBetween(today, car.licenseExpiry);
        if (left <= CAR_RULES.licenseWarnDays) out.push({ id: `car-license-${car.id}-${car.licenseExpiry}`, due: car.licenseExpiry, title: left < 0 ? `رخصة ${car.name} خلصت — جدّدها` : `رخصة ${car.name} بتخلص — جهّز التجديد (الفحص والمخالفات والتأمين)`, level: left < 0 ? 'overdue' : left <= 7 ? 'today' : 'upcoming', href: `${href}/setup` });
      }
      for (const f of d.faults) {
        if (f.state !== 'open' || f.severity === 'watch') continue;
        const due = f.severity === 'urgent' ? f.date : addDays(f.date, CAR_RULES.faultSoonDays);
        if (f.severity === 'urgent' || due <= addDays(today, 30)) out.push({ id: `car-fault-${f.id}`, due, title: `عطل ${f.severity === 'urgent' ? 'خطر' : 'مفتوح'} في ${car.name}: ${f.title}`, level: f.severity === 'urgent' || due < today ? 'overdue' : due === today ? 'today' : 'upcoming', href: `${href}/faults` });
      }
      for (const p of d.plans) {
        if (p.state !== 'planned') continue;
        let due = p.targetDate || null;
        if (p.targetKm && d.kmNow !== null && p.targetKm - d.kmNow <= CAR_RULES.soonKmMin) due = due && due < today ? due : today;
        if (!due || due > addDays(today, 30)) continue;
        out.push({ id: `car-plan-${p.id}`, due, title: `تعديل مخطط في ${car.name}: ${p.title}`, level: due < today ? 'overdue' : due === today ? 'today' : 'upcoming', href: `${href}/plans` });
      }
    }
    return out;
  },

  // قيمة العربية التقديرية ضمن الممتلكات في «وضعي المالي».
  finance(state) {
    return listEntities(state, 'car.vehicle')
      .filter((c) => (c.status || 'active') === 'active' && c.value > 0)
      .map((c) => ({ section: 'العربية', label: `${c.name} (قيمة تقديرية)`, kind: 'asset', amount: c.value, href: `#/car/${c.id}/setup` }));
  },
};
