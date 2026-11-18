// حسابات دورة الدواجن — دوال خالصة من الحالة (لا DOM ولا تخزين).
//
// المفاهيم:
//  • الحصص: قيد «poultry.shares» يسري من شهر (from). كل حصة = كسر من الدورة كلها لشخص.
//    via = null ⇒ شريك مباشر مع المدير (رأس «ناحية»)، via = رأس ⇒ شريك تابع يتعامل مع رأسه فقط.
//  • الضيف (تربية مشتركة): قيد «poultry.guest» يسري من تاريخ: للضيف guestBirds من totalBirds طائر،
//    فيتحمّل هذه النسبة من كل مصروف تاريخه بعد ذلك (إلا المصروف المعلَّم noGuest). guestBirds = 0 ⇒ انتهى.
//  • المراحل بشهر الحساب: قبل شهر البشاير (layStart) «تأسيس وتربية» = رأس مال؛ من البشاير حتى أول شهر منتظم
//    (settleFrom) «فترة البشاير»: تُحاسَب ككتلة واحدة ولا تدخل متوسطات الشهور المنتظمة؛ ومن settleFrom تسوية شهرية:
//    ربح الشهر = مبيعات شهر الحساب − مصروفاته التشغيلية (حصتنا فقط بعد خصم نصيب الضيف).
//    بلا layStart: كل ما قبل settleFrom تأسيس وتربية.
//  • الأرصدة: ما تدين به الدورة (المدير) لكل ناحية = المدفوع − المستلم + نصيبها من النتائج − نصيبه كضيف.
//    وما يدين به الرأس لكل تابع = ما دفعه التابع للرأس − ما استلمه منه + نصيب التابع من النتائج.
//    المدير يحمل النقدية: أي عجز أو زيادة عليه، فرصيده = النقدية − أرصدة الباقين.
import { activeEntries, entity } from '../../engine.js';
import { allocate } from '../../shares.js';
import { QTY, mulDiv } from '../../money.js';
import { addMonths, cmp, daysBetween, daysInMonth, monthsRange, todayISO, ymOf } from '../../util.js';

export const scopeOf = (cycleId) => `poultry:${cycleId}`;
const byDate = (a, b) => cmp(a.date, b.date) || cmp(a.ts, b.ts);

const memo = new WeakMap();
export function cycleData(state, cycleId, today = todayISO()) {
  let m = memo.get(state);
  if (!m || m.version !== state.version || m.today !== today) memo.set(state, (m = { version: state.version, today, map: new Map() }));
  if (!m.map.has(cycleId)) m.map.set(cycleId, computeCycle(state, cycleId, today));
  return m.map.get(cycleId);
}

export function cycleEntries(state, cycleId) {
  return activeEntries(state, (e) => e.cycleId === cycleId).sort(byDate);
}

// آخر نسخة حصص سارية في شهر (أو أقدم نسخة إن كان الشهر قبلها).
export function sharesAt(sharesList, month) {
  let cur = null;
  for (const s of sharesList) if (s.from <= month) cur = s;
  return cur || sharesList[0] || null;
}

export function guestAt(guestList, date) {
  let cur = null;
  for (const g of guestList) if (g.date <= date) cur = g;
  return cur && cur.guestBirds > 0 ? cur : null;
}

const blankMonth = (month) => ({
  month,
  phase: 'rearing', // rearing | lay | regular
  pre: false, // = تأسيس وتربية (رأس مال)
  lay: false, // = فترة البشاير
  closed: false,
  sales: 0,
  eggs: { qty: 0, amount: 0, byGrade: {} },
  manure: { qty: 0, amount: 0 },
  bags: { qty: 0, amount: 0 },
  birds: { qty: 0, weight: 0, amount: 0 },
  other: { amount: 0 },
  byCategory: {}, // catId → { amount (حصتنا), gross, qty }
  expensesOurs: 0,
  capExpenses: 0,
  opExpenses: 0,
  guestCost: 0,
  guestBy: {}, // personId → نصيب الضيف من مصروف الشهر
  opRevenue: 0,
  capRevenue: 0,
  opNet: 0,
  capNet: 0,
  deaths: 0,
  producedTrays: 0,
  count: 0, // عدد القيود
  alloc: [], // [{ personId, via, op, cap }]
  unallocated: false,
});

