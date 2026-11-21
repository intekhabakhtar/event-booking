import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/');
  }

  return (
    <nav className="navbar">
      <Link to="/" className="brand">College Events</Link>
      <div className="links">
        <NavLink to="/events">Events</NavLink>
        {user && user.role === 'student' && (
          <>
            <NavLink to="/my-bookings">My Bookings</NavLink>
            <NavLink to="/profile">Profile</NavLink>
          </>
        )}
        {user && user.role === 'admin' && <NavLink to="/admin">Admin</NavLink>}
        {!user && <NavLink to="/login">Login</NavLink>}
        {!user && <NavLink to="/register">Register</NavLink>}
        {user && (
          <button className="btn small red" onClick={handleLogout}>
            Logout ({user.name})
          </button>
        )}
      </div>
    </nav>
  );
}
