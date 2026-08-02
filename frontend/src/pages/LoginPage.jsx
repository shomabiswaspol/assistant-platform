import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import AuthLayout from '../components/layout/AuthLayout.jsx';
import Input from '../components/ui/Input.jsx';
import Button from '../components/ui/Button.jsx';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      navigate('/chat');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Sign in" subtitle="Welcome back — enter your details to continue.">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {error && (
          <p className="rounded-lg bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        )}
        <Input label="Username or email" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <Button type="submit" disabled={loading} className="w-full mt-1">
          {loading ? 'Signing in…' : 'Sign in'}
        </Button>
        <div className="flex items-center justify-between text-sm mt-1">
          <Link to="/forgot-password" className="text-brand-600 dark:text-brand-400 hover:underline">
            Forgot password?
          </Link>
          <Link to="/register" className="text-slate-500 dark:text-slate-400 hover:underline">
            Request access
          </Link>
        </div>
      </form>
    </AuthLayout>
  );
}