function person(map, id) {
  let p = map.get(id);
  if (!p)
    map.set(
      id,
      (p = { personId: id, paidCycle: 0, receivedCycle: 0, topOp: 0, topCap: 0, guestCost: 0, subVia: new Map(), isTop: false, isSub: false, isGuest: false, heads: new Set(), subs: new Set() }),
    );
  return p;
}
// حساب التابع مع رأس معيّن.
function subVia(p, head) {
  let r = p.subVia.get(head);
  if (!r) p.subVia.set(head, (r = { paid: 0, received: 0, op: 0, cap: 0 }));
  return r;
}

export function computeCycle(state, cycleId, today = todayISO()) {
  const cycle = entity(state, 'poultry.cycle', cycleId);
  if (!cycle) return null;
  const entries = cycleEntries(state, cycleId);
  const shares = entries.filter((e) => e.kind === 'poultry.shares').sort((a, b) => cmp(a.from, b.from) || cmp(a.ts, b.ts));
  const guests = entries.filter((e) => e.kind === 'poultry.guest');
  const closed = state.closed.get(scopeOf(cycleId)) || new Map();
  const layMonth = cycle.layStart ? ymOf(cycle.layStart) : null;
  const phaseOf = (m) => (cycle.settleFrom && m >= cycle.settleFrom ? 'regular' : layMonth && m >= layMonth ? 'lay' : 'rearing');
  const isPre = (m) => phaseOf(m) === 'rearing';

  const months = new Map();
  const M = (m) => {
    let r = months.get(m);
    if (!r) months.set(m, (r = blankMonth(m)));
    return r;
  };
  const people = new Map();
  for (const s of shares)
    for (const st of s.stakes) {
      const p = person(people, st.personId);
      if (st.via) {
        p.isSub = true;
        p.heads.add(st.via);
        person(people, st.via).subs.add(st.personId);
      } else p.isTop = true;
    }
  for (const g of guests) person(people, g.personId).isGuest = true;
  if (cycle.managerId) person(people, cycle.managerId);

  const cash = { in: 0, out: 0, sales: 0, expenses: 0 };
  const counts = { birds: [], cash: [] };
  let grossExpenses = 0;

  for (const e of entries) {
    switch (e.kind) {
      case 'poultry.expense': {
        const r = M(e.month);
        r.count++;
        const g = e.noGuest ? null : guestAt(guests, e.date);
        const gp = g ? mulDiv(e.amount, g.guestBirds, g.totalBirds) : 0;
        const ours = e.amount - gp;
        if (g) {
          person(people, g.personId).guestCost += gp;
          r.guestCost += gp;
          r.guestBy[g.personId] = (r.guestBy[g.personId] || 0) + gp;
        }
        const c = (r.byCategory[e.category] ||= { amount: 0, gross: 0, qty: 0, qtyGross: 0 });
        c.amount += ours;
        c.gross += e.amount;
        if (e.qty) {
          c.qty += e.qty;
          c.qtyGross += e.amount; // متوسط سعر الوحدة يُحسب من القيود ذات الكمية فقط
        }
        r.expensesOurs += ours;
        if (e.capital || isPre(e.month)) r.capExpenses += ours;
        else r.opExpenses += ours;
        grossExpenses += e.amount;
        cash.expenses += e.amount;
        break;
      }
      case 'poultry.sale': {
        const r = M(e.month);
        r.count++;
        r.sales += e.amount;
        cash.sales += e.amount;
        if (e.product === 'eggs') {
          r.eggs.qty += e.qty;
          r.eggs.amount += e.amount;
          const g = (r.eggs.byGrade[e.grade] ||= { qty: 0, amount: 0 });
          g.qty += e.qty;
          g.amount += e.amount;
        } else if (e.product === 'birds') {
          r.birds.qty += e.qty || 0;
          r.birds.weight += e.weight || 0;
          r.birds.amount += e.amount;
        } else if (r[e.product]) {
          r[e.product].amount += e.amount;
          if (e.qty) r[e.product].qty = (r[e.product].qty || 0) + e.qty;
        }
        break;
      }
      case 'poultry.payment': {
        const a = e.amount;
        if (e.to === 'cycle') {
          person(people, e.from).paidCycle += a;
          cash.in += a;
        } else if (e.from === 'cycle') {
          person(people, e.to).receivedCycle += a;
          cash.out += a;
        } else {
          const from = person(people, e.from);
          const to = person(people, e.to);
          if (from.heads.has(e.to)) subVia(from, e.to).paid += a; // تابع يدفع لرأسه
          else if (to.heads.has(e.from)) subVia(to, e.from).received += a; // رأس يدفع لتابعه
        }
        break;
      }
      case 'poultry.log': {
        const r = M(e.month);
        r.count++;
        r.deaths += e.deaths || 0;
        r.producedTrays += e.trays || 0;
        break;
      }
      case 'poultry.count':
        counts[e.item]?.push(e);
        break;
      default:
        break;
    }
  }

  // الشهور من أول قيد حتى آخر قيد (بلا فجوات)، مع شهور التسوية حتى الشهر الحالي للدورة الشغالة.
  const keys = [...months.keys()].sort();
  let first = keys[0] || ymOf(cycle.startDate);
  let last = keys[keys.length - 1] || first;
  if (cycle.startDate && ymOf(cycle.startDate) < first) first = ymOf(cycle.startDate);
  if (cycle.status === 'active' && cycle.settleFrom && ymOf(today) > last) last = ymOf(today);
  const monthList = monthsRange(first, last).map((m) => M(m));

  const totals = { sales: 0, opRevenue: 0, opExpenses: 0, opNet: 0, capExpenses: 0, capRevenue: 0, capNet: 0, guestCost: 0, grossExpenses, net: 0 };
  let unallocated = 0;
  for (const r of monthList) {
    r.phase = phaseOf(r.month);
    r.pre = r.phase === 'rearing';
    r.lay = r.phase === 'lay';
    r.closed = closed.has(r.month);
    r.closedInfo = closed.get(r.month) || null;
    r.opRevenue = r.pre ? 0 : r.sales;
    r.capRevenue = r.pre ? r.sales : 0;
    r.opNet = r.opRevenue - r.opExpenses;
    r.capNet = r.capRevenue - r.capExpenses;
    const st = sharesAt(shares, r.month);
    if (st) {
      const op = allocate(r.opNet, st.stakes);
      const cap = allocate(r.capNet, st.stakes);
      r.alloc = st.stakes.map((s, i) => ({ personId: s.personId, via: s.via || null, op: op[i], cap: cap[i] }));
      for (const a of r.alloc) {
        const p = person(people, a.personId);
        if (a.via) {
          const sv = subVia(p, a.via);
          sv.op += a.op;
          sv.cap += a.cap;
        } else {
          p.topOp += a.op;
          p.topCap += a.cap;
        }
      }
    } else if (r.opNet || r.capNet) {
      r.unallocated = true;
      unallocated += r.opNet + r.capNet;
    }
    for (const k of ['sales', 'opRevenue', 'opExpenses', 'opNet', 'capExpenses', 'capRevenue', 'capNet', 'guestCost']) totals[k] += r[k];
  }
  totals.net = totals.opNet + totals.capNet;
  const sumPhase = (ph) => {
    const rows = monthList.filter((r) => r.phase === ph && (r.count || ph !== 'regular'));
    return { from: rows[0]?.month || null, to: rows[rows.length - 1]?.month || null, months: rows.length, revenue: rows.reduce((a, r) => a + r.opRevenue, 0), expenses: rows.reduce((a, r) => a + r.opExpenses, 0), capExpenses: rows.reduce((a, r) => a + r.capExpenses, 0), net: rows.reduce((a, r) => a + r.opNet + r.capNet, 0) };
  };
  totals.lay = sumPhase('lay');
  totals.regular = sumPhase('regular');

  // الأرصدة
  for (const p of people.values()) {
    p.withHeads = [...p.subVia.entries()].map(([head, v]) => ({ head, ...v, results: v.op + v.cap, balance: v.paid - v.received + v.op + v.cap }));
    p.topResults = p.topOp + p.topCap;
  }
  for (const p of people.values()) {
    const subsBal = [...people.values()].flatMap((q) => q.withHeads.filter((w) => w.head === p.personId).map((w) => ({ personId: q.personId, ...w })));
    p.subAccounts = subsBal; // ما يدين به p لكل تابع
    p.subsResults = subsBal.reduce((s, w) => s + w.results, 0);
    p.sideBalance = p.paidCycle - p.receivedCycle + p.topResults + p.subsResults - p.guestCost; // ما تدين به الدورة لناحية p
    p.owedToSubs = subsBal.reduce((s, w) => s + w.balance, 0);
    p.owedByHeads = p.withHeads.reduce((s, w) => s + w.balance, 0);
    p.ownBalance = p.sideBalance - p.owedToSubs + p.owedByHeads; // صافي ما يخص p شخصياً
    p.results = p.topResults + p.withHeads.reduce((s, w) => s + w.results, 0);
  }

  const pool = cash.in - cash.out + cash.sales - cash.expenses;
  const lastShares = shares[shares.length - 1] || null;
  const current = sharesAt(shares, ymOf(today)) || lastShares;
  const manager = cycle.managerId ? people.get(cycle.managerId) || null : null;

  // جرد النقدية عند المدير: الفرق بين ما يقوله وما يجب أن يكون معه حتى تاريخ الجرد.
  const cashChecks = counts.cash.map((c) => {
    let expected = 0;
    for (const e of entries) {
      if (e.date > c.date) continue;
      if (e.kind === 'poultry.sale') expected += e.amount;
      else if (e.kind === 'poultry.expense') expected -= e.amount;
      else if (e.kind === 'poultry.payment') expected += e.to === 'cycle' ? e.amount : e.from === 'cycle' ? -e.amount : 0;
    }
    return { date: c.date, reported: c.amount, expected, diff: c.amount - expected, note: c.note || '' };
  });

  // عدد الطيور: آخر جرد (أو العدد الأول) − النافق − المباع بعده.
  const birdsTimeline = () => {
    const base = counts.birds.length ? counts.birds[counts.birds.length - 1] : null;
    const fromDate = base ? base.date : cycle.startDate;
    let n = base ? base.qty : (cycle.birds || 0) * QTY;
    for (const e of entries) {
      if (e.date <= fromDate && base) continue;
      if (e.kind === 'poultry.log') n -= (e.deaths || 0) * QTY;
      if (e.kind === 'poultry.sale' && e.product === 'birds') n -= e.qty || 0;
    }
    return { now: Math.max(0, Math.round(n / QTY)), base: base ? { date: base.date, qty: base.qty / QTY } : null };
  };

  const end = cycle.endDate || today;
  const days = cycle.startDate ? Math.max(0, daysBetween(cycle.startDate, end)) : 0;
  return {
    cycle,
    entries,
    shares,
    currentShares: current,
    guests,
    months: monthList,
    totals,
    people,
    manager,
    cash: { ...cash, pool },
    cashChecks,
    birds: birdsTimeline(),
    unallocated,
    days,
    ageDays: (cycle.ageDays || 0) + days,
    kpis: cycleKpis(monthList, totals, days),
  };
}

