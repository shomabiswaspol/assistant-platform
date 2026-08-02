import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';
import AuthLayout from '../components/layout/AuthLayout.jsx';
import Input from '../components/ui/Input.jsx';
import Button from '../components/ui/Button.jsx';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.forgotPassword(email);
      setMessage(res.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Forgot password" subtitle="We'll send a reset link if the email is registered.">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {message && (
          <p className="rounded-lg bg-green-50 dark:bg-green-950/40 px-3 py-2 text-sm text-green-700 dark:text-green-400">
            {message}
          </p>
        )}
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Button type="submit" disabled={loading} className="w-full mt-1">
          {loading ? 'Sending…' : 'Send reset link'}
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
