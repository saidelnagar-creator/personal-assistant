#!/usr/bin/env node
// نسخة نشر يدوية (بديل GitHub Actions): output/site = محتوى app/ فقط + .nojekyll. ارفع المجلد لأي استضافة ثابتة.
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeSwAssets } from './gen-sw-assets.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(ROOT, 'output/site');
const { version } = writeSwAssets(join(ROOT, 'app'));
rmSync(SITE, { recursive: true, force: true });
mkdirSync(SITE, { recursive: true });
cpSync(join(ROOT, 'app'), SITE, { recursive: true });
writeFileSync(join(SITE, '.nojekyll'), '');
console.log(`output/site جاهز (build ${version})`);
