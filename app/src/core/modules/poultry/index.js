// وحدة الدواجن (دورات إنتاج البيض): الكيانات، أنواع القيود، التحقق، الوصف، التذكيرات، المساهمة في الوضع المالي.
import { entity, isClosed, listEntities, closedMonths } from '../../engine.js';
import { isShare, sumShares, isWhole } from '../../shares.js';
import { QTY, lineAmount } from '../../money.js';
import { addMonths, check, isDate, isMonth, nonEmpty, ymOf } from '../../util.js';
import { BREEDS, CYCLE_STATUS, EGG_GRADES, EXPENSE_CATEGORIES, PRODUCTS } from './config.js';
import { cycleData, scopeOf } from './calc.js';
import { ME } from '../common.js';

const posInt = (x) => Number.isSafeInteger(x) && x > 0;
const nonNegInt = (x) => Number.isSafeInteger(x) && x >= 0;
const personName = (s, id) => (id === 'cycle' ? 'الدورة (المدير)' : entity(s, 'person', id)?.name || '؟');

function cycleOf(s, e) {
  const c = entity(s, 'poultry.cycle', e.cycleId);
  check(c, 'الدورة غير موجودة');
  return c;
}

// أي شهر مقفول في الدورة من شهر معيّن فصاعداً؟
const closedFrom = (s, cycleId, month) => closedMonths(s, scopeOf(cycleId)).filter((m) => m >= month);

function allStakeRelations(s, cycleId) {
  const tops = new Set();
  const heads = new Map(); // sub → Set(heads)
  for (const e of s.entries) {
    if (e.voided || e.kind !== 'poultry.shares' || e.cycleId !== cycleId) continue;
    for (const st of e.stakes) {
      if (st.via) {
        if (!heads.has(st.personId)) heads.set(st.personId, new Set());
        heads.get(st.personId).add(st.via);
      } else tops.add(st.personId);
    }
  }
  const guests = new Set(s.entries.filter((e) => !e.voided && e.kind === 'poultry.guest' && e.cycleId === cycleId).map((e) => e.personId));
  return { tops, heads, guests };
}

function validateAmountLine(e) {
  check(posInt(e.amount), 'المبلغ يجب أن يكون أكبر من صفر');
  if (e.qty !== undefined && e.qty !== null) check(nonNegInt(e.qty), 'الكمية غير صالحة');
  if (e.price !== undefined && e.price !== null) check(nonNegInt(e.price), 'السعر غير صالح');
}

const money = (u) => (u / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });

