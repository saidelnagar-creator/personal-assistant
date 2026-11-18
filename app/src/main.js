// نقطة التشغيل: فتح المخزن (مع ترحيل آمن إن لزم) ثم الواجهة ثم Service Worker.
import { APP_VERSION } from './config/version.js';
import { Store } from './storage/store.js';
import { startApp, showUpdateBanner } from './ui/app.js';
import { confirmDialog, toast } from './ui/components.js';
import { readCanary, readMirror, startMirror, writeCanary } from './storage/mirror.js';
import { parseBackup } from './core/backup.js';
import { seedEvents } from './core/book.js';
import { driveHandleReturn, startDriveSync } from './storage/drive-sync.js';

const bootMsg = (text, isError = false) => {
  const el = document.getElementById('boot-msg');
  if (el) {
    el.textContent = text;
    if (isError) el.style.color = 'var(--bad)';
  }
};

async function boot() {
  let store;
  try {
    store = await Store.open();
  } catch (e) {
    console.error(e);
    bootMsg(e.message || 'تعذّر فتح قاعدة البيانات', true);
    return;
  }
  try {
    if (navigator.storage?.persist) navigator.storage.persist();
  } catch {
    /* غير مدعوم */
  }
  const mirror = startMirror(store);
  if (store.isFresh) await offerRecovery(store);
  writeCanary(store);
  let driveReturned = false;
  try {
    driveReturned = await driveHandleReturn(store);
  } catch (e) {
    console.warn('drive return failed', e);
  }
  startApp(store);
  startDriveSync(store);
  if (driveReturned && store.meta.drive?.token) toast('تم الاتصال بـ Google Drive — النسخ التلقائي يعمل');
  window.__pa = { version: APP_VERSION, store, mirror }; // للتشخيص والاختبارات الآلية
  if (store.migrationInfo) toast(`تمت ترقية هيكل البيانات إلى الإصدار ${store.migrationInfo.to} (نسخة تلقائية محفوظة)`);
  registerSW();
}

// قاعدة جديدة فارغة مع وجود نسخة مرآة أو علامة تدل على بيانات سابقة ⇒ نعرض الاسترجاع.
async function offerRecovery(store) {
  const seeds = seedEvents().length;
  const doc = await readMirror();
  const canary = readCanary();
  const hasMirror = doc && Array.isArray(doc.events) && doc.events.length > seeds;
  if (!hasMirror && !(canary && canary.events > seeds)) return;
  if (!hasMirror) {
    await confirmDialog({ title: 'البيانات غير موجودة', message: `كان على هذا الجهاز ${canary.events} حدثاً ولم تعد موجودة (ربما مُسحت بيانات الموقع).\nلا توجد نسخة مرآة داخلية — استورد آخر نسخة احتياطية من: المزيد ← النسخ الاحتياطي.`, okText: 'فهمت', cancelText: 'إغلاق' });
    return;
  }
  const when = doc.exportedAt ? new Date(doc.exportedAt).toLocaleString('ar-EG') : '';
  const ok = await confirmDialog({ title: 'استرجاع البيانات؟', message: `قاعدة البيانات على الجهاز فارغة، لكن توجد نسخة مرآة داخلية (${when}) بها ${doc.counts?.entries ?? ''} قيداً.\nاسترجاعها يعيد كل شيء كما كان.`, okText: 'استرجاع', cancelText: 'بدء من جديد' });
  if (!ok) return;
  try {
    await store.importBackup(parseBackup(doc), 'replace');
    toast('تم الاسترجاع من النسخة المرآة');
  } catch (e) {
    await confirmDialog({ title: 'تعذّر الاسترجاع', message: `${e.message}\nاستورد آخر نسخة احتياطية من: المزيد ← النسخ الاحتياطي.`, okText: 'فهمت', cancelText: 'إغلاق' });
  }
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !window.__paUpdating) return;
    reloading = true;
    location.reload();
  });
  navigator.serviceWorker
    .register('./sw.js', { scope: './' })
    .then((reg) => {
      const offer = (worker) => {
        if (!worker) return;
        showUpdateBanner(() => {
          window.__paUpdating = true;
          worker.postMessage({ type: 'SKIP_WAITING' });
        });
      };
      const track = (w) => {
        if (!w) return;
        w.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w);
        });
      };
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
      track(reg.installing);
      reg.addEventListener('updatefound', () => track(reg.installing));
      if (navigator.serviceWorker.controller) reg.update().catch(() => {});
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) reg.update().catch(() => {});
      });
    })
    .catch((e) => console.warn('SW registration failed', e));
}

boot();
