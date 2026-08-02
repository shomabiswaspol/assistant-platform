import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';
import AuthLayout from '../components/layout/AuthLayout.jsx';
import Input from '../components/ui/Input.jsx';
import Button from '../components/ui/Button.jsx';

export default function RegisterPage() {
  const [form, setForm] = useState({ username: '', email: '', password: '', whatsapp_number: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const res = await api.register(form);
      setMessage(res.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Request membership" subtitle="An admin reviews every request before you can sign in.">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {error && (
          <p className="rounded-lg bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        )}
        {message && (
          <p className="rounded-lg bg-green-50 dark:bg-green-950/40 px-3 py-2 text-sm text-green-700 dark:text-green-400">
            {message}
          </p>
        )}
        <Input label="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <Input
          label="WhatsApp number (optional)"
          value={form.whatsapp_number}
          onChange={(e) => setForm({ ...form, whatsapp_number: e.target.value })}
        />
        <Input
          label="Password"
          type="password"
          placeholder="Min 8 characters"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        <Button type="submit" disabled={loading} className="w-full mt-1">
          {loading ? 'Submitting…' : 'Request access'}
        </Button>
        <p className="text-center text-sm">
          <Link to="/login" className="text-brand-600 dark:text-brand-400 hover:underline">
            Back to sign in
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