// تجميع شهور متتالية في «فترة» واحدة بنفس شكل الشهر (لفترة البشاير والتأسيس وأي فترة).
export function aggregateMonths(rows) {
  const out = blankMonth(rows[0]?.month || '');
  out.from = rows[0]?.month || null;
  out.to = rows[rows.length - 1]?.month || null;
  out.months = rows.map((r) => r.month);
  out.phase = rows[0]?.phase || 'regular';
  out.pre = rows.every((r) => r.pre);
  out.lay = rows.every((r) => r.lay);
  out.closed = rows.length > 0 && rows.every((r) => r.closed);
  out.anyClosed = rows.some((r) => r.closed);
  out.closedInfo = rows.find((r) => r.closedInfo)?.closedInfo || null;
  const alloc = new Map();
  for (const r of rows) {
    for (const k of ['sales', 'expensesOurs', 'capExpenses', 'opExpenses', 'guestCost', 'opRevenue', 'capRevenue', 'opNet', 'capNet', 'deaths', 'producedTrays', 'count']) out[k] += r[k];
    out.eggs.qty += r.eggs.qty;
    out.eggs.amount += r.eggs.amount;
    for (const [g, v] of Object.entries(r.eggs.byGrade)) {
      const t = (out.eggs.byGrade[g] ||= { qty: 0, amount: 0 });
      t.qty += v.qty;
      t.amount += v.amount;
    }
    for (const p of ['manure', 'bags', 'birds', 'other']) for (const [k, v] of Object.entries(r[p])) out[p][k] = (out[p][k] || 0) + v;
    for (const [c, v] of Object.entries(r.byCategory)) {
      const t = (out.byCategory[c] ||= { amount: 0, gross: 0, qty: 0, qtyGross: 0 });
      for (const k of Object.keys(t)) t[k] += v[k] || 0;
    }
    for (const [pid, v] of Object.entries(r.guestBy)) out.guestBy[pid] = (out.guestBy[pid] || 0) + v;
    for (const a of r.alloc) {
      const key = `${a.personId}|${a.via || ''}`;
      const t = alloc.get(key) || { personId: a.personId, via: a.via, op: 0, cap: 0 };
      t.op += a.op;
      t.cap += a.cap;
      alloc.set(key, t);
    }
  }
  out.alloc = [...alloc.values()];
  return out;
}

