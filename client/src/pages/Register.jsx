import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { errorMessage } from '../api.js';
import Alert from '../components/Alert.jsx';
import PasswordInput from '../components/PasswordInput.jsx';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // one handler for all three inputs: the input's "name" attribute tells us which field changed
  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await register(form.name, form.email, form.password);
      navigate('/events');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card narrow auth-card" onSubmit={handleSubmit}>
      <h1>Create your account</h1>
      <p className="muted">It takes less than a minute.</p>
      <Alert>{error}</Alert>
      <label>Name<input name="name" value={form.name} onChange={handleChange} autoComplete="name" required /></label>
      <label>Email<input name="email" type="email" value={form.email} onChange={handleChange} autoComplete="email" required /></label>
      <PasswordInput label="Password (min 6 characters)" value={form.password} onChange={handleChange} minLength={6} autoComplete="new-password" />
      <button className="btn block" type="submit" disabled={busy}>{busy ? 'Creating...' : 'Create account'}</button>
      <p className="muted center">Already registered? <Link to="/login">Login</Link></p>
    </form>
  );
}
