import { useState, useEffect } from 'react';
import { api } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Card, CardHeader } from '../components/ui/Card.jsx';
import Input from '../components/ui/Input.jsx';
import Button from '../components/ui/Button.jsx';
import Toast from '../components/ui/Toast.jsx';

function initials(name) {
  return name ? name.slice(0, 2).toUpperCase() : '?';
}

export default function ProfilePage() {
  const [profile, setProfile] = useState(null);
  const [saved, setSaved] = useState(false);
  const { updateUser } = useAuth();

  // Change password — POST /profile/change-password already existed on the
  // backend with zero UI anywhere (UI redesign audit, 2026-08-09).
  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [pwError, setPwError] = useState('');
  const [pwSaved, setPwSaved] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);

  useEffect(() => { api.profile().then(setProfile); }, []);

  async function save(e) {
    e.preventDefault();
    const updated = await api.updateProfile({
      whatsapp_number: profile.whatsapp_number,
      language: profile.language,
      theme: profile.theme,
    });
    setProfile(updated);
    updateUser({ theme: updated.theme, language: updated.language });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function changePassword(e) {
    e.preventDefault();
    setPwError('');
    if (pwForm.new_password.length < 8) {
      setPwError('New password must be at least 8 characters.');
      return;
    }
    if (pwForm.new_password !== pwForm.confirm_password) {
      setPwError('New password and confirmation do not match.');
      return;
    }
    setPwBusy(true);
    try {
      await api.changePassword(pwForm.current_password, pwForm.new_password);
      setPwForm({ current_password: '', new_password: '', confirm_password: '' });
      setPwSaved(true);
      setTimeout(() => setPwSaved(false), 2000);
    } catch (err) {
      setPwError(err.message || 'Failed to change password.');
    } finally {
      setPwBusy(false);
    }
  }

  if (!profile) {
    return <div className="max-w-2xl mx-auto px-4 py-8 text-sm text-slate-400">Loading…</div>;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-500 text-lg font-semibold text-white">
          {initials(profile.username)}
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">{profile.username}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{profile.email}</p>
        </div>
      </div>

      <Card>
        <CardHeader title="Account details" />
        <form onSubmit={save} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Username" value={profile.username} disabled />
            <Input label="Email" value={profile.email} disabled />
          </div>
          <Input
            label="WhatsApp number"
            value={profile.whatsapp_number || ''}
            onChange={(e) => setProfile({ ...profile, whatsapp_number: e.target.value })}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Language</span>
              <select
                value={profile.language}
                onChange={(e) => setProfile({ ...profile, language: e.target.value })}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
              >
                <option value="bn">বাংলা</option>
                <option value="en">English</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Theme</span>
              <select
                value={profile.theme}
                onChange={(e) => setProfile({ ...profile, theme: e.target.value })}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </label>
          </div>
          <Button type="submit" className="self-start">Save changes</Button>
        </form>
      </Card>

      <Card>
        <CardHeader title="Change password" />
        <form onSubmit={changePassword} className="flex flex-col gap-4">
          {pwError && (
            <p className="text-sm text-red-600 dark:text-red-400">{pwError}</p>
          )}
          <Input
            label="Current password"
            type="password"
            value={pwForm.current_password}
            onChange={(e) => setPwForm({ ...pwForm, current_password: e.target.value })}
            required
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="New password"
              type="password"
              hint="At least 8 characters"
              value={pwForm.new_password}
              onChange={(e) => setPwForm({ ...pwForm, new_password: e.target.value })}
              required
            />
            <Input
              label="Confirm new password"
              type="password"
              value={pwForm.confirm_password}
              onChange={(e) => setPwForm({ ...pwForm, confirm_password: e.target.value })}
              required
            />
          </div>
          <Button type="submit" variant="secondary" disabled={pwBusy} className="self-start">
            {pwBusy ? 'Updating…' : 'Update password'}
          </Button>
        </form>
      </Card>

      <Toast show={saved}>Profile saved</Toast>
      <Toast show={pwSaved}>Password updated</Toast>
    </div>
  );
}