// مؤشرات شهر واحد.
export function monthKpis(r) {
  const trays = r.eggs.qty; // ×1000
  const feed = r.byCategory.feed || { amount: 0, gross: 0, qty: 0, qtyGross: 0 };
  return {
    trays,
    eggAvg: trays ? mulDiv(r.eggs.amount, QTY, trays) : null, // متوسط سعر الطبق (قرش)
    costPerTray: trays && !r.pre ? mulDiv(r.opExpenses, QTY, trays) : null, // تكلفة الطبق التشغيلية = سعر التعادل
    feedQty: feed.qty, // طن ×1000 (= كيلو)
    feedAmount: feed.gross,
    feedAvg: feed.qty ? mulDiv(feed.qtyGross, QTY, feed.qty) : null, // متوسط سعر الطن
    feedPerTray: trays && feed.qty ? feed.qty / (trays / QTY) : null, // كيلو علف لكل طبق (الطن ×1000 = كيلو)
    trayPerDay: trays ? trays / QTY / daysInMonth(r.month) : null,
    margin: r.opRevenue ? r.opNet / r.opRevenue : null,
  };
}

function cycleKpis(months, totals, days) {
  const settled = months.filter((r) => r.phase === 'regular' && r.count);
  let breakEven = null;
  for (const r of months.filter((x) => !x.pre && x.count))
    if (r.opRevenue > 0 && r.opNet >= 0) {
      breakEven = r.month;
      break;
    }
  let cum = 0;
  let payback = null;
  for (const r of months) {
    cum += r.opNet + r.capNet;
    if (!r.pre && cum >= 0 && payback === null && totals.capExpenses > 0) payback = r.month;
  }
  const capital = totals.capExpenses - totals.capRevenue;
  const roi = capital > 0 ? totals.net / capital : null;
  const avg = settled.length ? settled.reduce((a, r) => a + r.opNet + r.capNet, 0) / settled.length : null;
  const toRecover = Math.max(0, -totals.net); // المتبقي لاسترداد رأس المال (قبل بيع القطيع)
  return {
    capital,
    roi,
    annualRoi: roi !== null && days > 30 ? (roi * 365) / days : null,
    // للدورة الشغالة: عائد الشهر المنتظم على رأس المال، والمدة المتوقعة للاسترداد بمتوسط الشهور
    monthlyReturn: capital > 0 && avg !== null ? avg / capital : null,
    toRecover,
    monthsToRecover: toRecover && avg > 0 ? toRecover / avg : null,
    breakEven,
    payback,
    settledMonths: settled.length,
    avgMonthlyNet: settled.length ? Math.round(settled.reduce((a, r) => a + r.opNet + r.capNet, 0) / settled.length) : null,
    margin: totals.regular.revenue ? totals.regular.net / totals.regular.revenue : null,
  };
}

