// الأسعار: سعر جرام الذهب بكل عيار والجنيه الذهب والعملات — يكتبها المستخدم بتاريخها (التطبيق لا يتصل بأي موقع).
import { h } from '../../dom.js';
import { ctx, F } from '../../ctx.js';
import { dateInput, errorBox, field, list, moneyInput, openSheet, row, sectionTitle, toast } from '../../components.js';
import { commitEntry, saveButton } from '../../forms-common.js';
import { entryList } from '../../widgets.js';
import { CURRENCIES } from '../../../core/modules/money/config.js';
import { PRICE_KEYS, deriveGold, priceLabel } from '../../../core/modules/money/units.js';
import { latestPrices, priceEntries, stalePriceKeys } from '../../../core/modules/money/prices.js';
import { loansOverview } from '../../../core/modules/loans/calc.js';
import { trustsNeedingPrices } from '../../../core/modules/trusts/calc.js';
import { ValidationError } from '../../../core/util.js';
import { PG } from './fmt.js';

// المفاتيح المستخدمة في سلف أو أمانات شغالة.
export function neededPriceKeys(state, today) {
  const keys = trustsNeedingPrices(state, today);
  for (const d of loansOverview(state, today).rows) if (d.status === 'active' && d.unit.priceKey) keys.add(d.unit.priceKey);
  return keys;
}

export function staleBanner() {
  const today = ctx.today();
  const stale = stalePriceKeys(ctx.state, neededPriceKeys(ctx.state, today), today);
  if (!stale.length) return null;
  return h('div', { class: 'banner info' }, h('span', { class: 'grow', text: `حدّث أسعار ${stale.map((x) => priceLabel(x.key)).join('، ')} عشان القيمة الحالية تبقى صح.` }), h('button', { class: 'btn small', text: 'الأسعار', onclick: () => priceForm() }));
}

export function pricesScreen() {
  const today = ctx.today();
  const latest = latestPrices(ctx.state, today);
  const keys = PRICE_KEYS.filter((k) => latest[k]);
  return {
    title: 'الأسعار',
    subtitle: 'الذهب والعملات',
    body: h(
      'div',
      {},
      staleBanner(),
      h('p', { class: 'muted small', text: 'اكتب سعر جرام عيار 21 (والدولار لو عندك حاجة بيه) وقت ما تحب. عيار 24 و18 والجنيه الذهب بيتحسبوا لوحدهم وتقدر تعدّلهم. القيمة الحالية لأي سلفة أو أمانة بتتحسب بآخر سعر، وقيمتها وقت السلف بسعر يومها.' }),
      sectionTitle('آخر الأسعار'),
      keys.length ? list(keys.map((k) => row({ title: priceLabel(k), subtitle: `من ${F.date(latest[k].date)}`, value: `${F.money(latest[k].price)} ج`, pg: PG, onclick: () => ctx.nav(`#/entry/${latest[k].entryId}`) }))) : h('div', { class: 'card' }, h('p', { text: 'لسه مفيش أسعار. اضغط «أسعار النهارده».' })),
      priceEntries(ctx.state).length ? [sectionTitle('السجل'), entryList(priceEntries(ctx.state))] : null,
    ),
    fab: { label: 'أسعار النهارده', onclick: () => priceForm() },
  };
}

export function priceForm(entry = null) {
  const today = ctx.today();
  const latest = latestPrices(ctx.state, today);
  openSheet(entry ? 'تعديل الأسعار' : 'أسعار النهارده', (body, close) => {
    const err = errorBox();
    const date = dateInput(entry?.date);
    const inputs = {};
    const touched = new Set(entry ? Object.keys(entry.prices) : []);
    const mk = (k) => {
      const el = moneyInput(entry?.prices?.[k] ?? null);
      if (latest[k]) el.placeholder = `آخر سعر ${F.money(latest[k].price)}`;
      el.addEventListener('input', () => touched.add(k));
      inputs[k] = el;
      return el;
    };
    for (const k of PRICE_KEYS) mk(k);
    // عيار 21 يقترح الباقي لحد ما تعدّلهم بإيدك.
    inputs.g21.addEventListener('input', () => {
      const v = inputs.g21.units();
      if (!(v > 0)) return;
      const d = deriveGold(v);
      for (const k of ['g24', 'g18', 'gpound']) if (!touched.has(k)) inputs[k].setUnits(d[k]);
    });
    const curKeys = Object.keys(CURRENCIES);
    const shownCur = curKeys.filter((k) => k === 'USD' || latest[k] || entry?.prices?.[k]);
    const moreCur = curKeys.filter((k) => !shownCur.includes(k));
    body.append(
      err,
      field('التاريخ', date),
      sectionTitle('الذهب (سعر البيع للجرام بالجنيه)'),
      field(priceLabel('g21'), inputs.g21, 'اكتبه الأول والباقي يتحسب'),
      h('div', { class: 'grid2' }, field(priceLabel('g24'), inputs.g24), field(priceLabel('g18'), inputs.g18)),
      field(priceLabel('gpound'), inputs.gpound, '8 جرام عيار 21 — عدّله لو سعره مختلف'),
      sectionTitle('العملات (بالجنيه)'),
      shownCur.map((k) => field(priceLabel(k), inputs[k])),
      moreCur.length ? h('details', { class: 'more-tasks' }, h('summary', { text: 'عملات تانية' }), moreCur.map((k) => field(priceLabel(k), inputs[k]))) : null,
      saveButton(
        'حفظ',
        async () => {
          const prices = {};
          for (const k of PRICE_KEYS) {
            if (inputs[k].value.trim() === '') continue;
            const v = inputs[k].units();
            if (!(v > 0)) throw new ValidationError(`سعر ${priceLabel(k)} غير صالح`);
            prices[k] = v;
          }
          if (!Object.keys(prices).length) throw new ValidationError('اكتب سعر واحد على الأقل');
          await commitEntry({ kind: 'money.price', date: date.value || today, prices }, entry);
          toast('تم حفظ الأسعار');
          close();
        },
        err,
      ),
    );
  });
}

