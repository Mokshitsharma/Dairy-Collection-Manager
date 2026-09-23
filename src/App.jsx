import { useEffect, useMemo, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, configured } from './firebase';
import { SuppliersContext, col, useLive } from './lib/data';
import Login from './pages/Login';
import DailyEntry from './pages/DailyEntry';
import Suppliers from './pages/Suppliers';
import SupplierEdit from './pages/SupplierEdit';
import Ledger from './pages/Ledger';
import Advances from './pages/Advances';

export default function App() {
  const [user, setUser] = useState(undefined);
  useEffect(() => onAuthStateChanged(auth, setUser), []);

  if (!configured) {
    return (
      <main className="login">
        <h1>Dairy Collection Manager</h1>
        <p className="error">Firebase is not configured.</p>
        <p className="muted small">Set the VITE_FIREBASE_* environment variables (see README) and redeploy.</p>
      </main>
    );
  }
  if (user === undefined) return <div className="boot">Loading…</div>;
  if (!user) return <Login />;
  return <Shell user={user} />;
}

function Shell({ user }) {
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
          <button type="button" className="link quiet" onClick={() => signOut(auth)} title={user.email}>
            Sign out
          </button>
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
