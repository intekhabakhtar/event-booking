import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { errorMessage } from '../api.js';
import Alert from '../components/Alert.jsx';
import PasswordInput from '../components/PasswordInput.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
      navigate('/events');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card narrow auth-card" onSubmit={handleSubmit}>
      <h1>Welcome back</h1>
      <p className="muted">Log in to book seats and manage your events.</p>
      <Alert>{error}</Alert>
      <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></label>
      <PasswordInput label="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
      <div className="row between tight">
        <span />
        <Link to="/forgot-password" className="small-text">Forgot password?</Link>
      </div>
      <button className="btn block" type="submit" disabled={busy}>{busy ? 'Logging in...' : 'Login'}</button>
      <p className="muted center">No account? <Link to="/register">Register</Link></p>
    </form>
  );
}
