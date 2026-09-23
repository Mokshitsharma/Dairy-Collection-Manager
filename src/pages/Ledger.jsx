import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  buildLedger, bySupplier, col, createSettlement, reverseSettlement, suggestedDeduction, useLive, useSuppliers,
} from '../lib/data';
import {
  addDays, dateLong, dateShort, fat as fmtFat, money, qty, round2, shiftShort, toISO, todayISO,
} from '../lib/format';

function presetRange(key, lastSettledTo, firstDate) {
  const now = new Date();
  const today = todayISO();
  switch (key) {
    case 'month': return [toISO(new Date(now.getFullYear(), now.getMonth(), 1)), today];
    case 'lastmonth': return [toISO(new Date(now.getFullYear(), now.getMonth() - 1, 1)), toISO(new Date(now.getFullYear(), now.getMonth(), 0))];
    case 'unsettled': return [lastSettledTo ? addDays(lastSettledTo, 1) : firstDate || today, today];
    case 'all': return [firstDate || today, today];
    default: return [today, today];
  }
}

/** Ledger balance with Cr/Dr suffix: Cr = payable to supplier, Dr = supplier owes (advance). */
function Bal({ value }) {
  const v = round2(value);
  if (v === 0) return <span className="num-val">0.00</span>;
  return (
    <span className={v > 0 ? 'credit' : 'due'}>
      {money(Math.abs(v))}<span className="crdr">{v > 0 ? 'Cr' : 'Dr'}</span>
    </span>
  );
}

