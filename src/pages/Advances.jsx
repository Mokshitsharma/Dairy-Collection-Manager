import { useState } from 'react';
import { Link } from 'react-router-dom';
import { addAdvance, deleteAdvance, listAdvances, updateAdvanceEmi, useQuery, useSuppliers } from '../lib/data';
import { dateShort, money, round2, todayISO } from '../lib/format';

export default function Advances() {
  const suppliers = useSuppliers();
  const all = useQuery(listAdvances, []);
  const [filter, setFilter] = useState('');
  const [openOnly, setOpenOnly] = useState(true);

  const list = all.data
    .filter((a) => (!filter || a.supplierId === filter) && (!openOnly || a.remaining > 0))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
  const totals = list.reduce((t, a) => ({ given: t.given + a.amount, left: t.left + a.remaining }), { given: 0, left: 0 });

  return (
    <div className="split">
      <section className="split-form">
        <h1>Advances</h1>
        <NewAdvance suppliers={suppliers.data.filter((s) => s.status !== 'inactive')} />
      </section>

      <section className="split-main">
        <div className="section-head">
          <h2>{openOnly ? 'Outstanding advances' : 'All advances'}</h2>
        </div>
        <div className="toolbar">
          <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter by supplier">
            <option value="">All suppliers</option>
            {suppliers.data.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <label className="check">
            <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} /> Outstanding only
          </label>
        </div>

        <table className="reg">
          <thead>
            <tr>
              <th>Date</th>
              <th>Supplier</th>
              <th className="num">Given ₹</th>
              <th className="num">EMI ₹</th>
              <th className="num">Remaining ₹</th>
              <th className="act"><span className="sr">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {list.map((a) => <AdvanceRow key={a.id} a={a} name={suppliers.byId[a.supplierId]?.name} />)}
            {!list.length && !all.loading && <tr className="empty"><td colSpan={6}>No {openOnly ? 'outstanding ' : ''}advances.</td></tr>}
          </tbody>
          {list.length > 1 && (
            <tfoot>
              <tr>
                <td className="hide-sm" />
                <td className="lead">{list.length} advances</td>
                <td className="num" data-label="Given ₹">{money(totals.given)}</td>
                <td className="num hide-sm" />
                <td className={`num strong ${totals.left > 0 ? 'due' : ''}`} data-label="Remaining ₹">{money(totals.left)}</td>
                <td className="act" />
              </tr>
            </tfoot>
          )}
        </table>
      </section>
    </div>
  );
}

function AdvanceRow({ a, name }) {
  const [emi, setEmi] = useState(null);
  const untouched = round2(a.remaining) === round2(a.amount);

  async function saveEmi() {
    const v = round2(Number(emi));
    setEmi(null);
    if (emi == null || !(v >= 0) || v === a.emi) return;
    await updateAdvanceEmi(a.id, v).catch((err) => window.alert(err.message));
  }
  async function remove() {
    if (!window.confirm(`Delete advance of ₹${money(a.amount)} to ${name}?`)) return;
    await deleteAdvance(a).catch((err) => window.alert(err.message));
  }

  return (
    <tr className={a.remaining > 0 ? '' : 'dim'}>
      <td className="mono date">{dateShort(a.date)}</td>
      <td className="lead">
        <Link to={`/ledger/${a.supplierId}`}>{name || '(deleted)'}</Link>
        {a.note && <div className="sub">{a.note}</div>}
      </td>
      <td className="num" data-label="Given ₹">{money(a.amount)}</td>
      <td className="num" data-label="EMI ₹">
        {a.remaining > 0 ? (
          <input
            className="num-input inline" inputMode="decimal" aria-label="EMI per settlement"
            value={emi ?? a.emi.toFixed(2)}
            onChange={(e) => setEmi(e.target.value.replace(/[^0-9.]/g, ''))}
            onBlur={saveEmi}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
        ) : money(a.emi)}
      </td>
      <td className={`num strong ${a.remaining > 0 ? 'due' : ''}`} data-label="Remaining ₹">
        {a.remaining > 0 ? money(a.remaining) : 'Cleared'}
      </td>
      <td className="act">
        {untouched && <button type="button" className="link danger" onClick={remove}>Delete</button>}
      </td>
    </tr>
  );
}

function NewAdvance({ suppliers }) {
  const [f, setF] = useState({ supplierId: '', amount: '', emi: '', date: todayISO(), note: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState('');
  const set = (k, numeric) => (e) => setF({ ...f, [k]: numeric ? e.target.value.replace(/[^0-9.]/g, '') : e.target.value });

  const supplier = suppliers.find((s) => s.id === f.supplierId);
  const amount = round2(Number(f.amount));
  const emi = round2(Number(f.emi));
  const settlements = amount > 0 && emi > 0 ? Math.ceil(amount / emi) : null;

  async function submit(ev) {
    ev.preventDefault();
    setError('');
    if (!supplier) return setError('Choose a supplier.');
    if (!(amount > 0)) return setError('Enter the advance amount.');
    if (!(emi >= 0) || emi > amount) return setError('EMI must be between 0 and the advance amount.');
    setBusy(true);
    try {
      await addAdvance({ supplierId: supplier.id, amount, emi, date: f.date, note: f.note.trim() });
      setSaved(`Advance of ₹${money(amount)} recorded for ${supplier.name}.`);
      setTimeout(() => setSaved(''), 3000);
      setF({ ...f, amount: '', emi: '', note: '' });
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} autoComplete="off">
      <label className="field">
        <span>Supplier</span>
        <select value={f.supplierId} onChange={set('supplierId')}>
          <option value="" disabled>Choose…</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      {supplier && (
        <p className="note">
          Already outstanding: <span className={`mono ${supplier.advanceBalance > 0 ? 'due' : ''}`}>₹{money(supplier.advanceBalance || 0)}</span>
        </p>
      )}
      <div className="row-2">
        <label className="field"><span>Amount ₹</span>
          <input className="num-input" inputMode="decimal" value={f.amount} onChange={set('amount', true)} placeholder="0.00" /></label>
        <label className="field"><span>EMI per settlement ₹</span>
          <input className="num-input" inputMode="decimal" value={f.emi} onChange={set('emi', true)} placeholder="0.00" /></label>
      </div>
      {settlements && <p className="note">Recovered over about {settlements} settlement{settlements > 1 ? 's' : ''}.</p>}
      <div className="row-2">
        <label className="field"><span>Date given</span>
          <input type="date" value={f.date} onChange={(e) => e.target.value && setF({ ...f, date: e.target.value })} /></label>
        <label className="field"><span>Remarks</span>
          <input value={f.note} onChange={set('note')} placeholder="Optional" /></label>
      </div>
      {error && <p className="error">{error}</p>}
      {saved && <p className="ok">{saved}</p>}
      <div className="actions">
        <button className="primary big" disabled={busy}>{busy ? 'Saving…' : 'Record advance'}</button>
      </div>
    </form>
  );
}
