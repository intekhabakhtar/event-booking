export const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';

// <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm" in LOCAL time ('' when there is no value)
export function toInputValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

// Registration is closed once the event starts, or once the optional registration deadline has passed.
export function registrationState(event) {
  const now = new Date();
  if (new Date(event.event_date) <= now) return 'started';
  if (event.registration_deadline && new Date(event.registration_deadline) <= now) return 'deadline';
  return 'open';
}

// readable text for booking-history actions
export const ACTION_TEXT = {
  BOOKED: 'Booked a seat',
  CANCELLED: 'Cancelled the booking',
  CANCELLED_BY_ADMIN: 'Booking cancelled by an administrator',
  PROMOTED: 'Got a seat from the waitlist',
  EVENT_DELETED: 'Event was deleted',
};
