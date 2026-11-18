// حسابات الجمعيات. السهم: قسطه الشهري = قسط السهم الكامل × حجمه، وإجماليه = القسط × عدد الشهور = مجموع قبضه.
// المدفوع يتوزع على الشهور الأقدم أولاً، والمقبوض على مواعيد القبض الأقدم أولاً.
// «عضو»: الأقساط اللي دفعتها للمدير والقبض اللي استلمته منه (والسهم اللي لحد تاني: اللي دفعهولي واللي سلّمته).
// «مدير» (أنا اللي بلمّها): الأقساط اللي حصّلتها من كل سهم والقبض اللي سلّمته؛ والفلوس اللي معايا = المحصّل − المسلَّم.
import { entity, listEntities } from '../../engine.js';
import { mulDiv } from '../../money.js';
import { addDays, addMonths, cmp, daysInMonth, monthsRange, sum, ymOf } from '../../util.js';
import { ME } from '../common.js';
import { dueLevel, remindDaysOf } from '../money/prices.js';

export const isOrganizer = (a) => a.organizerId === ME;
// «جمعية الشغل» تفضل زي ما هي، و«الشغل» تبقى «جمعية الشغل».
export const assocLabel = (a) => (!a ? 'جمعية' : /^\s*جمعي[ةه]/.test(a.name) ? a.name.trim() : `جمعية ${a.name.trim()}`);
export const shareInstallment = (a, sh) => mulDiv(a.monthly, sh.size.num, sh.size.den);
export const shareTotal = (a, sh) => shareInstallment(a, sh) * a.months;
export const assocEnd = (a) => addMonths(a.start, a.months - 1);
export const assocMonthList = (a) => monthsRange(a.start, assocEnd(a));
export function payDate(a, month) {
  const d = Math.min(a.payDay || 1, daysInMonth(month));
  return `${month}-${String(d).padStart(2, '0')}`;
}

export const assocEntries = (state, assocId) => state.entries.filter((e) => !e.voided && e.assocId === assocId && e.kind.startsWith('assoc.')).sort((a, b) => cmp(a.date, b.date) || cmp(a.ts, b.ts));

// المدفوع/المقبوض لسهم من القيود (استثناء قيد معيّن للتحقق عند الإلغاء أو التعديل).
export function shareSums(state, assocId, shareId, skipId = null) {
  const es = assocEntries(state, assocId).filter((e) => e.shareId === shareId && e.id !== skipId);
  const of = (k, dir) => sum(es.filter((e) => e.kind === k && (!dir || e.dir === dir)), (e) => e.amount);
  return { paid: of('assoc.pay'), received: of('assoc.payout'), tin: of('assoc.transfer', 'in'), tout: of('assoc.transfer', 'out'), count: es.length };
}

export function shareData(state, a, sh, today, entries = assocEntries(state, a.id)) {
  const days = remindDaysOf(state);
  const inst = shareInstallment(a, sh);
  const total = inst * a.months;
  const es = entries.filter((e) => e.shareId === sh.id);
  const pays = es.filter((e) => e.kind === 'assoc.pay');
  const outs = es.filter((e) => e.kind === 'assoc.payout');
  const trs = es.filter((e) => e.kind === 'assoc.transfer');
  const paid = sum(pays, (e) => e.amount);
  const received = sum(outs, (e) => e.amount);
  const tin = sum(trs.filter((e) => e.dir === 'in'), (e) => e.amount);
  const tout = sum(trs.filter((e) => e.dir === 'out'), (e) => e.amount);
  // الشهور: المدفوع يغطي الأقدم أولاً.
  let credit = paid;
  const months = assocMonthList(a).map((m, i) => {
    const take = Math.min(credit, inst);
    credit -= take;
    const due = payDate(a, m);
    const remaining = inst - take;
    const level = remaining > 0 ? dueLevel(due, today, days) : null;
    return { n: i + 1, month: m, due, amount: inst, paid: take, remaining, state: remaining === 0 ? 'paid' : take > 0 ? 'partial' : level || 'later', level };
  });
  const dueSoFar = months.filter((m) => m.due <= today).length * inst;
  // مواعيد القبض: المقبوض يغطي الأقدم أولاً.
  let got = received;
  const payouts = [...(sh.payouts || [])]
    .sort((x, y) => cmp(x.month, y.month))
    .map((p) => {
      const take = Math.min(got, p.amount);
      got -= take;
      const due = payDate(a, p.month);
      const remaining = p.amount - take;
      return { month: p.month, due, amount: p.amount, received: take, remaining, state: remaining === 0 ? 'received' : dueLevel(due, today, days) || 'later', n: assocMonthList(a).indexOf(p.month) + 1 };
    });
  const own = sh.ownerId === ME;
  const behalf = !own && !isOrganizer(a);
  return {
    share: sh,
    own,
    behalf,
    installment: inst,
    total,
    paid,
    received,
    tin,
    tout,
    late: Math.max(0, dueSoFar - paid),
    dueSoFar,
    position: paid - received, // موجب: دفع أكتر ما قبض (له عند الجمعية)؛ سالب: قبض قبل ما يكمّل (عليه أقساط)
    ownerBalance: behalf ? tin - paid + received - tout : 0, // موجب: فلوسه معايا؛ سالب: عليه ليّ
    ownerLate: behalf ? Math.max(0, dueSoFar - tin) : 0,
    months,
    payouts,
    nextMonth: months.find((m) => m.remaining > 0) || null,
    nextPayout: payouts.find((p) => p.remaining > 0) || null,
    unscheduled: total - sum(sh.payouts || [], (p) => p.amount),
    done: paid === total && received === total && (!behalf || (tin === paid && tout === received)),
    entries: es,
  };
}

