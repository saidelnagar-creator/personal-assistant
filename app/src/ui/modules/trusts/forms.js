// نماذج الأمانات: الأمانة وحاجاتها (ذهب بالقطعة والعيار والوزن والعدد، فلوس، ورق، حاجة تانية)، والترجيع (كله أو جزء).
import { h } from '../../dom.js';
import { ctx, F } from '../../ctx.js';
import { chips, dateInput, errorBox, field, intInput, moneyInput, openSheet, qtyInput, selectInput, textArea, textInput, toast } from '../../components.js';
import { commitEntry, personPicker, saveButton } from '../../forms-common.js';
import { entity } from '../../../core/engine.js';
import { ValidationError, newId } from '../../../core/util.js';
import { DOC_TYPES, GOLD_PIECES, KARATS, TRUST_DIRS, TRUST_TYPES } from '../../../core/modules/money/config.js';
import { itemText } from '../../../core/modules/trusts/index.js';
import { trustData } from '../../../core/modules/trusts/calc.js';
import { unitSelect } from '../money/fmt.js';

const need = (c, m) => {
  if (!c) throw new ValidationError(m);
};
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ''));

export function trustForm({ trust = null, dir = 'held', personId = '' } = {}) {
  openSheet(trust ? 'تعديل الأمانة' : 'أمانة جديدة', (body, close) => {
    const err = errorBox();
    let d = trust?.dir || dir;
    const person = personPicker(trust?.personId || personId, { placeholder: 'اختر…' });
    const personField = field('صاحب الأمانة', person);
    const date = dateInput(trust?.date);
    const place = textInput(trust?.place || '', 'اختياري: فين محفوظة (الدولاب، الخزنة، البنك…)');
    const due = h('input', { type: 'date', value: trust?.dueDate || '' });
    const note = textArea(trust?.note || '');
    const linesBox = h('div', { class: 'lines' });
    const lines = [];
    const addLine = (it = null) => {
      const L = { id: it?.id || newId('it_') };
      const type = selectInput(Object.entries(TRUST_TYPES).map(([value, label]) => ({ value, label })), it?.type || 'gold');
      type.setAttribute('aria-label', 'النوع');
      const name = textInput(it?.name || '');
      name.setAttribute('aria-label', 'الحاجة');
      const karat = selectInput([{ value: '', label: 'العيار؟' }, ...KARATS.map((k) => ({ value: String(k), label: `عيار ${k}` }))], it?.karat ? String(it.karat) : '21');
      karat.setAttribute('aria-label', 'العيار');
      const weight = qtyInput(it?.weight ?? null);
      weight.placeholder = 'الوزن بالجرام';
      weight.setAttribute('aria-label', 'الوزن بالجرام');
      const count = intInput(String(it?.count ?? 1));
      count.setAttribute('aria-label', 'العدد');
      const count2 = intInput(String(it?.count ?? 1));
      count2.setAttribute('aria-label', 'العدد');
      const cur = unitSelect(it?.unit || 'EGP', { moneyOnly: true });
      cur.setAttribute('aria-label', 'العملة');
      const amount = moneyInput(it?.amount ?? null);
      amount.placeholder = 'المبلغ';
      amount.setAttribute('aria-label', 'المبلغ');
      const value = moneyInput(it?.value ?? null);
      value.placeholder = 'قيمة تقديرية (اختياري)';
      value.setAttribute('aria-label', 'قيمة تقديرية');
      const desc = textInput(it?.desc || '', 'وصف (اختياري): بفص، مكتوب عليها…');
      desc.setAttribute('aria-label', 'الوصف');
      const goldRow = h('div', { class: 'grid3' }, karat, weight, count);
      const moneyRow = h('div', { class: 'grid2' }, cur, amount);
      const otherRow = h('div', { class: 'grid2' }, count2, value);
      const sync = () => {
        const t = type.value;
        name.setAttribute('list', t === 'gold' ? 'trust-gold' : t === 'doc' ? 'trust-docs' : '');
        name.placeholder = { gold: 'القطعة: غويشة، خاتم، سبيكة، جنيه ذهب…', money: 'اختياري: وصف (مثلاً في ظرف)', doc: 'الورقة: عقد، قايمة منقولات، شيك…', other: 'الحاجة إيه' }[t];
        goldRow.style.display = t === 'gold' ? '' : 'none';
        moneyRow.style.display = t === 'money' ? '' : 'none';
        otherRow.style.display = t === 'doc' || t === 'other' ? '' : 'none';
      };
      type.addEventListener('change', sync);
      const line = h('div', { class: 'line' }, type, name, goldRow, moneyRow, otherRow, desc, h('button', { type: 'button', class: 'rm', 'aria-label': 'حذف', text: '×', onclick: () => (lines.splice(lines.indexOf(L), 1), line.remove()) }));
      Object.assign(L, { type, name, karat, weight, count, count2, cur, amount, value, desc });
      lines.push(L);
      linesBox.append(line);
      sync();
    };
    for (const it of trust?.items || []) addLine(it);
    if (!trust) addLine();
    const syncDir = () => {
      personField.querySelector('label').textContent = d === 'placed' ? 'سايبها عند مين' : 'صاحب الأمانة';
    };
    body.append(
      err,
      chips(
        Object.entries(TRUST_DIRS).map(([value, label]) => ({ value, label })),
        d,
        (v) => {
          d = v;
          syncDir();
        },
      ),
      personField,
      field('اتحفظت امتى', date),
      field('المكان', place),
      h('div', { class: 'field' }, h('div', { class: 'label', text: 'الحاجات' }), h('div', { class: 'hint', text: 'ذهب: القطعة والعيار والوزن والعدد (أو وصف بس / وزن بس). فلوس: العملة والمبلغ. ورق: نوعه ووصفه.' }), linesBox, h('button', { type: 'button', class: 'btn small', text: '+ حاجة', onclick: () => addLine() })),
      h('datalist', { id: 'trust-gold' }, GOLD_PIECES.map((x) => h('option', { value: x }))),
      h('datalist', { id: 'trust-docs' }, DOC_TYPES.map((x) => h('option', { value: x }))),
      field('ميعاد الرجوع (اختياري)', due, 'لو متفقين على ميعاد — التطبيق يفكّرك قبله'),
      field('ملاحظة', note),
      saveButton(
        'حفظ',
        async () => {
          need(person.value, 'اختر الشخص');
          need(lines.length, 'ضيف حاجة واحدة على الأقل');
          const items = lines.map((L, i) => {
            const t = L.type.value;
            const n = L.name.value.trim();
            const ds = L.desc.value.trim();
            if (t === 'money') {
              const v = L.amount.units();
              need(v > 0, `اكتب مبلغ الحاجة ${F.num(i + 1)}`);
              return clean({ id: L.id, type: t, unit: L.cur.value, amount: v, name: n, desc: ds });
            }
            const c = (t === 'gold' ? L.count : L.count2).int();
            need(Number.isInteger(c) && c >= 1, `العدد في الحاجة ${F.num(i + 1)} غير صالح`);
            need(n || ds, `اكتب الحاجة ${F.num(i + 1)} إيه`);
            const w = L.weight.value.trim() === '' ? undefined : L.weight.units();
            need(w === undefined || (w !== null && w >= 0), `الوزن في الحاجة ${F.num(i + 1)} غير صالح`);
            const v = L.value.value.trim() === '' ? undefined : L.value.units();
            return clean({ id: L.id, type: t, name: n, desc: ds, count: c, ...(t === 'gold' ? { karat: L.karat.value ? Number(L.karat.value) : undefined, weight: w } : { value: v }) });
          });
          const item = clean({ id: trust?.id || newId('tr_'), dir: d, personId: person.value, date: date.value || ctx.today(), place: place.value.trim() || null, dueDate: due.value || null, note: note.value.trim() || null, items });
          await ctx.store.run((b) => b.upsert('trust', item));
          toast('تم الحفظ');
          close();
          if (!trust) ctx.nav(`#/trust/${item.id}`);
        },
        err,
      ),
      trust
        ? h('button', {
            class: 'btn block',
            style: { marginTop: '8px' },
            text: trust.archived ? 'إلغاء الأرشفة' : 'أرشفة (إخفاء من القوائم)',
            onclick: async () => {
              await ctx.store.run((b) => b.upsert('trust', { id: trust.id, archived: !trust.archived }));
              toast('تم');
              close();
            },
          })
        : null,
    );
    syncDir();
  });
}

