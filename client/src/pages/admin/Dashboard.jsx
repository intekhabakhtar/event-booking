import { Link } from 'react-router-dom';
import useFetch from '../../hooks/useFetch.js';
import Alert from '../../components/Alert.jsx';
import Loading from '../../components/Loading.jsx';

export default function Dashboard() {
  const { data, loading, error } = useFetch('/admin/stats');
  return (
    <>
      <h1>Admin Dashboard</h1>
      {loading && <Loading />}
      <Alert>{error}</Alert>
      {data && (
        <div className="grid">
          <div className="card stat"><span>{data.students}</span>Students</div>
          <div className="card stat"><span>{data.events}</span>Events</div>
          <div className="card stat"><span>{data.bookings}</span>Bookings</div>
          <div className="card stat"><span>{data.waitlisted}</span>On waitlists</div>
          <div className="card stat"><span>{data.sold_out_events}</span>Sold-out events</div>
        </div>
      )}
      <div className="row">
        <Link className="btn" to="/admin/events">Manage events</Link>
        <Link className="btn" to="/admin/events/new">Create event</Link>
        <Link className="btn" to="/admin/reports">Reports</Link>
      </div>
    </>
  );
}
