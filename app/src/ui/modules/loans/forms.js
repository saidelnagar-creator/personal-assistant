// نماذج السلف: سلفة جديدة (ليّ أو عليّ) بنوعها وطريقة سدادها، زيادة، سداد (أو مسامحة)، تعديل الميعاد/الجدول،
// تحويل الباقي لنوع تاني، وتعديل البيانات.
import { h } from '../../dom.js';
import { ctx, F } from '../../ctx.js';
import { checkbox, chips, confirmDialog, dateInput, errorBox, field, moneyInput, openSheet, textArea, textInput, toast } from '../../components.js';
import { commitEntry, personPicker, saveButton } from '../../forms-common.js';
import { entity } from '../../../core/engine.js';
import { ValidationError, newId } from '../../../core/util.js';
import { LOAN_DIRS } from '../../../core/modules/money/config.js';
import { qtyForValue, unitInfo, valueOf } from '../../../core/modules/money/units.js';
import { priceAt } from '../../../core/modules/money/prices.js';
import { loanData } from '../../../core/modules/loans/calc.js';
import { egp, priceHint, unitAmountInput, unitSelect, uq } from '../money/fmt.js';
import { planEditor } from '../money/plan.js';

const need = (c, m) => {
  if (!c) throw new ValidationError(m);
};
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ''));
const dirChips = (value, onchange) => chips(Object.entries(LOAN_DIRS).map(([v, label]) => ({ value: v, label })), value, onchange);
const priceOf = (unit, date) => {
  const k = unitInfo(unit)?.priceKey;
  return k ? priceAt(ctx.state, k, date || ctx.today())?.price ?? null : null;
};
const dataOf = (id) => loanData(ctx.state, id, ctx.today());

// قيمة اختيارية بالجنيه.
function optMoney(el, msg) {
  if (el.value.trim() === '') return undefined;
  const v = el.units();
  need(v !== null && v >= 0, msg);
  return v;
}

// كتلة «اللي اتسلم فعلاً نوع تاني» + «القيمة وقتها» (مشتركة بين السلفة والزيادة).
function drawFields({ getUnit, qty, date, entry = null, onQtySuggest = null }) {
  const given = checkbox('اللي اتسلم فعلاً نوع تاني (مثلاً ذهب واتحسب عليه جنيه)', !!entry?.given);
  const gUnit = unitSelect(entry?.given?.unit || 'g21', { noItem: false });
  const gQty = unitAmountInput(() => gUnit.value, entry?.given?.qty ?? null);
  const gDesc = textInput(entry?.given?.desc || '', 'وصف (مثلاً: غويشتين وخاتم)');
  const gBox = h('div', { class: 'card' }, field('اللي اتسلم', gUnit), field('الكمية', gQty), field('وصفه', gDesc));
  const value = moneyInput(entry?.value ?? null);
  const valueHint = h('div', { class: 'hint' });
  const valueField = h('div', { class: 'field' }, h('label', { text: 'قيمتها وقتها بالجنيه' }), value, valueHint);
  value.id = `v-${newId()}`;
  valueField.querySelector('label').htmlFor = value.id;
  let valueTouched = !!entry?.value;
  let qtyTouched = !!entry;
  value.addEventListener('input', () => (valueTouched = true));
  qty.addEventListener('input', () => (qtyTouched = true));
  const sync = () => {
    const unit = getUnit();
    const u = unitInfo(unit);
    gBox.style.display = given.input.checked ? '' : 'none';
    // اقتراح الكمية من اللي اتسلم: قيمته بسعر يومه ← بنوع السلفة.
    if (given.input.checked && !qtyTouched) {
      const gv = valueOf(gQty.units() || 0, gUnit.value, priceOf(gUnit.value, date.value));
      const q = gv !== null ? qtyForValue(gv, unit, priceOf(unit, date.value)) : null;
      if (q) {
        qty.setUnits(q);
        onQtySuggest?.();
      }
    }
    valueField.style.display = u?.kind === 'egp' ? 'none' : '';
    const p = priceHint(unit, date.value);
    valueHint.textContent = u?.kind === 'item' ? 'تقدير لقيمتها (اختياري)' : p.text;
    if (!valueTouched && u?.kind !== 'egp') {
      const v = valueOf(qty.units() || 0, unit, p.price);
      value.setUnits(v || null);
    }
  };
  for (const el of [gUnit, gQty, date]) el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', sync);
  given.input.addEventListener('change', sync);
  qty.addEventListener('input', sync);
  return {
    els: [given, gBox, valueField],
    sync,
    read(unit) {
      const out = {};
      if (given.input.checked) {
        need(gUnit.value !== unit, 'اللي اتسلم من نفس نوع السلفة — شيل العلامة');
        const gq = gQty.units();
        need(gq > 0, 'اكتب كمية اللي اتسلم');
        out.given = clean({ unit: gUnit.value, qty: gq, desc: gDesc.value.trim() });
      }
      if (unitInfo(unit).kind !== 'egp') out.value = optMoney(value, 'القيمة وقتها غير صالحة');
      return out;
    },
  };
}

