import { ProfileMark } from './ProfileMark';
import { useRef, useState, type FormEvent } from 'react';
import { getAuthInstance } from '../shared/firebase';

const MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'Email or password is incorrect.',
  'auth/wrong-password': 'Email or password is incorrect.',
  'auth/user-not-found': 'Email or password is incorrect.',
  'auth/missing-password': 'Enter your password.',
  'auth/invalid-email': 'That email address is not valid.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
  'auth/network-request-failed': 'Network error. Check your connection.',
};

export function Login({ onDemo }: { onDemo?: () => void } = {}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [badField, setBadField] = useState<'' | 'email' | 'password'>('');
  // Hidden demo entry: 6 quick clicks / taps on the profile photo (each within 700ms)
  const taps = useRef({ n: 0, last: 0 });
  const tapPhoto = () => {
    if (!onDemo) return;
    const now = Date.now();
    taps.current.n = now - taps.current.last <= 700 ? taps.current.n + 1 : 1;
    taps.current.last = now;
    if (taps.current.n >= 6) { taps.current.n = 0; onDemo(); }
  };
  // Set by the idle timer in AdminApp; shown once, then cleared
  const [idleOut] = useState(() => {
    try { const v = sessionStorage.getItem('sk-admin-idle-out'); sessionStorage.removeItem('sk-admin-idle-out'); return v; } catch { return null; }
  });
  const emailRef = useRef<HTMLInputElement>(null);
  const passRef = useRef<HTMLInputElement>(null);

  const fail = (msg: string, field: '' | 'email' | 'password' = '') => {
    setError(msg);
    setBadField(field);
    if (field === 'email') emailRef.current?.focus();
    if (field === 'password') passRef.current?.focus();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBadField('');
    const value = email.trim();
    // Check locally first: browsers on localhost often autofill a username saved
    // for another local app (e.g. "STU-0001"), which Firebase would only reject
    // after a slow network round trip.
    if (!value) { fail('Enter your admin email address.', 'email'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
      fail(`"${value.slice(0, 40)}" isn't an email address. Sign in with the admin account's email (your browser may have autofilled a saved username).`, 'email');
      return;
    }
    if (!password) { fail('Enter your password.', 'password'); return; }
    setBusy(true);
    try {
      const auth = await getAuthInstance();
      const { signInWithEmailAndPassword } = await import('firebase/auth');
      await signInWithEmailAndPassword(auth, value, password);
      // AdminApp's auth listener takes over from here.
    } catch (err) {
      const code = (err as { code?: string }).code ?? '';
      fail(MESSAGES[code] ?? 'Sign-in failed. Please try again.', code === 'auth/invalid-email' ? 'email' : '');
      setBusy(false);
    }
  };

  return (
    <main className="admin-center" id="main">
      <form className="login-card glass" onSubmit={submit} noValidate aria-labelledby="loginTitle">
        <span className="login-mark" onClick={tapPhoto} aria-hidden="true"><ProfileMark /></span>
        <h1 id="loginTitle">Admin sign-in</h1>
        <p className="login-sub">Restricted area. Sessions end when you close the tab.</p>
        {idleOut && <p className="login-note" role="status">You were signed out after {idleOut} minutes of inactivity.</p>}
        <div className={`field${badField === 'email' ? ' is-invalid' : ''}`}>
          <input id="lg-email" ref={emailRef} type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder=" "
            value={email} onChange={(e) => setEmail(e.target.value)} required aria-invalid={badField === 'email'} aria-describedby="lg-error" />
          <label htmlFor="lg-email">Email</label>
        </div>
        <div className={`field${badField === 'password' ? ' is-invalid' : ''}`}>
          <input id="lg-pass" ref={passRef} type="password" autoComplete="current-password" placeholder=" "
            value={password} onChange={(e) => setPassword(e.target.value)} required aria-invalid={badField === 'password'} aria-describedby="lg-error" />
          <label htmlFor="lg-pass">Password</label>
        </div>
        <p className="login-error" id="lg-error" role="alert">{error}</p>
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <a className="login-back" href="/">← Back to the portfolio</a>
      </form>
    </main>
  );
}
