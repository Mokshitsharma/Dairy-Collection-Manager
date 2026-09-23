import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { round2 } from './format';

/* ---------- row mapping (database snake_case <-> app camelCase) ---------- */

const num = (v) => (v == null ? v : Number(v));
const ts = (v) => (v ? Date.parse(v) : 0);

const toSupplier = (r) => ({
  id: r.id, name: r.name, phone: r.phone, status: r.status,
  rateChart: (r.rate_chart || []).map((c) => ({ fat: Number(c.fat), rate: Number(c.rate) })),
  advanceBalance: num(r.advance_balance), createdAt: ts(r.created_at),
});

const toEntry = (r) => ({
  id: r.id, supplierId: r.supplier_id, date: r.date, shift: r.shift,
  liters: r.liters, ml: r.ml, quantity: num(r.quantity), fat: num(r.fat),
  rate: num(r.rate), chartRate: num(r.chart_rate), rateOverridden: r.rate_overridden,
  amount: num(r.amount), notes: r.notes, settlementId: r.settlement_id, createdAt: ts(r.created_at),
});

const toAdvance = (r) => ({
  id: r.id, supplierId: r.supplier_id, date: r.date, amount: num(r.amount), emi: num(r.emi),
  remaining: num(r.remaining), note: r.note, createdAt: ts(r.created_at),
});

const toSettlement = (r) => ({
  id: r.id, supplierId: r.supplier_id, from: r.from_date, to: r.to_date, date: r.paid_on,
  entryCount: r.entry_count, totalLiters: num(r.total_liters), totalAmount: num(r.total_amount),
  deducted: num(r.deducted), netPayable: num(r.net_payable), advanceBalanceAfter: num(r.advance_balance_after),
  allocations: r.allocations, note: r.note, createdAt: ts(r.created_at),
});

/* ---------- queries ---------- */

const PAGE = 1000; // PostgREST returns at most 1000 rows per request

function check({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

/** Fetch every row of a filtered query, page by page. */
async function fetchAll(table, filter = (q) => q) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const page = check(await filter(supabase.from(table).select('*')).order('id').range(from, from + PAGE - 1));
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

export const listSuppliers = async () => (await fetchAll('suppliers')).map(toSupplier);
export const listEntriesOn = async (date) => (await fetchAll('entries', (q) => q.eq('date', date))).map(toEntry);
export const listAdvances = async () => (await fetchAll('advances')).map(toAdvance);
export const listForSupplier = {
  entries: async (id) => (await fetchAll('entries', (q) => q.eq('supplier_id', id))).map(toEntry),
  advances: async (id) => (await fetchAll('advances', (q) => q.eq('supplier_id', id))).map(toAdvance),
  settlements: async (id) => (await fetchAll('settlements', (q) => q.eq('supplier_id', id))).map(toSettlement),
};

/* ---------- live data ---------- */

// Every mutation (here, or on another device via realtime) bumps this version,
// and every mounted query refetches.
let version = 0;
const listeners = new Set();
export function invalidate() {
  version += 1;
  listeners.forEach((fn) => fn(version));
}

let timer;
/** Refetch when the database changes from another device (phone at the center, PC in the office). */
export function subscribeToChanges() {
  const channel = supabase
    .channel('db-changes')
    .on('postgres_changes', { event: '*', schema: 'public' }, () => {
      clearTimeout(timer);
      timer = setTimeout(invalidate, 250);
    })
    .subscribe();
  return () => supabase.removeChannel(channel);
}

/** Run `fetcher()` now, again whenever deps change, and after any data change. */
export function useQuery(fetcher, deps) {
  const [v, setV] = useState(version);
  const [state, setState] = useState({ data: [], loading: true, error: null });
  const key = JSON.stringify(deps);
  const lastKey = useRef(key);

  useEffect(() => {
    listeners.add(setV);
    return () => listeners.delete(setV);
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Keep showing the current rows during a background refresh; clear them only when
    // the query itself changes (e.g. another date or supplier).
    const changed = lastKey.current !== key;
    lastKey.current = key;
    setState((s) => ({ data: changed ? [] : s.data, loading: true, error: null }));
    fetcher().then(
      (data) => !cancelled && setState({ data, loading: false, error: null }),
      (error) => !cancelled && setState((s) => ({ ...s, loading: false, error })),
    );
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, v]);

  return state;
}

export const SuppliersContext = createContext({ data: [], loading: true, byId: {} });
export const useSuppliers = () => useContext(SuppliersContext);

async function mutate(promise) {
  const data = check(await promise);
  invalidate();
  return data;
}

/* ---------- suppliers ---------- */

export async function saveSupplier(id, { name, phone, status, rateChart }) {
  const row = { name, phone, status, rate_chart: rateChart };
  if (id) {
    await mutate(supabase.from('suppliers').update(row).eq('id', id));
    return id;
  }
  const [created] = await mutate(supabase.from('suppliers').insert(row).select('id'));
  return created.id;
}

/* ---------- daily entries ---------- */

/** Create or update a daily entry. Quantity and amount are computed by the database. */
export async function saveEntry(id, e) {
  const row = {
    supplier_id: e.supplierId,
    date: e.date,
    shift: e.shift,
    liters: Number(e.liters) || 0,
    ml: Number(e.ml) || 0,
    fat: e.fat,
    rate: e.rate,
    chart_rate: e.chartRate ?? null,
    rate_overridden: !!e.rateOverridden,
    notes: e.notes || '',
  };
  const q = id
    ? supabase.from('entries').update(row).eq('id', id).select('*')
    : supabase.from('entries').insert(row).select('*');
  const [saved] = await mutate(q);
  return toEntry(saved);
}

export const deleteEntry = (id) => mutate(supabase.from('entries').delete().eq('id', id));

/* ---------- advances ---------- */

export const addAdvance = ({ supplierId, amount, date, emi, note }) =>
  mutate(supabase.from('advances').insert({
    supplier_id: supplierId, amount, date, emi, note: note || '', remaining: amount,
  }));

export const deleteAdvance = (a) => mutate(supabase.from('advances').delete().eq('id', a.id));

export const updateAdvanceEmi = (id, emi) => mutate(supabase.from('advances').update({ emi }).eq('id', id));

/* ---------- settlements ---------- */

/** Sum of each open advance's EMI (capped at what is left on it), capped at the period's milk amount. */
export function suggestedDeduction(advances, totalAmount) {
  const emi = advances
    .filter((a) => a.remaining > 0)
    .reduce((t, a) => t + Math.min(a.emi || 0, a.remaining), 0);
  return round2(Math.max(0, Math.min(emi, totalAmount)));
}

/** Settles every unsettled entry in the period and recovers EMI, as one database transaction. */
export const createSettlement = ({ supplierId, from, to, paidOn, deduction, note }) =>
  mutate(supabase.rpc('create_settlement', {
    p_supplier_id: supplierId, p_from: from, p_to: to, p_paid_on: paidOn, p_deduction: deduction, p_note: note || '',
  }));

export const reverseSettlement = (s) => mutate(supabase.rpc('reverse_settlement', { p_id: s.id }));

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
