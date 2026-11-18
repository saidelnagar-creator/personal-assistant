// حسابات السلف: الحركات بالترتيب (سلفة/زيادة +، سداد/مسامحة −، تحويل خارج − وداخل +)، الباقي،
// قيمتها وقت السلف ودلوقتي، وجدول السداد (المسدد يتوزع على الأقساط الأقدم أولاً).
import { entity, listEntities } from '../../engine.js';
import { mulDiv } from '../../money.js';
import { cmp } from '../../util.js';
import { unitInfo, valueOf } from '../money/units.js';
import { dueLevel, priceAt, remindDaysOf } from '../money/prices.js';

export function loanMoves(state, loanId) {
  const out = [];
  for (const e of state.entries) {
    if (e.voided) continue;
    if (e.kind === 'loan.draw' && e.loanId === loanId) out.push({ e, delta: e.qty, type: 'draw' });
    else if (e.kind === 'loan.pay' && e.loanId === loanId) out.push({ e, delta: -e.qty, type: e.forgive ? 'forgive' : 'pay' });
    else if (e.kind === 'loan.convert' && e.loanId === loanId) out.push({ e, delta: -e.fromQty, type: 'convertOut' });
    else if (e.kind === 'loan.convert' && e.toLoanId === loanId) out.push({ e, delta: e.toQty, type: 'convertIn' });
  }
  return sortMoves(out);
}

// بالتاريخ، وفي نفس اليوم: الأخذ قبل السداد.
export const sortMoves = (list) => list.sort((a, b) => cmp(a.e.date, b.e.date) || (b.delta > 0) - (a.delta > 0) || cmp(a.e.ts || '', b.e.ts || ''));

// أول حركة يبقى بعدها الباقي بالسالب (أو null).
export function firstNegative(moves) {
  let bal = 0;
  for (const m of moves) {
    bal += m.delta;
    if (bal < 0) return { move: m, before: bal - m.delta };
  }
  return null;
}

export const loanBalance = (state, loanId) => loanMoves(state, loanId).reduce((a, m) => a + m.delta, 0);
export const conversionOf = (state, loanId) => state.entries.find((e) => !e.voided && e.kind === 'loan.convert' && e.loanId === loanId) || null;

// أقساط الخطة مقصوصة على المأخوذ فعلاً (لو الجدول أكبر من السلفة). base = اللي كان اتسدد قبل الخطة دي
// (لما تعمل جدول جديد للباقي في نص السلفة)، فالجدول يغطي ما بعده بس.
function planItems(loan, drawn) {
  const p = loan.plan || { type: 'open' };
  const base = Math.min(p.base || 0, drawn);
  let raw = [];
  if (p.type === 'once' && p.due) raw = [{ due: p.due, qty: drawn - base }];
  else if (p.type === 'schedule') raw = [...(p.items || [])].sort((a, b) => cmp(a.due, b.due));
  const out = [];
  let left = drawn - base;
  for (const it of raw) {
    const qty = Math.min(it.qty, left);
    if (qty <= 0) break;
    out.push({ due: it.due, qty });
    left -= qty;
  }
  return out;
}

export function loanData(state, loanId, today) {
  const loan = entity(state, 'loan', loanId);
  if (!loan) return null;
  const u = unitInfo(loan.unit);
  const moves = loanMoves(state, loanId);
  let bal = 0;
  for (const m of moves) m.balance = bal += m.delta;
  const total = (t) => moves.filter((m) => m.type === t).reduce((a, m) => a + Math.abs(m.delta), 0);
  const drawn = total('draw') + total('convertIn');
  const paid = total('pay');
  const forgiven = total('forgive');
  const convertedOut = total('convertOut');
  const conversion = moves.find((m) => m.type === 'convertOut')?.e || null;
  const convertedFrom = moves.find((m) => m.type === 'convertIn')?.e || null;
  const balance = bal;

  // قيمتها وقت السلف: مجموع قيمة كل أخذ بالجنيه يومها (المكتوبة في القيد).
  let valueThen = 0;
  let valueThenKnown = drawn > 0;
  for (const m of moves) {
    if (m.type !== 'draw' && m.type !== 'convertIn') continue;
    const v = u.kind === 'egp' ? m.delta : m.e.value;
    if (Number.isSafeInteger(v)) valueThen += v;
    else valueThenKnown = false;
  }
  const price = u.priceKey ? priceAt(state, u.priceKey, today) : null;
  let valueNow = null;
  let valueBasis = 'none';
  if (u.kind === 'egp') {
    valueNow = balance;
    valueBasis = 'exact';
  } else if (price) {
    valueNow = valueOf(balance, loan.unit, price.price);
    valueBasis = 'price';
  } else if (valueThenKnown && drawn) {
    valueNow = mulDiv(valueThen, balance, drawn);
    valueBasis = 'then';
  }

  const status = conversion ? 'converted' : drawn === 0 ? 'empty' : balance === 0 ? 'settled' : 'active';
  const days = remindDaysOf(state);
  const base = Math.min(loan.plan?.base || 0, drawn);
  let credit = Math.max(0, paid + forgiven - base);
  const schedule = planItems(loan, drawn).map((it, i) => {
    const take = Math.min(credit, it.qty);
    credit -= take;
    const remaining = status === 'active' ? it.qty - take : 0;
    const level = remaining > 0 ? dueLevel(it.due, today, days) : null;
    return { n: i + 1, due: it.due, qty: it.qty, paid: take, remaining, state: remaining === 0 ? 'paid' : level || 'later', partial: take > 0 && remaining > 0 };
  });
  const scheduled = schedule.reduce((a, s) => a + s.qty, 0);
  const next = schedule.find((s) => s.remaining > 0) || null;
  const overdue = schedule.filter((s) => s.state === 'overdue');
  return {
    loan,
    unit: u,
    moves,
    drawn,
    paid,
    forgiven,
    convertedOut,
    conversion,
    convertedFrom,
    balance,
    valueThen: valueThenKnown ? valueThen : null,
    valueNow,
    valueBasis,
    price,
    status,
    schedule,
    unscheduled: status === 'active' ? Math.max(0, Math.min(balance, drawn - base - scheduled)) : 0,
    next,
    overdueQty: overdue.reduce((a, s) => a + s.remaining, 0),
    overdueCount: overdue.length,
    lastPay: [...moves].reverse().find((m) => m.type === 'pay')?.e || null,
    firstDate: moves[0]?.e.date || null,
  };
}

export const allLoans = (state, { archived = false } = {}) => listEntities(state, 'loan', { archived });

// كل السلف بحالتها (الأحدث أولاً) + الإجماليات بالجنيه لكل اتجاه.
export function loansOverview(state, today) {
  const rows = allLoans(state, { archived: true })
    .map((l) => loanData(state, l.id, today))
    .sort((a, b) => cmp(b.firstDate || '', a.firstDate || ''));
  const totals = { out: 0, in: 0, outUnpriced: 0, inUnpriced: 0 };
  for (const d of rows) {
    if (d.status !== 'active' || d.loan.archived) continue;
    if (d.valueNow === null) totals[`${d.loan.dir}Unpriced`]++;
    else totals[d.loan.dir] += d.valueNow;
  }
  return { rows, totals };
}

export const personLoans = (state, personId, today) => loansOverview(state, today).rows.filter((d) => d.loan.personId === personId);
