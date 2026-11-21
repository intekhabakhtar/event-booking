import { Link } from 'react-router-dom';
import useFetch from '../hooks/useFetch.js';
import EventCard from '../components/EventCard.jsx';
import Loading from '../components/Loading.jsx';
import Alert from '../components/Alert.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function Home() {
  const { user } = useAuth();
  const { data, loading, error } = useFetch('/events');

  return (
    <>
      <section className="hero">
        <h1>Find your next college event</h1>
        <p>Browse events, book your seat in one click, and never lose your place: if an event is full, join the waitlist and get the seat automatically.</p>
        <div className="row">
          <Link className="btn light" to="/events">Browse events</Link>
          {!user && <Link className="btn ghost" to="/register">Create an account</Link>}
        </div>
      </section>

      <div className="features">
        <div className="feature"><strong>Instant booking</strong><span>Reserve a seat in seconds</span></div>
        <div className="feature"><strong>Smart waitlist</strong><span>Promoted automatically when a seat frees up</span></div>
        <div className="feature"><strong>No overbooking</strong><span>Seat counts are always exact</span></div>
      </div>

      <h2>Coming up</h2>
      {loading && <Loading />}
      <Alert>{error}</Alert>
      {data && data.length === 0 && <p className="muted">No events yet.</p>}
      <div className="grid">
        {data && data.slice(0, 6).map((e) => <EventCard key={e.id} event={e} />)}
      </div>
      {data && data.length > 6 && <p><Link to="/events">See all {data.length} events &rarr;</Link></p>}
    </>
  );
}
