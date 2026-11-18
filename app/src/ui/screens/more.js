// المزيد: الإعدادات، القفل، القوائم (بنود المصروف وأنواع البيض)، المجموعات، النسخ، الدليل، عن التطبيق.
import { h } from '../dom.js';
import { ctx, F } from '../ctx.js';
import { checkbox, confirmDialog, empty, errorBox, field, kv, list, openSheet, row, sectionTitle, selectInput, textInput, toast, intInput } from '../components.js';
import { listEntities } from '../../core/engine.js';
import { normalizeDigits } from '../../core/money.js';
import { APP_VERSION, APP_NAME } from '../../config/version.js';
import { SCHEMA_VERSION } from '../../core/migrations/index.js';
import { RULES } from '../../config/rules.js';
import { MONEY_RULES } from '../../core/modules/money/config.js';
import { makePinRecord } from '../pin.js';
import { saveButton } from '../forms-common.js';

export function moreScreen() {
  const items = [
    ['💾 النسخ الاحتياطي', '#/backup', 'تصدير، استيراد، Google Drive'],
    ['🔔 التذكيرات', '#/reminders', 'مواعيد متكررة وتنبيهات القطاعات'],
    ['💱 الأسعار', '#/prices', 'الذهب والعملات (لقيمة السلف والأمانات)'],
    ['📁 المجموعات', '#/groups', 'تنظيم الأشياء معاً'],
    ['📋 القوائم', '#/lists', 'بنود المصروف وأنواع البيض'],
    ['⚙️ الإعدادات', '#/settings', 'القفل، الأرقام'],
    ['📖 الدليل', '#/help', 'الاستخدام، التعديل، إضافة قطاعات'],
    ['ℹ️ عن التطبيق', '#/about', `الإصدار ${APP_VERSION}`],
  ];
  return { title: 'المزيد', root: true, body: list(items.map(([t, href, s]) => row({ title: t, subtitle: s, onclick: () => ctx.nav(href) }))) };
}

function pinForm() {
  openSheet('رقم القفل', (body, close) => {
    const err = errorBox();
    const a = h('input', { type: 'password', inputMode: 'numeric', autocomplete: 'off', placeholder: '4 إلى 8 أرقام', maxLength: 8 });
    const b = h('input', { type: 'password', inputMode: 'numeric', autocomplete: 'off', placeholder: 'أعد الرقم', maxLength: 8 });
    body.append(
      err,
      field('الرقم الجديد', a),
      field('تأكيد الرقم', b),
      saveButton(
        'حفظ',
        async () => {
          const pin = normalizeDigits(a.value);
          if (!/^\d{4,8}$/.test(pin)) throw new Error('الرقم يجب أن يكون من 4 إلى 8 أرقام');
          if (pin !== normalizeDigits(b.value)) throw new Error('الرقمان غير متطابقين');
          await ctx.store.setMeta('pin', makePinRecord(pin));
          await ctx.store.setMeta('pinGuard', undefined);
          toast('تم تفعيل القفل');
          close();
          ctx.refresh();
        },
        err,
      ),
    );
  });
}

export function settingsScreen() {
  const s = ctx.state.settings;
  const digits = selectInput(
    [
      { value: 'latin', label: '123 (أرقام إنجليزية)' },
      { value: 'arab', label: '١٢٣ (أرقام عربية)' },
    ],
    s.digits || 'latin',
  );
  digits.addEventListener('change', () => ctx.store.run((b) => b.dispatch('settings.set', { key: 'digits', value: digits.value })));
  const days = intInput(String(s.backupReminderDays ?? RULES.backupReminderDays));
  days.addEventListener('change', () => {
    const v = days.int();
    if (Number.isInteger(v)) ctx.store.run((b) => b.dispatch('settings.set', { key: 'backupReminderDays', value: v }));
  });
  const remind = intInput(String(s['money.remindDays'] ?? MONEY_RULES.remindDays));
  remind.addEventListener('change', () => {
    const v = remind.int();
    if (Number.isInteger(v) && v >= 0 && v <= 60) ctx.store.run((b) => b.dispatch('settings.set', { key: 'money.remindDays', value: v }));
  });
  return {
    title: 'الإعدادات',
    body: h(
      'div',
      {},
      sectionTitle('القفل'),
      h(
        'div',
        { class: 'card' },
        kv('رقم القفل', ctx.store.meta.pin ? 'مفعّل' : 'غير مفعّل', '', { secret: false }),
        h('p', { class: 'muted small', text: `يُطلب عند الفتح وبعد ${F.num(RULES.pinLockMinutes)} دقيقة في الخلفية. فعّل أيضاً رمز الدخول و Face ID على الهاتف.` }),
        h(
          'div',
          { class: 'btn-row' },
          h('button', { class: 'btn primary', text: ctx.store.meta.pin ? 'تغيير الرقم' : 'تفعيل القفل', onclick: pinForm }),
          ctx.store.meta.pin
            ? h('button', {
                class: 'btn',
                text: 'إلغاء القفل',
                onclick: async () => {
                  if (!(await confirmDialog({ title: 'إلغاء القفل', message: 'سيفتح التطبيق بدون رقم.', okText: 'إلغاء القفل', danger: true }))) return;
                  await ctx.store.setMeta('pin', undefined);
                  toast('تم إلغاء القفل');
                  ctx.refresh();
                },
              })
            : null,
        ),
      ),
      sectionTitle('العرض'),
      field('شكل الأرقام', digits),
      field('تذكير النسخة الاحتياطية بعد (يوم)', days, '0 = إيقاف التذكير'),
      field('التذكير بالسداد وأقساط الجمعيات والقبض قبلها بـ (يوم)', remind, 'الافتراضي أسبوع'),
      h('p', { class: 'muted small', text: 'إخفاء الأرصدة: زر العين أعلى أي شاشة يخفي كل الأرقام بضغطة، وزر الضبط بجانبه يخصّص ما يُخفى.' }),
    ),
  };
}