export default function Ledger() {
  const { id } = useParams();
  const navigate = useNavigate();
  const suppliers = useSuppliers();
  const supplier = id ? suppliers.byId[id] : null;

  const entries = useLive(() => bySupplier(col.entries, id), [id]);
  const advances = useLive(() => bySupplier(col.advances, id), [id]);
  const settlements = useLive(() => bySupplier(col.settlements, id), [id]);
  const loading = entries.loading || advances.loading || settlements.loading;

  const [preset, setPreset] = useState('month');
  const [range, setRange] = useState(() => presetRange('month'));
  const [from, to] = range;

  const ledger = useMemo(
    () => buildLedger(entries.data, advances.data, settlements.data),
    [entries.data, advances.data, settlements.data],
  );
  const lastSettledTo = settlements.data.reduce((m, s) => (s.to > m ? s.to : m), '');
  const firstDate = ledger[0]?.date;

  function choose(key) {
    setPreset(key);
    setRange(presetRange(key, lastSettledTo, firstDate));
  }
  const setFrom = (v) => { setPreset(''); setRange([v, to]); };
  const setTo = (v) => { setPreset(''); setRange([from, v]); };

  const before = ledger.filter((r) => r.date < from);
  const opening = before.length ? before[before.length - 1].balance : 0;
  const rows = ledger.filter((r) => r.date >= from && r.date <= to);
  const closing = rows.length ? rows[rows.length - 1].balance : opening;

  const sum = (kind, field) => round2(rows.filter((r) => r.kind === kind).reduce((t, r) => t + r[field], 0));
  const periodLiters = rows.filter((r) => r.kind === 'entry').reduce((t, r) => t + r.src.quantity, 0);
  const periodMilk = sum('entry', 'credit');
  const periodAdvances = sum('advance', 'debit');
  const periodPaid = sum('settlement', 'debit');
  const unsettledAll = round2(entries.data.filter((e) => !e.settlementId).reduce((t, e) => t + e.amount, 0));

  if (!id || !supplier) {
    return (
      <section className="narrow">
        <h1>Ledger</h1>
        {id && !suppliers.loading && <p className="error">Supplier not found.</p>}
        <label className="field">
          <span>Supplier</span>
          <select value="" onChange={(e) => navigate(`/ledger/${e.target.value}`)}>
            <option value="" disabled>Choose a supplier…</option>
            {suppliers.data.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      </section>
    );
  }

  return (
    <section>
      <div className="section-head">
        <h1>
          <select className="title-select" value={id} onChange={(e) => navigate(`/ledger/${e.target.value}`)} aria-label="Supplier">
            {suppliers.data.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </h1>
        <Link to={`/suppliers/${id}`} className="small">Supplier details</Link>
      </div>

      <dl className="figures">
        <div><dt>Balance now</dt><dd><Bal value={ledger.length ? ledger[ledger.length - 1].balance : 0} /></dd></div>
        <div><dt>Unsettled milk</dt><dd className="mono">{money(unsettledAll)}</dd></div>
        <div><dt>Advance outstanding</dt><dd className={`mono ${supplier.advanceBalance > 0 ? 'due' : ''}`}>{money(supplier.advanceBalance || 0)}</dd></div>
      </dl>

      <div className="filters">
        <div className="presets" role="group" aria-label="Period">
          {[['unsettled', 'Since last settlement'], ['month', 'This month'], ['lastmonth', 'Last month'], ['all', 'All']].map(([k, label]) => (
            <button key={k} type="button" className={`chip ${preset === k ? 'on' : ''}`} onClick={() => choose(k)}>{label}</button>
          ))}
        </div>
        <div className="row-2 dates">
          <label className="field"><span>From</span><input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} /></label>
          <label className="field"><span>To</span><input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} /></label>
        </div>
      </div>

      <p className="legend muted small">
        Balance: <span className="credit">Cr</span> = payable to supplier · <span className="due">Dr</span> = owed by supplier (unrecovered advance)
      </p>

      <table className="reg ledger">
        <thead>
          <tr>
            <th>Date</th>
            <th>Particulars</th>
            <th className="num">Qty L</th>
            <th className="num">Fat %</th>
            <th className="num">Rate</th>
            <th className="num">Credit ₹</th>
            <th className="num">Debit ₹</th>
            <th className="num">Balance ₹</th>
          </tr>
        </thead>
        <tbody>
          <tr className="opening">
            <td className="mono date">{dateShort(from)}</td>
            <td className="lead">Opening balance</td>
            <td className="num hide-sm" /><td className="num hide-sm" /><td className="num hide-sm" />
            <td className="num hide-sm" /><td className="num hide-sm" />
            <td className="num strong" data-label="Balance ₹"><Bal value={opening} /></td>
          </tr>
          {rows.map((r) => <LedgerRow key={r.key} r={r} />)}
          {!rows.length && !loading && <tr className="empty"><td colSpan={8}>Nothing recorded in this period.</td></tr>}
        </tbody>
        <tfoot>
          <tr>
            <td className="mono date">{dateShort(to)}</td>
            <td className="lead">Closing balance</td>
            <td className="num" data-label="Milk L">{qty(periodLiters)}</td>
            <td className="num hide-sm" /><td className="num hide-sm" />
            <td className="num" data-label="Credit ₹">{money(periodMilk)}</td>
            <td className="num" data-label="Debit ₹">{money(periodAdvances + periodPaid)}</td>
            <td className="num strong" data-label="Balance ₹"><Bal value={closing} /></td>
          </tr>
        </tfoot>
      </table>

      <Settle
        key={`${id}-${from}-${to}`}
        supplier={supplier} from={from} to={to}
        entries={entries.data} advances={advances.data}
      />
    </section>
  );
}

function LedgerRow({ r }) {
  const s = r.src;
  if (r.kind === 'entry') {
    return (
      <tr>
        <td className="mono date">{dateShort(r.date)}</td>
        <td className="lead">
          Milk <span className="muted">{shiftShort(s.shift)}</span>
          {s.settlementId && <span className="tag">settled</span>}
          {s.notes && <div className="sub">{s.notes}</div>}
        </td>
        <td className="num" data-label="Qty L">{qty(s.quantity)}</td>
        <td className="num" data-label="Fat %">{fmtFat(s.fat)}</td>
        <td className="num" data-label="Rate">{s.rate.toFixed(2)}{s.rateOverridden && <sup title="Manual rate">m</sup>}</td>
        <td className="num credit" data-label="Credit ₹">{money(r.credit)}</td>
        <td className="num hide-sm" />
        <td className="num" data-label="Balance ₹"><Bal value={r.balance} /></td>
      </tr>
    );
  }
  if (r.kind === 'advance') {
    return (
      <tr className="event">
        <td className="mono date">{dateShort(r.date)}</td>
        <td className="lead">
          Advance given
          <div className="sub">EMI ₹{money(s.emi)} per settlement · ₹{money(s.remaining)} left{s.note ? ` · ${s.note}` : ''}</div>
        </td>
        <td className="num hide-sm" /><td className="num hide-sm" /><td className="num hide-sm" /><td className="num hide-sm" />
        <td className="num due" data-label="Debit ₹">{money(r.debit)}</td>
        <td className="num" data-label="Balance ₹"><Bal value={r.balance} /></td>
      </tr>
    );
  }
  async function undo() {
    if (!window.confirm(`Reverse the settlement for ${dateLong(s.from)} – ${dateLong(s.to)}? Its entries become unsettled and ₹${money(s.deducted)} goes back onto the advance.`)) return;
    try { await reverseSettlement(s); } catch (err) { window.alert(err.message); }
  }
  return (
    <tr className="event settlement">
      <td className="mono date">{dateShort(r.date)}</td>
      <td className="lead">
        Paid for {dateShort(s.from)} – {dateShort(s.to)}
        <div className="sub mono">
          milk {money(s.totalAmount)} − EMI {money(s.deducted)} = {money(s.netPayable)}
        </div>
        <button type="button" className="link small danger" onClick={undo}>Reverse</button>
      </td>
      <td className="num" data-label="Qty L">{qty(s.totalLiters)}</td>
      <td className="num hide-sm" /><td className="num hide-sm" /><td className="num hide-sm" />
      <td className="num" data-label="Debit ₹">{money(r.debit)}</td>
      <td className="num" data-label="Balance ₹"><Bal value={r.balance} /></td>
    </tr>
  );
}

