import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api, { errorMessage } from '../../api.js';
import useFetch from '../../hooks/useFetch.js';
import Alert from '../../components/Alert.jsx';
import Loading from '../../components/Loading.jsx';
import { fmtDate } from '../../utils.js';

const LIMIT = 20;

export default function ManageBookings() {
  const { id } = useParams();
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useFetch(`/admin/events/${id}/bookings?page=${page}&limit=${LIMIT}`);
  const [message, setMessage] = useState({ type: '', text: '' });

  async function cancel(b) {
    if (!window.confirm(`Cancel the booking of ${b.name}?`)) return;
    try {
      const res = await api.delete(`/admin/events/${id}/bookings/${b.user_id}`);
      setMessage({ type: 'success', text: res.data.promotedUserId ? 'Cancelled. The seat went to the next student on the waitlist.' : 'Booking cancelled.' });
    } catch (err) {
      setMessage({ type: 'error', text: errorMessage(err) });
    }
    reload();
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / LIMIT)) : 1;

  return (
    <>
      <p><Link to="/admin/events">&larr; Manage events</Link></p>
      {loading && <Loading />}
      <Alert>{error}</Alert>
      {data && (
        <>
          <h1>Bookings: {data.event.title}</h1>
          <p className="muted">{data.event.seats_taken} of {data.event.capacity} seats booked</p>
          <Alert type={message.type}>{message.text}</Alert>
          {data.bookings.length === 0 && <p className="muted">No bookings on this page.</p>}
          {data.bookings.length > 0 && (
            <div className="scroll">
              <table>
                <thead><tr><th>#</th><th>Student</th><th>Email</th><th>Booked at</th><th></th></tr></thead>
                <tbody>
                  {data.bookings.map((b) => (
                    <tr key={b.id}>
                      <td>{b.id}</td><td>{b.name}</td><td>{b.email}</td><td>{fmtDate(b.created_at)}</td>
                      <td><button className="btn small red" onClick={() => cancel(b)}>Cancel</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="row">
            <button className="btn small grey" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
            <span>Page {page} of {pages}</span>
            <button className="btn small grey" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        </>
      )}
    </>
  );
}
