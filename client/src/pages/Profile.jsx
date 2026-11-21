import { useEffect, useState } from 'react';
import api, { errorMessage } from '../api.js';
import useFetch from '../hooks/useFetch.js';
import { useAuth } from '../context/AuthContext.jsx';
import Alert from '../components/Alert.jsx';
import Loading from '../components/Loading.jsx';

export default function Profile() {
  const { data, loading, error, reload } = useFetch('/me');
  const { setUser } = useAuth();
  const [name, setName] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => { if (data) setName(data.name); }, [data]);

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      const res = await api.put('/me', { name });
      localStorage.setItem('user', JSON.stringify({ ...JSON.parse(localStorage.getItem('user')), name: res.data.name }));
      setUser((u) => ({ ...u, name: res.data.name }));
      setMessage({ type: 'success', text: 'Name updated.' });
      reload();
    } catch (err) {
      setMessage({ type: 'error', text: errorMessage(err) });
    }
  }

  if (loading) return <Loading />;
  if (error) return <Alert>{error}</Alert>;

  return (
    <>
      <h1>Profile</h1>
      <div className="card">
        <p><strong>Email:</strong> {data.email}</p>
        <p><strong>Role:</strong> {data.role}</p>
        <p><strong>Seats booked:</strong> {data.active_bookings} of {data.max_bookings} allowed</p>
      </div>
      <form className="card" onSubmit={handleSubmit}>
        <h3>Change name</h3>
        <Alert type={message.type}>{message.text}</Alert>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required />
        <button className="btn" type="submit">Save</button>
      </form>
    </>
  );
}
