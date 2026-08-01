import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');

  async function onSubmit(e) {
    e.preventDefault();
    const res = await api.forgotPassword(email);
    setMessage(res.message);
  }

  return (
    <div className="auth-page">
      <form onSubmit={onSubmit} className="auth-form">
        <h1>Forgot password</h1>
        {message && <p className="success">{message}</p>}
        <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button type="submit">Send reset link</button>
        <p><Link to="/login">Back to sign in</Link></p>
      </form>
    </div>
  );
}
