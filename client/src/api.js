// One axios instance used by the whole app.
import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

// Request interceptor: attach the JWT to every request automatically.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = 'Bearer ' + token;
  return config;
});

// Response interceptor: if the server says 401 for a logged-in user, the token is bad or expired -> log out.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && localStorage.getItem('token')) {
      window.dispatchEvent(new Event('auth-expired'));
    }
    return Promise.reject(error);
  }
);

// Turn an axios error into a message a student can read.
export function errorMessage(error) {
  if (error.response?.data?.message) return error.response.data.message;
  if (error.request) return 'Cannot reach the server. Is it running?';
  return 'Something went wrong.';
}

export default api;
