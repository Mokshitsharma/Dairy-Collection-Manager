import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { query, where } from 'firebase/firestore';
import { col, deleteEntry, saveEntry, useLive, useSuppliers } from '../lib/data';
import { lookupRate } from '../lib/rates';
import {
  dateLong, defaultShift, fat as fmtFat, money, qty, quantity, round2, shiftLabel, todayISO,
} from '../lib/format';

const blank = { liters: '', ml: '', fat: '', rate: '', rateTouched: false, notes: '' };

export default function DailyEntry() {
  const suppliers = useSuppliers();
  const active = suppliers.data.filter((s) => s.status !== 'inactive');

  const [date, setDate] = useState(todayISO);
  const [shift, setShift] = useState(defaultShift);
  const [supplierId, setSupplierId] = useState('');
  const [f, setF] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(null);
  const [flashId, setFlashId] = useState(null);
  const litersRef = useRef(null);

  const day = useLive(() => query(col.entries, where('date', '==', date)), [date]);
  const register = useMemo(
    () => day.data.filter((e) => e.shift === shift).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)),
    [day.data, shift],
  );
  const entered = useMemo(() => new Set(register.map((e) => e.supplierId)), [register]);
  const pending = active.filter((s) => !entered.has(s.id));

  // Pick the first supplier still pending once suppliers load.
  useEffect(() => {
    if (!supplierId && active.length) setSupplierId((pending[0] || active[0]).id);
  }, [active.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const supplier = suppliers.byId[supplierId];
  const q = quantity(f.liters, f.ml);
  const fatNum = Number(f.fat);
  const chart = lookupRate(supplier?.rateChart, fatNum);
  const rate = f.rateTouched ? Number(f.rate) : chart.rate;
  const amount = q > 0 && rate > 0 ? round2(q * rate) : null;
  const duplicate = supplier && register.some((e) => e.supplierId === supplier.id && e.id !== editing?.id);

  const set = (k) => (ev) => setF((s) => ({ ...s, [k]: ev.target.value }));

  function reset() {
    setF(blank);
    setEditing(null);
    setError('');
  }

  function submit(ev) {
    ev.preventDefault();
    setError('');
    if (!supplier) return setError('Choose a supplier.');
    if (!(q > 0)) return setError('Enter the quantity.');
    if (Number(f.ml) >= 1000) return setError('Milliliters must be under 1000.');
    if (!(fatNum > 0 && fatNum < 15)) return setError('Enter a fat % between 0 and 15.');
    if (!(rate > 0)) return setError(supplier.rateChart?.length ? 'Enter a rate.' : 'This supplier has no rate chart — enter the rate manually.');

    const overridden = f.rateTouched && round2(rate) !== chart.rate;
    const { id, write } = saveEntry(editing?.id, {
      supplierId: supplier.id,
      date,
      shift,
      liters: f.liters,
      ml: f.ml,
      quantity: q,
      fat: Math.round(fatNum * 10) / 10,
      rate: round2(rate),
      chartRate: chart.rate,
      rateOverridden: overridden,
      amount,
      notes: f.notes.trim(),
    });
    write.catch((err) => setError(`Not saved: ${err.message}`));

    setSaved({ name: supplier.name, q, amount, updated: !!editing });
    setFlashId(id);
    setTimeout(() => setSaved(null), 2400);
    setTimeout(() => setFlashId(null), 1600);

    if (!editing) {
      // Move on to the next supplier who hasn't been entered for this shift.
      const order = active.map((s) => s.id);
      const done = new Set([...entered, supplier.id]);
      const start = order.indexOf(supplier.id);
      const next = [...order.slice(start + 1), ...order.slice(0, start)].find((sid) => !done.has(sid));
      if (next) setSupplierId(next);
    }
    reset();
    litersRef.current?.focus();
  }

  function edit(e) {
    setEditing(e);
    setSupplierId(e.supplierId);
    setF({
      liters: String(e.liters || ''),
      ml: e.ml ? String(e.ml) : '',
      fat: String(e.fat),
      rate: e.rate.toFixed(2),
      rateTouched: !!e.rateOverridden,
      notes: e.notes || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function remove(e) {
    const name = suppliers.byId[e.supplierId]?.name || 'this supplier';
    if (!window.confirm(`Delete ${qty(e.quantity)} L entry for ${name}?`)) return;
    if (editing?.id === e.id) reset();
    await deleteEntry(e.id).catch((err) => setError(err.message));
  }

  const totals = register.reduce(
    (t, e) => ({ q: t.q + e.quantity, amt: t.amt + e.amount, fatQ: t.fatQ + e.fat * e.quantity }),
    { q: 0, amt: 0, fatQ: 0 },
  );

  if (!suppliers.loading && !active.length) {
    return (
      <section>
        <h1>Daily entry</h1>
        <p className="muted">No active suppliers yet. <Link to="/suppliers/new">Add a supplier</Link> with a rate chart first.</p>
      </section>
    );
  }

  return (
    <div className="entry-layout">
      <section className="entry-form">
        <h1>{editing ? 'Edit entry' : 'Daily entry'}</h1>

        <form onSubmit={submit} autoComplete="off" noValidate>
          <div className="row-2">
            <label className="field">
              <span>Date</span>
              <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} disabled={!!editing} />
            </label>
            <div className="field">
              <span>Shift</span>
              <div className="segmented" role="radiogroup" aria-label="Shift">
                {['morning', 'evening'].map((s) => (
                  <button
                    key={s} type="button" role="radio" aria-checked={shift === s}
                    className={shift === s ? 'on' : ''} onClick={() => setShift(s)} disabled={!!editing}
                  >
                    {shiftLabel(s)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <label className="field">
            <span>Supplier</span>
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} disabled={!!editing}>
              {active.map((s) => (
                <option key={s.id} value={s.id}>{s.name}{entered.has(s.id) ? '  ✓' : ''}</option>
              ))}
            </select>
          </label>
          {duplicate && <p className="note warn">Already entered this shift — saving adds a second entry.</p>}

          <div className="row-3">
            <label className="field">
              <span>Liters</span>
              <input
                ref={litersRef} className="num-input" inputMode="numeric" pattern="[0-9]*" enterKeyHint="next"
                value={f.liters} onChange={(e) => setF((s) => ({ ...s, liters: e.target.value.replace(/\D/g, '') }))}
                placeholder="0"
              />
            </label>
            <label className="field">
              <span>ml</span>
              <input
                className="num-input" inputMode="numeric" pattern="[0-9]*" enterKeyHint="next" maxLength={3}
                value={f.ml} onChange={(e) => setF((s) => ({ ...s, ml: e.target.value.replace(/\D/g, '') }))}
                placeholder="000"
              />
            </label>
            <label className="field">
              <span>Fat %</span>
              <input
                className="num-input" inputMode="decimal" enterKeyHint="done"
                value={f.fat} onChange={(e) => setF((s) => ({ ...s, fat: e.target.value.replace(/[^0-9.]/g, '') }))}
                placeholder="0.0"
              />
            </label>
          </div>

          <div className="row-2 calc">
            <label className="field">
              <span>
                Rate ₹/L{' '}
                {f.rateTouched
                  ? <button type="button" className="link small" onClick={() => setF((s) => ({ ...s, rate: '', rateTouched: false }))}>use chart</button>
                  : chart.note && <em className="hint">{chart.note}</em>}
              </span>
              <input
                className={`num-input ${f.rateTouched ? 'overridden' : ''}`} inputMode="decimal"
                value={f.rateTouched ? f.rate : chart.rate != null ? chart.rate.toFixed(2) : ''}
                onChange={(e) => setF((s) => ({ ...s, rate: e.target.value.replace(/[^0-9.]/g, ''), rateTouched: true }))}
                placeholder="—"
              />
            </label>
            <div className="field readout">
              <span>Amount ₹</span>
              <output className="amount">{amount != null ? money(amount) : '—'}</output>
              <small className="muted mono">{q > 0 ? `${qty(q)} L` : ''}{q > 0 && rate > 0 ? ` × ${Number(rate).toFixed(2)}` : ''}</small>
            </div>
          </div>

          <label className="field">
            <span>Remarks</span>
            <input value={f.notes} onChange={set('notes')} placeholder="Optional" />
          </label>

          {error && <p className="error" role="alert">{error}</p>}

          <div className="actions">
            <button className={`primary big ${saved ? 'saved' : ''}`} aria-live="polite">
              {saved
                ? `${saved.updated ? 'Updated' : 'Saved'} · ${saved.name} · ₹${money(saved.amount)}`
                : editing ? 'Update entry' : 'Save entry'}
            </button>
            {editing && <button type="button" className="secondary big" onClick={reset}>Cancel</button>}
          </div>
        </form>
      </section>

      <section className="entry-register">
        <div className="section-head">
          <h2>{shiftLabel(shift)} register</h2>
          <span className="muted">{dateLong(date)}</span>
        </div>

        <table className="reg">
          <thead>
            <tr>
              <th>Supplier</th>
              <th className="num">Qty L</th>
              <th className="num">Fat %</th>
              <th className="num">Rate</th>
              <th className="num">Amount ₹</th>
              <th className="act"><span className="sr">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {register.map((e) => (
              <tr key={e.id} className={`${e.id === flashId ? 'flash' : ''} ${editing?.id === e.id ? 'editing' : ''}`}>
                <td className="lead">
                  {suppliers.byId[e.supplierId]?.name || '(deleted)'}
                  {e.notes && <div className="sub">{e.notes}</div>}
                </td>
                <td className="num" data-label="Qty L">{qty(e.quantity)}</td>
                <td className="num" data-label="Fat %">{fmtFat(e.fat)}</td>
                <td className="num" data-label="Rate">{e.rate.toFixed(2)}{e.rateOverridden && <sup title="Manual rate">m</sup>}</td>
                <td className="num strong" data-label="Amount ₹">{money(e.amount)}</td>
                <td className="act">
                  {e.settlementId
                    ? <span className="muted small">Settled</span>
                    : (
                      <>
                        <button type="button" className="link" onClick={() => edit(e)}>Edit</button>
                        <button type="button" className="link danger" onClick={() => remove(e)}>Delete</button>
                      </>
                    )}
                </td>
              </tr>
            ))}
            {!register.length && !day.loading && (
              <tr className="empty"><td colSpan={6}>No entries for this shift yet.</td></tr>
            )}
          </tbody>
          {register.length > 0 && (
            <tfoot>
              <tr>
                <td className="lead">{register.length} {register.length === 1 ? 'entry' : 'entries'}</td>
                <td className="num" data-label="Qty L">{qty(totals.q)}</td>
                <td className="num" data-label="Avg fat">{fmtFat(totals.fatQ / totals.q)}</td>
                <td className="num" data-label="Avg rate">{(totals.amt / totals.q).toFixed(2)}</td>
                <td className="num strong" data-label="Amount ₹">{money(totals.amt)}</td>
                <td className="act" />
              </tr>
            </tfoot>
          )}
        </table>

        {pending.length > 0 && register.length > 0 && (
          <p className="muted small pending">
            <strong>Not yet entered ({pending.length}):</strong> {pending.map((s) => s.name).join(', ')}
          </p>
        )}
      </section>
    </div>
  );
}
