// Small reusable hook: GET a URL and track the three states every screen needs (loading / error / data).
// Pass null as the url to skip fetching (for example when the user is not logged in).
import { useCallback, useEffect, useState } from 'react';
import api, { errorMessage } from '../api.js';

export default function useFetch(url) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(Boolean(url));
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!url) { setData(null); setLoading(false); return; }
    setLoading(true);
    setError('');
    try {
      const res = await api.get(url);
      setData(res.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load };
}