export function assocData(state, id, today) {
  const a = entity(state, 'assoc', id);
  if (!a) return null;
  const entries = assocEntries(state, id);
  const shares = (a.shares || []).map((sh) => shareData(state, a, sh, today, entries));
  const months = assocMonthList(a);
  const idx = months.indexOf(ymOf(today));
  const organizer = isOrganizer(a);
  const mine = shares.filter((s) => s.own);
  const paid = sum(shares, (s) => s.paid);
  const received = sum(shares, (s) => s.received);
  const status = shares.length && shares.every((s) => s.done) ? 'done' : today < payDate(a, a.start) ? 'upcoming' : 'active';
  // كل شهر: المستحق والمدفوع لكل الأسهم، والقبض المجدول فيه.
  const grid = months.map((m, i) => {
    const rows = shares.map((s) => s.months[i]);
    const due = sum(rows, (r) => r.amount);
    const got = sum(rows, (r) => r.paid);
    const payoutRows = shares.flatMap((s) => s.payouts.filter((p) => p.month === m).map((p) => ({ ...p, share: s })));
    const unpaid = shares.filter((s) => s.months[i].remaining > 0);
    const dueDate = payDate(a, m);
    return { n: i + 1, month: m, due: dueDate, amount: due, paid: got, unpaid, payouts: payoutRows, state: got >= due ? 'paid' : got > 0 ? 'partial' : dueDate < today ? 'due' : 'upcoming' };
  });
  return {
    assoc: a,
    organizer,
    shares,
    mine,
    months,
    grid,
    monthIndex: idx >= 0 ? idx + 1 : today < `${a.start}-01` ? 0 : a.months + 1,
    monthlyAll: sum(shares, (s) => s.installment),
    paid,
    received,
    pot: paid - received, // للمدير: الفلوس اللي معايا للجمعية (سالب = دفعت من جيبي)
    myPosition: sum(mine, (s) => s.position),
    myInstallment: sum(organizer ? mine : shares, (s) => s.installment),
    status,
    entries,
  };
}

export const allAssocs = (state, opts) => listEntities(state, 'assoc', opts);

// أقرب ميعاد بين الأسهم (القسط الجاي والقبض الجاي) لعرضه في القوائم.
export function assocNext(d) {
  const inst = d.shares.map((s) => s.nextMonth).filter(Boolean).sort((x, y) => cmp(x.due, y.due))[0] || null;
  const pay = d.shares.map((s) => (s.nextPayout ? { ...s.nextPayout, share: s } : null)).filter(Boolean).sort((x, y) => cmp(x.due, y.due))[0] || null;
  return { installment: inst, payout: pay };
}

// المستحق على كل الأسهم حتى تاريخ (للتذكير): مجموع المتبقي من الشهور اللي ميعادها ≤ التاريخ.
export const dueUntil = (shares, limit) => sum(shares, (s) => sum(s.months.filter((m) => m.due <= limit), (m) => m.remaining));
export const soonLimit = (state, today) => addDays(today, remindDaysOf(state));
