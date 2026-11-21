import { useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errorMessage } from '../api.js';
import useFetch from '../hooks/useFetch.js';
import Alert from '../components/Alert.jsx';
import Loading from '../components/Loading.jsx';
import { fmtDate, ACTION_TEXT } from '../utils.js';

export default function MyBookings() {
  const { data, loading, error, reload } = useFetch('/me/bookings');
  const history = useFetch('/me/history');
  const [message, setMessage] = useState({ type: '', text: '' });

  async function remove(eventId, kind) {
    try {
      await api.delete(`/events/${eventId}/${kind}`);
      setMessage({ type: 'success', text: kind === 'book' ? 'Booking cancelled.' : 'Left the waitlist.' });
    } catch (err) {
      setMessage({ type: 'error', text: errorMessage(err) });
    }
    reload();
    history.reload();
  }

  if (loading) return <Loading />;
  if (error) return <Alert>{error}</Alert>;

  return (
    <>
      <h1>My Bookings</h1>
      <Alert type={message.type}>{message.text}</Alert>

      <h2>Confirmed seats ({data.bookings.length})</h2>
      {data.bookings.length === 0 && <p className="muted">No bookings yet. <Link to="/events">Browse events</Link></p>}
      {data.bookings.map((b) => (
        <div className="card row between" key={b.id}>
          <div>
            <Link to={`/events/${b.event_id}`}><strong>{b.title}</strong></Link>
            <div className="muted">{b.venue} &middot; {fmtDate(b.event_date)}</div>
          </div>
          <button className="btn red small" onClick={() => remove(b.event_id, 'book')}>Cancel</button>
        </div>
      ))}

      <h2>Waitlist ({data.waitlist.length})</h2>
      {data.waitlist.length === 0 && <p className="muted">You are not on any waitlist.</p>}
      {data.waitlist.map((w) => (
        <div className="card row between" key={w.event_id}>
          <div>
            <Link to={`/events/${w.event_id}`}><strong>{w.title}</strong></Link>
            <div className="muted">Position {w.position} &middot; {fmtDate(w.event_date)}</div>
          </div>
          <button className="btn grey small" onClick={() => remove(w.event_id, 'waitlist')}>Leave</button>
        </div>
      ))}

      <h2>Booking history</h2>
      {history.loading && <Loading />}
      <Alert>{history.error}</Alert>
      {history.data && history.data.length === 0 && <p className="muted">Nothing here yet. Every booking, cancellation and waitlist promotion will be listed.</p>}
      {history.data && history.data.length > 0 && (
        <div className="scroll">
          <table>
            <thead><tr><th>When</th><th>Event</th><th>What happened</th></tr></thead>
            <tbody>
              {history.data.map((h) => (
                <tr key={h.id}>
                  <td>{fmtDate(h.created_at)}</td>
                  <td>{h.event_id ? <Link to={`/events/${h.event_id}`}>{h.event_title}</Link> : h.event_title}</td>
                  <td><span className={'badge ' + (h.action === 'BOOKED' || h.action === 'PROMOTED' ? 'green' : 'red')}>{ACTION_TEXT[h.action] || h.action}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
