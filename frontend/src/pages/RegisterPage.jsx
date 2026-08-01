import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';

export default function RegisterPage() {
  const [form, setForm] = useState({ username: '', email: '', password: '', whatsapp_number: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      const res = await api.register(form);
      setMessage(res.message);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="auth-page">
      <form onSubmit={onSubmit} className="auth-form">
        <h1>Request membership</h1>
        {error && <p className="error">{error}</p>}
        {message && <p className="success">{message}</p>}
        <input placeholder="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input placeholder="WhatsApp number (optional)" value={form.whatsapp_number} onChange={(e) => setForm({ ...form, whatsapp_number: e.target.value })} />
        <input type="password" placeholder="Password (min 8 chars)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <button type="submit">Request access</button>
        <p><Link to="/login">Back to sign in</Link></p>
      </form>
    </div>
  );
}
