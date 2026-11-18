// سلسلة ترحيلات هيكل البيانات. الإصدار 1 = أول هيكل منشور. لا تعدّل ترحيلاً منشوراً أبداً.
// إضافة نوع كيان/قيد جديد أو حقل اختياري لا تحتاج ترحيلاً؛ الترحيل فقط عندما يتغير معنى بيانات مخزّنة.
export const SCHEMA_VERSION = 1;
export const MIGRATIONS = [];

export function migrateDoc(doc, { migrations = MIGRATIONS, target = SCHEMA_VERSION } = {}) {
  let cur = { schemaVersion: doc.schemaVersion, events: doc.events };
  const applied = [];
  if (cur.schemaVersion > target) throw new Error('البيانات من إصدار أحدث من التطبيق');
  while (cur.schemaVersion < target) {
    const m = migrations.find((x) => x.from === cur.schemaVersion);
    if (!m) throw new Error(`لا يوجد ترحيل من الإصدار ${cur.schemaVersion}`);
    cur = m.migrate(cur);
    if (cur.schemaVersion !== m.to) throw new Error(`الترحيل ${m.from}→${m.to} أعاد إصداراً خاطئاً`);
    applied.push(`${m.from}→${m.to}`);
  }
  return { doc: { ...doc, ...cur }, applied };
}