// القوائم القابلة للتعديل: بنود المصروف وأنواع البيض (المعرّف ثابت والاسم يتغير).
function listItemForm(kind, item, { unit = false } = {}) {
  openSheet(item ? 'تعديل' : 'إضافة', (body, close) => {
    const err = errorBox();
    const name = textInput(item?.name || '');
    const u = textInput(item?.unit || '', 'مثال: طن، كيلو، شيكارة');
    const order = intInput(String(item?.order ?? 50));
    const hidden = checkbox('إخفاء من القوائم (القيود القديمة تبقى)', !!item?.archived);
    body.append(
      err,
      field('الاسم', name),
      unit ? field('وحدة الكمية (اختياري)', u, 'لو لها وحدة يظهر في النموذج: الكمية × السعر') : null,
      field('الترتيب', order),
      item ? hidden : null,
      saveButton(
        'حفظ',
        async () => {
          await ctx.store.run((b) => b.upsert(kind, { ...(item ? { id: item.id } : {}), name: name.value.trim(), ...(unit ? { unit: u.value.trim() || undefined } : {}), order: Number.isInteger(order.int()) ? order.int() : 50, archived: hidden.input.checked || undefined }));
          toast('تم الحفظ');
          close();
        },
        err,
      ),
    );
  });
}

export function listsScreen() {
  const cats = listEntities(ctx.state, 'poultry.category', { archived: true }).sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
  const grades = listEntities(ctx.state, 'poultry.grade', { archived: true }).sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
  return {
    title: 'القوائم',
    body: h(
      'div',
      {},
      sectionTitle('بنود مصروفات الدواجن', h('button', { class: 'link', text: '+ بند', onclick: () => listItemForm('poultry.category', null, { unit: true }) })),
      list(cats.map((c) => row({ title: c.name, subtitle: [c.unit ? `بالـ${c.unit}` : '', c.archived ? 'مخفي' : ''].filter(Boolean).join(' · '), onclick: () => listItemForm('poultry.category', c, { unit: true }) }))),
      sectionTitle('أنواع البيض', h('button', { class: 'link', text: '+ نوع', onclick: () => listItemForm('poultry.grade', null) })),
      list(grades.map((g) => row({ title: g.name, subtitle: g.archived ? 'مخفي' : '', onclick: () => listItemForm('poultry.grade', g) }))),
      h('p', { class: 'muted small', text: 'تغيير الاسم يظهر في كل القيود القديمة والجديدة. لا يوجد حذف حتى لا تفقد القيود القديمة معناها؛ استخدم الإخفاء.' }),
    ),
  };
}

export function aboutScreen() {
  const s = ctx.store;
  return {
    title: 'عن التطبيق',
    body: h(
      'div',
      { class: 'card' },
      kv('التطبيق', APP_NAME, '', { secret: false }),
      kv('إصدار الكود', APP_VERSION, '', { secret: false }),
      kv('إصدار هيكل البيانات', String(SCHEMA_VERSION), '', { secret: false }),
      kv('عدد الأحداث في السجل', F.num(s.events.length), '', { secret: false }),
      kv('على هذا الجهاز منذ', s.meta.createdAt ? F.dateTime(s.meta.createdAt) : '—', '', { secret: false }),
      h('p', { class: 'muted small', text: 'كل البيانات على هذا الجهاز فقط (لا خادم). تحديث التطبيق لا يمس البيانات. السجل لا يُمسح منه شيء: التعديل والإلغاء قيود جديدة.' }),
    ),
  };
}
export { empty };
