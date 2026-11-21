import { useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errorMessage } from '../../api.js';
import useFetch from '../../hooks/useFetch.js';
import Alert from '../../components/Alert.jsx';
import Loading from '../../components/Loading.jsx';
import { fmtDate } from '../../utils.js';

export default function ManageEvents() {
  const { data, loading, error, reload } = useFetch('/events');
  const [message, setMessage] = useState({ type: '', text: '' });

  async function remove(event) {
    if (!window.confirm(`Delete "${event.title}" and all its bookings?`)) return;
    try {
      await api.delete(`/events/${event.id}`);
      setMessage({ type: 'success', text: 'Event deleted.' });
    } catch (err) {
      setMessage({ type: 'error', text: errorMessage(err) });
    }
    reload();
  }

  return (
    <>
      <div className="row between">
        <h1>Manage Events</h1>
        <Link className="btn" to="/admin/events/new">+ Create event</Link>
      </div>
      <Alert type={message.type}>{message.text}</Alert>
      {loading && <Loading />}
      <Alert>{error}</Alert>
      {data && data.length === 0 && <p className="muted">No events yet.</p>}
      {data && data.length > 0 && (
        <div className="scroll">
          <table>
            <thead><tr><th>Title</th><th>Date</th><th>Venue</th><th>Booked</th><th></th></tr></thead>
            <tbody>
              {data.map((e) => (
                <tr key={e.id}>
                  <td>{e.title}</td>
                  <td>{fmtDate(e.event_date)}</td>
                  <td>{e.venue}</td>
                  <td>{e.seats_taken}/{e.capacity}</td>
                  <td className="actions">
                    <Link className="btn small" to={`/admin/events/${e.id}/bookings`}>Bookings</Link>{' '}
                    <Link className="btn small grey" to={`/admin/events/${e.id}/edit`}>Edit</Link>{' '}
                    <button className="btn small red" onClick={() => remove(e)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
