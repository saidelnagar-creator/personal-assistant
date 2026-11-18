// الحالة = fold(الأحداث). خمسة أنواع أحداث عامة فقط؛ كل قطاع (وحدة) يعرّف «أنواع» كياناته وقيوده
// داخل هذه الأحداث، فإضافة قطاع جديد لا تحتاج نوع حدث جديداً ولا ترحيل بيانات.
//   entity.upsert  { kind, item }                 إنشاء/تعديل كيان (شخص، مجموعة، دورة…) — الحقول المرسلة تحل محل القديمة
//   entry.add      { entry }                      قيد/حركة (مصروف، بيع، دفعة…) — لا يُعدَّل أبداً
//   entry.void     { entryId, reason, date, replacedBy? }   إلغاء بقيد عكسي (التعديل = إلغاء + قيد جديد يحمل replaces)
//   month.close    { scope, month, totals, note } / month.reopen { scope, month, reason }
//   settings.set   { key, value }
//   reminder.done  { reminderId, due }
import { MODULES } from './modules/index.js';

export const ENTITY_KINDS = new Map();
export const ENTRY_KINDS = new Map();
for (const mod of MODULES) {
  for (const [kind, def] of Object.entries(mod.entities || {})) ENTITY_KINDS.set(kind, { ...def, module: mod.id });
  for (const [kind, def] of Object.entries(mod.entries || {})) ENTRY_KINDS.set(kind, { ...def, module: mod.id });
}

export const DEFAULT_SETTINGS = Object.freeze({ digits: 'latin' });

export function emptyState() {
  return {
    entities: new Map(), // kind → Map(id → item)
    entries: [], // بترتيب الإضافة
    entryById: new Map(),
    closed: new Map(), // scope → Map(month → بيانات الإقفال)
    settings: { ...DEFAULT_SETTINGS },
    remindersDone: new Set(), // `${reminderId}|${due}`
    version: 0, // يزيد مع كل حدث (للذاكرة المؤقتة للحسابات)
  };
}

export function entities(state, kind) {
  let m = state.entities.get(kind);
  if (!m) state.entities.set(kind, (m = new Map()));
  return m;
}
export const entity = (state, kind, id) => (id ? entities(state, kind).get(id) || null : null);
export const listEntities = (state, kind, { archived = false } = {}) => [...entities(state, kind).values()].filter((x) => archived || !x.archived);

export const activeEntries = (state, pred = () => true) => state.entries.filter((e) => !e.voided && pred(e));

export const isClosed = (state, scope, month) => !!(scope && month && state.closed.get(scope)?.has(month));
export const closedMonths = (state, scope) => [...(state.closed.get(scope)?.keys() || [])].sort();

export function applyEvent(state, ev) {
  const d = ev.data || {};
  switch (ev.type) {
    case 'entity.upsert': {
      const m = entities(state, d.kind);
      const prev = m.get(d.item.id);
      m.set(d.item.id, { ...(prev || {}), ...d.item, createdAt: prev?.createdAt || ev.ts, updatedAt: ev.ts });
      break;
    }
    case 'entry.add': {
      const e = { ...d.entry, ts: ev.ts, voided: null };
      state.entries.push(e);
      state.entryById.set(e.id, e);
      break;
    }
    case 'entry.void': {
      const e = state.entryById.get(d.entryId);
      if (e) e.voided = { reason: d.reason || '', date: d.date || null, ts: ev.ts, replacedBy: d.replacedBy || null };
      break;
    }
    case 'month.close': {
      let m = state.closed.get(d.scope);
      if (!m) state.closed.set(d.scope, (m = new Map()));
      m.set(d.month, { totals: d.totals || null, note: d.note || '', ts: ev.ts });
      break;
    }
    case 'month.reopen':
      state.closed.get(d.scope)?.delete(d.month);
      break;
    case 'settings.set':
      state.settings[d.key] = d.value;
      break;
    case 'reminder.done':
      state.remindersDone.add(`${d.reminderId}|${d.due}`);
      break;
    default:
      throw new Error(`نوع حدث غير معروف: ${ev.type}`);
  }
  state.version++;
}

export function buildState(events) {
  const s = emptyState();
  for (const ev of events) applyEvent(s, ev);
  return s;
}

// وصف موحّد لأي قيد (للقوائم والبحث).
export function describeEntry(state, e) {
  const def = ENTRY_KINDS.get(e.kind);
  const d = def?.describe ? def.describe(state, e) : { title: def?.label || e.kind, amount: e.amount || 0, sign: 0 };
  return { label: def?.label || e.kind, ...d };
}
