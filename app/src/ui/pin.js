// بصمة الرقم السري: SHA-256 مملّحة ومكررة (تبطئ التخمين). تُحفظ على الجهاز فقط (meta.pin).
import { sha256 } from '../core/sha256.js';
import { newId } from '../core/util.js';

export const PIN_ITERATIONS = 8000;
export function pinHash(salt, pin, iterations = PIN_ITERATIONS) {
  let hash = sha256(`${salt}:${pin}`);
  for (let i = 0; i < iterations; i++) hash = sha256(hash + salt);
  return hash;
}
export const pinMatches = (rec, pin) => pinHash(rec.salt, pin, rec.iter ?? PIN_ITERATIONS) === rec.hash;
export const makePinRecord = (pin, salt = newId()) => ({ salt, iter: PIN_ITERATIONS, len: pin.length, hash: pinHash(salt, pin, PIN_ITERATIONS) });
