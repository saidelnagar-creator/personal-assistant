// مطابقة الاستيراد مع ملف الإكسيل الحقيقي — تعمل فقط إن وُجد input/farm-extracted.json (خارج git)، وإلا تُتخطى.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { reconcile } from '../../tools/import-excel.mjs';

const SRC = new URL('../../input/farm-extracted.json', import.meta.url);
const CFG = new URL('../../input/import-config.json', import.meta.url);

test('مطابقة أرقام دورة الدواجن مع الإكسيل', { skip: !existsSync(SRC) && 'لا يوجد input/farm-extracted.json' }, () => {
  const config = existsSync(CFG) ? JSON.parse(readFileSync(CFG, 'utf8')) : {};
  const { checks } = reconcile(JSON.parse(readFileSync(SRC, 'utf8')), config);
  for (const c of checks) assert.ok(c.ok, `${c.label}: التطبيق ${c.app} ≠ الإكسيل ${c.excel}`);
});
