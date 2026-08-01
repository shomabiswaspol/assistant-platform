import { useState, useEffect } from 'react';
import { api } from '../services/api.js';

export default function ProfilePage() {
  const [profile, setProfile] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => { api.profile().then(setProfile); }, []);

  async function save(e) {
    e.preventDefault();
    const updated = await api.updateProfile({
      whatsapp_number: profile.whatsapp_number,
      language: profile.language,
      theme: profile.theme,
    });
    setProfile(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (!profile) return <div className="page">Loading...</div>;

  return (
    <div className="page">
      <h1>Profile</h1>
      <form onSubmit={save} className="profile-form">
        <label>Username<input value={profile.username} disabled /></label>
        <label>Email<input value={profile.email} disabled /></label>
        <label>WhatsApp number
          <input value={profile.whatsapp_number || ''} onChange={(e) => setProfile({ ...profile, whatsapp_number: e.target.value })} />
        </label>
        <label>Language
          <select value={profile.language} onChange={(e) => setProfile({ ...profile, language: e.target.value })}>
            <option value="bn">বাংলা</option>
            <option value="en">English</option>
          </select>
        </label>
        <label>Theme
          <select value={profile.theme} onChange={(e) => setProfile({ ...profile, theme: e.target.value })}>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </label>
        <button type="submit">Save</button>
        {saved && <span className="success"> Saved.</span>}
      </form>
    </div>
  );
}
