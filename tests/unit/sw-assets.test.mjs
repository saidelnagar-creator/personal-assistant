// قائمة أصول الـ Service Worker محدَّثة، المسارات نسبية، لا روابط خارجية، ولا بيانات حقيقية في أي ملف متتبَّع.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { buildSwAssets, listAssets } from '../../tools/gen-sw-assets.mjs';

const ROOT = new URL('../../', import.meta.url).pathname;

test('app/sw-assets.js و بصمة sw.js محدَّثان (شغّل: npm run sw:assets)', () => {
  const expected = buildSwAssets();
  assert.equal(readFileSync(join(ROOT, 'app/sw-assets.js'), 'utf8'), expected.assets, 'ملفات app/ تغيّرت ولم يُعَد توليد sw-assets.js');
  assert.equal(readFileSync(join(ROOT, 'app/sw.js'), 'utf8'), expected.sw, 'بصمة sw.js قديمة');
});

test('كل المسارات نسبية ولا روابط خارجية إلا Google Drive في وحدتها', () => {
  const files = listAssets();
  const html = readFileSync(join(ROOT, 'app/index.html'), 'utf8');
  for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) assert.ok(m[1].startsWith('./'), `مسار غير نسبي: ${m[1]}`);
  for (const f of files.filter((x) => x.endsWith('.js'))) {
    const src = readFileSync(join(ROOT, 'app', f), 'utf8');
    for (const m of src.matchAll(/from '([^']+)'/g)) assert.ok(m[1].startsWith('.'), `استيراد غير نسبي في ${f}: ${m[1]}`);
    const allowed = f === 'src/core/drive.js' ? '|accounts\\.google\\.com/o/oauth2|www\\.googleapis\\.com/' : '';
    assert.ok(!new RegExp(`https?://(?!www\\.w3\\.org${allowed})`).test(src), `رابط خارجي في ${f}`);
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|eval\(|new Function\(/.test(src), `كود غير آمن (innerHTML/eval) في ${f}`);
  }
  const manifest = JSON.parse(readFileSync(join(ROOT, 'app/manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.start_url, './index.html');
  assert.equal(manifest.scope, './');
});

function trackedFiles() {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      if (['node_modules', '.git', 'input', 'output'].includes(name)) continue;
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(m?js|py|md|json|html|css|webmanifest|ya?ml)$/.test(name) && name !== 'package-lock.json') out.push(p);
    }
  };
  walk(ROOT);
  return out;
}

test('لا أرقام هواتف ولا ملفات بيانات في الملفات المتتبَّعة', () => {
  for (const f of trackedFiles()) {
    const src = readFileSync(f, 'utf8');
    assert.ok(!/\b01[0125]\d{8}\b/.test(src), `رقم هاتف محتمل في ${f}`);
  }
  const ignore = readFileSync(join(ROOT, '.gitignore'), 'utf8');
  for (const p of ['input/', 'output/', '*.xlsx']) assert.ok(ignore.includes(p), `.gitignore لا يستثني ${p}`);
});

// إن وُجد ملف الإكسيل المستخرج محلياً: لا يظهر أي اسم منه أو من إعداد الاستيراد في أي ملف متتبَّع.
test('لا أسماء من بيانات الإكسيل الحقيقية في الكود أو التوثيق', { skip: !existsSync(join(ROOT, 'input/farm-extracted.json')) && 'لا توجد بيانات محلية' }, () => {
  const ex = JSON.parse(readFileSync(join(ROOT, 'input/farm-extracted.json'), 'utf8'));
  const names = new Set();
  const personal = ex.sheets.find((s) => s.name.trim() === 'حساباتي');
  if (personal) for (const c of Object.values(personal.cells)) if (typeof c.v === 'string' && [1, 4, 10, 14].includes(c.c) && c.v.trim().length >= 3) names.add(c.v.trim());
  const cfgPath = join(ROOT, 'input/import-config.json');
  if (existsSync(cfgPath)) for (const [k, v] of Object.entries(JSON.parse(readFileSync(cfgPath, 'utf8')))) if (/Name$/.test(k) && typeof v === 'string') names.add(v.trim());
  const generic = new Set(['الأسر', 'الدرج', 'الوجبات', 'الأضحية', 'متطلبات', 'مصاريف الأسرة', 'عيدين', 'حساب البنك']);
  for (const f of trackedFiles()) {
    const src = readFileSync(f, 'utf8');
    for (const n of names) {
      if (generic.has(n)) continue;
      const word = new RegExp(`(^|[^\u0600-\u06FF])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\u0600-\u06FF]|$)`); // كلمة كاملة لا جزء كلمة
      assert.ok(!word.test(src), `اسم من البيانات الحقيقية «${n}» في ${f}`);
    }
  }
});
