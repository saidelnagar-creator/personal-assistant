// وحدة الأمانات: أمانة {dir: held (عندي لحد) | placed (أمانتي عند حد), personId, date, place?, dueDate?, items[]}.
// كل حاجة: ذهب (القطعة، العيار، الوزن، العدد — أو وصف بس)، فلوس (العملة والمبلغ)، ورق/مستند، أو حاجة تانية.
// القيد: ترجيع (trust.return) لكل الحاجات أو جزء منها؛ الباقي محسوب ولا يُخزَّن.
import { entity } from '../../engine.js';
import { formatUnits } from '../../money.js';
import { check, isDate, isId, nonEmpty, todayISO } from '../../util.js';
import { ME } from '../common.js';
import { KARATS, MONEY_RULES, TRUST_DIRS, TRUST_TYPES } from '../money/config.js';
import { unitInfo } from '../money/units.js';
import { dueLevel, remindDaysOf } from '../money/prices.js';
import { allTrusts, returnedOf, trustData } from './calc.js';

const posInt = (x) => Number.isSafeInteger(x) && x > 0;
const optNonNeg = (x) => x === undefined || x === null || (Number.isSafeInteger(x) && x >= 0);
const shortText = (s, max) => s === undefined || s === null || (typeof s === 'string' && s.length <= max);
const personName = (s, id) => entity(s, 'person', id)?.name || '؟';

// وصف قصير لحاجة: «غويشة عيار 21 — 15.5 جم» / «2 جنيه ذهب» / «5,000 دولار» / «قايمة منقولات».
export function itemText(it, { count = null, amount = null } = {}) {
  if (it.type === 'money') {
    const u = unitInfo(it.unit || 'EGP');
    return `${formatUnits(amount ?? it.amount, u.scale)} ${u.kind === 'egp' ? 'ج' : u.short}${it.name ? ` (${it.name})` : ''}`;
  }
  const n = count ?? it.count ?? 1;
  const parts = [`${n > 1 ? `${n} ` : ''}${it.name || TRUST_TYPES[it.type]}`];
  if (it.type === 'gold' && it.karat) parts.push(`عيار ${it.karat}`);
  if (it.weight) parts.push(`(${formatUnits(count === null ? it.weight : Math.round((it.weight * n) / (it.count || 1)), 1000)} جم)`);
  return parts.join(' ') + (it.desc ? ` — ${it.desc}` : '');
}

function validateItem(it) {
  check(it && isId(it.id) && TRUST_TYPES[it.type], 'حاجة غير صالحة في الأمانة');
  check(shortText(it.name, 80) && shortText(it.desc, 200), 'الوصف طويل');
  if (it.type === 'money') {
    const u = unitInfo(it.unit || 'EGP');
    check(u && (u.kind === 'egp' || u.kind === 'cur'), 'اختر العملة');
    check(posInt(it.amount), 'اكتب مبلغ الفلوس');
    return;
  }
  check(nonEmpty(it.name) || nonEmpty(it.desc), `اكتب ${it.type === 'gold' ? 'القطعة (غويشة، خاتم…)' : it.type === 'doc' ? 'نوع الورقة (عقد، قايمة…)' : 'الحاجة إيه'}`);
  check(posInt(it.count || 1) && (it.count || 1) <= 10000, 'العدد غير صالح');
  check(optNonNeg(it.weight), 'الوزن غير صالح');
  check(optNonNeg(it.value), 'القيمة التقديرية غير صالحة');
  if (it.type === 'gold') check(it.karat === undefined || it.karat === null || KARATS.includes(it.karat), 'العيار غير صالح');
}

