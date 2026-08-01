import { useState, useEffect } from 'react';
import { api } from '../services/api.js';

export default function SettingsPage() {
  const [models, setModels] = useState(null);
  const [keys, setKeys] = useState([]);
  const [omni, setOmni] = useState(null);
  const [newKey, setNewKey] = useState({ provider: '', key: '', label: '' });

  async function refresh() {
    setModels(await api.models());
    setKeys(await api.apiKeys());
    setOmni(await api.omnirouteStatus());
  }

  useEffect(() => { refresh(); }, []);

  async function addKey(e) {
    e.preventDefault();
    if (!newKey.provider || !newKey.key) return;
    await api.addApiKey(newKey);
    setNewKey({ provider: '', key: '', label: '' });
    refresh();
  }

  async function removeKey(id) {
    await api.deleteApiKey(id);
    refresh();
  }

  return (
    <div className="page">
      <h1>Settings</h1>

      <section>
        <h2>AI Gateway</h2>
        <p>OmniRoute: {omni ? (omni.reachable ? 'reachable' : 'not reachable — not started yet') : 'checking...'}</p>
        <p className="note">Start/stop is a host-level operation, not exposed to this app — see deployment report.</p>
      </section>

      <section>
        <h2>Models (by priority)</h2>
        {models && (
          <ul>
            <li><b>Free:</b> {models.priority_1_free.join(', ')}</li>
            <li><b>Local:</b> {models.priority_2_local.join(', ')}</li>
            <li><b>Paid:</b> {models.priority_3_paid.join(', ')}</li>
          </ul>
        )}
      </section>

      <section>
        <h2>Your API keys</h2>
        <ul>
          {keys.map((k) => (
            <li key={k.id}>
              {k.provider} {k.label ? `(${k.label})` : ''} — {k.is_active ? 'active' : 'inactive'}
              <button onClick={() => removeKey(k.id)}>Remove</button>
            </li>
          ))}
        </ul>
        <form onSubmit={addKey}>
          <input placeholder="provider (e.g. groq)" value={newKey.provider} onChange={(e) => setNewKey({ ...newKey, provider: e.target.value })} />
          <input placeholder="API key" value={newKey.key} onChange={(e) => setNewKey({ ...newKey, key: e.target.value })} />
          <input placeholder="label (optional)" value={newKey.label} onChange={(e) => setNewKey({ ...newKey, label: e.target.value })} />
          <button type="submit">Add key</button>
        </form>
      </section>
    </div>
  );
}
