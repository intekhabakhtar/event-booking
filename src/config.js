require('dotenv').config();

const isProd = process.env.NODE_ENV === 'production';
if (!process.env.JWT_SECRET) {
  if (isProd) {
    console.error('FATAL: JWT_SECRET must be set in production.');
    process.exit(1);
  }
  console.warn('WARNING: JWT_SECRET not set, using an insecure development secret. Create a .env file.');
}

module.exports = {
  PORT: process.env.PORT || 3000,
  JWT_SECRET: process.env.JWT_SECRET || 'dev-only-insecure-secret',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '2h',
  // Must match the CHECK on users.active_bookings in db/schema.sql
  MAX_BOOKINGS_PER_STUDENT: 3,
  // Read on every call so the harness / demo can flip GUARD without restarting code paths
  guardOn: () => process.env.GUARD !== 'off',
};
