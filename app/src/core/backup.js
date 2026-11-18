// النسخ الاحتياطي: مستند JSON فيه رقم الهيكل و checksum؛ استيراد بمعاينة ودمج/استبدال.
import { APP_ID, APP_VERSION } from '../config/version.js';
import { buildState } from './engine.js';
import { SCHEMA_VERSION, migrateDoc } from './migrations/index.js';
import { sha256 } from './sha256.js';
import { ValidationError, cmp, stableStringify } from './util.js';

export const checksumOf = (schemaVersion, events) => sha256(stableStringify({ schemaVersion, events }));

export function exportDoc(sourceEvents, { now = new Date(), deviceId = null, note = '' } = {}) {
  const events = sourceEvents.slice();
  const state = buildState(events);
  return {
    app: APP_ID,
    format: 'backup',
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    exportedAt: typeof now === 'string' ? now : now.toISOString(),
    deviceId,
    note,
    counts: countsOf(state, events),
    events,
    checksum: checksumOf(SCHEMA_VERSION, events),
  };
}

export function countsOf(state, events) {
  let first = null;
  let last = null;
  let active = 0;
  for (const e of state.entries) {
    if (e.voided) continue;
    active++;
    if (!first || e.date < first) first = e.date;
    if (!last || e.date > last) last = e.date;
  }
  return { events: events.length, entries: active, voided: state.entries.length - active, people: state.entities.get('person')?.size || 0, firstDate: first, lastDate: last };
}

export function parseBackup(text) {
  let doc;
  try {
    doc = typeof text === 'string' ? JSON.parse(text) : text;
  } catch {
    throw new ValidationError('الملف ليس JSON صالحاً');
  }
  if (!doc || doc.app !== APP_ID || doc.format !== 'backup') throw new ValidationError('هذا ليس ملف نسخة احتياطية لتطبيق مساعدي');
  if (!Array.isArray(doc.events)) throw new ValidationError('ملف النسخة لا يحتوي أحداثاً');
  if (!Number.isInteger(doc.schemaVersion)) throw new ValidationError('رقم إصدار الهيكل مفقود');
  if (checksumOf(doc.schemaVersion, doc.events) !== doc.checksum) throw new ValidationError('الملف تالف أو معدَّل (checksum غير مطابق)');
  const originalVersion = doc.schemaVersion;
  const { doc: migrated, applied } = migrateDoc(doc);
  const ids = new Set();
  for (const ev of migrated.events) {
    if (!ev || typeof ev.id !== 'string' || typeof ev.type !== 'string' || typeof ev.ts !== 'string') throw new ValidationError('ملف النسخة يحتوي حدثاً غير مكتمل');
    if (ids.has(ev.id)) throw new ValidationError('ملف النسخة يحتوي أحداثاً مكررة');
    ids.add(ev.id);
  }
  return { doc: migrated, originalVersion, migrated: applied };
}

// دمج سجلين: اتحاد بالمعرّف ثم ترتيب ثابت (الوقت ثم الترتيب الأصلي).
export function mergeEvents(current, incoming) {
  const seen = new Set(current.map((e) => e.id));
  const added = incoming.filter((e) => !seen.has(e.id));
  if (!added.length) return { events: current.slice(), added: 0 };
  const events = [...current, ...added];
  const order = new Map(events.map((e, i) => [e.id, i]));
  events.sort((a, b) => cmp(a.ts, b.ts) || order.get(a.id) - order.get(b.id));
  return { events, added: added.length };
}

export function planImport(currentEvents, parsed) {
  const incoming = parsed.doc.events;
  const merged = mergeEvents(currentEvents, incoming);
  let result = null;
  let error = null;
  try {
    result = countsOf(buildState(merged.events), merged.events);
  } catch (e) {
    error = e.message;
  }
  return {
    current: countsOf(buildState(currentEvents), currentEvents),
    incoming: countsOf(buildState(incoming), incoming),
    exportedAt: parsed.doc.exportedAt,
    merge: { added: merged.added, result, error },
  };
}
