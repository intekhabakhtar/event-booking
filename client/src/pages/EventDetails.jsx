// Event details + the seat booking flow (book, confirm, cancel, waitlist).
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api, { errorMessage } from '../api.js';
import useFetch from '../hooks/useFetch.js';
import { useAuth } from '../context/AuthContext.jsx';
import SeatBar from '../components/SeatBar.jsx';
import Alert from '../components/Alert.jsx';
import Loading from '../components/Loading.jsx';
import { fmtDate, registrationState } from '../utils.js';

export default function EventDetails() {
  const { id } = useParams();                       // the :id from the URL
  const { user } = useAuth();
  const isStudent = user && user.role === 'student';

  const event = useFetch(`/events/${id}`);
  const mine = useFetch(isStudent ? '/me/bookings' : null); // only students have bookings
  const [message, setMessage] = useState({ type: '', text: '' });
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (event.loading) return <Loading />;
  if (event.error) return <Alert>{event.error}</Alert>;
  const e = event.data;

  const myBooking = isStudent && mine.data?.bookings?.some((b) => b.event_id === e.id);
  const myWait = isStudent && mine.data?.waitlist?.find((w) => w.event_id === e.id);
  const full = e.seats_taken >= e.capacity;
  const state = registrationState(e);   // 'open', 'deadline' (deadline passed) or 'started'
  const past = state !== 'open';        // booking and waitlist are closed

  // one helper for all four buttons
  async function act(method, path, successText) {
    setBusy(true);
    setMessage({ type: '', text: '' });
    try {
      const res = await api({ method, url: `/events/${id}/${path}` });
      let text = successText;
      if (res.data.position) text += ` Your position: ${res.data.position}.`;
      setMessage({ type: 'success', text });
    } catch (err) {
      setMessage({ type: 'error', text: errorMessage(err) });
    } finally {
      setConfirming(false);
      setBusy(false);
      event.reload();   // numbers may have changed (even if our request failed)
      mine.reload();
    }
  }

  return (
    <>
      <p><Link to="/events">&larr; All events</Link></p>
      <div className="card">
        <h1>{e.title}</h1>
        <p className="muted">{e.venue} &middot; {fmtDate(e.event_date)}</p>
        {e.registration_deadline && state === 'open' && (
          <p className="muted small-text">Registration closes {fmtDate(e.registration_deadline)}</p>
        )}
        {e.description && <p>{e.description}</p>}
        <SeatBar taken={e.seats_taken} capacity={e.capacity} />
        {e.waitlist_count > 0 && <p className="muted">{e.waitlist_count} student(s) on the waitlist</p>}
      </div>

      <Alert type={message.type}>{message.text}</Alert>

      <div className="card">
        <h3>Seat booking</h3>
        {!user && <p>Please <Link to="/login">log in</Link> to book a seat.</p>}
        {user && !isStudent && <p className="muted">Admins manage events from the Admin area. Booking is for students.</p>}

        {isStudent && past && !myBooking && (
          <p className="muted">
            {state === 'started' ? 'This event has already started or finished, so booking is closed.' : 'The registration deadline has passed, so booking is closed.'}
          </p>
        )}

        {isStudent && myBooking && (
          <>
            <p>You have a seat at this event.</p>
            <button className="btn red" disabled={busy} onClick={() => act('delete', 'book', 'Booking cancelled.')}>Cancel my booking</button>
          </>
        )}

        {isStudent && !past && !myBooking && myWait && (
          <>
            <p>You are on the waitlist (position {myWait.position}). You get the seat automatically when one frees up.</p>
            <button className="btn grey" disabled={busy} onClick={() => act('delete', 'waitlist', 'You left the waitlist.')}>Leave waitlist</button>
          </>
        )}

        {isStudent && !past && !myBooking && !myWait && !full && !confirming && (
          <button className="btn" onClick={() => setConfirming(true)}>Book a seat</button>
        )}
        {isStudent && !past && !myBooking && !myWait && !full && confirming && (
          <div className="confirm">
            <p>Book one seat for <strong>{e.title}</strong>?</p>
            <button className="btn" disabled={busy} onClick={() => act('post', 'book', 'Seat booked! See it under My Bookings.')}>
              {busy ? 'Booking...' : 'Confirm booking'}
            </button>{' '}
            <button className="btn grey" disabled={busy} onClick={() => setConfirming(false)}>Back</button>
          </div>
        )}

        {isStudent && !past && !myBooking && !myWait && full && (
          <>
            <p>This event is sold out.</p>
            <button className="btn amber" disabled={busy} onClick={() => act('post', 'waitlist', 'Added to the waitlist.')}>Join waitlist</button>
          </>
        )}
      </div>
    </>
  );
}
