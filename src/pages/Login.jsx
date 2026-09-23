import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth, usingEmulators } from '../firebase';

const MESSAGES = {
  'auth/invalid-credential': 'Email or password is incorrect.',
  'auth/wrong-password': 'Email or password is incorrect.',
  'auth/user-not-found': 'Email or password is incorrect.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/too-many-requests': 'Too many attempts. Wait a minute and try again.',
  'auth/network-request-failed': 'No connection. Check the network and try again.',
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
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      setError(MESSAGES[err.code] || err.message);
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
      {usingEmulators && (
        <p className="muted small">
          Local account: <span className="mono">admin@dairy.local</span> / <span className="mono">dairy123</span>
        </p>
      )}
    </main>
  );
}
