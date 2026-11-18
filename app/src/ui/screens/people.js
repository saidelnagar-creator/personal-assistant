// الأشخاص: الشركاء والمدير والضيوف وكل من له تعامل، وأرصدته عبر القطاعات.
import { h } from '../dom.js';
import { ctx, F } from '../ctx.js';
import { empty, kv, list, row, sectionTitle } from '../components.js';
import { entity, listEntities } from '../../core/engine.js';
import { financeOverview } from '../../core/overview.js';
import { UI_MODULES } from '../modules/index.js';
import { people, simpleEntityForm } from '../forms-common.js';
import { textInput } from '../components.js';
import { signClass, ui } from '../widgets.js';

const phone = { key: 'phone', label: 'رقم الهاتف', make: (it) => Object.assign(textInput(it?.phone || ''), { inputMode: 'tel' }), read: (el) => el.value.trim() || undefined };

export function peopleScreen() {
  const f = ui('people', { q: '' });
  const fin = financeOverview(ctx.state);
  const balance = new Map();
  for (const it of fin.items) if (it.personId) balance.set(it.personId, (balance.get(it.personId) || 0) + (it.kind === 'payable' ? it.amount : -it.amount));
  const search = h('input', { class: 'search', type: 'search', placeholder: 'بحث بالاسم…', value: f.q, 'aria-label': 'بحث' });
  const box = h('div', {});
  const draw = () => {
    const q = search.value.trim();
    f.q = q;
    const shown = people().filter((p) => !q || p.name.includes(q));
    box.replaceChildren(shown.length ? list(shown.map((p) => row({ title: p.name, subtitle: p.phone || p.note || '', value: balance.has(p.id) ? F.money(balance.get(p.id)) : '', valueClass: signClass(-(balance.get(p.id) || 0)), onclick: () => ctx.nav(`#/person/${p.id}`) }))) : empty('لا يوجد'));
  };
  search.addEventListener('input', draw);
  draw();
  return { title: 'الأشخاص', root: true, body: h('div', {}, search, box, h('p', { class: 'muted small', text: 'الرقم بجانب الاسم = ما أدين له به (موجب) أو ما يدين لي به (سالب) في حسابات الشركاء التابعين.' })), fab: { label: 'شخص', onclick: () => simpleEntityForm('person', 'شخص', null, { extra: [phone] }) } };
}

export function personScreen({ id }) {
  const p = entity(ctx.state, 'person', id);
  if (!p) return { title: 'غير موجود', body: empty('الشخص غير موجود') };
  const sections = UI_MODULES.map((m) => (m.personRows ? m.personRows(ctx.state, id) : null)).filter(Boolean);
  return {
    title: p.name,
    subtitle: p.id === 'me' ? 'أنا' : p.phone || '',
    body: h(
      'div',
      {},
      h('div', { class: 'card' }, p.phone ? kv('الهاتف', p.phone, '', { secret: false }) : null, p.note ? kv('ملاحظة', p.note, '', { secret: false }) : null, h('button', { class: 'btn small', text: 'تعديل', onclick: () => simpleEntityForm('person', 'شخص', p, { extra: [phone] }) })),
      sectionTitle('الحسابات'),
      sections.length ? h('div', {}, sections) : empty('لا توجد حسابات لهذا الشخص بعد'),
    ),
  };
}