// ---------- الترجيع ----------
export function returnForm(trustId, entry = null) {
  const d = trustData(ctx.state, trustId, ctx.today());
  const t = d.trust;
  openSheet(entry ? 'تعديل الترجيع' : t.dir === 'placed' ? 'استرجعت' : 'رجّعت الأمانة', (body, close) => {
    const err = errorBox();
    const prev = new Map((entry?.items || []).map((x) => [x.itemId, x]));
    const rows = d.items
      .filter((it) => !it.done || prev.has(it.id))
      .map((it) => {
        const p = prev.get(it.id);
        const max = it.type === 'money' ? it.remainingAmount + (p?.amount || 0) : it.remainingCount + (p?.count || 0);
        const cb = h('input', { type: 'checkbox', checked: entry ? !!p : true });
        cb.setAttribute('aria-label', itemText(it));
        const n = it.type === 'money' ? moneyInput(p?.amount ?? max) : intInput(String(p?.count ?? max));
        n.setAttribute('aria-label', `الراجع من ${itemText(it)}`);
        const el = h('label', { class: 'row' }, cb, h('div', { class: 'main' }, h('div', { class: 'title wrap', text: itemText(it) }), h('div', { class: 'subtitle', text: it.type === 'money' ? 'المبلغ اللي رجع' : `العدد اللي رجع (من ${F.num(max)})` })), n);
        return { it, cb, n, el };
      });
    const date = dateInput(entry?.date);
    const by = textInput(entry?.receivedBy || '', 'اختياري: مين استلم');
    const note = textInput(entry?.note || '', 'اختياري');
    body.append(
      err,
      rows.length ? h('div', { class: 'list pick-list' }, rows.map((r) => r.el)) : h('p', { text: 'كل الحاجات رجعت.' }),
      field('التاريخ', date),
      field('اللي استلم', by),
      field('ملاحظة', note),
      saveButton(
        'حفظ',
        async () => {
          const items = rows
            .filter((r) => r.cb.checked)
            .map((r) => {
              if (r.it.type === 'money') {
                const v = r.n.units();
                need(v > 0, `اكتب المبلغ اللي رجع من «${itemText(r.it)}»`);
                return { itemId: r.it.id, amount: v };
              }
              const c = r.n.int();
              need(Number.isInteger(c) && c >= 1, `اكتب العدد اللي رجع من «${itemText(r.it)}»`);
              return { itemId: r.it.id, count: c };
            });
          need(items.length, 'علّم اللي رجع');
          if (await commitEntry(clean({ kind: 'trust.return', trustId, date: date.value || ctx.today(), items, receivedBy: by.value.trim(), note: note.value.trim() }), entry)) {
            toast('تم التسجيل');
            close();
          }
        },
        err,
      ),
    );
  });
}

export const trustOf = (id) => entity(ctx.state, 'trust', id);
