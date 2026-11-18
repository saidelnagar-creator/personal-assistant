// كل قواعد القبول/الرفض قبل إضافة أي حدث (رسائل عربية). القواعد الخاصة بكل قطاع في وحدته.
import { ENTITY_KINDS, ENTRY_KINDS, entity, isClosed } from './engine.js';
import { check, isDate, isId, isMonth, nonEmpty } from './util.js';

// نطاق الإقفال وشهر القيد (إن وُجد) من تعريف نوعه.
export function lockOf(state, e) {
  const def = ENTRY_KINDS.get(e.kind);
  return { scope: def?.scopeOf ? def.scopeOf(e) : null, months: def?.monthsOf ? def.monthsOf(state, e) : [] };
}

function checkNotLocked(state, e, verb) {
  const { scope, months } = lockOf(state, e);
  for (const m of months) check(!isClosed(state, scope, m), `لا يمكن ${verb} قيد في شهر مقفول (${m}). افتح الشهر أولاً من شاشة الشهور.`);
}

export function validateEvent(state, ev) {
  check(ev && typeof ev.type === 'string' && typeof ev.id === 'string', 'حدث غير صالح');
  const d = ev.data || {};
  switch (ev.type) {
    case 'entity.upsert': {
      const def = ENTITY_KINDS.get(d.kind);
      check(def, `نوع غير معروف: ${d.kind}`);
      check(d.item && isId(d.item.id), 'معرّف غير صالح');
      const prev = entity(state, d.kind, d.item.id);
      def.validate?.(state, { ...(prev || {}), ...d.item }, prev);
      return;
    }
    case 'entry.add': {
      const e = d.entry;
      check(e && isId(e.id), 'معرّف القيد غير صالح');
      check(!state.entryById.has(e.id), 'القيد موجود من قبل');
      const def = ENTRY_KINDS.get(e.kind);
      check(def, `نوع قيد غير معروف: ${e.kind}`);
      check(isDate(e.date), 'التاريخ غير صالح');
      if (e.month !== undefined) check(isMonth(e.month), 'شهر الحساب غير صالح');
      if (e.note !== undefined) check(typeof e.note === 'string' && e.note.length <= 500, 'الملاحظة طويلة جداً');
      if (e.replaces) {
        const old = state.entryById.get(e.replaces);
        check(old && old.voided && old.voided.replacedBy === e.id, 'التعديل يجب أن يلغي القيد القديم أولاً');
      }
      def.validate(state, e);
      checkNotLocked(state, e, 'إضافة');
      return;
    }
    case 'entry.void': {
      const e = state.entryById.get(d.entryId);
      check(e, 'القيد غير موجود');
      check(!e.voided, 'القيد ملغى من قبل');
      check(d.date === undefined || d.date === null || isDate(d.date), 'تاريخ الإلغاء غير صالح');
      checkNotLocked(state, e, 'إلغاء أو تعديل');
      ENTRY_KINDS.get(e.kind)?.validateVoid?.(state, e);
      return;
    }
    case 'month.close':
    case 'month.reopen': {
      check(nonEmpty(d.scope) && isMonth(d.month), 'الشهر غير صالح');
      const closed = isClosed(state, d.scope, d.month);
      if (ev.type === 'month.close') check(!closed, 'الشهر مقفول من قبل');
      else check(closed, 'الشهر غير مقفول');
      return;
    }
    case 'settings.set':
      check(nonEmpty(d.key), 'إعداد غير صالح');
      return;
    case 'reminder.done':
      check(entity(state, 'reminder', d.reminderId), 'التذكير غير موجود');
      check(isDate(d.due), 'تاريخ التذكير غير صالح');
      return;
    default:
      throw new Error(`نوع حدث غير معروف: ${ev.type}`);
  }
}
