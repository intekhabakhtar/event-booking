// Step 2 of password reset: the link contains ?token=..., the student chooses a new password.
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api, { errorMessage } from '../api.js';
import Alert from '../components/Alert.jsx';
import PasswordInput from '../components/PasswordInput.jsx';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError('The two passwords do not match.'); return; }
    setBusy(true);
    try {
      const res = await api.post('/auth/reset-password', { token, password });
      setSuccess(res.data.message);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="card narrow auth-card">
        <h1>Reset password</h1>
        <Alert>This page needs a reset link. Please request one first.</Alert>
        <Link className="btn block" to="/forgot-password">Request a reset link</Link>
      </div>
    );
  }

  if (success) {
    return (
      <div className="card narrow auth-card">
        <h1>All done</h1>
        <Alert type="success">{success}</Alert>
        <Link className="btn block" to="/login">Go to login</Link>
      </div>
    );
  }

  return (
    <form className="card narrow auth-card" onSubmit={handleSubmit}>
      <h1>Choose a new password</h1>
      <Alert>{error}</Alert>
      <PasswordInput label="New password (min 6 characters)" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} autoComplete="new-password" />
      <PasswordInput label="Confirm new password" name="confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={6} autoComplete="new-password" />
      <button className="btn block" type="submit" disabled={busy}>{busy ? 'Saving...' : 'Change password'}</button>
      {error.includes('link') && <p className="muted center"><Link to="/forgot-password">Request a new link</Link></p>}
    </form>
  );
}