// ---------- سلفة جديدة ----------
export function loanForm({ dir = 'out', personId = '' } = {}) {
  openSheet('سلفة جديدة', (body, close) => {
    const err = errorBox();
    let d = dir;
    const person = personPicker(personId, { placeholder: 'اختر الشخص…' });
    const unit = unitSelect('EGP');
    const itemName = textInput('', 'مثلاً: كراسي، شاشة، موتوسيكل');
    const itemField = field('الحاجة إيه', itemName);
    const qty = unitAmountInput(() => unit.value);
    const qtyHint = h('div', { class: 'hint' });
    const qtyField = field('الكمية / المبلغ', qty);
    qtyField.append(qtyHint);
    const date = dateInput();
    const desc = textInput('', 'اختياري: سبب السلفة أو وصف الحاجة (غويشة + خاتم…)');
    const title = textInput('', 'اختياري: اسم يميزها (سلفة الجواز…)');
    const note = textArea('');
    const extra = drawFields({ getUnit: () => unit.value, qty, date, onQtySuggest: () => plan.refresh() });
    const plan = planEditor({ getTotal: () => qty.units() || 0, getUnit: () => unit.value, itemName: () => itemName.value.trim() });
    const sync = () => {
      const u = unitInfo(unit.value);
      itemField.style.display = u.kind === 'item' ? '' : 'none';
      qtyHint.textContent = { egp: 'بالجنيه', cur: `بال${u.label}`, gold: 'بالجرام (مثلاً 10.5)', gpound: 'عدد الجنيهات (نص = 0.5)', item: 'العدد' }[u.kind];
      extra.sync();
      plan.refresh();
    };
    unit.addEventListener('change', sync);
    qty.addEventListener('input', () => plan.refresh());
    body.append(
      err,
      dirChips(d, (v) => (d = v)),
      field('الشخص', person),
      field('النوع', unit),
      itemField,
      qtyField,
      field('التاريخ', date),
      field('وصف', desc),
      ...extra.els,
      plan.el,
      field('اسم مميز', title),
      field('ملاحظة', note),
      saveButton(
        'حفظ',
        async () => {
          need(person.value, 'اختر الشخص');
          const q = qty.units();
          need(q > 0, 'اكتب الكمية أو المبلغ');
          const loan = clean({ id: newId('loan_'), dir: d, personId: person.value, unit: unit.value, itemName: unit.value === 'item' ? itemName.value.trim() : undefined, title: title.value.trim(), note: note.value.trim(), plan: plan.read() });
          const draw = clean({ id: newId('n'), kind: 'loan.draw', loanId: loan.id, date: date.value || ctx.today(), qty: q, desc: desc.value.trim(), ...extra.read(unit.value) });
          await ctx.store.run((b) =>
            b.dispatchAll([
              ['entity.upsert', { kind: 'loan', item: loan }],
              ['entry.add', { entry: draw }],
            ]),
          );
          toast('تم تسجيل السلفة');
          close();
          ctx.nav(`#/loan/${loan.id}`);
        },
        err,
      ),
    );
    sync();
  });
}

// ---------- زيادة على السلفة (أو تعديل أخذ) ----------
export function drawForm(loanId, entry = null) {
  const loan = entity(ctx.state, 'loan', loanId);
  openSheet(entry ? 'تعديل السلفة' : 'زيادة على السلفة', (body, close) => {
    const err = errorBox();
    const qty = unitAmountInput(() => loan.unit, entry?.qty ?? null);
    const date = dateInput(entry?.date);
    const desc = textInput(entry?.desc || '', 'اختياري');
    const note = textInput(entry?.note || '', 'اختياري');
    const extra = drawFields({ getUnit: () => loan.unit, qty, date, entry });
    body.append(
      err,
      h('p', { class: 'muted small', text: `${loan.dir === 'out' ? 'اللي اديته' : 'اللي أخدته'} بـ${unitInfo(loan.unit).label}${loan.itemName ? ` (${loan.itemName})` : ''}. لو مرة تانية بميعاد مختلف ممكن تعمل سلفة جديدة بدل الزيادة.` }),
      field('الكمية / المبلغ', qty),
      field('التاريخ', date),
      field('وصف', desc),
      ...extra.els,
      field('ملاحظة', note),
      saveButton(
        'حفظ',
        async () => {
          const q = qty.units();
          need(q > 0, 'اكتب الكمية أو المبلغ');
          const saved = await commitEntry(clean({ kind: 'loan.draw', loanId, date: date.value || ctx.today(), qty: q, desc: desc.value.trim(), note: note.value.trim(), ...extra.read(loan.unit) }), entry);
          if (!saved) return;
          toast('تم الحفظ');
          close();
        },
        err,
      ),
    );
    extra.sync();
  });
}

