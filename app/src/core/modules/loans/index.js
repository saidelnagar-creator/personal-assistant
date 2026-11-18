// وحدة السلف (ليّ وعليّ) وأسعار الذهب والعملات.
// الكيان: السلفة {dir, personId, unit, itemName?, plan} — مع شخص واحد وبنوع واحد (جنيه/عملة/ذهب بعيار/جنيهات ذهب/حاجة).
// القيود: أخذ (أول مرة أو زيادة)، سداد (بنفس النوع، أو مسامحة)، تحويل الباقي كله لنوع تاني (سلفة جديدة)، وأسعار بتاريخ.
import { entity } from '../../engine.js';
import { check, daysBetween, isDate, nonEmpty, todayISO } from '../../util.js';
import { ME } from '../common.js';
import { MONEY_RULES, PLAN_TYPES } from '../money/config.js';
import { PRICE_KEYS, isUnit, priceLabel, qtyText, unitInfo } from '../money/units.js';
import { dueLevel, remindDaysOf, stalePriceKeys } from '../money/prices.js';
import { conversionOf, firstNegative, loanMoves, loansOverview, sortMoves } from './calc.js';
import { trustsNeedingPrices } from '../trusts/calc.js';

const posInt = (x) => Number.isSafeInteger(x) && x > 0;
const optNonNeg = (x) => x === undefined || x === null || (Number.isSafeInteger(x) && x >= 0);
const shortText = (s, max) => s === undefined || s === null || (typeof s === 'string' && s.length <= max);
const dmy = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const personName = (s, id) => entity(s, 'person', id)?.name || '؟';

function loanOf(s, e) {
  const l = entity(s, 'loan', e.loanId);
  check(l, 'السلفة غير موجودة');
  return l;
}
function notConverted(s, loanId, verb = 'تسجّل عليها') {
  const c = conversionOf(s, loanId);
  check(!c, `السلفة دي اتحولت لنوع تاني يوم ${c ? dmy(c.date) : ''} — مينفعش ${verb}. لو التحويل غلط ألغِه الأول.`);
}
// الباقي لا يصبح بالسالب في أي يوم بعد إضافة/إلغاء حركة.
function checkRunning(s, loan, moves) {
  const neg = firstNegative(moves);
  if (!neg) return;
  const before = Math.max(0, neg.before);
  check(false, `${loan.dir === 'out' ? 'المسدد' : 'اللي سددته'} أكبر من الباقي وقتها (${qtyText(before, loan.unit, loan.itemName)} يوم ${dmy(neg.move.e.date)}).`);
}
const withEntry = (s, loanId, e, delta, type) => sortMoves([...loanMoves(s, loanId), { e: { ...e, ts: '~' }, delta, type }]);

function validatePlan(p) {
  check(p && PLAN_TYPES[p.type], 'اختر طريقة السداد');
  check(optNonNeg(p.base), 'غير صالح');
  if (p.type === 'once') check(isDate(p.due), 'اكتب ميعاد السداد');
  if (p.type === 'schedule') {
    check(Array.isArray(p.items) && p.items.length >= 1 && p.items.length <= MONEY_RULES.maxInstallments, 'اكتب أقساط الجدول');
    for (const it of p.items) check(it && isDate(it.due) && posInt(it.qty), 'كل قسط لازم له ميعاد ومبلغ أكبر من صفر');
  }
}

