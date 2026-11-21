// Step 1 of password reset: the student enters their email and gets a reset link.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errorMessage } from '../api.js';
import Alert from '../components/Alert.jsx';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);   // the server's reply once the request worked
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api.post('/auth/forgot-password', { email });
      setDone(res.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="card narrow auth-card">
        <h1>Check your reset link</h1>
        <Alert type="success">{done.message}</Alert>
        {done.resetPath ? (
          <>
            <p className="muted">
              Demo mode: this project has no email server, so the link is shown here (it is also printed in the server
              console). It works once and expires in 15 minutes.
            </p>
            <a className="btn block" href={done.resetPath}>Open reset link</a>
          </>
        ) : (
          <p className="muted">Follow the link in the message to choose a new password. It expires in 15 minutes.</p>
        )}
        <p className="muted center"><Link to="/login">Back to login</Link></p>
      </div>
    );
  }

  return (
    <form className="card narrow auth-card" onSubmit={handleSubmit}>
      <h1>Forgot password?</h1>
      <p className="muted">Enter your account email and we will create a link to reset your password.</p>
      <Alert>{error}</Alert>
      <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></label>
      <button className="btn block" type="submit" disabled={busy}>{busy ? 'Please wait...' : 'Send reset link'}</button>
      <p className="muted center"><Link to="/login">Back to login</Link></p>
    </form>
  );
}
