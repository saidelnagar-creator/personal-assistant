// خصوصية العرض: إخفاء كل الأرصدة بضغطة، أو مجموعة، أو بند واحد. إعداد على الجهاز فقط (meta.privacy).
// القاعدة: إعداد البند يغلب إعداد مجموعته، وإعداد المجموعة يغلب الإعداد العام. ليس تشفيراً — الحماية قفل PIN.
import { ctx } from './ctx.js';

export const PRIVACY_GROUPS = Object.freeze({
  home: 'أرقام الرئيسية',
  poultry: 'الدواجن',
  car: 'العربية',
  money: 'السلف والجمعيات والأمانات',
  people: 'الأشخاص والأرصدة',
  finance: 'وضعي المالي',
  entries: 'الحركات',
  other: 'أخرى',
});
export const MASK = '•••••';

const EMPTY = Object.freeze({ all: 'show', groups: {}, items: {} });
let customizing = false;

export const privacyState = () => (ctx.store && ctx.store.meta.privacy) || EMPTY;
export const isCustomizing = () => customizing;
export const anyHidden = () => {
  const p = privacyState();
  return p.all === 'hide' || Object.values(p.groups).includes('hide') || Object.values(p.items).includes('hide');
};

export function isHidden(group, key = null) {
  const p = privacyState();
  if (key && p.items[key]) return p.items[key] === 'hide';
  if (group && p.groups[group]) return p.groups[group] === 'hide';
  return p.all === 'hide';
}
export const groupHidden = (group) => isHidden(group, null);

async function save(next) {
  await ctx.store.setMeta('privacy', next);
  ctx.refresh();
}

export const setAllPrivacy = (mode) => save({ all: mode, groups: {}, items: {} });
export const toggleAllPrivacy = () => setAllPrivacy(privacyState().all === 'hide' ? 'show' : 'hide');

export function toggleGroupPrivacy(group) {
  const p = privacyState();
  const next = isHidden(group) ? 'show' : 'hide';
  const groups = { ...p.groups };
  if (next === p.all) delete groups[group];
  else groups[group] = next;
  const items = Object.fromEntries(Object.entries(p.items).filter(([k]) => !k.startsWith(group + '|')));
  return save({ all: p.all, groups, items });
}

export function toggleItemPrivacy(group, key) {
  const p = privacyState();
  const next = isHidden(group, key) ? 'show' : 'hide';
  const items = { ...p.items };
  if (next === (isHidden(group) ? 'hide' : 'show')) delete items[key];
  else items[key] = next;
  return save({ all: p.all, groups: p.groups, items });
}

export function setCustomizing(v) {
  customizing = v;
  ctx.refresh();
}

export const privacyKey = (group, label) => `${group}|${String(label).trim()}`;
export const maskIf = (hidden, text) => (hidden ? MASK : text);
export const maskDigits = (text) => String(text).replace(/[\d٠-٩][\d٠-٩.,٬٫]*/g, '••');