function Settle({ supplier, from, to, entries, advances }) {
  const unsettled = entries.filter((e) => !e.settlementId && e.date >= from && e.date <= to);
  const liters = unsettled.reduce((t, e) => t + e.quantity, 0);
  const total = round2(unsettled.reduce((t, e) => t + e.amount, 0));
  const maxDeduct = round2(Math.min(total, supplier.advanceBalance || 0));
  const suggested = suggestedDeduction(advances, total);

  const [ded, setDed] = useState(null);
  const [paidOn, setPaidOn] = useState(todayISO);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const deduction = ded == null ? suggested : Math.min(Number(ded) || 0, maxDeduct);
  const net = round2(total - deduction);

  async function submit(ev) {
    ev.preventDefault();
    if (!window.confirm(`Record payment of ₹${money(net)} to ${supplier.name}?`)) return;
    setBusy(true);
    setError('');
    try {
      await createSettlement({ supplier, from, to, paidOn, entries: unsettled, advances, deduction, note });
      setDone(true);
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  return (
    <div className="settle">
      <h2>Settle {dateShort(from)} – {dateShort(to)}</h2>
      {done && <p className="ok">Settlement recorded.</p>}
      {!unsettled.length ? (
        !done && <p className="muted">No unsettled milk entries in this period.</p>
      ) : (
        <form onSubmit={submit}>
          <table className="sheet">
            <tbody>
              <tr><th>Unsettled entries</th><td className="num">{unsettled.length}</td></tr>
              <tr><th>Milk</th><td className="num">{qty(liters)} L</td></tr>
              <tr><th>Milk amount</th><td className="num">{money(total)}</td></tr>
              <tr>
                <th>
                  Less advance EMI
                  <div className="sub">
                    Suggested ₹{money(suggested)} · outstanding ₹{money(supplier.advanceBalance || 0)}
                  </div>
                </th>
                <td className="num">
                  <input
                    className="num-input inline" inputMode="decimal" aria-label="EMI deduction"
                    value={ded == null ? suggested.toFixed(2) : ded}
                    onChange={(e) => setDed(e.target.value.replace(/[^0-9.]/g, ''))}
                    disabled={!maxDeduct}
                  />
                </td>
              </tr>
              <tr className="total"><th>Net payable</th><td className="num strong">{money(net)}</td></tr>
            </tbody>
          </table>
          {ded != null && Number(ded) > maxDeduct && (
            <p className="note warn">Deduction capped at ₹{money(maxDeduct)} (the smaller of milk amount and outstanding advance).</p>
          )}
          <div className="row-2">
            <label className="field"><span>Paid on</span><input type="date" value={paidOn} onChange={(e) => e.target.value && setPaidOn(e.target.value)} /></label>
            <label className="field"><span>Remarks</span><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" /></label>
          </div>
          {error && <p className="error">{error}</p>}
          <div className="actions">
            <button className="primary big" disabled={busy}>{busy ? 'Saving…' : `Record settlement · ₹${money(net)}`}</button>
          </div>
        </form>
      )}
    </div>
  );
}