// مؤشرات فترة يختارها المستخدم (من/إلى شهر الحساب).
export function periodStats(data, from, to) {
  const rows = data.months.filter((r) => r.month >= from && r.month <= to && r.count);
  const out = { months: rows.length, days: 0, trays: 0, eggs: 0, sales: 0, opRevenue: 0, opExpenses: 0, opNet: 0, capNet: 0, feedQty: 0, feedQtyAmount: 0, feedAmount: 0, deaths: 0, byCategory: {}, byGrade: {} };
  for (const r of rows) {
    out.days += daysInMonth(r.month);
    out.trays += r.eggs.qty;
    out.eggs += r.eggs.amount;
    out.sales += r.sales;
    out.opRevenue += r.opRevenue;
    out.opExpenses += r.opExpenses;
    out.opNet += r.opNet;
    out.capNet += r.capNet;
    out.deaths += r.deaths;
    const f = r.byCategory.feed;
    if (f) {
      out.feedQty += f.qty;
      out.feedQtyAmount += f.qtyGross;
      out.feedAmount += f.gross;
    }
    for (const [k, v] of Object.entries(r.byCategory)) out.byCategory[k] = (out.byCategory[k] || 0) + v.amount;
    for (const [k, v] of Object.entries(r.eggs.byGrade)) {
      const g = (out.byGrade[k] ||= { qty: 0, amount: 0 });
      g.qty += v.qty;
      g.amount += v.amount;
    }
  }
  out.eggAvg = out.trays ? mulDiv(out.eggs, QTY, out.trays) : null;
  out.feedAvg = out.feedQty ? mulDiv(out.feedQtyAmount, QTY, out.feedQty) : null;
  out.costPerTray = out.trays ? mulDiv(out.opExpenses, QTY, out.trays) : null;
  out.traysPerDay = out.days ? out.trays / QTY / out.days : null;
  out.feedPerTray = out.trays && out.feedQty ? out.feedQty / (out.trays / QTY) : null;
  out.avgMonthlyNet = rows.length ? Math.round(out.opNet / rows.length) : null;
  out.avgMonthlyFeed = rows.length ? Math.round(out.feedQty / rows.length) : null;
  out.avgMonthlyTrays = rows.length ? Math.round(out.trays / rows.length) : null;
  return out;
}

