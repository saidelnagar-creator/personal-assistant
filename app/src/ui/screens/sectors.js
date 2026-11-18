// القطاعات (الوحدات) والمجموعات التي يصنعها المستخدم لتنظيم الأشياء معاً.
import { h } from '../dom.js';
import { ctx, F } from '../ctx.js';
import { badge, empty, list, row, sectionTitle } from '../components.js';
import { UI_MODULES, UPCOMING } from '../modules/index.js';
import { listEntities } from '../../core/engine.js';
import { simpleEntityForm } from '../forms-common.js';

// كل الكيانات التي يمكن ضمها لمجموعة (تُعرض داخل المجموعة).
function groupMembers(groupId) {
  const out = [];
  for (const c of listEntities(ctx.state, 'poultry.cycle')) if (c.groupId === groupId) out.push({ title: `🐔 ${c.name}`, href: `#/poultry/cycle/${c.id}` });
  return out;
}

export function sectorsScreen() {
  const groups = listEntities(ctx.state, 'group');
  return {
    title: 'القطاعات',
    root: true,
    body: h(
      'div',
      {},
      list(UI_MODULES.map((m) => row({ title: `${m.emoji} ${m.name}`, subtitle: m.summary(ctx.state), onclick: () => ctx.nav(m.href) }))),
      sectionTitle('مجموعاتي', h('button', { class: 'link', text: 'إدارة', onclick: () => ctx.nav('#/groups') })),
      groups.length
        ? list(
            groups.map((g) => {
              const members = groupMembers(g.id);
              return row({ title: `📁 ${g.name}`, subtitle: members.length ? members.map((x) => x.title).join('، ') : 'فارغة — اختر المجموعة من إعداد أي دورة', onclick: () => ctx.nav('#/groups') });
            }),
          )
        : h('p', { class: 'muted small', text: 'المجموعات تجمع أشياء من قطاعات مختلفة معاً (مثلاً «استثمارات العائلة»). أنشئ مجموعة ثم اخترها من إعداد الدورة.' }),
      sectionTitle('قريباً'),
      list(UPCOMING.map((u) => row({ title: `${u.emoji} ${u.name}`, badge: badge(`المرحلة ${F.num(u.phase)}`) }))),
    ),
  };
}

export function groupsScreen() {
  const groups = listEntities(ctx.state, 'group', { archived: true });
  return {
    title: 'المجموعات',
    body: h(
      'div',
      {},
      groups.length
        ? list(
            groups.map((g) => {
              const members = groupMembers(g.id);
              return row({ title: g.name, subtitle: g.archived ? 'مؤرشفة' : members.map((x) => x.title).join('، ') || 'فارغة', onclick: () => simpleEntityForm('group', 'مجموعة', g) });
            }),
          )
        : empty('لا توجد مجموعات'),
      h('p', { class: 'muted small', text: 'لإضافة دورة لمجموعة: افتح الدورة ← الإعداد ← تعديل بيانات الدورة ← المجموعة.' }),
    ),
    fab: { label: 'مجموعة', onclick: () => simpleEntityForm('group', 'مجموعة') },
  };
}
