import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { saveSupplier, useSuppliers } from '../lib/data';
import { money } from '../lib/format';
import { cleanChart, generateChart, lookupRate } from '../lib/rates';

const toRows = (chart) => (chart || []).map((r) => ({ fat: r.fat.toFixed(1), rate: r.rate.toFixed(2) }));

export default function SupplierEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const suppliers = useSuppliers();
  const existing = id ? suppliers.byId[id] : null;

  const [form, setForm] = useState({ name: '', phone: '', status: 'active' });
  const [rows, setRows] = useState([{ fat: '', rate: '' }]);
  const [gen, setGen] = useState({ fromFat: '3.0', toFat: '6.5', step: '0.1', baseRate: '', perStep: '' });
  const [testFat, setTestFat] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(!id);

  useEffect(() => {
    if (existing && !loaded) {
      setForm({ name: existing.name, phone: existing.phone || '', status: existing.status || 'active' });
      setRows(existing.rateChart?.length ? toRows(existing.rateChart) : [{ fat: '', rate: '' }]);
      setLoaded(true);
    }
  }, [existing, loaded]);

  if (id && !existing) {
    return <p className="muted">{suppliers.loading ? 'Loading…' : 'Supplier not found.'}</p>;
  }

  const setRow = (i, k, v) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v.replace(/[^0-9.]/g, '') } : r)));
  const chart = cleanChart(rows);
  const test = lookupRate(chart, Number(testFat));

  function fill() {
    const generated = generateChart(gen);
    if (!generated.length || !(Number(gen.baseRate) > 0)) {
      setError('Fill in the range, step and starting rate to generate a chart.');
      return;
    }
    setError('');
    setRows(toRows(generated));
  }

  async function submit(ev) {
    ev.preventDefault();
    if (!form.name.trim()) return setError('Name is required.');
    setBusy(true);
    setError('');
    try {
      await saveSupplier(id, { name: form.name.trim(), phone: form.phone.trim(), status: form.status, rateChart: chart });
      navigate('/suppliers');
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <section className="narrow">
      <p className="crumbs"><Link to="/suppliers">Suppliers</Link> /</p>
      <h1>{existing ? existing.name : 'New supplier'}</h1>
      {existing && (
        <p className="muted">
          Advance outstanding{' '}
          <span className={`mono ${existing.advanceBalance > 0 ? 'due' : ''}`}>₹{money(existing.advanceBalance || 0)}</span>
          {' · '}<Link to={`/ledger/${existing.id}`}>Open ledger</Link>
        </p>
      )}

      <form onSubmit={submit} autoComplete="off">
        <div className="row-2">
          <label className="field">
            <span>Collection center name</span>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label className="field">
            <span>Phone</span>
            <input type="tel" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </label>
        </div>
        <div className="field">
          <span>Status</span>
          <div className="segmented" role="radiogroup">
            {['active', 'inactive'].map((s) => (
              <button key={s} type="button" role="radio" aria-checked={form.status === s}
                className={form.status === s ? 'on' : ''} onClick={() => setForm({ ...form, status: s })}>
                {s === 'active' ? 'Active' : 'Inactive'}
              </button>
            ))}
          </div>
        </div>

        <h2 className="spaced">Rate chart</h2>
        <p className="muted small">
          Rate per liter for each fat %. Fat values between two rows are interpolated; values outside the chart use the nearest end.
        </p>

        <div className="generator">
          <span className="gen-title">Fill a range</span>
          <label className="field"><span>From fat %</span>
            <input className="num-input" inputMode="decimal" value={gen.fromFat} onChange={(e) => setGen({ ...gen, fromFat: e.target.value })} /></label>
          <label className="field"><span>To fat %</span>
            <input className="num-input" inputMode="decimal" value={gen.toFat} onChange={(e) => setGen({ ...gen, toFat: e.target.value })} /></label>
          <label className="field"><span>Step</span>
            <input className="num-input" inputMode="decimal" value={gen.step} onChange={(e) => setGen({ ...gen, step: e.target.value })} /></label>
          <label className="field"><span>Rate at start ₹</span>
            <input className="num-input" inputMode="decimal" value={gen.baseRate} onChange={(e) => setGen({ ...gen, baseRate: e.target.value })} /></label>
          <label className="field"><span>+ ₹ per step</span>
            <input className="num-input" inputMode="decimal" value={gen.perStep} onChange={(e) => setGen({ ...gen, perStep: e.target.value })} /></label>
          <button type="button" className="secondary" onClick={fill}>Generate</button>
        </div>

        <table className="chart-edit">
          <thead>
            <tr><th className="num">Fat %</th><th className="num">Rate ₹/L</th><th /></tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td><input className="num-input" inputMode="decimal" aria-label="Fat %" value={r.fat} onChange={(e) => setRow(i, 'fat', e.target.value)} /></td>
                <td><input className="num-input" inputMode="decimal" aria-label="Rate" value={r.rate} onChange={(e) => setRow(i, 'rate', e.target.value)} /></td>
                <td className="act">
                  <button type="button" className="link danger" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} aria-label="Remove row">Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="toolbar">
          <button type="button" className="link" onClick={() => setRows((rs) => [...rs, { fat: '', rate: '' }])}>+ Add row</button>
          {rows.length > 1 && <button type="button" className="link danger" onClick={() => setRows([{ fat: '', rate: '' }])}>Clear chart</button>}
          <span className="muted small">{chart.length} valid rows</span>
        </div>

        <div className="tester">
          <label className="field">
            <span>Check a fat %</span>
            <input className="num-input" inputMode="decimal" value={testFat} onChange={(e) => setTestFat(e.target.value)} placeholder="4.5" />
          </label>
          <p className="mono">
            {test.rate != null ? `₹${test.rate.toFixed(2)} / L` : '—'}
            {test.note && <span className="muted small"> · {test.note}</span>}
          </p>
        </div>

        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button className="primary big" disabled={busy}>{busy ? 'Saving…' : existing ? 'Save changes' : 'Add supplier'}</button>
          <Link className="button secondary big" to="/suppliers">Cancel</Link>
        </div>
      </form>
    </section>
  );
}
