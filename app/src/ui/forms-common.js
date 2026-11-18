// أدوات نماذج مشتركة: اختيار شخص (مع إضافة سريعة)، الحفظ الآمن من الضغط المزدوج، إلغاء/تعديل قيد.
import { h, clear } from './dom.js';
import { ctx } from './ctx.js';
import { confirmDialog, errorBox, field, openSheet, selectInput, textInput, textArea, toast } from './components.js';
import { listEntities } from '../core/engine.js';
import { collator } from './widgets.js';

export const people = (state = ctx.state) => listEntities(state, 'person').sort((a, b) => (a.id === 'me' ? -1 : b.id === 'me' ? 1 : collator.compare(a.name, b.name)));
export const personName = (id) => (id === 'cycle' ? 'الدورة' : ctx.state.entities.get('person')?.get(id)?.name || '؟');

// قائمة أشخاص + زر «جديد» يضيف شخصاً ويختاره. ids: تقييد الاختيار بقائمة معيّنة.
export function personPicker(value = '', { ids = null, placeholder = 'اختر…', allowNew = true } = {}) {
  const wrap = h('div', { class: 'picker' });
  let sel;
  const build = (v) => {
    const opts = people()
      .filter((p) => !ids || ids.includes(p.id))
      .map((p) => ({ value: p.id, label: p.name }));
    const next = selectInput(opts, v, { placeholder });
    if (sel) sel.replaceWith(next);
    sel = next;
    wrap.select = sel;
  };
  build(value);
  wrap.append(sel);
  if (allowNew)
    wrap.append(
      h('button', {
        type: 'button',
        class: 'btn small',
        text: '+ جديد',
        onclick: async () => {
          const name = await confirmDialog({ title: 'شخص جديد', okText: 'إضافة', input: { label: 'الاسم', required: true } });
          if (!name || name === true) return;
          const { result } = await ctx.store.run((b) => b.upsert('person', { name: String(name).trim() }));
          if (ids) ids.push(result.id);
          build(result.id);
          sel.dispatchEvent(new Event('change'));
        },
      }),
    );
  Object.defineProperty(wrap, 'value', { get: () => sel.value, set: (v) => (sel.value = v) });
  wrap.onChange = (fn) => wrap.addEventListener('change', fn);
  return wrap;
}

// حفظ بزر واحد: يمنع الضغط المزدوج ويعرض الخطأ بالعربية.
export function saveButton(label, fn, err) {
  const btn = h('button', { class: 'btn primary block', text: label });
  btn.addEventListener('click', async () => {
    if (btn.disabled) return;
    btn.disabled = true;
    err.show('');
    try {
      await fn();
    } catch (e) {
      console.warn(e);
      err.show(e.message || String(e));
    } finally {
      btn.disabled = false;
    }
  });
  return btn;
}

// تنفيذ إضافة أو تعديل قيد (التعديل = إلغاء + قيد جديد مع سبب).
export async function commitEntry(entry, old = null) {
  if (old) {
    const reason = await confirmDialog({ title: 'سبب التعديل', okText: 'حفظ التعديل', input: { label: 'السبب (يظهر في سجل التدقيق)', value: 'تصحيح' } });
    if (!reason) return null;
    return (await ctx.store.run((b) => b.replaceEntry(old.id, entry, reason === true ? 'تعديل' : reason, ctx.today()))).result;
  }
  return (await ctx.store.run((b) => b.addEntry(entry))).result;
}

export async function voidEntryFlow(e) {
  const reason = await confirmDialog({ title: 'إلغاء القيد', message: 'الإلغاء لا يمسح القيد: يبقى في السجل مشطوباً ولا يدخل أي حساب.', okText: 'إلغاء القيد', danger: true, input: { label: 'السبب', required: true, requiredMessage: 'اكتب سبب الإلغاء' } });
  if (!reason) return false;
  await ctx.store.run((b) => b.voidEntry(e.id, reason, ctx.today()));
  toast('تم إلغاء القيد');
  return true;
}

// نافذة كيان بسيط (اسم + ملاحظة) لإضافة/تعديل.
export function simpleEntityForm(kind, title, item = null, { extra = [], onSaved = null } = {}) {
  openSheet(item ? `تعديل ${title}` : `${title} جديد`, (body, close) => {
    const err = errorBox();
    const name = textInput(item?.name || '');
    const note = textArea(item?.note || '');
    const extras = extra.map((x) => ({ ...x, el: x.make(item) }));
    body.append(
      err,
      field('الاسم', name),
      ...extras.map((x) => field(x.label, x.el, x.hint || '')),
      field('ملاحظة', note),
      saveButton(
        'حفظ',
        async () => {
          const data = { ...(item ? { id: item.id } : {}), name: name.value.trim(), note: note.value.trim() || undefined };
          for (const x of extras) data[x.key] = x.read(x.el);
          const { result } = await ctx.store.run((b) => b.upsert(kind, data));
          toast('تم الحفظ');
          close();
          onSaved?.(result);
        },
        err,
      ),
      item && !item.archived && item.id !== 'me'
        ? h('button', {
            class: 'btn block',
            style: { marginTop: '8px' },
            text: 'أرشفة (إخفاء من القوائم)',
            onclick: async () => {
              await ctx.store.run((b) => b.upsert(kind, { id: item.id, archived: true }));
              toast('تمت الأرشفة');
              close();
            },
          })
        : null,
      item?.archived ? h('button', { class: 'btn block', style: { marginTop: '8px' }, text: 'إلغاء الأرشفة', onclick: async () => (await ctx.store.run((b) => b.upsert(kind, { id: item.id, archived: false })), close()) }) : null,
    );
  });
}

export { clear };
