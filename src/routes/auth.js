const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { JWT_SECRET, JWT_EXPIRES_IN } = require('../config');

const router = express.Router();

const invalid = (res, message) => res.status(400).json({ error: 'INVALID_INPUT', message });
const makeToken = (user) =>
  jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password } = req.body || {};
    if (typeof name !== 'string' || !name.trim()) return invalid(res, 'name is required');
    if (typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email)) return invalid(res, 'valid email is required');
    if (typeof password !== 'string' || password.length < 6) return invalid(res, 'password must be at least 6 characters');

    const hash = await bcrypt.hash(password, 10);            // never store the plain password
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3)
       RETURNING id, name, email, role`,
      [name.trim(), email.toLowerCase(), hash]
    );
    res.status(201).json({ token: makeToken(rows[0]), user: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'EMAIL_TAKEN', message: 'Email already registered' });
    }
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string') return invalid(res, 'email and password are required');

    const { rows } = await pool.query(
      'SELECT id, name, email, role, password_hash FROM users WHERE email = $1', [email.toLowerCase()]);
    const user = rows[0];
    // same message for "no such user" and "wrong password" so attackers learn nothing
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Wrong email or password' });
    }
    delete user.password_hash;
    res.json({ token: makeToken(user), user });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// FORGOT / RESET PASSWORD
// The reset token is a short-lived JWT signed with a DIFFERENT secret than login tokens, so it can never
// be used to call the API as a logged-in user. It contains the tail of the current password hash, so
// once the password is changed the same link stops working (single use).
// No email server is configured: the link is printed in the server console, and (outside production)
// also returned to the browser so the demo works without email.
// ---------------------------------------------------------------------------
const RESET_SECRET = JWT_SECRET + '|password-reset';
const tail = (hash) => hash.slice(-12);

router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body || {};
    if (typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email)) return invalid(res, 'valid email is required');

    const { rows } = await pool.query('SELECT id, password_hash FROM users WHERE email = $1', [email.toLowerCase()]);
    // Same answer whether or not the email exists, so nobody can discover who has an account.
    const reply = { message: 'If that email is registered, a password reset link has been created.' };
    if (rows[0]) {
      const token = jwt.sign({ id: rows[0].id, h: tail(rows[0].password_hash) }, RESET_SECRET, { expiresIn: '15m' });
      const resetPath = `/reset-password?token=${token}`;
      console.log(`Password reset link for ${email}: ${req.protocol}://${req.get('host')}${resetPath}`);
      if (process.env.NODE_ENV !== 'production') reply.resetPath = resetPath;
    }
    res.json(reply);
  } catch (err) {
    next(err);
  }
});

router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, password } = req.body || {};
    if (typeof token !== 'string' || !token) return invalid(res, 'reset token is required');
    if (typeof password !== 'string' || password.length < 6) return invalid(res, 'password must be at least 6 characters');

    let payload;
    try {
      payload = jwt.verify(token, RESET_SECRET);
    } catch (err) {
      return res.status(400).json({ error: 'INVALID_TOKEN', message: 'This reset link is invalid or has expired. Request a new one.' });
    }
    const { rows } = await pool.query('SELECT id, password_hash FROM users WHERE id = $1', [payload.id]);
    if (!rows[0] || tail(rows[0].password_hash) !== payload.h) {
      return res.status(400).json({ error: 'INVALID_TOKEN', message: 'This reset link was already used or is no longer valid.' });
    }
    const hash = await bcrypt.hash(password, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, rows[0].id]);
    res.json({ message: 'Password changed. You can log in now.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
