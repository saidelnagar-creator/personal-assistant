// حسابات الأمانات: الباقي من كل حاجة بعد الترجيع (بالعدد، أو بالمبلغ للفلوس)، الوزن الباقي بالتناسب،
// والقيمة الحالية بأسعار اليوم (الذهب بالوزن والعيار، الجنيهات الذهب بالعدد، العملات بسعرها، والباقي بقيمته التقديرية).
import { entity, listEntities } from '../../engine.js';
import { mulDiv } from '../../money.js';
import { cmp, sum } from '../../util.js';
import { valueOf } from '../money/units.js';
import { priceAt } from '../money/prices.js';

// جنيه ذهب بدون وزن: عدده × (1 أو نص أو ربع) بسعر الجنيه الذهب.
export function poundFactor(name = '') {
  if (!/جنيه/.test(name)) return 0;
  if (/ربع/.test(name)) return 250;
  if (/نص|نصف/.test(name)) return 500;
  return 1000;
}

// مفتاح السعر اللي يقيّم الحاجة (أو null).
export function itemPriceKey(it) {
  if (it.type === 'money') return it.unit && it.unit !== 'EGP' ? it.unit : null;
  if (it.type !== 'gold') return null;
  if (it.weight && it.karat) return `g${it.karat}`;
  if (!it.weight && poundFactor(it.name)) return 'gpound';
  return null;
}

export const trustReturns = (state, trustId, skipId = null) => state.entries.filter((e) => !e.voided && e.kind === 'trust.return' && e.trustId === trustId && e.id !== skipId).sort((a, b) => cmp(a.date, b.date) || cmp(a.ts, b.ts));

// المرجَّع من كل حاجة: { itemId: {count, amount} }.
export function returnedOf(state, trustId, skipId = null) {
  const out = {};
  for (const r of trustReturns(state, trustId, skipId))
    for (const x of r.items || []) {
      const o = (out[x.itemId] ||= { count: 0, amount: 0 });
      o.count += x.count || 0;
      o.amount += x.amount || 0;
    }
  return out;
}

export function itemState(state, it, back, today) {
  const ret = back || { count: 0, amount: 0 };
  let remainingCount = 0;
  let remainingAmount = 0;
  let remainingWeight = null;
  let value = null;
  const key = itemPriceKey(it);
  const price = key ? priceAt(state, key, today) : null;
  if (it.type === 'money') {
    remainingAmount = it.amount - ret.amount;
    value = valueOf(remainingAmount, it.unit || 'EGP', price?.price ?? null);
  } else {
    const count = it.count || 1;
    remainingCount = count - ret.count;
    remainingWeight = it.weight ? mulDiv(it.weight, remainingCount, count) : null;
    if (it.type === 'gold' && price) value = remainingWeight !== null && it.karat ? valueOf(remainingWeight, `g${it.karat}`, price.price) : valueOf(remainingCount * poundFactor(it.name), 'gpound', price.price);
    else if (it.value) value = mulDiv(it.value, remainingCount, count);
  }
  const done = it.type === 'money' ? remainingAmount === 0 : remainingCount === 0;
  return { ...it, returnedCount: ret.count, returnedAmount: ret.amount, remainingCount, remainingAmount, remainingWeight, value, priceKey: key, price, done, valued: value !== null, needsPrice: !!key && !price };
}

export function trustData(state, id, today) {
  const t = entity(state, 'trust', id);
  if (!t) return null;
  const back = returnedOf(state, id);
  const items = (t.items || []).map((it) => itemState(state, it, back[it.id], today));
  const left = items.filter((x) => !x.done);
  const returns = trustReturns(state, id);
  // الذهب الباقي بالوزن لكل عيار.
  const goldByKarat = {};
  for (const x of left) if (x.type === 'gold' && x.remainingWeight) goldByKarat[x.karat || 0] = (goldByKarat[x.karat || 0] || 0) + x.remainingWeight;
  return {
    trust: t,
    items,
    left,
    returns,
    status: !left.length ? 'returned' : returns.length ? 'partial' : 'active',
    valueNow: sum(left, (x) => x.value || 0),
    unvalued: left.filter((x) => !x.valued && (x.type === 'gold' || x.type === 'money')).length,
    goldByKarat,
    lastReturn: returns[returns.length - 1] || null,
  };
}

export const allTrusts = (state, opts) => listEntities(state, 'trust', opts);

export function trustsOverview(state, today) {
  const rows = allTrusts(state, { archived: true })
    .map((t) => trustData(state, t.id, today))
    .sort((a, b) => cmp(b.trust.date, a.trust.date));
  return { rows, held: rows.filter((d) => d.trust.dir === 'held' && d.status !== 'returned' && !d.trust.archived), placed: rows.filter((d) => d.trust.dir === 'placed' && d.status !== 'returned' && !d.trust.archived) };
}

// مفاتيح الأسعار اللي تحتاجها الأمانات الشغالة (لتنبيه «حدّث الأسعار»).
export function trustsNeedingPrices(state, today) {
  const keys = new Set();
  for (const t of allTrusts(state)) {
    const d = trustData(state, t.id, today);
    for (const x of d.left) if (x.priceKey) keys.add(x.priceKey);
  }
  return keys;
}
