import { useState } from 'react';
import { supabase } from '../supabase';

const MESSAGES = {
  'Invalid login credentials': 'Email or password is incorrect.',
  'Email not confirmed': 'This account is not confirmed yet. Confirm it in the Supabase dashboard.',
  'Failed to fetch': 'No connection. Check the network and try again.',
};

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(ev) {
    ev.preventDefault();
    setBusy(true);
    setError('');
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (err) {
      setError(MESSAGES[err.message] || err.message);
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <h1>Dairy Collection Manager</h1>
      <p className="muted">Owner sign-in</p>
      <form onSubmit={submit}>
        <label className="field">
          <span>Email</span>
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="primary big" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </main>
  );
}
