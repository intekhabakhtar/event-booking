import { Link } from 'react-router-dom';
import useFetch from '../../hooks/useFetch.js';
import Alert from '../../components/Alert.jsx';
import Loading from '../../components/Loading.jsx';
import { fmtDate } from '../../utils.js';

export default function Reports() {
  const { data, loading, error } = useFetch('/admin/reports');
  return (
    <>
      <p><Link to="/admin">&larr; Dashboard</Link></p>
      <h1>Reports</h1>
      {loading && <Loading />}
      <Alert>{error}</Alert>
      {data && (
        <>
          <h2>Data integrity check</h2>
          {data.integrityMismatches.length === 0 ? (
            <Alert type="success">OK: for every event, the seat counter equals the real number of booking rows.</Alert>
          ) : (
            <Alert>Mismatch found in {data.integrityMismatches.length} event(s)!</Alert>
          )}

          <h2>Fill rate per event</h2>
          <div className="scroll">
            <table>
              <thead><tr><th>Event</th><th>Date</th><th>Booked</th><th>Fill</th><th>Waitlist</th></tr></thead>
              <tbody>
                {data.perEvent.map((e) => (
                  <tr key={e.id}>
                    <td><Link to={`/admin/events/${e.id}/bookings`}>{e.title}</Link></td>
                    <td>{fmtDate(e.event_date)}</td>
                    <td>{e.seats_taken}/{e.capacity}</td>
                    <td>{e.fill_percent}%</td>
                    <td>{e.waitlist_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2>Bookings per day</h2>
          {data.perDay.length === 0 && <p className="muted">No bookings yet.</p>}
          <ul>
            {data.perDay.map((d) => (
              <li key={d.day}>{new Date(d.day).toLocaleDateString()}: {d.bookings} bookings</li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
