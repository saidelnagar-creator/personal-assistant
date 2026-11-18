#!/usr/bin/env node
// يولّد أيقونات PNG من SVG (يحتاج Playwright/Chromium المثبت). الناتج في app/icons ويُضاف للمستودع.
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../app/icons');

const svg = (pad) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#2f6b3f"/>
  <g transform="translate(256 256) scale(${pad}) translate(-256 -256)">
    <path d="M256 92c-62 0-118 104-118 190a118 118 0 0 0 236 0c0-86-56-190-118-190z" fill="#fff7e6"/>
    <path d="M196 300l42 42 84-92" fill="none" stroke="#2f6b3f" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="132" y="408" width="248" height="22" rx="11" fill="#cfe6d4"/>
  </g>
</svg>`;

const targets = [
  ['icon-192.png', 192, 1],
  ['icon-512.png', 512, 1],
  ['icon-maskable-512.png', 512, 0.78],
  ['apple-touch-icon.png', 180, 0.92],
];
const browser = await chromium.launch();
for (const [name, size, pad] of targets) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg(pad)}`);
  await page.screenshot({ path: resolve(OUT, name), clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
  console.log('wrote', name);
}
await browser.close();
