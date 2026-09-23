import { createContext, useContext, useEffect, useState } from 'react';
import {
  collection, doc, onSnapshot, query, where, setDoc, updateDoc, deleteDoc, writeBatch, increment,
} from 'firebase/firestore';
import { db } from '../firebase';
import { round2, round3 } from './format';

export const col = {
  suppliers: collection(db, 'suppliers'),
  entries: collection(db, 'entries'),
  advances: collection(db, 'advances'),
  settlements: collection(db, 'settlements'),
};

/* ---------- live queries ---------- */

/** Subscribe to a query built by `make()`; re-subscribes when deps change. `make` may return null. */
export function useLive(make, deps) {
  const [state, setState] = useState({ data: [], loading: true, error: null });
  useEffect(() => {
    const q = make();
    if (!q) {
      setState({ data: [], loading: false, error: null });
      return undefined;
    }
    setState((s) => ({ ...s, loading: true }));
    return onSnapshot(
      q,
      (snap) => setState({ data: snap.docs.map((d) => ({ id: d.id, ...d.data() })), loading: false, error: null }),
      (error) => setState({ data: [], loading: false, error }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

export const SuppliersContext = createContext({ data: [], loading: true, byId: {} });
export const useSuppliers = () => useContext(SuppliersContext);

export const bySupplier = (c, supplierId) => (supplierId ? query(c, where('supplierId', '==', supplierId)) : null);

/* ---------- suppliers ---------- */

export async function saveSupplier(id, data) {
  if (id) {
    await updateDoc(doc(db, 'suppliers', id), data);
    return id;
  }
  const ref = doc(col.suppliers);
  await setDoc(ref, { advanceBalance: 0, createdAt: Date.now(), ...data });
  return ref.id;
}

/* ---------- daily entries ---------- */

/**
 * Save (create or update) a daily entry. The caller doesn't wait for the server:
 * Firestore applies the write locally at once, so the register updates even offline.
 */
export function saveEntry(id, e) {
  const ref = id ? doc(db, 'entries', id) : doc(col.entries);
  const data = {
    supplierId: e.supplierId,
    date: e.date,
    shift: e.shift,
    liters: Number(e.liters) || 0,
    ml: Number(e.ml) || 0,
    quantity: e.quantity,
    fat: e.fat,
    rate: e.rate,
    chartRate: e.chartRate ?? null,
    rateOverridden: !!e.rateOverridden,
    amount: e.amount,
    notes: e.notes || '',
  };
  const write = id ? updateDoc(ref, data) : setDoc(ref, { ...data, settlementId: null, createdAt: Date.now() });
  return { id: ref.id, write };
}

export const deleteEntry = (id) => deleteDoc(doc(db, 'entries', id));

/* ---------- advances ---------- */

export async function addAdvance({ supplierId, amount, date, emi, note }) {
  const batch = writeBatch(db);
  batch.set(doc(col.advances), {
    supplierId, amount, date, emi, note: note || '', remaining: amount, createdAt: Date.now(),
  });
  batch.update(doc(db, 'suppliers', supplierId), { advanceBalance: increment(amount) });
  return batch.commit();
}

export async function deleteAdvance(a) {
  if (round2(a.remaining) !== round2(a.amount)) throw new Error('EMI has already been deducted from this advance.');
  const batch = writeBatch(db);
  batch.delete(doc(db, 'advances', a.id));
  batch.update(doc(db, 'suppliers', a.supplierId), { advanceBalance: increment(-a.amount) });
  return batch.commit();
}

export const updateAdvanceEmi = (id, emi) => updateDoc(doc(db, 'advances', id), { emi });

/* ---------- settlements ---------- */

const byOldest = (a, b) => a.date.localeCompare(b.date) || (a.createdAt || 0) - (b.createdAt || 0);

/** Sum of each open advance's EMI (capped at what is left on it), capped at the period's milk amount. */
export function suggestedDeduction(advances, totalAmount) {
  const emi = advances
    .filter((a) => a.remaining > 0)
    .reduce((t, a) => t + Math.min(a.emi || 0, a.remaining), 0);
  return round2(Math.max(0, Math.min(emi, totalAmount)));
}

/**
 * Split a deduction across open advances: first each advance's own EMI (oldest first),
 * then any extra goes to the oldest advances until they are cleared.
 */
export function allocateDeduction(advances, deduction) {
  const open = advances.filter((a) => a.remaining > 0).sort(byOldest);
  const alloc = new Map();
  let left = round2(deduction);
  for (const a of open) {
    const take = round2(Math.min(a.emi || 0, a.remaining, left));
    if (take > 0) { alloc.set(a.id, take); left = round2(left - take); }
  }
  for (const a of open) {
    const room = round2(a.remaining - (alloc.get(a.id) || 0));
    const take = round2(Math.min(room, left));
    if (take > 0) { alloc.set(a.id, round2((alloc.get(a.id) || 0) + take)); left = round2(left - take); }
  }
  return [...alloc.entries()].map(([advanceId, amount]) => ({ advanceId, amount }));
}

export async function createSettlement({ supplier, from, to, paidOn, entries, advances, deduction, note }) {
  if (entries.length > 450) throw new Error('Too many entries for one settlement; use a shorter period.');
  const totalLiters = round3(entries.reduce((t, e) => t + e.quantity, 0));
  const totalAmount = round2(entries.reduce((t, e) => t + e.amount, 0));
  const allocations = allocateDeduction(advances, Math.min(deduction, totalAmount));
  const deducted = round2(allocations.reduce((t, a) => t + a.amount, 0));

  const ref = doc(col.settlements);
  const batch = writeBatch(db);
  batch.set(ref, {
    supplierId: supplier.id,
    from, to, date: paidOn,
    entryCount: entries.length,
    totalLiters, totalAmount,
    deducted,
    netPayable: round2(totalAmount - deducted),
    advanceBalanceAfter: round2((supplier.advanceBalance || 0) - deducted),
    allocations,
    entryIds: entries.map((e) => e.id),
    note: note || '',
    createdAt: Date.now(),
  });
  for (const e of entries) batch.update(doc(db, 'entries', e.id), { settlementId: ref.id });
  for (const a of allocations) batch.update(doc(db, 'advances', a.advanceId), { remaining: increment(-a.amount) });
  if (deducted) batch.update(doc(db, 'suppliers', supplier.id), { advanceBalance: increment(-deducted) });
  return batch.commit();
}

/** Undo a settlement: entries become unsettled again and EMI deductions go back onto the advances. */
export async function reverseSettlement(s) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'settlements', s.id));
  for (const id of s.entryIds || []) batch.update(doc(db, 'entries', id), { settlementId: null });
  for (const a of s.allocations || []) batch.update(doc(db, 'advances', a.advanceId), { remaining: increment(a.amount) });
  if (s.deducted) batch.update(doc(db, 'suppliers', s.supplierId), { advanceBalance: increment(s.deducted) });
  return batch.commit();
}

/* ---------- ledger ---------- */

const RANK = { entry: 0, advance: 1, settlement: 2 };
const SHIFT_RANK = { morning: 0, evening: 1 };

/**
 * One chronological list of everything for a supplier, with a running balance.
 * Balance = milk credited - cash paid out (advances + settlement payouts).
 * Positive: the unit owes the supplier. Negative: the supplier owes (unrecovered advance).
 */
export function buildLedger(entries, advances, settlements) {
  const rows = [
    ...entries.map((e) => ({ kind: 'entry', key: `e${e.id}`, date: e.date, credit: e.amount, debit: 0, src: e })),
    ...advances.map((a) => ({ kind: 'advance', key: `a${a.id}`, date: a.date, credit: 0, debit: a.amount, src: a })),
    ...settlements.map((s) => ({ kind: 'settlement', key: `s${s.id}`, date: s.date, credit: 0, debit: s.netPayable, src: s })),
  ];
  rows.sort((a, b) =>
    a.date.localeCompare(b.date)
    || RANK[a.kind] - RANK[b.kind]
    || (SHIFT_RANK[a.src.shift] ?? 0) - (SHIFT_RANK[b.src.shift] ?? 0)
    || (a.src.createdAt || 0) - (b.src.createdAt || 0));
  let bal = 0;
  for (const r of rows) {
    bal = round2(bal + r.credit - r.debit);
    r.balance = bal;
  }
  return rows;
}
