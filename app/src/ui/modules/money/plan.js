// محرر طريقة السداد: مرة واحدة في ميعاد، أقساط بجدول (توزيع بالتساوي ثم تعديل)، أو من غير ميعاد.
import { h, clear } from '../../dom.js';
import { ctx, F } from '../../ctx.js';
import { chips, field, intInput } from '../../components.js';
import { splitByWeights } from '../../../core/money.js';
import { PLAN_TYPES } from '../../../core/modules/money/config.js';
import { ValidationError } from '../../../core/util.js';
import { addMonthsToDate, unitAmountInput, uq } from './fmt.js';

const need = (c, m) => {
  if (!c) throw new ValidationError(m);
};

// getTotal: الكمية اللي هتتقسط (السلفة أو الباقي)، getUnit: نوعها.
export function planEditor({ plan = null, getTotal, getUnit, itemName = () => '' }) {
  let type = plan?.type || 'once';
  const wrap = h('div', { class: 'field' });
  const once = dateInputAt(plan?.type === 'once' ? plan.due : addMonthsToDate(ctx.today(), 1));
  const onceField = field('ميعاد السداد', once);
  const count = intInput(String(plan?.type === 'schedule' ? plan.items.length : 3));
  const first = dateInputAt(plan?.type === 'schedule' ? plan.items[0].due : addMonthsToDate(ctx.today(), 1));
  const every = intInput('1');
  const rowsBox = h('div', { class: 'lines' });
  const rows = [];
  const sumEl = h('div', { class: 'line-summary' });
  const refresh = () => {
    const t = getTotal() || 0;
    const s = rows.reduce((a, r) => a + (r.q.units() || 0), 0);
    sumEl.textContent = `مجموع الأقساط ${uq(s, getUnit(), itemName())}${t ? ` من ${uq(t, getUnit(), itemName())}` : ''}${t && s !== t ? ' — مش متساويين' : ''}`;
    sumEl.className = `line-summary ${t && s !== t ? 'neg' : ''}`;
  };
  const addRow = (due, qty) => {
    const d = dateInputAt(due);
    const q = unitAmountInput(getUnit, qty);
    d.setAttribute('aria-label', 'ميعاد القسط');
    q.setAttribute('aria-label', 'مبلغ القسط');
    q.addEventListener('input', refresh);
    const r = { d, q };
    const line = h('div', { class: 'line' }, h('div', { class: 'grid2' }, d, q), h('button', { type: 'button', class: 'rm', 'aria-label': 'حذف القسط', text: '×', onclick: () => (rows.splice(rows.indexOf(r), 1), line.remove(), refresh()) }));
    rows.push(r);
    rowsBox.append(line);
  };
  const generate = () => {
    const n = count.int();
    const step = every.int() || 1;
    const t = getTotal();
    need(Number.isInteger(n) && n >= 1 && n <= 240, 'عدد الأقساط من 1 إلى 240');
    need(t > 0, 'اكتب الكمية الأول');
    need(first.value, 'اختر ميعاد أول قسط');
    rows.length = 0;
    clear(rowsBox);
    splitByWeights(t, Array(n).fill(1)).forEach((q, i) => addRow(addMonthsToDate(first.value, i * step), q));
    refresh();
  };
  if (plan?.type === 'schedule') for (const it of plan.items) addRow(it.due, it.qty);
  const genErr = h('div', { class: 'form-error', style: { display: 'none' } });
  const scheduleBox = h(
    'div',
    {},
    h('div', { class: 'grid3' }, field('عدد الأقساط', count), field('أول قسط', first), field('كل كام شهر', every)),
    genErr,
    h('button', {
      type: 'button',
      class: 'btn small',
      text: 'وزّع بالتساوي',
      onclick: () => {
        try {
          genErr.style.display = 'none';
          generate();
        } catch (e) {
          genErr.textContent = e.message;
          genErr.style.display = '';
        }
      },
    }),
    rowsBox,
    h('button', { type: 'button', class: 'btn small', text: '+ قسط', onclick: () => (addRow(rows.length ? addMonthsToDate(rows[rows.length - 1].d.value || ctx.today(), 1) : first.value, null), refresh()) }),
    sumEl,
  );
  const openHint = h('p', { class: 'muted small', text: 'بيسدد كل ما يقدر: كل مرة سجّل اللي رجع ويتخصم من الباقي.' });
  const sync = () => {
    onceField.style.display = type === 'once' ? '' : 'none';
    scheduleBox.style.display = type === 'schedule' ? '' : 'none';
    openHint.style.display = type === 'open' ? '' : 'none';
    if (type === 'schedule' && !rows.length && getTotal() > 0) {
      try {
        generate();
      } catch {
        /* يكمّل المستخدم */
      }
    }
    refresh();
  };
  wrap.append(
    h('div', { class: 'label', text: 'السداد' }),
    chips(
      Object.entries(PLAN_TYPES).map(([value, label]) => ({ value, label })),
      type,
      (v) => {
        type = v;
        sync();
      },
    ),
    onceField,
    scheduleBox,
    openHint,
  );
  sync();
  return {
    el: wrap,
    refresh,
    read() {
      if (type === 'open') return { type: 'open' };
      if (type === 'once') {
        need(once.value, 'اختر ميعاد السداد');
        return { type: 'once', due: once.value };
      }
      need(rows.length, 'اعمل جدول الأقساط («وزّع بالتساوي»)');
      const items = rows.map((r, i) => {
        const q = r.q.units();
        need(r.d.value, `اختر ميعاد القسط ${F.num(i + 1)}`);
        need(q > 0, `اكتب مبلغ القسط ${F.num(i + 1)}`);
        return { due: r.d.value, qty: q };
      });
      const t = getTotal();
      need(!t || items.reduce((a, x) => a + x.qty, 0) <= t, 'مجموع الأقساط أكبر من السلفة');
      return { type: 'schedule', items: items.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0)) };
    },
  };
}

function dateInputAt(v) {
  return h('input', { type: 'date', value: v || ctx.today() });
}