// ---------- سداد (أو مسامحة) ----------
export function payForm(loanId, entry = null) {
  const d = dataOf(loanId);
  const loan = d.loan;
  const u = unitInfo(loan.unit);
  openSheet(entry ? 'تعديل السداد' : loan.dir === 'out' ? 'رجعلي جزء' : 'سددت جزء', (body, close) => {
    const err = errorBox();
    const suggest = entry ? entry.qty : d.overdueQty || d.next?.remaining || d.balance;
    const qty = unitAmountInput(() => loan.unit, suggest || null);
    const date = dateInput(entry?.date);
    const forgive = checkbox(loan.dir === 'out' ? 'مسامحة (سامحته فيه — مش فلوس رجعت)' : 'مسامحة (سامحني فيه)', !!entry?.forgive);
    const value = moneyInput(entry?.value ?? null);
    const valueHint = h('div', { class: 'hint' });
    let touched = !!entry?.value;
    value.addEventListener('input', () => (touched = true));
    const valueField = field('قيمته بالجنيه يومها (اختياري)', value);
    valueField.append(valueHint);
    const note = textInput(entry?.note || '', 'اختياري');
    const sync = () => {
      valueField.style.display = u.kind === 'egp' ? 'none' : '';
      const p = priceHint(loan.unit, date.value);
      valueHint.textContent = p.text;
      if (!touched && u.kind !== 'egp') value.setUnits(valueOf(qty.units() || 0, loan.unit, p.price) || null);
    };
    qty.addEventListener('input', sync);
    date.addEventListener('input', sync);
    body.append(
      err,
      h('div', { class: 'card' }, h('div', { class: 'muted small', text: `الباقي: ${uq(d.balance + (entry && !entry.voided ? entry.qty : 0), loan.unit, loan.itemName)}${d.next ? ` · القسط الجاي ${F.date(d.next.due)}: ${uq(d.next.remaining, loan.unit, loan.itemName)}` : ''}` })),
      field(`الكمية / المبلغ (${u.kind === 'item' ? loan.itemName : u.short})`, qty, 'السداد بنفس نوع السلفة. لو اتفقتوا على نوع تاني استخدم «تحويل لنوع تاني».'),
      field('التاريخ', date),
      forgive,
      valueField,
      field('ملاحظة', note),
      saveButton(
        'حفظ',
        async () => {
          const q = qty.units();
          need(q > 0, 'اكتب المسدد');
          const saved = await commitEntry(clean({ kind: 'loan.pay', loanId, date: date.value || ctx.today(), qty: q, forgive: forgive.input.checked || undefined, value: u.kind === 'egp' ? undefined : optMoney(value, 'القيمة غير صالحة'), note: note.value.trim() }), entry);
          if (!saved) return;
          toast(forgive.input.checked ? 'تم تسجيل المسامحة' : 'تم تسجيل السداد');
          close();
        },
        err,
      ),
    );
    sync();
  });
}

// ---------- ميعاد/جدول السداد للباقي ----------
export function planForm(loanId) {
  const d = dataOf(loanId);
  const base = d.paid + d.forgiven;
  openSheet('ميعاد السداد', (body, close) => {
    const err = errorBox();
    const plan = planEditor({ plan: d.loan.plan, getTotal: () => d.drawn - base, getUnit: () => d.loan.unit, itemName: () => d.loan.itemName || '' });
    body.append(
      err,
      base ? h('p', { class: 'muted small', text: `اتسدد ${uq(base, d.loan.unit, d.loan.itemName)} قبل كده — الجدول هنا للباقي (${uq(d.drawn - base, d.loan.unit, d.loan.itemName)}).` }) : null,
      plan.el,
      saveButton(
        'حفظ',
        async () => {
          const p = plan.read();
          await ctx.store.run((b) => b.upsert('loan', { id: loanId, plan: base ? { ...p, base } : p }));
          toast('تم الحفظ');
          close();
        },
        err,
      ),
    );
  });
}

