// Seeds the local Firestore emulator with a few sample suppliers,
// a week of entries and one advance. Safe to re-run (skips if suppliers exist).
import { initializeApp } from 'firebase/app';
import {
  getFirestore, connectFirestoreEmulator, collection, doc, getDocs, writeBatch,
} from 'firebase/firestore';

const app = initializeApp({ apiKey: 'demo-key', projectId: 'demo-dairy' });
const db = getFirestore(app);
connectFirestoreEmulator(db, '127.0.0.1', 8080);

const existing = await getDocs(collection(db, 'suppliers'));
if (!existing.empty) {
  console.log(`${existing.size} suppliers already present; skipping sample data.`);
  process.exit(0);
}

const r2 = (n) => Math.round(n * 100) / 100;
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const chart = (base, perStep) => Array.from({ length: 36 }, (_, i) => ({
  fat: Math.round((3.0 + i * 0.1) * 10) / 10,
  rate: r2(base + i * perStep),
}));
function rateFor(c, fat) {
  const row = c.find((r) => Math.abs(r.fat - fat) < 1e-9);
  return row ? row.rate : c[c.length - 1].rate;
}

const suppliers = [
  { name: 'Barwala Collection Center', phone: '98120 44102', rateChart: chart(38, 0.6), base: 62, fat: 4.2 },
  { name: 'Gangwa Dairy Point', phone: '94160 77231', rateChart: chart(37, 0.6), base: 48, fat: 4.6 },
  { name: 'Kheri Milk Society', phone: '99960 13485', rateChart: chart(38.5, 0.65), base: 85, fat: 5.8 },
  { name: 'Ladwa Collection Center', phone: '97290 55610', rateChart: chart(38, 0.6), base: 36, fat: 3.9 },
  { name: 'Siswal Village Center', phone: '98963 20117', rateChart: chart(37.5, 0.6), base: 54, fat: 4.9 },
];

const batch = writeBatch(db);
const now = Date.now();
let seq = 0;
const ids = [];
for (const s of suppliers) {
  const ref = doc(collection(db, 'suppliers'));
  ids.push(ref.id);
  batch.set(ref, {
    name: s.name, phone: s.phone, rateChart: s.rateChart, status: 'active',
    advanceBalance: 0, createdAt: now,
  });
}

// The last 7 days (excluding today), both shifts.
for (let d = 7; d >= 1; d--) {
  const date = iso(new Date(Date.now() - d * 86400000));
  for (const shift of ['morning', 'evening']) {
    suppliers.forEach((s, i) => {
      const quantity = Math.round((s.base * (shift === 'morning' ? 0.55 : 0.45) + (Math.random() * 6 - 3)) * 2) / 2;
      const liters = Math.floor(quantity);
      const ml = Math.round((quantity - liters) * 1000);
      const fat = Math.round((s.fat + (Math.random() * 0.6 - 0.3)) * 10) / 10;
      const rate = rateFor(s.rateChart, fat);
      batch.set(doc(collection(db, 'entries')), {
        supplierId: ids[i], date, shift, liters, ml, quantity, fat, rate, chartRate: rate,
        rateOverridden: false, amount: r2(quantity * rate), notes: '', settlementId: null,
        createdAt: now + seq++,
      });
    });
  }
}

// One advance for Kheri Milk Society.
batch.set(doc(collection(db, 'advances')), {
  supplierId: ids[2], amount: 25000, emi: 2500, date: iso(new Date(Date.now() - 10 * 86400000)),
  note: 'Chiller repair', remaining: 25000, createdAt: now,
});
batch.update(doc(db, 'suppliers', ids[2]), { advanceBalance: 25000 });

await batch.commit();
console.log(`Seeded ${suppliers.length} suppliers, ${seq} entries and 1 advance.`);
process.exit(0);
