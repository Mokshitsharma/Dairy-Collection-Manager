import { useMemo } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { SuppliersContext, col, useLive } from './lib/data';
import DailyEntry from './pages/DailyEntry';
import Suppliers from './pages/Suppliers';
import SupplierEdit from './pages/SupplierEdit';
import Ledger from './pages/Ledger';
import Advances from './pages/Advances';

export default function App() {
  const live = useLive(() => col.suppliers, []);
  const suppliers = useMemo(() => {
    const data = [...live.data].sort((a, b) => a.name.localeCompare(b.name));
    return { ...live, data, byId: Object.fromEntries(data.map((s) => [s.id, s])) };
  }, [live]);

  return (
    <SuppliersContext.Provider value={suppliers}>
      <header className="masthead">
        <div className="masthead-row">
          <span className="wordmark">Dairy Collection Manager</span>
        </div>
        <nav className="tabs">
          <NavLink to="/entry">Daily entry</NavLink>
          <NavLink to="/suppliers">Suppliers</NavLink>
          <NavLink to="/ledger">Ledger</NavLink>
          <NavLink to="/advances">Advances</NavLink>
        </nav>
      </header>
      <main className="page">
        {suppliers.error && <p className="error">Could not load data: {suppliers.error.message}</p>}
        <Routes>
          <Route path="/entry" element={<DailyEntry />} />
          <Route path="/suppliers" element={<Suppliers />} />
          <Route path="/suppliers/new" element={<SupplierEdit />} />
          <Route path="/suppliers/:id" element={<SupplierEdit />} />
          <Route path="/ledger" element={<Ledger />} />
          <Route path="/ledger/:id" element={<Ledger />} />
          <Route path="/advances" element={<Advances />} />
          <Route path="*" element={<Navigate to="/entry" replace />} />
        </Routes>
      </main>
    </SuppliersContext.Provider>
  );
}