// كشف حساب شخص في دورة: الدفعات + نصيبه الشهري، برصيد تراكمي.
export function personStatement(data, personId, { head = null } = {}) {
  const lines = [];
  for (const e of data.entries) {
    if (e.kind !== 'poultry.payment') continue;
    if (head) {
      if (e.from === personId && e.to === head) lines.push({ date: e.date, kind: 'paid', amount: e.amount, entry: e });
      else if (e.from === head && e.to === personId) lines.push({ date: e.date, kind: 'received', amount: -e.amount, entry: e });
    } else {
      if (e.from === personId && e.to === 'cycle') lines.push({ date: e.date, kind: 'paid', amount: e.amount, entry: e });
      else if (e.from === 'cycle' && e.to === personId) lines.push({ date: e.date, kind: 'received', amount: -e.amount, entry: e });
    }
  }
  for (const r of data.months) {
    let op = 0;
    let cap = 0;
    for (const a of r.alloc) {
      const mine = head ? a.personId === personId && a.via === head : (a.personId === personId && !a.via) || a.via === personId;
      if (mine) {
        op += a.op;
        cap += a.cap;
      }
    }
    if (op || cap) lines.push({ date: `${r.month}-28`, month: r.month, kind: r.pre ? 'capital' : r.lay ? 'lay' : 'month', amount: op + cap, op, cap });
  }
  if (!head) for (const r of data.months) if (r.guestBy[personId]) lines.push({ date: `${r.month}-28`, month: r.month, kind: 'guest', amount: -r.guestBy[personId] });
  lines.sort((a, b) => cmp(a.date, b.date));
  let bal = 0;
  for (const l of lines) l.balance = bal += l.amount;
  return lines;
}

export const nextMonthOf = (ym) => addMonths(ym, 1);