export default {
  id: 'trusts',
  name: 'الأمانات',
  entities: {
    trust: {
      label: 'أمانة',
      validate: (s, x, prev) => {
        check(TRUST_DIRS[x.dir], 'اختر: أمانة عندي ولا أمانتي عند حد');
        check(entity(s, 'person', x.personId) && x.personId !== ME, `اختر ${x.dir === 'placed' ? 'اللي سايبها عنده' : 'صاحب الأمانة'}`);
        check(isDate(x.date), 'اكتب اتحفظت امتى');
        check(!x.dueDate || isDate(x.dueDate), 'ميعاد الرجوع غير صالح');
        check(shortText(x.place, 80) && shortText(x.note, 500), 'الوصف طويل');
        const items = x.items || [];
        check(Array.isArray(items) && items.length >= 1 && items.length <= MONEY_RULES.maxTrustItems, 'ضيف حاجة واحدة على الأقل في الأمانة');
        check(new Set(items.map((i) => i.id)).size === items.length, 'حاجات مكررة');
        for (const it of items) validateItem(it);
        if (prev) {
          const back = returnedOf(s, x.id);
          for (const [id, r] of Object.entries(back)) {
            const it = items.find((i) => i.id === id);
            const old = (prev.items || []).find((i) => i.id === id);
            check(it, `«${old ? itemText(old) : 'حاجة'}» رجع منها جزء — مينفعش تتشال من الأمانة`);
            check(it.type === 'money' ? it.amount >= r.amount : (it.count || 1) >= r.count, `«${itemText(it)}» أقل من اللي رجع منها`);
          }
        }
      },
    },
  },
  entries: {
    // ترجيع كل الأمانة أو جزء: لكل حاجة العدد (أو المبلغ للفلوس).
    'trust.return': {
      label: 'ترجيع أمانة',
      validate: (s, e) => {
        const t = entity(s, 'trust', e.trustId);
        check(t, 'الأمانة غير موجودة');
        check(Array.isArray(e.items) && e.items.length >= 1, 'اختر اللي رجع');
        check(new Set(e.items.map((x) => x.itemId)).size === e.items.length, 'حاجات مكررة');
        check(shortText(e.receivedBy, 80), 'الاسم طويل');
        const back = returnedOf(s, t.id, e.id);
        for (const x of e.items) {
          const it = (t.items || []).find((i) => i.id === x.itemId);
          check(it, 'حاجة غير موجودة في الأمانة');
          const r = back[it.id] || { count: 0, amount: 0 };
          if (it.type === 'money') {
            check(posInt(x.amount), `اكتب المبلغ اللي رجع من «${itemText(it)}»`);
            check(r.amount + x.amount <= it.amount, `اللي رجع من «${itemText(it)}» أكبر من الباقي`);
          } else {
            check(posInt(x.count), `اكتب العدد اللي رجع من «${itemText(it)}»`);
            check(r.count + x.count <= (it.count || 1), `اللي رجع من «${itemText(it)}» أكبر من الباقي`);
          }
        }
      },
      describe: (s, e) => {
        const t = entity(s, 'trust', e.trustId);
        const names = (e.items || []).map((x) => {
          const it = t?.items?.find((i) => i.id === x.itemId);
          return it ? itemText(it, { count: x.count ?? null, amount: x.amount ?? null }) : '؟';
        });
        const who = personName(s, t?.personId);
        const text = names.length > 2 ? `${names.slice(0, 2).join('، ')} +${names.length - 2}` : names.join('، ');
        return { title: t?.dir === 'placed' ? `استرجعت أمانتي من ${who}: ${text}` : `رجّعت أمانة ${who}: ${text}`, amount: 0, sign: 0, tag: 'trust' };
      },
    },
  },

  reminders(state, today) {
    const out = [];
    const days = remindDaysOf(state);
    for (const t of allTrusts(state)) {
      if (!t.dueDate) continue;
      const d = trustData(state, t.id, today);
      if (d.status === 'returned') continue;
      const level = dueLevel(t.dueDate, today, days);
      if (!level) continue;
      const who = personName(state, t.personId);
      out.push({ id: `trust-${t.id}-${t.dueDate}`, due: t.dueDate, title: t.dir === 'placed' ? `ميعاد رجوع أمانتي من ${who}` : `ميعاد ترجيع أمانة ${who}`, level, href: `#/trust/${t.id}` });
    }
    return out;
  },

  // أمانتي عند حد = ليّ عند الغير (بقيمتها الحالية). أمانة حد عندي = للعرض فقط (مش ملكي ومش دين عليّ).
  finance(state, today = todayISO()) {
    const out = [];
    for (const t of allTrusts(state)) {
      const d = trustData(state, t.id, today);
      if (d.status === 'returned') continue;
      const who = personName(state, t.personId);
      const extra = d.unvalued ? ' — جزء بدون سعر' : '';
      if (t.dir === 'placed') out.push({ section: 'الأمانات', label: `أمانتي عند ${who}${extra}`, kind: 'receivable', amount: d.valueNow, href: `#/trust/${t.id}`, personId: t.personId });
      else out.push({ section: 'الأمانات', label: `أمانة ${who} عندي${extra}`, kind: 'held', amount: d.valueNow, href: `#/trust/${t.id}` });
    }
    return out;
  },
};
