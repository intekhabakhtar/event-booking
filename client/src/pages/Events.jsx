import { useState } from 'react';
import useFetch from '../hooks/useFetch.js';
import EventCard from '../components/EventCard.jsx';
import Loading from '../components/Loading.jsx';
import Alert from '../components/Alert.jsx';

export default function Events() {
  const [text, setText] = useState('');      // what is typed in the box (controlled input)
  const [search, setSearch] = useState('');  // what we actually searched for
  const { data, loading, error } = useFetch('/events?search=' + encodeURIComponent(search));

  function handleSubmit(e) {
    e.preventDefault();                       // do not reload the page
    setSearch(text);
  }

  return (
    <>
      <h1>Events</h1>
      <form className="row" onSubmit={handleSubmit}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search by title or venue" />
        <button className="btn" type="submit">Search</button>
        {search && <button type="button" className="btn grey" onClick={() => { setText(''); setSearch(''); }}>Clear</button>}
      </form>

      {loading && <Loading />}
      <Alert>{error}</Alert>
      {data && data.length === 0 && <p className="muted">No events match your search.</p>}
      <div className="grid">
        {data && data.map((e) => <EventCard key={e.id} event={e} />)}
      </div>
    </>
  );
}