// ---------- تحويل الباقي لنوع تاني ----------
export function convertForm(loanId) {
  const d = dataOf(loanId);
  const loan = d.loan;
  openSheet('تحويل لنوع تاني', (body, close) => {
    const err = errorBox();
    const to = unitSelect(loan.unit === 'EGP' ? 'g21' : 'EGP', { exclude: [loan.unit], noItem: true });
    const qty = unitAmountInput(() => to.value);
    const date = dateInput();
    const hint = h('div', { class: 'hint' });
    const qtyField = field('يبقى عليه / عليّ', qty);
    qtyField.append(hint);
    const note = textInput('', 'اختياري: الاتفاق');
    let touched = false;
    qty.addEventListener('input', () => (touched = true));
    const sync = () => {
      const v = valueOf(d.balance, loan.unit, priceOf(loan.unit, date.value));
      const q = v !== null ? qtyForValue(v, to.value, priceOf(to.value, date.value)) : null;
      hint.textContent = q ? `بأسعار ${F.date(date.value)} ≈ ${uq(q, to.value)} (قيمة ${egp(v)}) — اكتب المتفق عليه` : 'اكتب الكمية المتفق عليها (مفيش أسعار كفاية للحساب)';
      if (!touched && q) qty.setUnits(q);
    };
    to.addEventListener('change', () => ((touched = false), sync()));
    date.addEventListener('input', sync);
    body.append(
      err,
      h('p', { class: 'muted small', text: `الباقي كله (${uq(d.balance, loan.unit, loan.itemName)}) يتقفل هنا ويبدأ سلفة جديدة بنفس الشخص بالنوع الجديد. السلفة القديمة تفضل في السجل.` }),
      field('النوع الجديد', to),
      qtyField,
      field('التاريخ', date),
      field('ملاحظة', note),
      saveButton(
        'تحويل',
        async () => {
          const q = qty.units();
          need(q > 0, 'اكتب الكمية بعد التحويل');
          const ok = await confirmDialog({ title: 'تأكيد التحويل', message: `${uq(d.balance, loan.unit, loan.itemName)} ← ${uq(q, to.value)}`, okText: 'تحويل' });
          if (!ok) return;
          const id = newId('loan_');
          const v = valueOf(q, to.value, priceOf(to.value, date.value || ctx.today()));
          await ctx.store.run((b) =>
            b.dispatchAll([
              ['entity.upsert', { kind: 'loan', item: clean({ id, dir: loan.dir, personId: loan.personId, unit: to.value, title: loan.title, plan: { type: 'open' }, fromLoanId: loan.id }) }],
              ['entry.add', { entry: clean({ id: newId('n'), kind: 'loan.convert', loanId: loan.id, toLoanId: id, date: date.value || ctx.today(), fromQty: d.balance, toQty: q, value: v ?? undefined, note: note.value.trim() }) }],
            ]),
          );
          toast('تم التحويل');
          close();
          ctx.nav(`#/loan/${id}`);
        },
        err,
      ),
    );
    sync();
  });
}

// ---------- بيانات السلفة ----------
export function loanEditForm(loanId) {
  const loan = entity(ctx.state, 'loan', loanId);
  openSheet('بيانات السلفة', (body, close) => {
    const err = errorBox();
    const person = personPicker(loan.personId);
    const title = textInput(loan.title || '', 'اختياري');
    const itemName = textInput(loan.itemName || '');
    const note = textArea(loan.note || '');
    body.append(
      err,
      field('الشخص', person),
      loan.unit === 'item' ? field('الحاجة إيه', itemName) : null,
      field('اسم مميز', title),
      field('ملاحظة', note),
      saveButton(
        'حفظ',
        async () => {
          await ctx.store.run((b) => b.upsert('loan', { id: loanId, personId: person.value, title: title.value.trim() || null, note: note.value.trim() || null, ...(loan.unit === 'item' ? { itemName: itemName.value.trim() } : {}) }));
          toast('تم الحفظ');
          close();
        },
        err,
      ),
      h('button', {
        class: 'btn block',
        style: { marginTop: '8px' },
        text: loan.archived ? 'إلغاء الأرشفة' : 'أرشفة (إخفاء من القوائم والحساب)',
        onclick: async () => {
          await ctx.store.run((b) => b.upsert('loan', { id: loanId, archived: !loan.archived }));
          toast(loan.archived ? 'رجعت للقوائم' : 'تمت الأرشفة');
          close();
        },
      }),
    );
  });
}
