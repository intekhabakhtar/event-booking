// One form used for both "create event" (/admin/events/new) and "edit event" (/admin/events/:id/edit).
import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import api, { errorMessage } from '../../api.js';
import Alert from '../../components/Alert.jsx';
import Loading from '../../components/Loading.jsx';
import { toInputValue } from '../../utils.js';

const EMPTY = { title: '', description: '', venue: '', event_date: '', registration_deadline: '', capacity: '' };

export default function EventForm() {
  const { id } = useParams();            // undefined when creating
  const editing = Boolean(id);
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(editing);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // when editing, load the current values into the form
  useEffect(() => {
    if (!editing) return;
    api.get(`/events/${id}`)
      .then((res) => setForm({
        title: res.data.title, description: res.data.description, venue: res.data.venue,
        event_date: toInputValue(res.data.event_date), registration_deadline: toInputValue(res.data.registration_deadline),
        capacity: String(res.data.capacity),
      }))
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [id, editing]);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const payload = {
      ...form,
      event_date: form.event_date ? new Date(form.event_date).toISOString() : '',
      registration_deadline: form.registration_deadline ? new Date(form.registration_deadline).toISOString() : null,
      capacity: form.capacity === '' ? '' : Number(form.capacity),
    };
    try {
      if (editing) await api.put(`/events/${id}`, payload);
      else await api.post('/events', payload);
      navigate('/admin/events');
    } catch (err) {
      setError(errorMessage(err));   // server validation messages show up here
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading />;

  return (
    <form className="card narrow" onSubmit={handleSubmit}>
      <h1>{editing ? 'Edit event' : 'Create event'}</h1>
      <Alert>{error}</Alert>
      <label>Title<input name="title" value={form.title} onChange={handleChange} required /></label>
      <label>Description<textarea name="description" value={form.description} onChange={handleChange} rows={3} /></label>
      <label>Venue<input name="venue" value={form.venue} onChange={handleChange} required /></label>
      <label>Date and time<input name="event_date" type="datetime-local" value={form.event_date} onChange={handleChange} required /></label>
      <label>Registration deadline (optional)
        <input name="registration_deadline" type="datetime-local" value={form.registration_deadline} onChange={handleChange} />
      </label>
      <p className="muted small-text">Students cannot book or join the waitlist after this time. Leave empty to keep booking open until the event starts.</p>
      <label>Capacity (seats)<input name="capacity" type="number" min="1" value={form.capacity} onChange={handleChange} required /></label>
      {editing && <p className="muted">Raising the capacity automatically gives the new seats to students on the waitlist.</p>}
      <button className="btn" type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save'}</button>{' '}
      <Link className="btn grey" to="/admin/events">Cancel</Link>
    </form>
  );
}
