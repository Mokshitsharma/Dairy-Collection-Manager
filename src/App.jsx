import { useEffect, useMemo, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { configured, supabase } from './supabase';
import { SuppliersContext, listSuppliers, subscribeToChanges, useQuery } from './lib/data';
import Login from './pages/Login';
import DailyEntry from './pages/DailyEntry';
import Suppliers from './pages/Suppliers';
import SupplierEdit from './pages/SupplierEdit';
import Ledger from './pages/Ledger';
import Advances from './pages/Advances';

export default function App() {
  const [session, setSession] = useState(undefined);
  useEffect(() => {
    if (!configured) return undefined;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!configured) {
    return (
      <main className="login">
        <h1>Dairy Collection Manager</h1>
        <p className="error">Supabase is not configured.</p>
        <p className="muted small">
          Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (in .env.local, or in Vercel's environment variables) — see README.
        </p>
      </main>
    );
  }
  if (session === undefined) return <div className="boot">Loading…</div>;
  if (!session) return <Login />;
  return <Shell user={session.user} />;
}

function Shell({ user }) {
  useEffect(subscribeToChanges, []);
  const live = useQuery(listSuppliers, []);
  const suppliers = useMemo(() => {
    const data = [...live.data].sort((a, b) => a.name.localeCompare(b.name));
    return { ...live, data, byId: Object.fromEntries(data.map((s) => [s.id, s])) };
  }, [live]);

  return (
    <SuppliersContext.Provider value={suppliers}>
      <header className="masthead">
        <div className="masthead-row">
          <span className="wordmark">Dairy Collection Manager</span>
          <button type="button" className="link quiet" onClick={() => supabase.auth.signOut()} title={user.email}>
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
