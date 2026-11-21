import { Link } from 'react-router-dom';
import SeatBar from './SeatBar.jsx';
import { fmtDate } from '../utils.js';

export default function EventCard({ event }) {
  const d = new Date(event.event_date);
  return (
    <Link to={`/events/${event.id}`} className="card event-card">
      <div className="event-top">
        <div className="date-badge">
          <strong>{d.getDate()}</strong>
          <span>{d.toLocaleString([], { month: 'short' })}</span>
        </div>
        <div>
          <h3>{event.title}</h3>
          <p className="muted">{event.venue}</p>
          <p className="muted small-text">{fmtDate(event.event_date)}</p>
        </div>
      </div>
      <SeatBar taken={event.seats_taken} capacity={event.capacity} />
    </Link>
  );
}
