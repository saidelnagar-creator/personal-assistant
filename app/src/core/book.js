// الدفتر: مصفوفة أحداث + الحالة المشتقة. كل تغيير يمر من dispatch (تحقق ← إلحاق).
import { applyEvent, buildState } from './engine.js';
import { MODULES } from './modules/index.js';
import { validateEvent } from './validate.js';
import { ValidationError, newId } from './util.js';

export const SEED_TS = '2000-01-01T00:00:00.000Z';

// أحداث الزرع: القوائم الافتراضية بمعرّفات ثابتة (فلا تتكرر عند الدمج). كل وحدة تزرع قوائمها.
export function seedEvents() {
  const out = [];
  for (const mod of MODULES) for (const [kind, item] of mod.seeds ? mod.seeds() : []) out.push({ id: `seed-${kind}-${item.id}`, ts: SEED_TS, type: 'entity.upsert', data: { kind, item } });
  return out;
}

export class Book {
  constructor(events = []) {
    this.events = events.slice();
    this.state = buildState(this.events);
  }

  static seeded() {
    return new Book(seedEvents());
  }

  make(type, data, { now = new Date(), id = null } = {}) {
    return { id: id || newId('e'), ts: typeof now === 'string' ? now : now.toISOString(), type, data };
  }

  dispatch(type, data, opts) {
    const ev = this.make(type, data, opts);
    validateEvent(this.state, ev);
    this.events.push(ev);
    applyEvent(this.state, ev);
    return ev;
  }

  // مجموعة أحداث ككتلة واحدة: إما كلها أو لا شيء.
  dispatchAll(list, opts) {
    const start = this.events.length;
    try {
      return list.map(([type, data]) => this.dispatch(type, data, opts));
    } catch (e) {
      this.events.length = start;
      this.state = buildState(this.events);
      throw e;
    }
  }

  fork() {
    return new Book(this.events);
  }

  // ----- اختصارات -----
  upsert(kind, item, opts) {
    const it = { ...item, id: item.id || newId(kind.split('.').pop().slice(0, 3) + '_') };
    this.dispatch('entity.upsert', { kind, item: it }, opts);
    return it;
  }

  addEntry(entry, opts) {
    const e = { ...entry, id: entry.id || newId('n') };
    this.dispatch('entry.add', { entry: e }, opts);
    return e;
  }

  addEntries(list, opts) {
    const es = list.map((x) => ({ ...x, id: x.id || newId('n') }));
    this.dispatchAll(
      es.map((e) => ['entry.add', { entry: e }]),
      opts,
    );
    return es;
  }

  voidEntry(entryId, reason, date, opts) {
    return this.dispatch('entry.void', { entryId, reason: reason || '', date: date || null }, opts);
  }

  // التعديل = إلغاء القيد القديم + قيد جديد يشير إليه (سجل تدقيق كامل).
  replaceEntry(oldId, entry, reason, date, opts) {
    const old = this.state.entryById.get(oldId);
    if (!old) throw new ValidationError('القيد غير موجود');
    const e = { ...entry, id: newId('n'), replaces: oldId };
    this.dispatchAll(
      [
        ['entry.void', { entryId: oldId, reason: reason || 'تعديل', date: date || null, replacedBy: e.id }],
        ['entry.add', { entry: e }],
      ],
      opts,
    );
    return e;
  }
}