export default {
  id: 'loans',
  name: 'السلف',
  entities: {
    loan: {
      label: 'سلفة',
      validate: (s, x, prev) => {
        check(x.dir === 'out' || x.dir === 'in', 'اختر: سلّفت ولا استلفت');
        check(entity(s, 'person', x.personId) && x.personId !== ME, 'اختر الشخص');
        check(isUnit(x.unit), 'اختر نوع السلفة (فلوس، ذهب، دولار…)');
        if (x.unit === 'item') check(nonEmpty(x.itemName) && x.itemName.trim().length <= 60, 'اكتب الحاجة اللي اتسلفت إيه');
        check(shortText(x.title, 80) && shortText(x.note, 500) && shortText(x.itemName, 60), 'الوصف طويل جداً');
        validatePlan(x.plan || { type: 'open' });
        if (prev) {
          const used = loanMoves(s, x.id).length > 0;
          check(!used || (prev.unit === x.unit && prev.dir === x.dir), 'نوع السلفة واتجاهها مايتغيروش بعد التسجيل — استخدم «تحويل لنوع تاني».');
          check(!used || prev.personId === x.personId || loanMoves(s, x.id).every((m) => m.type !== 'convertIn' && m.type !== 'convertOut'), 'مينفعش تغيّر الشخص في سلفة اتحولت');
        }
        if (x.fromLoanId) check(entity(s, 'loan', x.fromLoanId), 'السلفة الأصلية غير موجودة');
      },
    },
  },
  entries: {
    // أخذ: أول السلفة أو زيادة عليها. qty بنوع السلفة. given = اللي اتسلم فعلاً لو مختلف (ذهب واتحسب عليّ جنيه مثلاً).
    'loan.draw': {
      label: 'سلفة',
      validate: (s, e) => {
        const l = loanOf(s, e);
        notConverted(s, l.id, 'تزود عليها');
        check(posInt(e.qty), 'اكتب الكمية أو المبلغ');
        check(optNonNeg(e.value), 'القيمة وقتها غير صالحة');
        check(shortText(e.desc, 200), 'الوصف طويل');
        if (e.given) {
          check(isUnit(e.given.unit) && e.given.unit !== l.unit && posInt(e.given.qty), 'اللي اتسلم فعلاً غير صالح');
          check(shortText(e.given.desc, 200), 'الوصف طويل');
        }
      },
      validateVoid: (s, e) => {
        const l = loanOf(s, e);
        notConverted(s, l.id, 'تلغي حركة فيها');
        checkRunning(
          s,
          l,
          loanMoves(s, l.id).filter((m) => m.e.id !== e.id),
        );
      },
      describe: (s, e) => {
        const l = entity(s, 'loan', e.loanId);
        if (!l) return { title: 'سلفة', amount: 0, sign: 0 };
        const u = unitInfo(l.unit);
        const first = loanMoves(s, l.id).find((m) => m.type === 'draw')?.e.id === e.id;
        const verb = l.dir === 'out' ? (first ? 'سلّفت' : 'زودت سلفة') : first ? 'استلفت من' : 'زيادة سلفة من';
        const given = e.given ? ` (اتسلم ${qtyText(e.given.qty, e.given.unit)})` : '';
        return { title: `${verb} ${personName(s, l.personId)}: ${qtyText(e.qty, l.unit, l.itemName)}${given}${e.desc ? ` — ${e.desc}` : ''}`, amount: u.kind === 'egp' ? e.qty : e.value || 0, sign: l.dir === 'out' ? -1 : 1, tag: 'loan' };
      },
    },
    // سداد بنفس نوع السلفة (أو مسامحة في جزء منها). value = قيمته بالجنيه يومها (اختياري للعرض).
    'loan.pay': {
      label: 'سداد سلفة',
      validate: (s, e) => {
        const l = loanOf(s, e);
        notConverted(s, l.id);
        check(posInt(e.qty), 'اكتب المسدد');
        check(optNonNeg(e.value), 'القيمة غير صالحة');
        check(e.forgive === undefined || e.forgive === true, 'غير صالح');
        checkRunning(s, l, withEntry(s, l.id, e, -e.qty, 'pay'));
      },
      validateVoid: (s, e) => notConverted(s, loanOf(s, e).id, 'تلغي حركة فيها'),
      describe: (s, e) => {
        const l = entity(s, 'loan', e.loanId);
        if (!l) return { title: 'سداد', amount: 0, sign: 0 };
        const u = unitInfo(l.unit);
        const who = personName(s, l.personId);
        const title = e.forgive ? `مسامحة ${l.dir === 'out' ? who : `من ${who}`}: ${qtyText(e.qty, l.unit, l.itemName)}` : l.dir === 'out' ? `${who} سدد: ${qtyText(e.qty, l.unit, l.itemName)}` : `سددت لـ${who}: ${qtyText(e.qty, l.unit, l.itemName)}`;
        return { title, amount: e.forgive ? 0 : u.kind === 'egp' ? e.qty : e.value || 0, sign: e.forgive ? 0 : l.dir === 'out' ? 1 : -1, tag: 'loan' };
      },
    },
    // تحويل كل الباقي لنوع تاني باتفاق (ذهب ← جنيه مثلاً): يقفل السلفة ويبدأ سلفة جديدة بنفس الشخص.
    'loan.convert': {
      label: 'تحويل سلفة',
      validate: (s, e) => {
        const l = loanOf(s, e);
        const t = entity(s, 'loan', e.toLoanId);
        check(t && t.id !== l.id, 'السلفة الجديدة غير موجودة');
        check(t.personId === l.personId && t.dir === l.dir && t.unit !== l.unit, 'التحويل لنفس الشخص ولنوع مختلف');
        notConverted(s, l.id, 'تحوّلها تاني');
        const moves = loanMoves(s, l.id);
        const bal = moves.reduce((a, m) => a + m.delta, 0);
        check(bal > 0, 'مفيش باقي يتحول');
        check(e.fromQty === bal, `التحويل لازم يكون لكل الباقي (${qtyText(bal, l.unit, l.itemName)})`);
        check(!moves.some((m) => m.e.date > e.date), 'تاريخ التحويل لازم يكون بعد آخر حركة في السلفة');
        check(posInt(e.toQty), 'اكتب الكمية بعد التحويل');
        check(optNonNeg(e.value), 'القيمة غير صالحة');
      },
      validateVoid: (s, e) => {
        const others = loanMoves(s, e.toLoanId).filter((m) => m.e.id !== e.id);
        check(!others.length, 'السلفة الجديدة عليها حركات — ألغِها الأول وبعدين ألغِ التحويل');
      },
      describe: (s, e) => {
        const l = entity(s, 'loan', e.loanId);
        const t = entity(s, 'loan', e.toLoanId);
        return { title: `تحويل سلفة ${personName(s, l?.personId)}: ${qtyText(e.fromQty, l?.unit, l?.itemName)} ← ${qtyText(e.toQty, t?.unit, t?.itemName)}`, amount: 0, sign: 0, tag: 'loan' };
      },
    },
    // أسعار يوم: جرام كل عيار، الجنيه الذهب، العملات (بالقرش).
    'money.price': {
      label: 'أسعار',
      validate: (s, e) => {
        check(e.prices && typeof e.prices === 'object', 'اكتب سعر واحد على الأقل');
        const keys = Object.keys(e.prices);
        check(keys.length >= 1, 'اكتب سعر واحد على الأقل');
        for (const k of keys) {
          check(PRICE_KEYS.includes(k), 'سعر غير معروف');
          check(posInt(e.prices[k]), `سعر ${priceLabel(k)} غير صالح`);
        }
      },
      describe: (s, e) => {
        const f = (k) => `${priceLabel(k)} ${(e.prices[k] / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
        const keys = Object.keys(e.prices || {});
        return { title: `أسعار: ${keys.slice(0, 3).map(f).join(' · ')}${keys.length > 3 ? ` +${keys.length - 3}` : ''}`, amount: 0, sign: 0, tag: 'price' };
      },
    },
  },

  reminders(state, today) {
    const out = [];
    const days = remindDaysOf(state);
    const { rows } = loansOverview(state, today);
    const priceKeys = new Set();
    for (const d of rows) {
      if (d.status !== 'active' || d.loan.archived) continue;
      if (d.unit.priceKey) priceKeys.add(d.unit.priceKey);
      if (!d.next) continue;
      const level = dueLevel(d.next.due, today, days);
      if (!level) continue;
      const who = personName(state, d.loan.personId);
      const qty = level === 'overdue' ? d.overdueQty : d.next.remaining;
      const what = qtyText(qty, d.loan.unit, d.loan.itemName);
      const late = d.overdueCount > 1 ? ` (متأخر ${d.overdueCount} أقساط)` : '';
      const title = d.loan.dir === 'out' ? `${who} عليه ${d.schedule.length > 1 ? 'قسط' : 'سداد'} ${what}${late}` : `عليّ ${d.schedule.length > 1 ? 'قسط' : 'سداد'} لـ${who}: ${what}${late}`;
      out.push({ id: `loan-${d.loan.id}-${d.next.due}`, due: d.next.due, title, level, href: `#/loan/${d.loan.id}` });
    }
    for (const k of trustsNeedingPrices(state, today)) priceKeys.add(k);
    const stale = stalePriceKeys(state, priceKeys, today);
    if (stale.length) {
      const oldest = stale.map((x) => x.last?.date).filter(Boolean).sort()[0];
      const missing = stale.some((x) => !x.last);
      out.push({ id: `prices-${today}`, due: today, title: `حدّث الأسعار (${stale.map((x) => priceLabel(x.key)).join('، ')}) — ${missing ? 'مفيش سعر مكتوب' : `آخر سعر من ${daysBetween(oldest, today)} يوم`} عشان القيمة الحالية تبقى صح`, level: 'today', href: '#/prices' });
    }
    return out;
  },

  // اللي ليّ عند الناس (سلّفت) واللي عليّ (استلفت) بالقيمة الحالية بالجنيه.
  finance(state, today = todayISO()) {
    return financeItems(state, today);
  },
};

export function financeItems(state, today) {
  return loansOverview(state, today)
    .rows.filter((d) => d.status === 'active' && !d.loan.archived)
    .map((d) => {
      const who = personName(state, d.loan.personId);
      const what = qtyText(d.balance, d.loan.unit, d.loan.itemName);
      const basis = d.valueBasis === 'then' ? ' — بقيمته وقت السلف' : d.valueBasis === 'none' ? ' — بدون سعر' : '';
      return { section: 'السلف', label: `${d.loan.dir === 'out' ? `سلفة ${who}` : `سلفة من ${who}`} (${what}${basis})`, kind: d.loan.dir === 'out' ? 'receivable' : 'payable', amount: d.valueNow || 0, href: `#/loan/${d.loan.id}`, personId: d.loan.personId };
    });
}
