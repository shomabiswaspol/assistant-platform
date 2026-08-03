import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../services/api.js';
import AuthLayout from '../components/layout/AuthLayout.jsx';
import Input from '../components/ui/Input.jsx';
import Button from '../components/ui/Button.jsx';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (password !== confirm) return setError('Passwords do not match.');
    setLoading(true);
    try {
      await api.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err.message || 'That reset link is invalid or has expired.');
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <AuthLayout title="Reset password" subtitle="Invalid link">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          This reset link is missing its token. Request a new one from the{' '}
          <Link to="/forgot-password" className="text-brand-600 dark:text-brand-400 hover:underline">
            forgot password
          </Link>{' '}
          page.
        </p>
      </AuthLayout>
    );
  }

  if (done) {
    return (
      <AuthLayout title="Password updated" subtitle="You can sign in with your new password now.">
        <Link to="/login">
          <Button className="w-full">Go to sign in</Button>
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Reset password" subtitle="Choose a new password for your account.">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {error && (
          <p className="rounded-lg bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        )}
        <Input label="New password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <Input label="Confirm new password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <Button type="submit" disabled={loading} className="w-full mt-1">
          {loading ? 'Updating…' : 'Update password'}
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
