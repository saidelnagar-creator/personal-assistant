#!/usr/bin/env node
// يولّد app/sw-assets.js (قائمة كل ملفات التطبيق للتخزين المسبق) ويختم app/sw.js ببصمة تتغير مع أي تغيير في أي ملف.
// شغّله بعد أي تعديل في app/ :  npm run sw:assets   (اختبار tests/unit/sw-assets.test.mjs يفشل إن نُسي)
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '../app');
const SKIP = new Set(['sw.js', 'sw-assets.js']);

export function listAssets(dir = APP) {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else {
        const rel = relative(dir, p).split('\\').join('/');
        if (!SKIP.has(rel) && !name.startsWith('.')) out.push(rel);
      }
    }
  };
  walk(dir);
  return out;
}

const STAMP = '// build: ';

// يعيد محتوى الملفين: sw-assets.js (القائمة) و sw.js (بسطر بصمة أول).
// البصمة داخل sw.js نفسه تجعل المتصفح (ومنه Safari) يكتشف التحديث من الملف الرئيسي لا من الملف المستورد فقط.
export function buildSwAssets(dir = APP) {
  const files = listAssets(dir);
  const swBody = readFileSync(join(dir, 'sw.js'), 'utf8').replace(new RegExp(`^${STAMP}.*\n`), '');
  const hash = createHash('sha256');
  for (const f of files) hash.update(f).update(readFileSync(join(dir, f)));
  hash.update(swBody);
  const version = hash.digest('hex').slice(0, 12);
  return {
    version,
    assets: `// ملف مولَّد — لا تعدّله يدوياً. التوليد: npm run sw:assets\nself.__ASSETS_VERSION = '${version}';\nself.__ASSETS = ${JSON.stringify(['./', ...files.map((f) => './' + f)], null, 1)};\n`,
    sw: `${STAMP}${version}\n${swBody}`,
  };
}

export function writeSwAssets(dir = APP) {
  const out = buildSwAssets(dir);
  writeFileSync(join(dir, 'sw-assets.js'), out.assets);
  writeFileSync(join(dir, 'sw.js'), out.sw);
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = writeSwAssets();
  console.log(`sw-assets.js + sw.js: ${listAssets().length} files, build ${out.version}`);
}
