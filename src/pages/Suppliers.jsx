import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSuppliers } from '../lib/data';
import { money } from '../lib/format';
import { cleanChart } from '../lib/rates';

export default function Suppliers() {
  const suppliers = useSuppliers();
  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState('');

  const list = suppliers.data
    .filter((s) => showInactive || s.status !== 'inactive')
    .filter((s) => !search || s.name.toLowerCase().includes(search.toLowerCase()) || (s.phone || '').includes(search));
  const totalAdvance = list.reduce((t, s) => t + (s.advanceBalance || 0), 0);

  return (
    <section>
      <div className="section-head">
        <h1>Suppliers</h1>
        <Link className="button primary" to="/suppliers/new">Add supplier</Link>
      </div>

      <div className="toolbar">
        <input type="search" placeholder="Search name or phone" value={search} onChange={(e) => setSearch(e.target.value)} />
        <label className="check">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show inactive
        </label>
      </div>

      <table className="reg">
        <thead>
          <tr>
            <th>Collection center</th>
            <th>Phone</th>
            <th>Rate chart</th>
            <th>Status</th>
            <th className="num">Advance due ₹</th>
            <th className="act"><span className="sr">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {list.map((s) => {
            const chart = cleanChart(s.rateChart);
            return (
              <tr key={s.id} className={s.status === 'inactive' ? 'dim' : ''}>
                <td className="lead"><Link to={`/suppliers/${s.id}`}>{s.name}</Link></td>
                <td data-label="Phone" className="mono">{s.phone || '—'}</td>
                <td data-label="Rate chart" className="mono small">
                  {chart.length
                    ? `${chart[0].fat.toFixed(1)}–${chart[chart.length - 1].fat.toFixed(1)}% · ₹${chart[0].rate.toFixed(2)}–${chart[chart.length - 1].rate.toFixed(2)}`
                    : <span className="due">not set</span>}
                </td>
                <td data-label="Status">{s.status === 'inactive' ? 'Inactive' : 'Active'}</td>
                <td data-label="Advance due ₹" className={`num ${s.advanceBalance > 0 ? 'due' : ''}`}>
                  {money(s.advanceBalance || 0)}
                </td>
                <td className="act">
                  <Link to={`/ledger/${s.id}`}>Ledger</Link>
                  <Link to={`/suppliers/${s.id}`}>Edit</Link>
                </td>
              </tr>
            );
          })}
          {!list.length && !suppliers.loading && (
            <tr className="empty"><td colSpan={6}>No suppliers{search ? ' match that search' : ' yet'}.</td></tr>
          )}
        </tbody>
        {list.length > 1 && (
          <tfoot>
            <tr>
              <td className="lead">{list.length} suppliers</td>
              <td /><td /><td />
              <td className={`num ${totalAdvance > 0 ? 'due' : ''}`} data-label="Total advance due ₹">{money(totalAdvance)}</td>
              <td className="act" />
            </tr>
          </tfoot>
        )}
      </table>
    </section>
  );
}
