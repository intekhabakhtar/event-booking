import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Home from './pages/Home.jsx';
import Events from './pages/Events.jsx';
import EventDetails from './pages/EventDetails.jsx';
import MyBookings from './pages/MyBookings.jsx';
import Profile from './pages/Profile.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import Footer from './components/Footer.jsx';
import Dashboard from './pages/admin/Dashboard.jsx';
import ManageEvents from './pages/admin/ManageEvents.jsx';
import EventForm from './pages/admin/EventForm.jsx';
import ManageBookings from './pages/admin/ManageBookings.jsx';
import Reports from './pages/admin/Reports.jsx';

export default function App() {
  return (
    <>
      <Navbar />
      <main className="container">
        <Routes>
          {/* public */}
          <Route path="/" element={<Home />} />
          <Route path="/events" element={<Events />} />
          <Route path="/events/:id" element={<EventDetails />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* student (login required) */}
          <Route path="/my-bookings" element={<ProtectedRoute><MyBookings /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />

          {/* admin (login + admin role required) */}
          <Route path="/admin" element={<ProtectedRoute adminOnly><Dashboard /></ProtectedRoute>} />
          <Route path="/admin/events" element={<ProtectedRoute adminOnly><ManageEvents /></ProtectedRoute>} />
          <Route path="/admin/events/new" element={<ProtectedRoute adminOnly><EventForm /></ProtectedRoute>} />
          <Route path="/admin/events/:id/edit" element={<ProtectedRoute adminOnly><EventForm /></ProtectedRoute>} />
          <Route path="/admin/events/:id/bookings" element={<ProtectedRoute adminOnly><ManageBookings /></ProtectedRoute>} />
          <Route path="/admin/reports" element={<ProtectedRoute adminOnly><Reports /></ProtectedRoute>} />

          <Route path="*" element={<div className="card narrow center"><h1>404</h1><p className="muted">Page not found.</p></div>} />
        </Routes>
      </main>
      <Footer />
    </>
  );
}