export default {
  id: 'poultry',
  name: 'الدواجن',
  entities: {
    'poultry.farm': {
      label: 'مزرعة',
      validate: (s, x) => check(nonEmpty(x.name), 'اكتب اسم المزرعة'),
    },
    'poultry.cycle': {
      label: 'دورة',
      validate: (s, x, prev) => {
        check(nonEmpty(x.name) && x.name.length <= 80, 'اكتب اسماً مميزاً للدورة (مثل: مزرعتنا-مايو-٢٠٢٥)');
        check(isDate(x.startDate), 'تاريخ بداية الدورة غير صالح');
        check(nonNegInt(x.birds || 0), 'عدد الطيور غير صالح');
        check(nonNegInt(x.ageDays || 0), 'عمر الطيور عند الشراء غير صالح');
        check(!x.breed || BREEDS.includes(x.breed) || nonEmpty(x.breed), 'السلالة غير صالحة');
        check(!x.settleFrom || isMonth(x.settleFrom), 'شهر بداية التسوية غير صالح');
        check(!x.layStart || isDate(x.layStart), 'تاريخ البشاير غير صالح');
        check(!x.endDate || isDate(x.endDate), 'تاريخ نهاية الدورة غير صالح');
        check(Object.keys(CYCLE_STATUS).includes(x.status || 'active'), 'حالة الدورة غير صالحة');
        check(!x.managerId || entity(s, 'person', x.managerId), 'المدير غير موجود في الأشخاص');
        check(!x.farmId || entity(s, 'poultry.farm', x.farmId), 'المزرعة غير موجودة');
        check(!x.groupId || entity(s, 'group', x.groupId), 'المجموعة غير موجودة');
        if (prev && (prev.settleFrom || null) !== (x.settleFrom || null)) {
          const lo = [prev.settleFrom, x.settleFrom].filter(Boolean).sort()[0] || '0000-00';
          check(!closedFrom(s, x.id, lo).length, 'لا يمكن تغيير أول شهر منتظم بعد إقفال شهور تتأثر به. افتح الشهور أولاً.');
        }
        const lm = (d) => (d ? ymOf(d) : null);
        if (prev && lm(prev.layStart) !== lm(x.layStart)) {
          const lo = [lm(prev.layStart), lm(x.layStart)].filter(Boolean).sort()[0] || '0000-00';
          check(!closedFrom(s, x.id, lo).length, 'لا يمكن تغيير شهر البشاير بعد إقفال شهور تتأثر به. افتح الشهور أولاً.');
        }
      },
    },
    'poultry.category': {
      label: 'بند مصروف',
      validate: (s, x) => check(nonEmpty(x.name), 'اكتب اسم البند'),
    },
    'poultry.grade': {
      label: 'نوع بيض',
      validate: (s, x) => check(nonEmpty(x.name), 'اكتب اسم النوع'),
    },
  },
  entries: {
    'poultry.expense': {
      label: 'مصروف',
      scopeOf: (e) => scopeOf(e.cycleId),
      monthsOf: (s, e) => [e.month],
      validate: (s, e) => {
        cycleOf(s, e);
        check(isMonth(e.month), 'اختر شهر الحساب');
        check(entity(s, 'poultry.category', e.category), 'اختر بند المصروف');
        validateAmountLine(e);
        if (e.qty && e.price) check(lineAmount(e.qty, e.price) === e.amount, 'المبلغ لا يساوي الكمية × السعر');
      },
      describe: (s, e) => {
        const cat = entity(s, 'poultry.category', e.category)?.name || 'مصروف';
        const q = e.qty ? ` · ${e.qty / QTY} ${entity(s, 'poultry.category', e.category)?.unit || ''}` : '';
        return { title: `${cat}${q}`, amount: e.amount, sign: -1, tag: 'expense' };
      },
    },
    'poultry.sale': {
      label: 'بيع',
      scopeOf: (e) => scopeOf(e.cycleId),
      monthsOf: (s, e) => [e.month],
      validate: (s, e) => {
        cycleOf(s, e);
        check(isMonth(e.month), 'اختر شهر الحساب');
        check(PRODUCTS[e.product], 'اختر نوع البيع');
        validateAmountLine(e);
        if (e.product === 'eggs') {
          check(entity(s, 'poultry.grade', e.grade), 'اختر نوع البيض');
          check(posInt(e.qty) && posInt(e.price), 'أدخل عدد الأطباق وسعر الطبق');
          check(lineAmount(e.qty, e.price) === e.amount, 'المبلغ لا يساوي العدد × السعر');
        } else if (e.product === 'birds') {
          if (e.weight !== undefined && e.weight !== null) check(nonNegInt(e.weight), 'الوزن غير صالح');
          if (e.weight && e.price) check(lineAmount(e.weight, e.price) === e.amount, 'المبلغ لا يساوي الوزن × سعر الكيلو');
        } else if (e.qty && e.price) check(lineAmount(e.qty, e.price) === e.amount, 'المبلغ لا يساوي العدد × السعر');
      },
      describe: (s, e) => {
        let title = PRODUCTS[e.product]?.name || 'بيع';
        if (e.product === 'eggs') title = `بيض ${entity(s, 'poultry.grade', e.grade)?.name || ''} · ${e.qty / QTY} طبق × ${money(e.price)}`;
        else if (e.product === 'birds') title = `بيع طيور${e.qty ? ` · ${e.qty / QTY} طائر` : ''}${e.weight ? ` · ${e.weight / QTY} كجم` : ''}`;
        else if (e.qty && e.price) title += ` · ${e.qty / QTY} × ${money(e.price)}`;
        return { title, amount: e.amount, sign: 1, tag: 'sale' };
      },
    },
    'poultry.payment': {
      label: 'دفعة',
      validate: (s, e) => {
        cycleOf(s, e);
        check(posInt(e.amount), 'المبلغ يجب أن يكون أكبر من صفر');
        check(e.from !== e.to, 'الدافع والمستلم نفس الشخص');
        check(e.from === 'cycle' || entity(s, 'person', e.from), 'اختر الدافع');
        check(e.to === 'cycle' || entity(s, 'person', e.to), 'اختر المستلم');
        const { tops, heads, guests } = allStakeRelations(s, e.cycleId);
        const direct = (p) => tops.has(p) || guests.has(p) || p === entity(s, 'poultry.cycle', e.cycleId).managerId;
        if (e.to === 'cycle') check(direct(e.from), `${personName(s, e.from)} ليس شريكاً مباشراً في الدورة. الشريك التابع يدفع لرأسه.`);
        else if (e.from === 'cycle') check(direct(e.to), `${personName(s, e.to)} ليس شريكاً مباشراً في الدورة. الشريك التابع يستلم من رأسه.`);
        else check(heads.get(e.from)?.has(e.to) || heads.get(e.to)?.has(e.from), 'الدفع بين شخصين مسموح فقط بين الشريك التابع ورأسه');
      },
      describe: (s, e) => {
        const title = e.to === 'cycle' ? `دفعة من ${personName(s, e.from)} للدورة` : e.from === 'cycle' ? `استلام ${personName(s, e.to)} من الدورة` : `${personName(s, e.from)} ← ${personName(s, e.to)}`;
        return { title, amount: e.amount, sign: e.to === 'cycle' ? 1 : e.from === 'cycle' ? -1 : 0, tag: 'payment' };
      },
    },
    'poultry.shares': {
      label: 'حصص الشركاء',
      validate: (s, e) => {
        cycleOf(s, e);
        check(isMonth(e.from), 'اختر الشهر الذي تسري منه الحصص');
        check(Array.isArray(e.stakes) && e.stakes.length > 0, 'أضف الشركاء');
        const ids = new Set();
        for (const st of e.stakes) {
          check(entity(s, 'person', st.personId), 'شريك غير موجود في الأشخاص');
          check(!ids.has(st.personId), `${personName(s, st.personId)} مكرر`);
          ids.add(st.personId);
          check(isShare(st), `حصة ${personName(s, st.personId)} غير صالحة`);
        }
        for (const st of e.stakes) if (st.via) check(e.stakes.some((x) => x.personId === st.via && !x.via), `${personName(s, st.personId)} تابع لشخص ليس شريكاً مباشراً`);
        const total = sumShares(e.stakes);
        check(isWhole(total), `مجموع الحصص ${((total.num * 100) / total.den).toFixed(2)}% — لازم يساوي 100% بالضبط (استخدم كسوراً مثل 1/3 بدل 33.33)`);
        const closed = closedFrom(s, e.cycleId, e.from);
        check(!closed.length, `لا يمكن تغيير الحصص من ${e.from} لأن شهر ${closed[0]} مقفول`);
      },
      validateVoid: (s, e) => {
        const closed = closedFrom(s, e.cycleId, e.from);
        check(!closed.length, `لا يمكن إلغاء الحصص لأن شهر ${closed[0]} مقفول`);
      },
      describe: (s, e) => ({ title: `حصص الشركاء من ${e.from}`, amount: 0, sign: 0, tag: 'setup' }),
    },
    'poultry.guest': {
      label: 'تربية مشتركة (ضيف)',
      validate: (s, e) => {
        cycleOf(s, e);
        check(entity(s, 'person', e.personId), 'اختر صاحب الطيور الضيف');
        check(nonNegInt(e.guestBirds) && posInt(e.totalBirds) && e.guestBirds < e.totalBirds, 'عدد طيور الضيف يجب أن يكون أقل من إجمالي الطيور');
        const closed = closedFrom(s, e.cycleId, ymOf(e.date));
        check(!closed.length, `لا يمكن التغيير لأن شهر ${closed[0]} مقفول`);
      },
      validateVoid: (s, e) => {
        const closed = closedFrom(s, e.cycleId, ymOf(e.date));
        check(!closed.length, `لا يمكن الإلغاء لأن شهر ${closed[0]} مقفول`);
      },
      describe: (s, e) => ({ title: e.guestBirds ? `${personName(s, e.personId)} يربي ${e.guestBirds} من ${e.totalBirds} طائر` : `${personName(s, e.personId)} أخذ طيوره (انتهت التربية المشتركة)`, amount: 0, sign: 0, tag: 'setup' }),
    },
    'poultry.log': {
      label: 'نافق / إنتاج',
      scopeOf: (e) => scopeOf(e.cycleId),
      monthsOf: (s, e) => [e.month],
      validate: (s, e) => {
        cycleOf(s, e);
        check(isMonth(e.month), 'اختر الشهر');
        check(e.deaths === undefined || nonNegInt(e.deaths), 'عدد النافق غير صالح');
        check(e.trays === undefined || nonNegInt(e.trays), 'عدد الأطباق غير صالح');
        check(e.deaths || e.trays || nonEmpty(e.note), 'أدخل النافق أو الإنتاج أو ملاحظة');
      },
      describe: (s, e) => ({ title: [e.deaths ? `نافق ${e.deaths}` : '', e.trays ? `إنتاج ${e.trays / QTY} طبق` : '', !e.deaths && !e.trays ? e.note : ''].filter(Boolean).join(' · '), amount: 0, sign: 0, tag: 'log' }),
    },
    'poultry.count': {
      label: 'جرد',
      validate: (s, e) => {
        cycleOf(s, e);
        check(['birds', 'cash'].includes(e.item), 'نوع الجرد غير صالح');
        if (e.item === 'birds') check(nonNegInt(e.qty), 'العدد غير صالح');
        else check(Number.isSafeInteger(e.amount), 'المبلغ غير صالح');
      },
      describe: (s, e) => ({ title: e.item === 'birds' ? `جرد الطيور: ${e.qty / QTY} طائر` : `جرد النقدية مع المدير: ${money(e.amount)}`, amount: 0, sign: 0, tag: 'count' }),
    },
  },
  seeds: () => [...EXPENSE_CATEGORIES.map((c) => ['poultry.category', c]), ...EGG_GRADES.map((g) => ['poultry.grade', g])],

  // تذكير: شهور تسوية انتهت ولم تُقفل بعد.
  reminders(state, today) {
    const out = [];
    const lastDone = addMonths(ymOf(today), -1);
    for (const c of listEntities(state, 'poultry.cycle')) {
      const first = c.layStart && (!c.settleFrom || ymOf(c.layStart) < c.settleFrom) ? ymOf(c.layStart) : c.settleFrom;
      if ((c.status || 'active') !== 'active' || !first || first > lastDone || !c.settleFrom) continue;
      const open = [];
      for (let m = first; m <= lastDone; m = addMonths(m, 1)) if (!isClosed(state, scopeOf(c.id), m)) open.push(m);
      if (!open.length) continue;
      out.push({ id: `poultry-close-${c.id}-${open[0]}`, due: `${addMonths(open[0], 1)}-10`, title: open.length === 1 ? `تسوية شهر ${open[0]} لدورة ${c.name}` : `${open.length} شهور تسوية مفتوحة لدورة ${c.name} (أقدمها ${open[0]})`, level: `${addMonths(open[0], 1)}-10` < today ? 'overdue' : 'upcoming', href: `#/poultry/cycle/${c.id}/months` });
    }
    return out;
  },

  // المساهمة في «وضعي المالي»: ما تدين به كل دورة لناحيتي، وما أدين به لشركائي التابعين.
  finance(state) {
    const items = [];
    for (const c of listEntities(state, 'poultry.cycle')) {
      const d = cycleData(state, c.id);
      const me = d?.people.get(ME);
      if (!me) continue;
      if (me.sideBalance) items.push({ section: 'الدواجن', label: `دورة ${c.name}: رصيد ناحيتي عند المدير`, kind: me.sideBalance > 0 ? 'receivable' : 'payable', amount: Math.abs(me.sideBalance), href: `#/poultry/cycle/${c.id}/partners` });
      for (const sub of me.subAccounts) if (sub.balance) items.push({ section: 'الدواجن', label: `${personName(state, sub.personId)} — حصته معي في ${c.name}`, kind: sub.balance > 0 ? 'payable' : 'receivable', amount: Math.abs(sub.balance), href: `#/poultry/cycle/${c.id}/partners`, personId: sub.personId });
    }
    return items;
  },
};
