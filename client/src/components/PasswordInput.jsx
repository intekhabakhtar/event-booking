// Password field with a Show / Hide button.
import { useState } from 'react';

export default function PasswordInput({ label, value, onChange, name = 'password', minLength, autoComplete }) {
  const [show, setShow] = useState(false);
  return (
    <label>
      {label}
      <span className="pw">
        <input name={name} type={show ? 'text' : 'password'} value={value} onChange={onChange}
               minLength={minLength} autoComplete={autoComplete} required />
        <button type="button" className="pw-toggle" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button>
      </span>
    </label>
  );
}
